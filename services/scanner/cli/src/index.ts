#!/usr/bin/env node
/**
 * is5568 — command line interface.
 *
 *   is5568 scan <url> [options]
 *   is5568 verify --url <url> --criterion <no>
 *   is5568 import-criteria <path-to-form.xlsx>
 */

import { resolve } from 'node:path';
import { ClaudeJudge } from '../../src/checks/judge.ts';
import { buildSiteContext, findStatementUrl } from '../../src/checks/site-context.ts';
import { loadCatalogue, scan } from '../../src/scan.ts';
import { DEFAULT_OPTIONS, type ScanOptions } from '../../src/types.ts';
import { ALL_FORMATS, emitReports, type ReportFormat } from '../../report/src/index.ts';

const USAGE = `
is5568 — בודק נגישות לפי תקן ישראלי ת"י 5568

  is5568 scan <url> [options]        סריקת אתר והפקת דוחות
  is5568 verify --url U --criterion C  בדיקת קריטריון יחיד בעמוד יחיד
  is5568 import-criteria <form.xlsx>   ייבוא גיליון הבדיקה הרשמי

Options for scan:
  --out <dir>            output directory                 (default ./reports)
  --formats <list>       html,xlsx,json,md,pdf            (default all)
  --max-pages <n>        page limit                       (default ${DEFAULT_OPTIONS.maxPages})
  --max-depth <n>        crawl depth limit                (default ${DEFAULT_OPTIONS.maxDepth})
  --concurrency <n>      parallel page loads              (default ${DEFAULT_OPTIONS.concurrency})
  --level <A|AA>         conformance target               (default AA)
  --include <regex>      only crawl matching URLs         (repeatable)
  --exclude <regex>      never crawl matching URLs        (repeatable)
  --no-documents         skip linked PDF/Office documents
  --no-robots            ignore robots.txt
  --no-ai                automation only; judgement rows report as unverified
  --budget <usd>         cap AI spend                     (default ${DEFAULT_OPTIONS.budgetUsd})
  --storage-state <f>    Playwright storageState for authenticated crawls
  --timeout <ms>         per-page timeout                 (default ${DEFAULT_OPTIONS.timeoutMs})

Level note: the check sheet requires level AA. Level A applies only where a
heavy-burden exemption under regulation 35(b)(2) has been granted.
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case 'scan':
      return runScan(rest);
    case 'verify':
      return runVerify(rest);
    case 'import-criteria':
      return runImport(rest);
    case '--help':
    case '-h':
    case undefined:
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command "${command}".`);
      console.log(USAGE);
      return 1;
  }
}

