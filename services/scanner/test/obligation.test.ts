/**
 * Regulation 35ו exempts by turnover, 35ד bounds the video duty the same way.
 *
 * The tests that matter most here are the ones asserting what does NOT happen:
 * an absent field must never buy an exemption. A duty-bearer who tells us
 * nothing gets the full review.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CheckItem } from '@ai5568/criteria';
import type { ObligationProfile } from '@ai5568/report-contract';
import { bindingLevel, rowExemption, siteWideExemption } from '../src/checks/obligation.ts';

function item(criterionNo: string): CheckItem {
  return { id: 'X', form: { criterionNo }, engine: {} } as unknown as CheckItem;
}

const video = item('1.2.2');
const images = item('1.1.1');

describe('site-wide exemption — reg. 35ו', () => {
  it('exempts an עוסק פטור or turnover at or below 100,000', () => {
    const e = siteWideExemption({ averageTurnoverIls: 100_000 });
    assert.ok(e);
    assert.equal(e.clause, 'תקנה 35ו(ז)');
  });

  it('does not exempt just above the threshold', () => {
    assert.equal(siteWideExemption({ averageTurnoverIls: 100_001 }), null);
  });

  it('exempts a legacy site under 1,000,000 — but only a legacy one', () => {
    const legacy: ObligationProfile = { averageTurnoverIls: 900_000, serviceStartedBefore2017: true };
    assert.equal(siteWideExemption(legacy)?.clause, 'תקנה 35ו(ט)');

    // 35ו(ט) covers a site already being operated before the regulations came
    // into force. A new site at the same turnover carries the full duty.
    assert.equal(siteWideExemption({ averageTurnoverIls: 900_000, serviceStartedBefore2017: false }), null);
    assert.equal(siteWideExemption({ averageTurnoverIls: 900_000 }), null, 'unstated is not the same as true');
  });

  it('never exempts a public authority on turnover', () => {
    assert.equal(siteWideExemption({ publicAuthority: true, averageTurnoverIls: 50_000 }), null);
  });

  it('grants nothing when nothing was stated', () => {
    // The whole point: silence must not buy relief.
    assert.equal(siteWideExemption(undefined), null);
    assert.equal(siteWideExemption({}), null);
  });
});

describe('video duty — reg. 35ד', () => {
  it('lifts the video rows below 5,000,000', () => {
    const e = rowExemption(video, { averageTurnoverIls: 4_000_000 });
    assert.ok(e);
    assert.equal(e.clause, 'תקנה 35ד(א)');
  });

  it('keeps them above it', () => {
    assert.equal(rowExemption(video, { averageTurnoverIls: 6_000_000 }), null);
  });

  it('keeps them for a public authority at any turnover', () => {
    assert.equal(rowExemption(video, { publicAuthority: true, averageTurnoverIls: 1 }), null);
  });

  it('lifts them for someone who neither edits nor produces video, at any turnover', () => {
    // The definition of "חייב בהנגשת תוכני וידאו" is about the activity, and
    // that test comes before the turnover one.
    const e = rowExemption(video, { editsOrProducesVideo: false, averageTurnoverIls: 50_000_000 });
    assert.ok(e);
    assert.match(e.reasonHe, /עורך או מפיק/);
  });

  it('touches only the 1.2 rows', () => {
    assert.equal(rowExemption(images, { averageTurnoverIls: 1_000 }), null);
  });

  it('grants nothing when nothing was stated', () => {
    assert.equal(rowExemption(video, undefined), null);
    assert.equal(rowExemption(video, {}), null);
  });
});

describe('binding level — reg. 35א(ב)', () => {
  it('holds a public authority at AA even if A was requested', () => {
    assert.equal(bindingLevel({ publicAuthority: true }, 'A'), 'AA');
  });

  it('does not infer level A from turnover', () => {
    // Dropping to A requires an undue-burden exemption under s.19יב, which
    // somebody else grants. It is not something to guess from a number.
    assert.equal(bindingLevel({ averageTurnoverIls: 150_000 }, 'AA'), 'AA');
  });

  it('honours an explicitly requested level A', () => {
    assert.equal(bindingLevel({}, 'A'), 'A');
  });
});
