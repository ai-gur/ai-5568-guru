/**
 * Web UI and API.
 *
 * Port 3569 by default. It remains configurable through PORT for containers.
 *
 * Scans run in-process as background jobs with an in-memory registry. That is
 * deliberate for a tool run locally by one operator: a queue and a database
 * would add deployment surface without changing what a single reviewer can do.
 * Jobs are lost on restart, and the UI says so rather than implying durability.
 *
 * The UI itself is built to the standard it reviews — it is the reference
 * implementation, and `npm run verify:self` scans it.
 */

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, normalize, sep } from 'node:path';
import Fastify from 'fastify';
import { ClaudeJudge } from '../../src/checks/judge.ts';
import { buildSiteContext } from '../../src/checks/site-context.ts';
import { loadCatalogue, scan } from '../../src/scan.ts';
import { DEFAULT_OPTIONS, type ScanOptions, type ScanReport } from '../../src/types.ts';
import { ALL_FORMATS, emitReports, type ReportFormat } from '../../report/src/index.ts';
import { renderApp } from './ui.ts';

const PORT = Number(process.env.PORT ?? 3569);
const HOST = process.env.HOST ?? '127.0.0.1';
const REPORTS_ROOT = resolve(process.env.REPORTS_DIR ?? './reports');

type JobStatus = 'queued' | 'running' | 'done' | 'failed';

interface Job {
  id: string;
  url: string;
  status: JobStatus;
  phase: string;
  pagesScanned: number;
  documentsFound: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  report?: ScanReport;
  outputs: { format: ReportFormat; file: string }[];
  failedOutputs: { format: ReportFormat; reason: string }[];
  costUsd: number;
}

const jobs = new Map<string, Job>();

/** Set once a stop signal arrives; no new scans are accepted after that. */
let shuttingDown = false;

const app = Fastify({ logger: false });

// In production the scanner sits on a private network and the API gateway
// supplies this token. Local development may omit it for a zero-config run.
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/api/')) return;
  const token = process.env.SCANNER_TOKEN;
  if (!token) return;
  if (request.headers.authorization !== `Bearer ${token}`) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
});

app.get('/', async (_req, reply) => {
  reply.type('text/html; charset=utf-8').send(renderApp());
});

/**
 * Liveness. Reports `ok: false` once shutdown has begun, so a load balancer
 * stops sending work to an instance that is on its way out.
 */
app.get('/health', async () => ({ ok: !shuttingDown, jobs: jobs.size }));

app.get('/api/jobs', async () => ({
  jobs: [...jobs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicJob),
}));

app.get('/api/jobs/:id', async (req, reply) => {
  const job = jobs.get((req.params as { id: string }).id);
  if (!job) return reply.code(404).send({ error: 'job not found' });
  return publicJob(job);
});

app.get('/api/jobs/:id/results', async (req, reply) => {
  const job = jobs.get((req.params as { id: string }).id);
  if (!job) return reply.code(404).send({ error: 'job not found' });
  if (!job.report) return reply.code(409).send({ error: 'scan has not finished' });
  return { report: job.report };
});


/*
 * Spending limits.
 *
 * A scan of a real site costs several dollars in judgement calls, and the
 * service is about to sit behind a public button with no account and no
 * billing. The target allowlist controls *what* can be scanned; it does not
 * control how often, and "press the button forty times" is not an attack, just
 * an ordinary curious visitor.
 *
 * These live in the scanner rather than the web app because this is where the
 * money is actually spent, and the web app is not guaranteed to be the only
 * caller.
 */
const MAX_CONCURRENT_SCANS = Math.max(1, Number(process.env.MAX_CONCURRENT_SCANS ?? 1));
const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 25);
const RESCAN_COOLDOWN_MINUTES = Number(process.env.RESCAN_COOLDOWN_MINUTES ?? 60);

function activeScans(): number {
  return [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'queued').length;
}

/** Spend since midnight UTC, across every job this instance has held. */
function spentToday(): number {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  return [...jobs.values()]
    .filter((j) => new Date(j.startedAt) >= midnight)
    .reduce((total, j) => total + j.costUsd, 0);
}

/**
 * A recent finished scan of the same URL, if there is one.
 *
 * Re-running an unchanged site inside the hour buys nothing and costs the full
 * amount again. Handing back the existing report is both cheaper and a better
 * answer — it is on screen immediately instead of twelve minutes later.
 */
