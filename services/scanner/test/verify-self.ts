/**
 * Self-audit: scans the tool's own outputs with the tool.
 *
 * A compliance report distributed as an inaccessible document, or driven by an
 * inaccessible UI, is not a credible artifact. This runs the auditor against
 * its own HTML report and its own web UI and prints any finding.
 *
 *   npm run verify:self
 *
 * It is a report, not a gate. Some rows will always show — the Israeli-addition
 * rows are service-website duties (accessibility statement, Regulation 35
 * widget) that do not apply to a generated report file, and the tool has no way
 * to know what kind of artifact it is looking at. Those are listed separately
 * below so they do not hide a real regression.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitReports } from '../report/src/index.ts';
import { loadCatalogue, scan } from '../src/scan.ts';
import { DEFAULT_OPTIONS, type ScanOptions } from '../src/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIXTURE_PORT = 4181;
const REPORT_PORT = 4182;
const WEB_PORT = 4183;

/** Rows that are site-level duties and cannot apply to a standalone artifact. */
const NOT_APPLICABLE_TO_ARTIFACT = new Set(['IL-1', 'IL-2', 'IL-5', 'IL-6']);

async function waitFor(url: string, label: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`${label} did not come up at ${url}`);
}

async function auditTarget(url: string, label: string): Promise<number> {
  const catalogue = await loadCatalogue();
  const items = new Map(catalogue.items.map((i) => [i.id, i]));

  const options: ScanOptions = {
    ...DEFAULT_OPTIONS,
    url,
    outDir: await mkdtemp(join(tmpdir(), 'is5568-self-')),
    maxPages: 1,
    maxDepth: 0,
    documents: false,
    noAi: true,
  };

  const report = await scan(options, null);
  const page = report.pages[0];
  await rm(options.outDir, { recursive: true, force: true }).catch(() => undefined);

  console.log(`\n${'='.repeat(74)}\n${label}\n${url}\n${'='.repeat(74)}`);
  if (!page) {
    console.log('  לא נסרק.');
    return 1;
  }

  const real = page.results.filter((r) => r.verdict === 'FAIL' && r.confidence > 0);
  const artifactRows = real.filter((r) => NOT_APPLICABLE_TO_ARTIFACT.has(items.get(r.itemId)?.form.criterionNo ?? ''));
  const genuine = real.filter((r) => !NOT_APPLICABLE_TO_ARTIFACT.has(items.get(r.itemId)?.form.criterionNo ?? ''));

  console.log(
    `  תקין ${page.summary.pass} · לא תקין ${page.summary.fail} ` +
      `(מהם ${page.summary.unverified} לא אומתו) · לא רלוונטי ${page.summary.na}`,
  );

  if (genuine.length === 0) {
    console.log('\n  ✔ אין ממצאים ממשיים.');
  } else {
    console.log(`\n  ✘ ${genuine.length} ממצאים ממשיים:`);
    for (const r of genuine) {
      const item = items.get(r.itemId);
      console.log(`     ${item?.form.criterionNo}  ${item?.form.criterionNameHe}`);
      for (const f of r.findings.slice(0, 3)) {
        console.log(`        ${f.locator}`);
        console.log(`        ${f.reasonHe.slice(0, 150)}`);
      }
    }
  }

  if (artifactRows.length) {
    console.log(`\n  — ${artifactRows.length} שורות חובה ברמת האתר שאינן חלות על קובץ בודד:`);
    for (const r of artifactRows) {
      const item = items.get(r.itemId);
      console.log(`     ${item?.form.criterionNo}  ${item?.form.criterionNameHe}`);
    }
  }

  return genuine.length;
}

async function main(): Promise<void> {
  const procs: ChildProcess[] = [];
  const started: string[] = [];

  try {
    // 1. Produce a report from the fixture, then audit that report.
    procs.push(spawn(process.execPath, [resolve(ROOT, 'fixtures/serve.mjs'), String(FIXTURE_PORT)], { stdio: 'ignore', cwd: ROOT }));
    await waitFor(`http://localhost:${FIXTURE_PORT}/broken/`, 'fixture server');

    const outDir = resolve(ROOT, '.self-review');
    const catalogue = await loadCatalogue();
    const report = await scan(
      { ...DEFAULT_OPTIONS, url: `http://localhost:${FIXTURE_PORT}/broken/`, outDir, maxPages: 1, maxDepth: 0, documents: false, noAi: true },
      null,
    );
    const emitted = await emitReports(report, catalogue, outDir, ['html', 'pdf']);
    for (const f of emitted.failed) console.error(`  אזהרה: לא הופק ${f.format}: ${f.reason}`);

    procs.push(spawn(process.execPath, [resolve(ROOT, 'fixtures/serve.mjs'), String(REPORT_PORT), outDir], { stdio: 'ignore', cwd: ROOT }));
    await waitFor(`http://localhost:${REPORT_PORT}/report.html`, 'report server');
    started.push('report');

    // 2. Start the web UI and audit it too.
    procs.push(
      spawn(process.execPath, ['--experimental-strip-types', resolve(ROOT, 'packages/web/src/server.ts')], {
        stdio: 'ignore',
        cwd: ROOT,
        env: { ...process.env, PORT: String(WEB_PORT) },
      }),
    );
    await waitFor(`http://127.0.0.1:${WEB_PORT}/`, 'web UI');
    started.push('web');

    const a = await auditTarget(`http://localhost:${REPORT_PORT}/report.html`, 'דוח ה-HTML של הכלי');
    const b = await auditTarget(`http://127.0.0.1:${WEB_PORT}/`, 'ממשק הווב של הכלי');

    console.log(`\n${'='.repeat(74)}`);
    console.log(`סה"כ ממצאים ממשיים: ${a + b}`);
    console.log(
      'שורות שסומנו כלא-אומתו דורשות בדיקה ידנית ואינן ממצא. ' +
        'ראו "Known limitations" ב-README.',
    );
    console.log('='.repeat(74));
  } finally {
    for (const p of procs) p.kill();
    void started;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
