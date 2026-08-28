/** Manual smoke check for the probe + axe + keyboard walk against a fixture. */

import { BrowserDriver } from '../src/crawl/browser.ts';
import { DEFAULT_OPTIONS, type ScanOptions } from '../src/types.ts';

const url = process.argv[2] ?? 'http://localhost:4177/broken/';
const options: ScanOptions = { ...DEFAULT_OPTIONS, url, outDir: './.smoke' };

const driver = new BrowserDriver(options);
await driver.start();
const bundle = await driver.visit(url);
await driver.stop();

if (bundle.error) {
  console.error('LOAD ERROR:', bundle.error);
  process.exit(1);
}

const e = bundle.evidence;
console.log('status         ', bundle.status);
console.log('title          ', JSON.stringify(e.meta.title), '| site:', e.meta.siteName);
console.log('lang / dir     ', e.meta.lang, '/', e.meta.dir, '| blocksZoom:', e.meta.blocksZoom);
console.log('templateHash   ', e.templateHash);
console.log('counts         ', JSON.stringify(e.counts));
console.log('axe violations ', bundle.axe?.violations.map((v) => `${v.id}(${v.nodes.length})`).join(' ') ?? 'axe failed');
console.log('fakeHeadings   ', JSON.stringify((e.structure as { fakeHeadings: unknown[] }).fakeHeadings));
console.log('fakeLists      ', ((e.structure as { fakeLists: unknown[] }).fakeLists).length);
console.log('presentational ', JSON.stringify((e.structure as { presentational: { tag: string }[] }).presentational.map((p) => p.tag)));
console.log('generic links  ', (e.links as { generic: boolean; text: string }[]).filter((l) => l.generic).map((l) => l.text));
console.log('ambiguous links', (e.links as { ambiguous: boolean; text: string }[]).filter((l) => l.ambiguous).map((l) => l.text));
console.log('sensory        ', JSON.stringify(e.sensoryText));
console.log('ltrIslands     ', JSON.stringify((e.language as { ltrIslands: { kind: string; match: string }[] }).ltrIslands.map((i) => `${i.kind}:${i.match}`)));
console.log('foreignRuns    ', (e.language as { foreignRuns: unknown[] }).foreignRuns.length);
console.log('englishNames   ', JSON.stringify((e.language as { englishAccessibleNames: unknown[] }).englishAccessibleNames));
console.log('duplicateIds   ', JSON.stringify((e.markup as { duplicateIds: { id: string }[] }).duplicateIds.map((d) => d.id)));
console.log('pseudoControls ', JSON.stringify((e.aria as { pseudoControls: { text: string }[] }).pseudoControls.map((p) => p.text)));
console.log('iconOnlyBtns   ', (e.aria as { iconOnlyButtons: unknown[] }).iconOnlyButtons.length);
console.log('placeholderOnly', (e.forms as { controls: { placeholderOnly: boolean; placeholder: string }[] }).controls.filter((c) => c.placeholderOnly).map((c) => c.placeholder));
console.log('motion         ', JSON.stringify({
  animated: (e.motion as { animated: { fastFlashRisk: boolean }[] }).animated.length,
  flashRisk: (e.motion as { animated: { fastFlashRisk: boolean }[] }).animated.filter((a) => a.fastFlashRisk).length,
  deprecated: (e.motion as { deprecated: { tag: string }[] }).deprecated.map((d) => d.tag),
  timers: (e.motion as { timers: { delayMs: number }[] }).timers.map((t) => t.delayMs),
}));
console.log('skipLinks      ', (e.navigation as { skipLinks: unknown[] }).skipLinks.length);
console.log('statementLinks ', (e.navigation as { statementLinks: unknown[] }).statementLinks.length);
console.log('media          ', JSON.stringify((e.media as { kind: string; accessibleName: string; hasCaptionTrack: boolean }[]).map((m) => `${m.kind}/name=${JSON.stringify(m.accessibleName)}/cc=${m.hasCaptionTrack}`)));
console.log('keyboard stops ', bundle.keyboard?.stops.length, '| trap:', JSON.stringify(bundle.keyboard?.trap));
console.log('noFocusRing    ', JSON.stringify(bundle.keyboard?.missingFocusIndicator.map((m) => m.tag)));
console.log('unreachable    ', JSON.stringify(bundle.keyboard?.unreachableInteractive.map((u) => u.text)));
console.log('zoom           ', JSON.stringify(bundle.zoom));