function recentScanOf(url: string): Job | null {
  const cutoff = Date.now() - RESCAN_COOLDOWN_MINUTES * 60_000;
  let best: Job | null = null;
  for (const job of jobs.values()) {
    if (job.url !== url || job.status !== 'done' || !job.finishedAt) continue;
    if (new Date(job.finishedAt).getTime() < cutoff) continue;
    if (!best || new Date(job.finishedAt) > new Date(best.finishedAt!)) best = job;
  }
  return best;
}

app.post('/api/scan', async (req, reply) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawUrl = String(body.url ?? '').trim();
  if (!rawUrl) return reply.code(400).send({ error: 'url is required' });

  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).toString();
  } catch {
    return reply.code(400).send({ error: 'url is not valid' });
  }

  if (shuttingDown) {
    return reply.code(503).send({ error: 'השירות מתכבה ואינו מקבל סריקות חדשות. נסו שוב בעוד רגע.' });
  }

  // Answered before the concurrency check, so a repeat press returns the report
  // rather than "busy".
  const recent = recentScanOf(url);
  if (recent) {
    return reply.code(200).send({ id: recent.id, reused: true, finishedAt: recent.finishedAt });
  }

  if (activeScans() >= MAX_CONCURRENT_SCANS) {
    return reply.code(429).send({
      error: 'סריקה אחרת פועלת כרגע. סריקה אחת בכל רגע נתון — נסו שוב בעוד כמה דקות.',
    });
  }

  const spent = spentToday();
  if (spent >= DAILY_BUDGET_USD) {
    return reply.code(429).send({
      error: 'תקציב הסריקות היומי מוצה. הסריקות ייפתחו מחדש מחר.',
    });
  }

  const noAi = body.noAi === true || !process.env.ANTHROPIC_API_KEY;
  const job: Job = {
    id: randomUUID(),
    url,
    status: 'queued',
    phase: 'ממתין',
    pagesScanned: 0,
    documentsFound: 0,
    startedAt: new Date().toISOString(),
    outputs: [],
    failedOutputs: [],
    costUsd: 0,
  };
  jobs.set(job.id, job);

  // Deliberately not awaited — the POST returns the job id immediately and the
  // client polls. Rejections are captured onto the job, never left unhandled.
  void runJob(job, {
    maxPages: clamp(Number(body.maxPages), 1, 2000, 50),
    maxDepth: clamp(Number(body.maxDepth), 0, 20, DEFAULT_OPTIONS.maxDepth),
    level: body.level === 'A' ? 'A' : 'AA',
    documents: body.documents !== false,
    noAi,
    // Never more than the day has left, whatever the caller asks for.
    budgetUsd: Math.min(
      clamp(Number(body.budgetUsd), 0.5, 500, DEFAULT_OPTIONS.budgetUsd),
      Math.max(0.5, DAILY_BUDGET_USD - spent),
    ),
  });

  return reply.code(202).send({ id: job.id, noAi });
});

/**
 * Report download. Paths are resolved and re-checked against the reports root —
 * the job id is a UUID the server minted, but the filename comes from the
 * request and must never be able to escape the directory.
 */
app.get('/api/jobs/:id/download/:file', async (req, reply) => {
  const { id, file } = req.params as { id: string; file: string };
  const job = jobs.get(id);
  if (!job) return reply.code(404).send({ error: 'job not found' });

  const dir = resolve(REPORTS_ROOT, id);
  const path = resolve(join(dir, normalize(file)));
  if (!path.startsWith(dir + sep)) {
    return reply.code(403).send({ error: 'forbidden' });
  }

  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return reply.code(404).send({ error: 'file not found' });

  const type =
    path.endsWith('.html') ? 'text/html; charset=utf-8'
    : path.endsWith('.json') ? 'application/json; charset=utf-8'
    : path.endsWith('.pdf') ? 'application/pdf'
    : path.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/octet-stream';

  reply.type(type);
  // The HTML report is meant to be read in place; everything else downloads.
  if (!path.endsWith('.html')) {
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(file)}"`);
  }
  return reply.send(createReadStream(path));
});

