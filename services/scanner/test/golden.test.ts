/**
 * Golden tests.
 *
 * These lock in the two properties that make the tool worth trusting:
 *
 *   1. It catches what it claims to catch (the broken fixture).
 *   2. It does **not** fail compliant content (the good fixture).
 *
 * Property 2 is the one that usually rots. A checker drifting towards
 * "everything fails" still looks vigilant, and nobody notices until an operator
 * spends a week chasing findings that were never defects. The assertions below
 * therefore bound the *upper* number of failures on the good fixture, not just
 * the lower number on the broken one.
 *
 *   node --test --experimental-strip-types packages/engine/test/golden.test.ts
 *
 * The fixture server is started by the test itself, on a port inside the
 * 4001–4998 range this machine reserves.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAxeMapping } from '../src/checks/axe-map.ts';
import { toCounts } from '../src/checks/applicability.ts';
import { canonicalize, classifyLink, registrableDomain } from '../src/crawl/url.ts';
import { loadCatalogue, scan } from '../src/scan.ts';
import { DEFAULT_OPTIONS, type ScanOptions } from '../src/types.ts';
import type { TargetReport } from '../src/types.ts';
import type { Catalogue } from '@ai5568/criteria';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;
let catalogue: Catalogue;

before(async () => {
  catalogue = await loadCatalogue();
  server = spawn(process.execPath, [resolve(ROOT, 'fixtures/serve.mjs'), String(PORT)], {
    stdio: 'ignore',
    cwd: ROOT,
  });
  // Poll rather than sleep — the port is either accepting or it is not.
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/broken/`, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`fixture server did not come up on ${BASE}`);
});

after(() => {
  server?.kill();
});

function options(url: string, maxPages = 1): ScanOptions {
  return {
    ...DEFAULT_OPTIONS,
    url,
    outDir: resolve(ROOT, '.test-output'),
    maxPages,
    maxDepth: 1,
    documents: false,
    // The golden tests must be deterministic and offline; the judgement layer
    // is exercised separately.
    noAi: true,
  };
}

/** Failures with an actual finding, as opposed to rows nothing could verify. */
function realFailures(target: TargetReport): { criterionNo: string; name: string }[] {
  const items = new Map(catalogue.items.map((i) => [i.id, i]));
  return target.results
    .filter((r) => r.verdict === 'FAIL' && r.confidence > 0)
    .map((r) => ({
      criterionNo: items.get(r.itemId)?.form.criterionNo ?? r.itemId,
      name: items.get(r.itemId)?.form.criterionNameHe ?? '',
    }));
}

describe('catalogue', () => {
  it('contains every row of the official check sheet plus part 2 and the Israeli additions', () => {
    const part1 = catalogue.items.filter((i) => i.engine.part === 1);
    const part2 = catalogue.items.filter((i) => i.engine.part === 2);
    const israeli = catalogue.items.filter((i) => i.engine.part === 'IL');

    assert.equal(part1.length, 42, 'the check sheet has 42 rows');
    assert.equal(part2.length, 12, 'part 2 has 11 criteria plus the complex-information clause');
    assert.equal(israeli.length, 6);
  });

  it("preserves the sheet's own levels where they differ from WCAG", () => {
    const byRow = new Map(catalogue.items.map((i) => [i.id, i]));
    // WCAG has 1.2.1 at level A; the Israeli sheet marks it AA.
    assert.equal(byRow.get('R08')?.form.level, 'AA');
    // WCAG has 2.4.10 at AAA; the sheet marks it AA.
    assert.equal(byRow.get('R34')?.form.level, 'AA');
  });

  it('gives every row a two-sentence summary and a rubric', () => {
    for (const item of catalogue.items) {
      assert.ok(item.engine.summaryHe.length > 0, `${item.id} has no summary`);
      assert.ok(item.engine.rubricHe.length > 0, `${item.id} has no rubric`);
      const sentences = item.engine.summaryHe.split(/(?<=[.!?])\s+/).filter(Boolean);
      assert.ok(sentences.length <= 2, `${item.id} summary is ${sentences.length} sentences, max is 2`);
    }
  });

  it('maps only axe rules that the installed axe-core actually provides', () => {
    // A renamed rule would silently make a row unfailable, which is worse than
    // a crash — buildAxeMapping throws instead.
    assert.doesNotThrow(() => buildAxeMapping(catalogue));
  });
});

