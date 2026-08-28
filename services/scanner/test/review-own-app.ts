/**
 * Review our own app with our own scanner.
 *
 * The knowledge site and the review app both have to clear the standard they
 * are built to check — a tool that reviews other people's accessibility and
 * fails its own is answered before it opens its mouth. This is the gate for
 * that, run by hand against a locally running app:
 *
 *     npm run web -w @ai5568/readiness      # or `next start` on 3568
 *     npm run review:self -w @ai5568/scanner
 *
 * It found five real defects the first time it ran, three of them introduced
 * while building the app: a wordmark styled as a heading, a footer colour pair
 * at 4.07:1, and an aria-controls naming an element that only existed once the
 * panel was open.
 */

import { loadCatalogue, scan } from '../src/scan.ts';
import { DEFAULT_OPTIONS } from '../src/types.ts';

const catalogue = await loadCatalogue();
const items = new Map(catalogue.items.map((i) => [i.id, i]));

const report = await scan(
  {
    ...DEFAULT_OPTIONS,
    url: 'http://127.0.0.1:3568/',
    outDir: '.self-scan',
    maxPages: 4,
    maxDepth: 2,
    documents: false,
    noAi: true,
    allowPrivateNetworkTargets: true,
  },
  null,
);

for (const page of report.pages) {
  const real = page.results.filter((r) => r.verdict === 'FAIL' && r.confidence > 0);
  console.log(`\n${page.url}  —  ${real.length} real findings  (pass ${page.summary.pass}, na ${page.summary.na}, unverified ${page.summary.unverified})`);
  for (const r of real) {
    const it = items.get(r.itemId);
    console.log(`   ✗ ${it?.form.criterionNo} ${it?.form.criterionNameHe}`);
    for (const f of r.findings.slice(0, 3)) console.log(`       ${f.locator} — ${f.reasonHe}`);
  }
}
console.log(`\ncatalogue ${report.catalogue?.version} · pages ${report.stats.pagesScanned}`);
