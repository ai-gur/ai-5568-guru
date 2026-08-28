/** End-to-end scan smoke check (no LLM). Prints the report table as text. */

import { scan, loadCatalogue } from '../src/scan.ts';
import { DEFAULT_OPTIONS, type ScanOptions } from '../src/types.ts';
import { VERDICT_HE } from '@ai5568/criteria';

const url = process.argv[2] ?? 'http://localhost:4177/broken/';
const options: ScanOptions = {
  ...DEFAULT_OPTIONS,
  url,
  outDir: './.smoke',
  maxPages: Number(process.argv[3] ?? 3),
  noAi: true,
};

const catalogue = await loadCatalogue();
const items = new Map(catalogue.items.map((i) => [i.id, i]));

const report = await scan(options, null, {
  onPhase: (p, d) => console.error(`[phase] ${p}${d ? ` — ${d}` : ''}`),
});

const ICON = { PASS: 'V', FAIL: 'X', NA: '-' } as const;

for (const page of report.pages) {
  console.log('\n' + '='.repeat(100));
  console.log(`אתר: ${page.siteName}`);
  console.log(`עמוד: ${page.name}`);
  console.log(`כתובת: ${page.url}`);
  console.log(`סיכום: תקין ${page.summary.pass} | לא תקין ${page.summary.fail} (מהם ${page.summary.unverified} לא אומתו) | לא רלוונטי ${page.summary.na}`);
  console.log('-'.repeat(100));
  for (const r of page.results) {
    const item = items.get(r.itemId);
    if (!item) continue;
    const first = r.findings[0];
    const detail = first ? `${first.locator} → ${first.reasonHe}` : (r.noteHe ?? '');
    console.log(
      `${ICON[r.verdict]} ${item.form.criterionNo.padEnd(14)} ${item.form.level.padEnd(2)} ` +
        `${item.form.criterionNameHe.slice(0, 26).padEnd(28)} [${r.method}${r.confidence < 1 ? ` c=${r.confidence}` : ''}] ` +
        `${r.findings.length ? `(${r.findings.length}) ` : ''}${detail.slice(0, 110)}`,
    );
  }
}

console.log('\n' + '='.repeat(100));
console.log('כשלים חוצי-אתר (לפי שיעור הכישלון):');
for (const f of report.siteWideFailures.slice(0, 12)) {
  console.log(`  ${f.criterionNo.padEnd(14)} ${f.criterionNameHe.slice(0, 30).padEnd(32)} ${f.failCount}/${f.total}`);
}
console.log('\nstats:', JSON.stringify(report.stats));
console.log('verdict labels:', JSON.stringify(VERDICT_HE));