async function runScan(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const url = args.positional[0];
  if (!url) {
    console.error('Missing <url>.\n' + USAGE);
    return 1;
  }

  const formats = parseFormats(args.values.formats);
  if (!formats) return 1;

  const options: ScanOptions = {
    ...DEFAULT_OPTIONS,
    url: normaliseUrl(url),
    outDir: resolve(args.values.out ?? './reports'),
    maxPages: num(args.values['max-pages'], DEFAULT_OPTIONS.maxPages),
    maxDepth: num(args.values['max-depth'], DEFAULT_OPTIONS.maxDepth),
    concurrency: num(args.values.concurrency, DEFAULT_OPTIONS.concurrency),
    timeoutMs: num(args.values.timeout, DEFAULT_OPTIONS.timeoutMs),
    budgetUsd: num(args.values.budget, DEFAULT_OPTIONS.budgetUsd),
    level: args.values.level === 'A' ? 'A' : 'AA',
    documents: args.flags['no-documents'] !== true,
    respectRobots: args.flags['no-robots'] !== true,
    noAi: args.flags['no-ai'] === true,
    include: args.multi.include?.map((r) => new RegExp(r)),
    exclude: args.multi.exclude?.map((r) => new RegExp(r)),
    ...(args.values['storage-state'] ? { storageState: resolve(args.values['storage-state']) } : {}),
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!options.noAi && !apiKey) {
    // Silently degrading here would produce a report full of "unverified" rows
    // with no explanation of why, which is exactly the kind of quiet failure
    // this tool exists to avoid.
    console.error(
      'ANTHROPIC_API_KEY is not set.\n' +
        'Roughly two-thirds of the check sheet needs judgement and cannot be decided by rules alone.\n' +
        'Either set the key, or re-run with --no-ai to get an automation-only report in which those rows\n' +
        'are reported as unverified rather than as passing.',
    );
    return 1;
  }

  const judge =
    options.noAi || !apiKey
      ? null
      : new ClaudeJudge({
          apiKey,
          budgetUsd: options.budgetUsd,
          cacheDir: resolve(options.outDir, '.cache'),
          concurrency: Math.max(2, options.concurrency),
          // Replaced with the real context once the crawl has produced one.
          site: buildSiteContext([], null, null),
          onProgress: (done, total, cost) =>
            process.stderr.write(`\r  שיקול דעת: ${done}/${total} · $${cost.toFixed(2)}   `),
        });

  const started = Date.now();
  let report;
  try {
    report = await scan(options, judge, {
      onPhase: (phase, detail) => console.error(`\n▸ ${phaseLabel(phase)}${detail ? ` — ${detail}` : ''}`),
      onPageDone: (bundle, index) =>
        process.stderr.write(`\r  נסרקו ${index + 1} עמודים · ${truncate(bundle.url, 70)}          `),
      onDocumentFound: (doc) => process.stderr.write(`\n  מסמך: ${truncate(doc.url, 80)}\n`),
    });
  } catch (err) {
    console.error(`\nהסריקה נכשלה: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.error('\n▸ הפקת דוחות');
  const emitted = await emitReports(report, await loadCatalogue(), options.outDir, formats);

  printSummary(report, emitted, Date.now() - started);
  // A scan that produced no report is a failed run, whatever the crawl did.
  return emitted.written.length === 0 ? 1 : 0;
}

async function runVerify(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const url = args.values.url ?? args.positional[0];
  const criterion = args.values.criterion;
  if (!url || !criterion) {
    console.error('Usage: is5568 verify --url <url> --criterion <number>');
    return 1;
  }

  const catalogue = await loadCatalogue();
  const matching = catalogue.items.filter((i) => i.form.criterionNo.includes(criterion));
  if (matching.length === 0) {
    console.error(`No criterion matching "${criterion}" in the catalogue.`);
    return 1;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const options: ScanOptions = {
    ...DEFAULT_OPTIONS,
    url: normaliseUrl(url),
    outDir: resolve('./.verify'),
    maxPages: 1,
    maxDepth: 0,
    documents: false,
    noAi: !apiKey,
  };

  const judge = apiKey
    ? new ClaudeJudge({
        apiKey,
        budgetUsd: options.budgetUsd,
        cacheDir: resolve(options.outDir, '.cache'),
        concurrency: 2,
        site: buildSiteContext([], null, null),
      })
    : null;

  const report = await scan(options, judge);
  const page = report.pages[0];
  if (!page) {
    console.error('העמוד לא נסרק.');
    return 1;
  }

  const ids = new Set(matching.map((m) => m.id));
  const results = page.results.filter((r) => ids.has(r.itemId));
  const items = new Map(catalogue.items.map((i) => [i.id, i]));

  console.log(`\n${page.name}\n${page.url}\n`);
  let anyFail = false;
  for (const r of results) {
    const item = items.get(r.itemId);
    if (!item) continue;
    const icon = r.verdict === 'PASS' ? '✔' : r.verdict === 'FAIL' ? '✘' : '⊘';
    if (r.verdict === 'FAIL') anyFail = true;
    console.log(`${icon} ${item.form.criterionNo}  ${item.form.criterionNameHe}`);
    if (r.noteHe) console.log(`   ${r.noteHe}`);
    for (const f of r.findings.slice(0, 10)) console.log(`   • ${f.locator}\n     ${f.reasonHe}`);
    console.log('');
  }
  return anyFail ? 2 : 0;
}

async function runImport(argv: string[]): Promise<number> {
  const path = argv[0];
  if (!path) {
    console.error('Usage: is5568 import-criteria <path-to-form.xlsx>');
    return 1;
  }
  const { importForm } = await import('@ai5568/criteria/import-form-xlsx');
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const { CATALOGUE_PATH } = await import('@ai5568/criteria');
  const out = CATALOGUE_PATH;

  const catalogue = await importForm(resolve(path));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');
  console.log(`Imported ${catalogue.source.rowCount} rows → ${catalogue.items.length} checks.`);
  console.log(`Written to ${out}`);
  return 0;
}

// ── output ──────────────────────────────────────────────────────────────────

function printSummary(
  report: Awaited<ReturnType<typeof scan>>,
  emitted: Awaited<ReturnType<typeof emitReports>>,
  elapsedMs: number,
): void {
  const targets = [...report.pages, ...report.documents];
  const totals = targets.reduce(
    (a, t) => ({
      pass: a.pass + t.summary.pass,
      fail: a.fail + t.summary.fail,
      na: a.na + t.summary.na,
      unverified: a.unverified + t.summary.unverified,
    }),
    { pass: 0, fail: 0, na: 0, unverified: 0 },
  );

  console.log('\n' + '─'.repeat(72));
  console.log(`אתר: ${report.site.name}`);
  console.log(`עמודים: ${report.stats.pagesScanned} · מסמכים: ${report.stats.documentsScanned} · ${(elapsedMs / 1000).toFixed(0)} שניות`);
  console.log(
    `תקין ${totals.pass} · לא תקין ${totals.fail} (מהם ${totals.unverified} לא אומתו) · לא רלוונטי ${totals.na}`,
  );
  if (report.stats.llmCalls > 0) {
    console.log(`שיקול דעת: ${report.stats.llmCalls} קריאות · $${report.stats.llmCostUsd.toFixed(2)}`);
  }
  if (report.stats.skipped.length > 0) {
    console.log(`לא נסרקו: ${report.stats.skipped.length} כתובות (מפורטות בדוח)`);
  }
  if (totals.unverified > 0) {
    console.log(
      `\nשים לב: ${totals.unverified} שורות לא אומתו ואינן מהוות ממצא של אי-עמידה. יש לבדוק אותן ידנית.`,
    );
  }

  console.log('\nדוחות:');
  for (const w of emitted.written) console.log(`  ${w.format.padEnd(5)} ${w.path}`);
  for (const f of emitted.failed) console.log(`  ${f.format.padEnd(5)} נכשל: ${f.reason}`);
  console.log('─'.repeat(72));
}

function phaseLabel(phase: string): string {
  return (
    { crawl: 'סריקת האתר', statement: 'בדיקת הצהרת הנגישות', evaluate: 'הערכת קריטריונים', judge: 'שיקול דעת', documents: 'ניתוח מסמכים' }[
      phase
    ] ?? phase
  );
}

// ── arg parsing ─────────────────────────────────────────────────────────────

interface Args {
  positional: string[];
  values: Record<string, string | undefined>;
  multi: Record<string, string[] | undefined>;
  flags: Record<string, boolean>;
}

const REPEATABLE = new Set(['include', 'exclude']);

function parseArgs(argv: string[]): Args {
  const args: Args = { positional: [], values: {}, multi: {}, flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (!token.startsWith('--')) {
      args.positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (key.startsWith('no-') || next === undefined || next.startsWith('--')) {
      args.flags[key] = true;
      continue;
    }
    if (REPEATABLE.has(key)) {
      (args.multi[key] ??= []).push(next);
    } else {
      args.values[key] = next;
    }
    i++;
  }
  return args;
}

function parseFormats(raw: string | undefined): ReportFormat[] | null {
  if (!raw) return ALL_FORMATS;
  const parts = raw.split(',').map((p) => p.trim().toLowerCase());
  const invalid = parts.filter((p) => !ALL_FORMATS.includes(p as ReportFormat));
  if (invalid.length) {
    console.error(`Unknown format(s): ${invalid.join(', ')}. Valid: ${ALL_FORMATS.join(', ')}`);
    return null;
  }
  return parts as ReportFormat[];
}

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normaliseUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