async function runJob(
  job: Job,
  opts: { maxPages: number; maxDepth: number; level: 'A' | 'AA'; documents: boolean; noAi: boolean; budgetUsd: number },
): Promise<void> {
  job.status = 'running';
  const outDir = join(REPORTS_ROOT, job.id);

  const options: ScanOptions = {
    ...DEFAULT_OPTIONS,
    url: job.url,
    outDir,
    maxPages: opts.maxPages,
    maxDepth: opts.maxDepth,
    level: opts.level,
    documents: opts.documents,
    noAi: opts.noAi,
    budgetUsd: opts.budgetUsd,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const judge =
    opts.noAi || !apiKey
      ? null
      : new ClaudeJudge({
          apiKey,
          budgetUsd: options.budgetUsd,
          cacheDir: join(outDir, '.cache'),
          concurrency: Math.max(2, options.concurrency),
          site: buildSiteContext([], null, null),
          onProgress: (_done, _total, cost) => {
            job.costUsd = cost;
          },
        });

  try {
    const report = await scan(options, judge, {
      onPhase: (phase) => {
        job.phase = PHASES[phase] ?? phase;
      },
      onPageDone: (_bundle, index) => {
        job.pagesScanned = index + 1;
      },
      onDocumentFound: () => {
        job.documentsFound++;
      },
    });

    job.phase = 'הפקת דוחות';
    const emitted = await emitReports(report, await loadCatalogue(), outDir, ALL_FORMATS);

    job.report = report;
    job.outputs = emitted.written.map((w) => ({ format: w.format, file: basenameOf(w.path) }));
    job.failedOutputs = emitted.failed;
    job.costUsd = report.stats.llmCostUsd;
    job.status = 'done';
    job.phase = 'הושלם';
  } catch (err) {
    job.status = 'failed';
    job.phase = 'נכשל';
    job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.finishedAt = new Date().toISOString();
  }
}

const PHASES: Record<string, string> = {
  crawl: 'סריקת האתר',
  statement: 'בדיקת הצהרת הנגישות',
  evaluate: 'הערכת קריטריונים',
  judge: 'שיקול דעת',
  documents: 'ניתוח מסמכים',
};

function publicJob(job: Job): Record<string, unknown> {
  const targets = job.report ? [...job.report.pages, ...job.report.documents] : [];
  const totals = targets.reduce(
    (a, t) => ({
      pass: a.pass + t.summary.pass,
      fail: a.fail + t.summary.fail,
      na: a.na + t.summary.na,
      unverified: a.unverified + t.summary.unverified,
    }),
    { pass: 0, fail: 0, na: 0, unverified: 0 },
  );

  return {
    id: job.id,
    url: job.url,
    status: job.status,
    phase: job.phase,
    pagesScanned: job.pagesScanned,
    documentsFound: job.documentsFound,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
    error: job.error ?? null,
    costUsd: job.costUsd,
    totals,
    siteName: job.report?.site.name ?? null,
    skipped: job.report?.stats.skipped.length ?? 0,
    outputs: job.outputs,
    failedOutputs: job.failedOutputs,
  };
}

function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const started = await app.listen({ port: PORT, host: HOST });
console.log(`5568 Readiness על ${started}`);
console.log(process.env.ANTHROPIC_API_KEY ? 'שכבת שיקול הדעת פעילה.' : 'ANTHROPIC_API_KEY לא הוגדר — סריקות ירוצו במצב ללא בינה מלאכותית.');

/*
 * Shutdown.
 *
 * Cloudflare gives no guarantee that a container instance runs for any set
 * period: a host restart sends SIGTERM, waits fifteen minutes, then SIGKILL.
 * Fifteen minutes is longer than a scan, so the useful thing to do is stop
 * accepting new work and let the running scan finish and write its report,
 * rather than exit at once and lose the judge calls already paid for.
 *
 * Reports are on a mounted volume, so a report written here survives the
 * instance. In-flight jobs still do not — that is the documented behaviour of
 * the in-memory registry, and this only narrows the window.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;

    const running = [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'queued');
    console.log(`[${signal}] מפסיק לקבל סריקות חדשות. ${running.length} סריקות עדיין רצות.`);

    const finish = (): void => {
      void app.close().then(() => process.exit(0));
    };

    if (running.length === 0) return finish();

    // Poll rather than await: the scans are detached background promises, not
    // something the request lifecycle holds a handle to.
    const deadline = Date.now() + 13 * 60_000;
    const timer = setInterval(() => {
      const stillRunning = [...jobs.values()].some((j) => j.status === 'running' || j.status === 'queued');
      if (!stillRunning || Date.now() > deadline) {
        clearInterval(timer);
        finish();
      }
    }, 2_000);
  });
}