describe('URL handling', () => {
  it('strips tracking parameters but keeps parameters that identify the page', () => {
    assert.equal(
      canonicalize('https://a.co.il/p?utm_source=x&id=42&fbclid=y'),
      'https://a.co.il/p?id=42',
    );
  });

  it('treats /index.html and / as the same document', () => {
    assert.equal(canonicalize('https://a.co.il/index.html'), 'https://a.co.il/');
  });

  it('recognises Israeli multi-label domains', () => {
    assert.equal(registrableDomain('www.shop.example.co.il'), 'example.co.il');
    assert.equal(registrableDomain('sub.gov.il'), 'sub.gov.il');
  });

  it('routes documents to the part 2 pipeline and ignores assets', () => {
    assert.equal(classifyLink('https://a.co.il/f.pdf').kind, 'document');
    assert.equal(classifyLink('https://a.co.il/f.docx').docType, 'docx');
    assert.equal(classifyLink('https://a.co.il/style.css').kind, 'ignore');
    assert.equal(classifyLink('https://a.co.il/page').kind, 'page');
  });
});

describe('applicability counts', () => {
  it('refuses to default a missing count to zero', () => {
    // Zero means "subject absent", which means "not applicable" — so silently
    // defaulting would turn a probe bug into a clean-looking report.
    assert.throws(() => toCounts({ images: 3 }, 1), /did not report these counts/);
  });
});

describe('the broken fixture', () => {
  it('catches the defects it was built to contain', async () => {
    const report = await scan(options(`${BASE}/broken/`), null);
    const page = report.pages[0];
    assert.ok(page, 'the fixture page was scanned');

    const failed = new Set(realFailures(page).map((f) => f.criterionNo));

    // One assertion per planted defect, so a regression names itself.
    const expected: [string, string][] = [
      ['1.1.1', 'images with no alt and an alt that is a filename'],
      ['1.3.1', 'a styled pseudo-heading and presentational <font>/<center>'],
      ['1.4.1', 'links distinguished by colour alone'],
      ['1.4.3', 'insufficient contrast'],
      ['1.4.4', 'viewport blocks zoom'],
      ['1.4.5', 'a banner image carrying text'],
      ['2.1.1', 'a div with onclick that Tab never reaches'],
      ['2.2.1', 'a 15-minute timer with no way to extend it'],
      ['2.2.2', '<marquee>'],
      ['2.4.1', 'no skip link and no main landmark'],
      ['2.4.4', 'two "לחץ כאן" links with different destinations'],
      ['2.4.7', 'outline:none with no replacement'],
      ['3.1.1', 'no lang attribute'],
      ['3.1.2', 'an English paragraph with no lang'],
      ['3.3.2', 'placeholder used as the label'],
      ['4.1.1', 'duplicate id'],
      ['4.1.2', 'an icon-only button and an untitled iframe'],
      ['IL-1', 'no accessibility statement'],
      ['IL-3', 'phone numbers not marked dir="ltr"'],
    ];

    for (const [criterion, why] of expected) {
      assert.ok(
        [...failed].some((f) => f.startsWith(criterion)),
        `expected criterion ${criterion} to fail (${why}); failing rows were: ${[...failed].join(', ')}`,
      );
    }
  });
});

describe('the compliant fixture', () => {
  it('does not report defects that are not there', async () => {
    const report = await scan(options(`${BASE}/good/`, 2), null);
    const page = report.pages.find((p) => p.url.includes('/good'));
    assert.ok(page, 'the good fixture page was scanned');

    const failures = realFailures(page);

    // The fixture has no Regulation 35 preferences widget — that is a real,
    // expected finding. Anything else is a false positive and a bug.
    const unexpected = failures.filter((f) => !f.criterionNo.startsWith('IL-5'));
    assert.deepEqual(
      unexpected,
      [],
      `compliant fixture produced false positives: ${unexpected.map((f) => `${f.criterionNo} ${f.name}`).join(' | ')}`,
    );
  });

  it('produces real passes, not just an absence of failures', async () => {
    const report = await scan(options(`${BASE}/good/`, 2), null);
    const page = report.pages.find((p) => p.url.includes('/good'));
    assert.ok(page);
    assert.ok(
      page.summary.pass >= 3,
      `expected the compliant fixture to pass several criteria outright, got ${page.summary.pass}`,
    );
  });

  it('recognises a complete accessibility statement', async () => {
    const report = await scan(options(`${BASE}/good/`, 2), null);
    const page = report.pages.find((p) => p.url.includes('/good'));
    assert.ok(page);

    // These rows are `hybrid`, so without the judgement layer they resolve to
    // "unverified" rather than to a pass — that is the correct discipline, not
    // a defect. What must not happen is a *finding*: the statement is complete,
    // so the rule has nothing to report.
    for (const row of page.results.filter((r) => r.itemId === 'IL01' || r.itemId === 'IL02')) {
      assert.deepEqual(
        row.findings,
        [],
        `statement row ${row.itemId} reported findings despite a complete statement: ` +
          row.findings.map((f) => f.reasonHe).join(' | '),
      );
      assert.ok(
        row.verdict !== 'FAIL' || row.confidence === 0,
        `statement row ${row.itemId} was failed with confidence, not merely left unverified`,
      );
    }
  });
});

