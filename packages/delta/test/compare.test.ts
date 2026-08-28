/**
 * The four outcomes are the honesty guarantee of the paid product. Two of them
 * exist only to stop the tool flattering itself, so they are the ones tested
 * hardest here:
 *
 *   a row that broke while we were fixing something else must surface;
 *   a row we could not re-check must never be counted as fixed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CheckResult, ScanReport } from '@ai5568/report-contract';
import { compare } from '../src/index.ts';
import { artifactKey } from '@ai5568/report-contract';

function row(itemId: string, verdict: 'PASS' | 'FAIL' | 'NA', confidence: number, locators: string[] = []): CheckResult {
  return {
    itemId,
    verdict,
    method: 'auto',
    confidence,
    findings: locators.map((locator) => ({ locator, reasonHe: 'בדיקה' })),
  };
}

function report(results: CheckResult[], catalogueVersion: string | null = '2026.08.1'): ScanReport {
  return {
    site: { name: 'x', startUrl: 'https://a.co.il/', origin: 'https://a.co.il' },
    options: {} as ScanReport['options'],
    catalogueSource: { file: 'f', sheet: 's', importedAt: '' },
    catalogue: catalogueVersion
      ? { version: catalogueVersion, effectiveFrom: '2026-08-01', source: { file: 'form.xlsx' } }
      : undefined,
    startedAt: '2026-08-01T00:00:00Z',
    finishedAt: '2026-08-01T00:01:00Z',
    pages: [
      {
        kind: 'page',
        url: 'https://a.co.il/',
        name: 'home',
        siteName: 'x',
        results,
        summary: { pass: 0, fail: 0, na: 0, unverified: 0 },
        scannedAt: '2026-08-01T00:00:30Z',
      },
    ],
    documents: [],
    siteWideFailures: [],
    stats: { pagesScanned: 1, pagesFailed: 0, documentsScanned: 0, llmCalls: 0, llmCostUsd: 0, skipped: [] },
  };
}

describe('delta', () => {
  it('reports a genuine fix, and names the locator that cleared', () => {
    const d = compare(report([row('R04', 'FAIL', 1, ['img#a'])]), report([row('R04', 'PASS', 1)]));
    assert.equal(d.summary.fixed, 1);
    assert.equal(d.rows[0]?.outcome, 'fixed');
    assert.deepEqual(d.rows[0]?.clearedLocators, ['img#a']);
  });

  it('does NOT call a row fixed when it merely became unverifiable', () => {
    // The single most tempting lie a remediation tool can tell.
    const d = compare(report([row('R04', 'FAIL', 1, ['img#a'])]), report([row('R04', 'FAIL', 0)]));
    assert.equal(d.summary.fixed, 0, 'an unverified row is not progress');
    assert.equal(d.summary.unverified, 1);
    assert.equal(d.rows[0]?.outcome, 'unverified');
    assert.ok(d.rows[0]?.noteHe, 'the reason it could not be verified must be stated');
  });

  it('does NOT call a row fixed when it simply disappeared from the review', () => {
    // Absence is not evidence: nothing checked it.
    const d = compare(report([row('R04', 'FAIL', 1, ['img#a'])]), report([]));
    assert.equal(d.summary.fixed, 0);
    assert.equal(d.rows[0]?.outcome, 'unverified');
  });

  it('surfaces a row that broke while something else was being fixed', () => {
    const d = compare(
      report([row('R04', 'FAIL', 1, ['img#a']), row('R34', 'PASS', 1)]),
      report([row('R04', 'PASS', 1), row('R34', 'FAIL', 1, ['h2#x'])]),
    );
    assert.equal(d.summary.fixed, 1);
    assert.equal(d.summary.newlyBroken, 1);
    assert.equal(d.summary.netProgress, 0, 'one closed and one opened is not an improvement');
  });

  it('reports negative net progress rather than hiding it', () => {
    const d = compare(
      report([row('R04', 'PASS', 1), row('R34', 'PASS', 1)]),
      report([row('R04', 'FAIL', 1, ['a']), row('R34', 'FAIL', 1, ['b'])]),
    );
    assert.equal(d.summary.netProgress, -2);
  });

  it('tracks locator-level movement inside a row that still fails', () => {
    const d = compare(
      report([row('R04', 'FAIL', 1, ['img#a', 'img#b'])]),
      report([row('R04', 'FAIL', 1, ['img#b', 'img#c'])]),
    );
    assert.equal(d.rows[0]?.outcome, 'stillBroken');
    assert.deepEqual(d.rows[0]?.clearedLocators, ['img#a']);
    assert.deepEqual(d.rows[0]?.newLocators, ['img#c']);
  });

  it('refuses to call it a delta across catalogue versions', () => {
    // Regulation 35 defines the standard as a rolling reference, so a row can
    // change because the standard did. That is different news for the customer.
    const d = compare(report([row('R04', 'FAIL', 1, ['a'])], '2026.08.1'), report([row('R04', 'PASS', 1)], '2026.09.1'));
    assert.equal(d.comparable, false);
    assert.match(d.incomparableReasonHe ?? '', /גרסאות קטלוג שונות/);
  });

  it('refuses to compare when a report does not state its catalogue version', () => {
    const d = compare(report([row('R04', 'FAIL', 1, ['a'])], null), report([row('R04', 'PASS', 1)]));
    assert.equal(d.comparable, false);
  });

  it('lists targets that appeared or vanished between reviews', () => {
    const base = report([row('R04', 'PASS', 1)]);
    const next = report([row('R04', 'PASS', 1)]);
    next.pages[0]!.url = 'https://a.co.il/new';
    const d = compare(base, next);
    assert.deepEqual(d.targetsAdded, ['https://a.co.il/new']);
    assert.deepEqual(d.targetsRemoved, ['https://a.co.il/']);
  });
});

describe('artifact retention', () => {
  /**
   * Retention is enforced by R2 lifecycle rules keyed on prefix, so a key built
   * with the wrong prefix means the rule silently does not apply. These pin the
   * mapping the bucket was configured against.
   */

  it('routes screenshots to the 90-day prefix', () => {
    assert.match(artifactKey('run-1', 'screenshot', 'home.png'), /^screenshots\/run-1\//);
  });

  it('routes the delta baseline to the prefix that has no expiry', () => {
    // Deleting this destroys the ability to show that anything improved.
    assert.match(artifactKey('run-1', 'json', 'report.json'), /^data\/run-1\//);
    assert.match(artifactKey('run-1', 'fix_plan', 'plan.json'), /^data\/run-1\//);
  });

  it('routes customer deliverables to the one-year prefix', () => {
    for (const format of ['html', 'pdf', 'xlsx', 'remediation']) {
      assert.match(artifactKey('run-1', format, `report.${format}`), /^reports\/run-1\//, format);
    }
  });

  it('keeps one review together under a single prefix, so deletion is one operation', () => {
    assert.ok(artifactKey('run-9', 'html', 'a.html').includes('/run-9/'));
  });

  it('refuses to let a filename escape its prefix', () => {
    // A crafted name must not walk out of the run's folder and into another's.
    const key = artifactKey('run-1', 'html', '../../etc/passwd');
    assert.equal(key.includes('..'), false);
    assert.match(key, /^reports\/run-1\//);
  });

  it('does not produce a hidden or option-like filename on download', () => {
    assert.match(artifactKey('run-1', 'html', '---rf.html'), /run-1\/rf\.html$/);
    assert.match(artifactKey('run-1', 'html', '.bashrc'), /run-1\/bashrc$/);
  });

  it('never yields an empty name', () => {
    assert.match(artifactKey('run-1', 'html', '...'), /run-1\/artifact$/);
  });
});
