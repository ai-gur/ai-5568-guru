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
    budgetUsd: clamp(Number(body.budgetUsd), 0.5, 500, DEFAULT_OPTIONS.budgetUsd),
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