describe('part 2 — documents', () => {
  /**
   * Runs the Python sidecar directly. The document pipeline's value is in what
   * the analyser extracts; the verdict layer over it is the same code the page
   * tests already cover.
   */
  async function analyse(file: string, kind: string): Promise<Record<string, any>> {
    const { spawn } = await import('node:child_process');
    const script = resolve(ROOT, 'sidecar/analyze_document.py');
    const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const job = [{ path: resolve(ROOT, 'fixtures/docs', file), kind, url: `file://${file}` }];

    return new Promise((resolvePromise, reject) => {
      const child = spawn(python, [script], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c: string) => (out += c));
      child.on('error', reject);
      child.on('close', () => {
        try {
          resolvePromise((JSON.parse(out) as Record<string, any>[])[0]!);
        } catch (err) {
          reject(new Error(`sidecar returned unparseable output: ${out.slice(0, 200)}`));
        }
      });
      child.stdin.end(JSON.stringify(job));
    });
  }

  it('detects a manually-styled heading that was never marked up', async () => {
    const facts = await analyse('bad.docx', 'docx');
    const fake = (facts.headings as { fake?: boolean }[]).filter((h) => h.fake);
    assert.ok(fake.length > 0, 'the bolded 18pt paragraph should be reported as an unmarked heading');
  });

  it('detects hand-typed bullets and an unmarked table header row', async () => {
    const facts = await analyse('bad.docx', 'docx');
    assert.ok(
      (facts.lists as { manual?: boolean }[]).some((l) => l.manual),
      'typed "-" bullets should be reported as a manual list',
    );
    assert.ok(
      (facts.tables as { headerRowMarked?: boolean }[]).some((t) => !t.headerRowMarked),
      'a table with no repeat-header row should be reported',
    );
    assert.equal(facts.title, null, 'the document has no Title property');
  });

  it('accepts a correctly authored document', async () => {
    const facts = await analyse('good.docx', 'docx');
    assert.ok(facts.title, 'the document Title is read');
    const real = (facts.headings as { fake?: boolean; level?: number }[]).filter((h) => !h.fake);
    assert.ok(real.length >= 2, 'real heading styles are recognised');
    assert.deepEqual(
      real.map((h) => h.level),
      [1, 2],
      'the heading hierarchy is read in order and without gaps',
    );
    assert.equal(
      (facts.headings as { fake?: boolean }[]).filter((h) => h.fake).length,
      0,
      'a correctly authored document must not produce pseudo-heading findings',
    );
  });

  it('applies the part 2 large-text thresholds, not the web ones', async () => {
    const { PART2_TEXT_THRESHOLDS } = await import('@ai5568/criteria');
    // Section 3.6: documents are measured in points, the web in pixels. Using
    // the web values on a Word document is a silent, common error.
    assert.equal(PART2_TEXT_THRESHOLDS.document.largePt, 14);
    assert.equal(PART2_TEXT_THRESHOLDS.document.veryLargePt, 18);
    assert.equal(PART2_TEXT_THRESHOLDS.web.largePx, 18.5);
  });
});

describe('verdict discipline', () => {
  it('never reports an unverified row as passing', async () => {
    const report = await scan(options(`${BASE}/good/`, 2), null);
    for (const page of report.pages) {
      for (const r of page.results) {
        if (r.confidence === 0) {
          assert.notEqual(r.verdict, 'PASS', `${r.itemId} passed with zero confidence`);
          assert.notEqual(r.verdict, 'NA', `${r.itemId} was marked NA with zero confidence`);
        }
      }
    }
  });

  it('gives every Not Applicable row a stated reason', async () => {
    const report = await scan(options(`${BASE}/good/`, 2), null);
    for (const page of report.pages) {
      for (const r of page.results.filter((x) => x.verdict === 'NA')) {
        assert.ok(r.noteHe && r.noteHe.length > 0, `${r.itemId} is NA with no reason given`);
      }
    }
  });

  it('reports every catalogue row for every page', async () => {
    const report = await scan(options(`${BASE}/broken/`), null);
    const page = report.pages[0];
    assert.ok(page);
    const expected = catalogue.items.filter((i) => i.engine.appliesTo.includes('page')).length;
    assert.equal(page.results.length, expected, 'every applicable row must appear, none silently dropped');
  });
});
