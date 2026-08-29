import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCustomRule, type RuleContext, type SiteContext } from '../src/checks/custom-rules.ts';
import type { PageBundle, PageEvidence } from '../src/crawl/browser.ts';

/*
 * From a real scan of a bilingual site. 3.2.4 was failed on all sixteen pages
 * because the skip link is called "דלג לתוכן הראשי" on the Hebrew pages and
 * "Skip to main content" on the English ones. That is the translation working,
 * not a defect — and it is exactly the kind of finding that costs an operator a
 * day and teaches them to distrust the report.
 */

const HE = 'https://example.co.il/he';
const HE2 = 'https://example.co.il/he/about';
const EN = 'https://example.co.il/en';

function siteWith(langs: Record<string, string | null>, names: Record<string, Record<string, string>>): SiteContext {
  return {
    pageCount: Object.keys(names).length,
    titles: new Map(),
    navSequences: new Map(),
    componentNames: new Map(Object.entries(names).map(([url, n]) => [url, new Map(Object.entries(n))])),
    langs: new Map(Object.entries(langs)),
    statementUrl: null,
    statementContent: null,
    hasSearch: false,
    hasSitemap: false,
    hasBreadcrumbs: false,
  };
}

function ctx(url: string, site: SiteContext): RuleContext {
  return {
    bundle: { url } as PageBundle,
    evidence: {} as PageEvidence,
    site,
    notes: [],
  };
}

test('a translated label is not an inconsistency', () => {
  const site = siteWith(
    { [HE]: 'he', [HE2]: 'he', [EN]: 'en' },
    {
      [HE]: { skip: 'דלג לתוכן הראשי' },
      [HE2]: { skip: 'דלג לתוכן הראשי' },
      [EN]: { skip: 'Skip to main content' },
    },
  );
  assert.deepEqual(runCustomRule('component-identity', ctx(HE, site)), []);
  assert.deepEqual(runCustomRule('component-identity', ctx(EN, site)), []);
});

test('an inconsistency inside one language is still reported', () => {
  // The row must keep working — scoping it must not amount to disabling it.
  const site = siteWith(
    { [HE]: 'he', [HE2]: 'he', [EN]: 'en' },
    {
      [HE]: { contact: 'יצירת קשר' },
      [HE2]: { contact: 'contact@example.co.il' },
      [EN]: { contact: 'Contact us' },
    },
  );
  const findings = runCustomRule('component-identity', ctx(HE, site));
  assert.equal(findings?.length, 1);
  const [only] = findings ?? [];
  assert.ok(only, 'expected a finding');
  assert.match(only.reasonHe, /contact@example\.co\.il/);
  assert.doesNotMatch(only.reasonHe, /Contact us/);
});

test('with no declared language, comparison still happens', () => {
  // Over-reporting is visible to a reader; a silently disabled row is not.
  const site = siteWith(
    { [HE]: null, [HE2]: null },
    { [HE]: { search: 'חיפוש' }, [HE2]: { search: 'חפש' } },
  );
  assert.equal(runCustomRule('component-identity', ctx(HE, site))?.length, 1);
});

test('a regional tag matches its base language', () => {
  const site = siteWith(
    { [HE]: 'he-IL', [HE2]: 'he' },
    { [HE]: { menu: 'תפריט' }, [HE2]: { menu: 'תפריט ראשי' } },
  );
  assert.equal(runCustomRule('component-identity', ctx(HE, site))?.length, 1);
});
