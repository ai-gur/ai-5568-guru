/**
 * Which duties this particular duty-bearer actually has.
 *
 * Regulation 35ו exempts by turnover, and 35ד bounds the video duty by turnover
 * too. A review that ignores this reports failures against requirements the
 * subject does not have — which is the same class of error as passing something
 * untested, pointing the other way. Both make the report untrustworthy; only
 * one of them looks diligent while doing it.
 *
 * ⚠️ THE RULE THAT MATTERS HERE
 *
 * An absent field means UNKNOWN, and unknown always means the duty applies.
 * Never read a missing turnover as a small one. A duty-bearer who supplies
 * nothing gets the full review, which is the honest default: we would rather
 * report a duty someone turns out to be exempt from than stay silent about one
 * they actually carry.
 */

import type { CheckItem } from '@ai5568/criteria';
import type { ObligationProfile } from '@ai5568/report-contract';

/** Reg. 35ו(ז) — below this, or an עוסק פטור, and סימן ג' does not apply at all. */
export const FULL_EXEMPTION_TURNOVER = 100_000;

/** Reg. 35ו(ט) — below this, a site already running before the regulations took effect. */
export const LEGACY_SITE_EXEMPTION_TURNOVER = 1_000_000;

/** Reg. 35ד — below this, a non-authority carries no video duty. */
export const VIDEO_DUTY_TURNOVER = 5_000_000;

/** When the 2017 amendment took effect; 35ו(ט) turns on whether the site predates it. */
export const REGULATIONS_IN_FORCE_FROM = '2017-10-26';

export interface Exemption {
  /** The provision it comes from, quoted in the report so it can be checked. */
  clause: string;
  reasonHe: string;
}

/**
 * Exemption from סימן ג' as a whole.
 *
 * Returned separately from the per-row check because it changes what the report
 * *is*: not a list of failures, but a statement that the duty does not apply.
 * Presenting 60 rows of findings to someone who is exempt would be technically
 * accurate row by row and wrong as a document.
 */
export function siteWideExemption(p: ObligationProfile | undefined): Exemption | null {
  if (!p) return null;

  // A public authority has no turnover relief at all — 35א(ב) and 35ד both
  // single them out, so the turnover tests below simply do not apply to them.
  if (p.publicAuthority) return null;

  const turnover = p.averageTurnoverIls;
  if (turnover === undefined) return null;

  if (turnover <= FULL_EXEMPTION_TURNOVER) {
    return {
      clause: 'תקנה 35ו(ז)',
      reasonHe:
        `חייב שמחזורו השנתי הממוצע אינו עולה על ${FULL_EXEMPTION_TURNOVER.toLocaleString('he-IL')} ש"ח, ` +
        `או שהוא עוסק פטור, פטור מביצוע התאמות נגישות לפי סימן ג'.`,
    };
  }

  // 35ו(ט) is narrower than it first reads: it covers only a site or
  // application already being operated before the regulations came into force,
  // and only while contact details are published accessibly. A new site at the
  // same turnover carries the full duty.
  if (turnover <= LEGACY_SITE_EXEMPTION_TURNOVER && p.serviceStartedBefore2017 === true) {
    return {
      clause: 'תקנה 35ו(ט)',
      reasonHe:
        `חייב שמחזורו הממוצע אינו עולה על ${LEGACY_SITE_EXEMPTION_TURNOVER.toLocaleString('he-IL')} ש"ח ` +
        `פטור לגבי אתר או יישום שהחל להפעיל לפני ${REGULATIONS_IN_FORCE_FROM}, ` +
        `ובלבד שדרכי ההתקשרות עמו מפורסמות בשירות האינטרנט שלו באופן נגיש. ` +
        `הפטור תקף לשלוש שנים וניתן לחידוש.`,
    };
  }

  return null;
}

/** Criterion numbers that make up the time-based-media duty under 35ד. */
const VIDEO_CRITERIA = /^1\.2\./;

/**
 * Exemption from one row.
 *
 * Only the video duty is bounded this way today. It is kept as a general hook
 * because 35ג(ג) — an accessible equivalent website exempting an application —
 * will land here when the mobile catalogue arrives.
 */
export function rowExemption(item: CheckItem, p: ObligationProfile | undefined): Exemption | null {
  if (!p) return null;
  if (!VIDEO_CRITERIA.test(item.form.criterionNo)) return null;

  // 35ד binds a public authority regardless of turnover.
  if (p.publicAuthority) return null;

  // Someone who neither edits nor produces video is not a "חייב בהנגשת תוכני
  // וידאו" whatever their turnover — the definition is about the activity, and
  // it comes first.
  if (p.editsOrProducesVideo === false) {
    return {
      clause: 'תקנה 35ד(א)',
      reasonHe:
        'חובת הנגשת תוכני וידאו חלה על מי שעורך או מפיק תוכני וידאו מוקלטים. ' +
        'לפי הנתונים שנמסרו, החייב אינו עורך ואינו מפיק תוכני וידאו.',
    };
  }

  const turnover = p.averageTurnoverIls;
  if (turnover !== undefined && turnover <= VIDEO_DUTY_TURNOVER) {
    return {
      clause: 'תקנה 35ד(א)',
      reasonHe:
        `חובת הנגשת תוכני וידאו חלה על רשות ציבורית, או על חייב שמחזורו הממוצע עולה על ` +
        `${VIDEO_DUTY_TURNOVER.toLocaleString('he-IL')} ש"ח. תוצאת בדיקת מחזור נמוך מכך תקפה לשלוש שנים.`,
    };
  }

  return null;
}

/**
 * The conformance level that binds.
 *
 * 35א(א) sets AA. 35א(ב)(2) drops a non-authority to A only where an undue-
 * burden exemption under section 19יב of the Act has actually been granted —
 * which is a decision someone else makes, not something we infer from turnover.
 * So this only honours what the caller states, and defaults to AA.
 */
export function bindingLevel(p: ObligationProfile | undefined, requested: 'A' | 'AA'): 'A' | 'AA' {
  if (p?.publicAuthority) return 'AA';
  return requested;
}
