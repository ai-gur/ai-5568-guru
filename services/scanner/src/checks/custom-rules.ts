/**
 * Rules axe-core does not cover.
 *
 * Three groups:
 *   - Israeli-specific duties (RTL declaration, Hebrew UI strings, accessibility
 *     statement, coordinator contact, Regulation 35 widget).
 *   - Behavioural checks that need the keyboard walk or the zoom pass.
 *   - Structural heuristics with high audit yield that axe deliberately leaves
 *     alone because they need judgement (pseudo-headings, hand-typed lists,
 *     placeholder-as-label, generic link text).
 *
 * A rule returns:
 *   `[]`    — checked, nothing wrong (contributes a PASS)
 *   `[...]` — findings (contributes a FAIL)
 *   `null`  — no opinion; the row falls through to the LLM layer
 *
 * Rules never see the criteria catalogue. The mapping from rule id to sheet row
 * lives in overrides.ts, so a rule can feed several rows without knowing it.
 */

import type { Finding } from '@ai5568/criteria';
import type { PageBundle, PageEvidence } from '../crawl/browser.ts';

/** Cross-page facts, computed once after the crawl. */
export interface SiteContext {
  pageCount: number;
  /** Canonical URL → page title, for the uniqueness check. */
  titles: Map<string, string>;
  /** Navigation item sequences per page, for consistency comparison. */
  navSequences: Map<string, string[]>;
  /** Accessible names of repeated components, per page. */
  componentNames: Map<string, Map<string, string>>;
  /**
   * Declared language per page. The consistency rows compare a page only
   * against others in its own language — a translation is a different set of
   * pages, not an inconsistency in this one.
   */
  langs: Map<string, string | null>;
  /** True when at least one page links to a reachable accessibility statement. */
  statementUrl: string | null;
  statementContent: StatementAudit | null;
  hasSearch: boolean;
  hasSitemap: boolean;
  hasBreadcrumbs: boolean;
}

export interface StatementAudit {
  url: string;
  /** The seven items the Regulations expect an accessibility statement to carry. */
  hasConformanceLevel: boolean;
  hasFeaturesList: boolean;
  hasKnownLimitations: boolean;
  hasCoordinatorName: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasAuditDate: boolean;
  hasUpdateDate: boolean;
}

export interface RuleContext {
  bundle: PageBundle;
  evidence: PageEvidence;
  site: SiteContext;
  /**
   * Rules that decline to judge (`return null`) can push a specific reason
   * here, so the row says *why* it needs a human instead of falling back to a
   * generic "requires manual check".
   */
  notes: string[];
}

export type RuleFn = (ctx: RuleContext) => Finding[] | null;

const MAX_FINDINGS = 20;

function cap(findings: Finding[]): Finding[] {
  return findings.slice(0, MAX_FINDINGS);
}

// Typed views over the loose evidence object.
type Ev = PageEvidence & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Pages that count as "the same set of Web pages" as this one.
 *
 * 3.2.3 and 3.2.4 ask whether a repeated component is identified consistently
 * *within a set of pages*. A translated site is several sets. Without this, the
 * skip link reads as inconsistent for being called "דלג לתוכן הראשי" on the
 * Hebrew pages and "Skip to main content" on the English ones — reporting the
 * translation as the defect, and sending an operator to "fix" the one thing on
 * the page that was already right.
 */
function sameLanguageAs(site: SiteContext, url: string): (other: string) => boolean {
  const base = (value: string | null | undefined): string => (value ?? '').split('-')[0].toLowerCase();
  const mine = base(site.langs.get(url));
  // With no declared language there is nothing to partition on, and dropping
  // every comparison would silently disable the row. Comparing is the safer
  // failure: it can over-report, which a reader can see and dismiss.
  if (!mine) return () => true;
  return (other) => base(site.langs.get(other)) === mine;
}

export const CUSTOM_RULES: Record<string, RuleFn> = {
  // ── Israeli additions ─────────────────────────────────────────────────────

  /** `lang` and `dir` on the root element for Hebrew/Arabic content. */
  'hebrew-lang-dir': ({ evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    const lang = (e.meta.lang ?? '').toLowerCase();
    const dir = (e.meta.dir ?? '').toLowerCase();
    const rtlContent = e.language.rtlContent === true;

    if (!lang) {
      findings.push({
        locator: 'html',
        snippet: '<html>',
        reasonHe: 'לא הוגדר מאפיין lang בתגית html. קורא מסך לא יידע באיזו שפה להקריא את התוכן.',
      });
    } else if (rtlContent && !/^(he|iw|ar)/.test(lang)) {
      findings.push({
        locator: 'html',
        snippet: `<html lang="${lang}">`,
        reasonHe: `תוכן העמוד בעברית או בערבית אך מוצהרת השפה "${lang}".`,
      });
    }

    if (rtlContent && dir !== 'rtl') {
      findings.push({
        locator: 'html',
        snippet: `<html${lang ? ` lang="${lang}"` : ''}${dir ? ` dir="${dir}"` : ''}>`,
        reasonHe: 'תוכן העמוד בכתב מימין לשמאל אך לא הוגדר dir="rtl" בתגית html.',
      });
    }
    return cap(findings);
  },

  /** LTR runs inside RTL text that bidi will render in the wrong order. */
  'ltr-island-marked': ({ evidence }) => {
    const e = evidence as Ev;
    if (e.language.rtlContent !== true) return null;
    const islands = e.language.ltrIslands as { selector: string; kind: string; match: string; context: string }[];
    const kindHe: Record<string, string> = {
      phone: 'מספר טלפון',
      'id-or-number': 'מספר בן 9 ספרות (תעודת זהות או מספר הזמנה)',
      email: 'כתובת דוא"ל',
      reference: 'מספר אסמכתה',
    };
    return cap(
      islands.map((i) => ({
        locator: i.selector,
        snippet: i.context,
        reasonHe: `${kindHe[i.kind] ?? 'תוכן משמאל לימין'} "${i.match}" מוצג בתוך טקסט בעברית ללא dir="ltr", ולכן עלול להיות מוצג בסדר הפוך.`,
      })),
    );
  },

  /** Accessible names left in English on a Hebrew page. */
  'hebrew-ui-strings': ({ evidence }) => {
    const e = evidence as Ev;
    if (e.language.rtlContent !== true) return null;
    const names = e.language.englishAccessibleNames as { selector: string; name: string; source: string }[];
    return cap(
      names.map((n) => ({
        locator: n.selector,
        snippet: n.name,
        reasonHe: `השם הנגיש "${n.name}" באנגלית בעמוד בעברית (מקור: ${n.source}). קורא מסך יקריא אותו באנגלית למשתמש דובר עברית.`,
      })),
    );
  },

  /** Alt text that is a filename, or English on a Hebrew page. */
  'hebrew-alt-text': ({ evidence }) => {
    const e = evidence as Ev;
    const images = e.images as { selector: string; alt: string | null; altLooksLikeFilename: boolean; snippet: string; ariaHidden: boolean }[];
    const findings: Finding[] = [];
    for (const img of images) {
      if (img.ariaHidden) continue;
      if (img.altLooksLikeFilename) {
        findings.push({
          locator: img.selector,
          snippet: img.snippet,
          reasonHe: `הטקסט החלופי הוא שם קובץ ("${img.alt}") ואינו מתאר את תוכן התמונה.`,
        });
      }
    }
    return cap(findings);
  },

  /** An accessibility statement, linked and complete. Decided at site level. */
  'accessibility-statement': ({ evidence, site }) => {
    const e = evidence as Ev;
    const links = e.navigation.statementLinks as { selector: string; text: string; href: string }[];
    const findings: Finding[] = [];

    if (links.length === 0) {
      findings.push({
        locator: 'body',
        reasonHe: 'לא נמצא קישור להצהרת נגישות בעמוד זה. התקנות מחייבות שההצהרה תהיה נגישה מכל עמוד באתר.',
      });
    }

    const audit = site.statementContent;
    if (audit) {
      const missing: string[] = [];
      if (!audit.hasConformanceLevel) missing.push('רמת הנגישות שאליה מכוון האתר (AA)');
      if (!audit.hasFeaturesList) missing.push('פירוט אמצעי הנגישות שבוצעו');
      if (!audit.hasKnownLimitations) missing.push('מגבלות נגישות ידועות (או ציון מפורש שאין כאלה)');
      if (!audit.hasCoordinatorName) missing.push('שם רכז הנגישות');
      if (!audit.hasPhone) missing.push('טלפון ליצירת קשר');
      if (!audit.hasEmail) missing.push('כתובת דוא"ל ליצירת קשר');
      if (!audit.hasAuditDate) missing.push('תאריך ביקורת הנגישות האחרונה');
      if (!audit.hasUpdateDate) missing.push('תאריך עדכון ההצהרה');
      if (missing.length) {
        findings.push({
          locator: audit.url,
          reasonHe: `הצהרת הנגישות קיימת אך חסרים בה: ${missing.join('; ')}.`,
        });
      }
    } else if (links.length > 0) {
      findings.push({
        locator: links[0]?.selector ?? 'body',
        snippet: links[0]?.href,
        reasonHe: 'קיים קישור להצהרת נגישות אך לא ניתן היה לטעון את עמוד ההצהרה ולבדוק את תוכנו.',
      });
    }

    return cap(findings);
  },

  /** Coordinator name plus at least two ways to reach them. */
  'coordinator-contact': ({ site }) => {
    const audit = site.statementContent;
    if (!audit) return null; // no statement to inspect; the statement rule reports that
    const findings: Finding[] = [];
    if (!audit.hasCoordinatorName) {
      findings.push({
        locator: audit.url,
        reasonHe: 'לא נמצא שם רכז/ת נגישות בהצהרת הנגישות. רכז הנגישות הוא כתובת הפנייה הראשונה לתלונות נגישות.',
      });
    }
    const ways = [audit.hasPhone, audit.hasEmail].filter(Boolean).length;
    if (ways < 2) {
      findings.push({
        locator: audit.url,
        reasonHe: `נמצאו ${ways} דרכי התקשרות בהצהרת הנגישות. נדרשות לפחות שתיים — טלפון ודוא"ל.`,
      });
    }
    return cap(findings);
  },

  /** A visible indication somewhere on the page that accessibility work was done. */
  'accessibility-notice-visible': ({ evidence }) => {
    const e = evidence as Ev;
    const hasStatementLink = (e.navigation.statementLinks as unknown[]).length > 0;
    const hasWidget = (e.navigation.a11yWidget.candidates as { visible: boolean }[]).some((c) => c.visible);
    if (hasStatementLink || hasWidget) return [];
    return [
      {
        locator: 'body',
        reasonHe:
          'לא נמצא ציון גלוי לעין באתר על ביצוע התאמות נגישות — לא קישור להצהרת נגישות ולא רכיב נגישות. הוראות טופס הבדיקה הרשמי מחייבות ציון כזה במקום בולט.',
      },
    ];
  },

  /** Regulation 35 preferences widget exists. */
  'a11y-widget-present': ({ evidence }) => {
    const e = evidence as Ev;
    const candidates = e.navigation.a11yWidget.candidates as { selector: string; visible: boolean; accessibleName: string }[];
    if (candidates.some((c) => c.visible)) return [];
    return [
      {
        locator: 'body',
        reasonHe: 'לא נמצא רכיב העדפות נגישות בעמוד (ניגודיות, גודל טקסט, מרווח שורות והדגשת קישורים).',
      },
    ];
  },

  /** …and can be operated from the keyboard. */
  'a11y-widget-keyboard': ({ evidence, bundle }) => {
    const e = evidence as Ev;
    const candidates = e.navigation.a11yWidget.candidates as { selector: string; visible: boolean; focusable: boolean; accessibleName: string }[];
    const visible = candidates.filter((c) => c.visible);
    if (visible.length === 0) return null; // presence is the other rule's problem

    const reachedSelectors = new Set((bundle.keyboard?.stops ?? []).map((s) => s.selector));
    const unreachable = visible.filter((c) => !c.focusable && !reachedSelectors.has(c.selector));
    return cap(
      unreachable.map((c) => ({
        locator: c.selector,
        reasonHe: `רכיב הנגישות ${c.accessibleName ? `("${c.accessibleName}") ` : ''}אינו נגיש במקלדת. משתמש שאינו יכול להשתמש בעכבר לא יוכל להפעיל את העדפות הנגישות.`,
      })),
    );
  },

  /**
   * Third-party overlay detection.
   *
   * An overlay that rewrites the DOM and advertises the site as compliant is a
   * liability rather than a remedy — the FTC fined accessiBe $1M in April 2025
   * for exactly that claim, and the Israeli Commission has endorsed no such
   * product. Reported as a finding so it reaches the operator's attention.
   */
  'overlay-antipattern': ({ evidence }) => {
    const e = evidence as Ev;
    const vendors = e.navigation.a11yWidget.overlayVendors as string[];
    if (vendors.length === 0) return [];
    return [
      {
        locator: 'script[src]',
        snippet: vendors.join(', '),
        reasonHe:
          `זוהה תוסף overlay של צד שלישי (${vendors.join(', ')}). תוספים אלה אינם הופכים אתר לתואם תקן — ההערכה נעשית מול ה-HTML שנוצר בפועל, ` +
          'ורשות הסחר האמריקאית קנסה ספק כזה במיליון דולר באפריל 2025 על הצהרות תאימות מטעות. יש לוודא שהאתר עומד בתקן בזכות עצמו, ושהתוסף אינו מוצג כתחליף.',
      },
    ];
  },

  // ── structure and semantics ───────────────────────────────────────────────

  /** Text styled to look like a heading but not marked up as one. */
  'fake-heading-detect': ({ evidence }) => {
    const e = evidence as Ev;
    const fakes = e.structure.fakeHeadings as { selector: string; text: string; fontSizePx: number; fontWeight: number; baseFontSizePx: number; snippet: string }[];
    const findings: Finding[] = fakes.map((f) => ({
      locator: f.selector,
      snippet: f.snippet,
      reasonHe: `הטקסט "${f.text}" מעוצב ככותרת (${f.fontSizePx}px, משקל ${f.fontWeight}, מול ${f.baseFontSizePx}px בגוף הטקסט) אך אינו מסומן בתגית כותרת. קורא מסך לא יוכל לנווט אליו כאל כותרת.`,
    }));

    const fakeLists = e.structure.fakeLists as { selector: string; text: string; snippet: string }[];
    for (const f of fakeLists) {
      findings.push({
        locator: f.selector,
        snippet: f.snippet,
        reasonHe: `הטקסט "${f.text}" הוא פריט ברשימה שנוצרה בהקלדת תו תבליט ידני במקום ברשימה סמנטית (ul/ol). קורא מסך לא יכריז על מספר הפריטים ברשימה.`,
      });
    }

    if (!e.structure.hasH1) {
      findings.push({
        locator: 'body',
        reasonHe: 'לא נמצאה כותרת ראשית (h1) בעמוד.',
      });
    }
    return cap(findings);
  },

  /** Landmarks covering the page regions. */
  'landmark-coverage': ({ evidence }) => {
    const e = evidence as Ev;
    const landmarks = e.structure.landmarks as { tag: string; role: string | null }[];
    const findings: Finding[] = [];
    const has = (name: string): boolean =>
      landmarks.some((l) => l.tag === name || l.role === (name === 'header' ? 'banner' : name === 'footer' ? 'contentinfo' : name));

    if (!e.structure.hasMain) {
      findings.push({ locator: 'body', reasonHe: 'לא הוגדר אזור תוכן ראשי (main או role="main") בעמוד.' });
    }
    if (!has('nav') && (e.counts.links ?? 0) >= 5) {
      findings.push({ locator: 'body', reasonHe: 'לא הוגדר אזור ניווט (nav או role="navigation") למרות שקיימים קישורי ניווט בעמוד.' });
    }
    return cap(findings);
  },

  /** Presentational markup that should live in CSS. */
  'presentational-markup': ({ evidence }) => {
    const e = evidence as Ev;
    const items = e.structure.presentational as { selector: string; tag: string; snippet: string }[];
    return cap(
      items.map((i) => ({
        locator: i.selector,
        snippet: i.snippet,
        reasonHe: `נעשה שימוש בתגית או מאפיין עיצובי <${i.tag}> בקוד. העיצוב צריך להיות מוגדר ב-CSS בלבד כדי לשמור על הפרדה בין תוכן לתצוגה.`,
      })),
    );
  },

  /** Tables used for layout. */
  'layout-table-detect': ({ evidence }) => {
    const e = evidence as Ev;
    const tables = e.structure.tables as { selector: string; looksLikeLayout: boolean; rows: number; snippet: string; thCount: number; hasCaption: boolean }[];
    const findings: Finding[] = [];
    for (const t of tables) {
      if (t.looksLikeLayout) {
        findings.push({
          locator: t.selector,
          snippet: t.snippet,
          reasonHe: `טבלה בת ${t.rows} שורות ללא תאי כותרת (th) וללא caption. אם היא משמשת לפריסה — יש להחליפה ב-CSS; אם היא טבלת נתונים — יש להוסיף th ו-caption.`,
        });
      } else if (t.thCount > 0 && !t.hasCaption) {
        findings.push({
          locator: t.selector,
          snippet: t.snippet,
          reasonHe: 'טבלת נתונים ללא caption. כותרת הטבלה מאפשרת למשתמש קורא מסך להבין את תוכנה לפני שהוא נכנס אליה.',
        });
      }
    }
    return cap(findings);
  },

  /** Headings that skip levels, and sections with no heading at all. */
  'section-heading-coverage': ({ evidence }) => {
    const e = evidence as Ev;
    const levels = (e.structure.headings as { level: number | null; text: string; selector: string }[]).filter((h) => h.level);
    const findings: Finding[] = [];
    let previous = 0;
    for (const h of levels) {
      const level = h.level as number;
      if (previous && level > previous + 1) {
        findings.push({
          locator: h.selector,
          snippet: h.text,
          reasonHe: `דילוג ברמת הכותרות: הכותרת "${h.text}" היא h${level} ומופיעה אחרי h${previous}. ההיררכיה חייבת להיות רציפה.`,
        });
      }
      previous = level;
    }
    if (levels.length === 0 && (e.counts.textLength ?? 0) > 600) {
      findings.push({
        locator: 'body',
        reasonHe: 'העמוד מכיל תוכן טקסטואלי משמעותי אך אין בו כותרות כלל, ולכן אין דרך לנווט בין מקטעיו.',
      });
    }
    return cap(findings);
  },

  // ── links and navigation ──────────────────────────────────────────────────

  /**
   * DOM order against visual order (criterion 1.3.2).
   *
   * Only explicit CSS reordering is reported as a failure. A raw geometric
   * mismatch is a weak signal — multi-column layouts, floats and RTL grids all
   * produce them legitimately — so those are handed to the judgement layer
   * instead of being asserted as defects.
   */
  'dom-visual-order-mismatch': ({ evidence }) => {
    const e = evidence as Ev;
    const reordered = e.readingOrder.cssReordered as { selector: string; order: string; flexDirection: string; text: string }[];
    const mismatches = e.readingOrder.mismatches as { selector: string; text: string; domPosition: number; visualPosition: number }[];

    const findings: Finding[] = [];
    for (const r of reordered) {
      const reason =
        r.order && r.order !== '0'
          ? `הרכיב ממוקם מחדש באמצעות CSS order:${r.order}`
          : `הרכיב ממוקם מחדש באמצעות flex-direction:${r.flexDirection}`;
      findings.push({
        locator: r.selector,
        snippet: r.text,
        reasonHe: `${reason}, ולכן סדר ההקראה בקורא מסך אינו תואם את הסדר הנראה על המסך. יש לשנות את סדר ה-DOM במקום למקם מחדש ב-CSS.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }

    // Nothing was explicitly reordered and nothing looks out of place: pass.
    if (findings.length === 0 && mismatches.length === 0) return [];
    // Geometric mismatch without a CSS cause — needs judgement, not an assertion.
    if (findings.length === 0) return null;
    return cap(findings);
  },

  'generic-link-text': ({ evidence }) => {
    const e = evidence as Ev;
    const links = e.links as {
      selector: string; text: string; accessibleName: string; href: string; generic: boolean;
      isUrlText: boolean; ambiguous: boolean; context: string; empty: boolean; imageOnly: boolean; visible: boolean;
    }[];
    const findings: Finding[] = [];
    for (const l of links) {
      if (!l.visible) continue;
      if (l.empty) {
        findings.push({
          locator: l.selector,
          snippet: `<a href="${l.href}">`,
          reasonHe: 'קישור ללא שם נגיש כלל. קורא מסך יקריא את כתובת ה-URL או "קישור" בלבד.',
        });
      } else if (l.ambiguous) {
        findings.push({
          locator: l.selector,
          snippet: `<a href="${l.href}">${l.text}</a>`,
          reasonHe: `הטקסט "${l.text}" משמש ביותר מקישור אחד בעמוד עם יעדים שונים. משתמש שסורק את רשימת הקישורים לא יוכל להבחין ביניהם.`,
        });
      } else if (l.generic) {
        findings.push({
          locator: l.selector,
          snippet: `<a href="${l.href}">${l.text}</a>`,
          reasonHe: `טקסט קישור גנרי ("${l.text}") שאינו מתאר את היעד. ההקשר בפסקה: "${(l.context || '').slice(0, 120)}".`,
        });
      } else if (l.isUrlText) {
        findings.push({
          locator: l.selector,
          snippet: l.text,
          reasonHe: 'טקסט הקישור הוא כתובת URL ארוכה. קורא מסך יקריא אותה תו-אחר-תו.',
        });
      }
    }
    return cap(findings);
  },

  /** A skip link that exists, is reachable, and actually goes somewhere. */
  'skip-link-functional': ({ evidence }) => {
    const e = evidence as Ev;
    const skips = e.navigation.skipLinks as {
      selector: string; text: string; href: string; targetExists: boolean;
      targetFocusable: boolean; permanentlyHidden: boolean; looksLikeSkip: boolean; domPosition: number;
    }[];
    const candidates = skips.filter((s) => s.looksLikeSkip);

    if (candidates.length === 0) {
      // Landmarks are the standard's other accepted bypass mechanism.
      if (e.structure.hasMain && (e.structure.landmarks as unknown[]).length >= 3) return [];
      return [
        {
          locator: 'body',
          reasonHe: 'לא נמצא קישור דילוג לתוכן הראשי, ואין מבנה landmarks מלא שיכול לשמש כמנגנון עקיפה חלופי.',
        },
      ];
    }

    const findings: Finding[] = [];
    for (const s of candidates) {
      if (!s.targetExists) {
        findings.push({
          locator: s.selector,
          snippet: `<a href="${s.href}">${s.text}</a>`,
          reasonHe: `קישור הדילוג מצביע ל-"${s.href}" אך היעד אינו קיים בעמוד.`,
        });
      } else if (s.permanentlyHidden) {
        findings.push({
          locator: s.selector,
          snippet: `<a href="${s.href}">${s.text}</a>`,
          reasonHe: 'קישור הדילוג מוסתר ב-display:none או visibility:hidden, ולכן לא ניתן להגיע אליו במקלדת כלל.',
        });
      } else if (!s.targetFocusable) {
        findings.push({
          locator: s.selector,
          snippet: `<a href="${s.href}">${s.text}</a>`,
          reasonHe: `יעד הדילוג "${s.href}" אינו יכול לקבל פוקוס. יש להוסיף לו tabindex="-1" כדי שהפוקוס אכן יעבור אליו.`,
        });
      } else if (s.domPosition > 3) {
        findings.push({
          locator: s.selector,
          snippet: `<a href="${s.href}">${s.text}</a>`,
          reasonHe: `קישור הדילוג נמצא במקום ${s.domPosition + 1} בסדר המיקוד. עליו להיות מהראשונים כדי שיהיה שימושי.`,
        });
      }
    }
    return cap(findings);
  },

  /** Page titles that are unique across the site and describe the page. */
  'title-unique-across-site': ({ bundle, evidence, site }) => {
    const e = evidence as Ev;
    const title = e.meta.title.trim();
    const findings: Finding[] = [];

    if (!title) {
      findings.push({ locator: 'title', reasonHe: 'לעמוד אין כותרת (title) כלל.' });
      return findings;
    }

    const duplicates = [...site.titles.entries()].filter(([url, t]) => t === title && url !== bundle.url);
    if (duplicates.length > 0) {
      findings.push({
        locator: 'title',
        snippet: `<title>${title}</title>`,
        reasonHe: `הכותרת "${title}" אינה ייחודית — היא מופיעה גם ב-${duplicates.length} עמודים אחרים שנסרקו, בהם ${duplicates[0]?.[0]}.`,
      });
    }
    if (title === e.meta.siteName) {
      findings.push({
        locator: 'title',
        snippet: `<title>${title}</title>`,
        reasonHe: `כותרת העמוד זהה לשם האתר ואינה מתארת את תוכן העמוד הספציפי.`,
      });
    }
    return cap(findings);
  },

  /** More than one way to reach a page (criterion 2.4.5). */
  'multiple-ways-site': ({ evidence, site }) => {
    const e = evidence as Ev;
    if (site.pageCount <= 1) return null;
    const ways: string[] = [];
    if (site.hasSearch || (e.navigation.searchMechanisms as number) > 0) ways.push('חיפוש');
    if (site.hasSitemap || (e.navigation.sitemapLinks as number) > 0) ways.push('מפת אתר');
    if (site.hasBreadcrumbs || (e.navigation.breadcrumbs as number) > 0) ways.push('פירורי לחם');
    if ((e.navigation.navs as unknown[]).length > 0) ways.push('תפריט ניווט');

    if (ways.length >= 2) return [];
    const found =
      ways.length === 1
        ? `נמצאה דרך אחת בלבד להגיע לעמודי האתר (${ways[0]})`
        : 'לא נמצאה אף דרך מובנית להגיע לעמודי האתר';
    return [
      {
        locator: 'body',
        reasonHe: `${found}. נדרשות לפחות שתיים — לדוגמה תפריט וחיפוש, או תפריט ומפת אתר.`,
      },
    ];
  },

  /** Navigation order identical across pages (criterion 3.2.3). */
  'nav-consistency': ({ bundle, site }) => {
    if (site.pageCount <= 1) return null;
    const mine = site.navSequences.get(bundle.url);
    if (!mine || mine.length === 0) return null;
    const inMySet = sameLanguageAs(site, bundle.url);

    for (const [otherUrl, other] of site.navSequences) {
      if (otherUrl === bundle.url || other.length === 0 || !inMySet(otherUrl)) continue;
      // Compare only the items both pages share, so a page with extra
      // context-specific items is not reported as inconsistent.
      const shared = mine.filter((m) => other.includes(m));
      const otherShared = other.filter((o) => mine.includes(o));
      if (shared.length < 2) continue;
      if (shared.join('|') !== otherShared.join('|')) {
        return [
          {
            locator: 'nav',
            snippet: `${bundle.url}: ${shared.join(' → ')}`,
            reasonHe: `סדר פריטי הניווט שונה מזה שבעמוד ${otherUrl} (שם: ${otherShared.join(' → ')}). מנגנוני ניווט חוזרים חייבים להופיע באותו סדר בכל עמוד.`,
          },
        ];
      }
    }
    return [];
  },

  /** The same component named differently on different pages (criterion 3.2.4). */
  'component-identity': ({ bundle, site }) => {
    if (site.pageCount <= 1) return null;
    const mine = site.componentNames.get(bundle.url);
    if (!mine) return null;
    const findings: Finding[] = [];
    const inMySet = sameLanguageAs(site, bundle.url);

    for (const [key, name] of mine) {
      for (const [otherUrl, others] of site.componentNames) {
        if (otherUrl === bundle.url || !inMySet(otherUrl)) continue;
        const otherName = others.get(key);
        if (otherName && otherName !== name && findings.length < 5) {
          findings.push({
            locator: key,
            snippet: `"${name}"`,
            reasonHe: `רכיב "${key}" מזוהה כ-"${name}" בעמוד זה וכ-"${otherName}" בעמוד ${otherUrl}. רכיבים חוזרים חייבים לשאת אותו שם נגיש בכל האתר.`,
          });
        }
      }
    }
    return cap(findings);
  },

  // ── forms ─────────────────────────────────────────────────────────────────

  'placeholder-as-label': ({ evidence }) => {
    const e = evidence as Ev;
    const controls = e.forms.controls as { selector: string; placeholderOnly: boolean; placeholder: string | null; snippet: string; visible: boolean; required: boolean }[];
    const findings: Finding[] = [];
    for (const c of controls) {
      if (!c.visible) continue;
      if (c.placeholderOnly) {
        findings.push({
          locator: c.selector,
          snippet: c.snippet,
          reasonHe: `לשדה אין תווית משויכת — רק placeholder ("${c.placeholder}"). ה-placeholder נעלם ברגע שהמשתמש מתחיל להקליד, ולכן אינו תחליף ל-label.`,
        });
      }
    }

    // Required fields marked only with a red asterisk.
    const markers = e.colorUsage.requiredMarkers as { selector: string; text: string; hasAsterisk: boolean; saysRequired: boolean; ariaRequired: boolean }[];
    for (const m of markers) {
      if (m.hasAsterisk && !m.saysRequired) {
        findings.push({
          locator: m.selector,
          snippet: m.text,
          reasonHe: `שדה חובה מסומן בכוכבית בלבד ("${m.text}") ללא המילה "חובה". משתמש שאינו רואה את הכוכבית או את צבעה לא ידע שהשדה נדרש.`,
        });
      }
    }
    return cap(findings);
  },

  'error-announcement': ({ evidence }) => {
    const e = evidence as Ev;
    const containers = e.forms.errorContainers as { selector: string; role: string | null; ariaLive: string | null; text: string; referencedByField: boolean; visible: boolean }[];
    const controls = e.forms.controls as { required: boolean; describedBy: string[]; selector: string; snippet: string }[];

    const hasLiveRegion = containers.some((c) => c.role === 'alert' || (c.ariaLive && c.ariaLive !== 'off'));
    const findings: Finding[] = [];

    if (containers.length > 0 && !hasLiveRegion) {
      findings.push({
        locator: containers[0]?.selector ?? 'form',
        snippet: containers[0]?.text,
        reasonHe: 'קיימים אזורי הודעות שגיאה בעמוד אך אף אחד מהם אינו מוגדר כ-role="alert" או aria-live. שגיאה שתופיע בהם לא תוכרז לקורא מסך.',
      });
    }

    // Broken aria-describedby is worse than none: the field claims a
    // description that does not exist.
    for (const c of controls) {
      const missing = c.describedBy.filter((d) => d.startsWith('(missing:'));
      if (missing.length && findings.length < MAX_FINDINGS) {
        findings.push({
          locator: c.selector,
          snippet: c.snippet,
          reasonHe: `השדה מפנה ב-aria-describedby למזהה שאינו קיים בעמוד (${missing.join(', ')}), ולכן ההסבר או הודעת השגיאה לא יוקראו.`,
        });
      }
    }

    if (containers.length === 0 && controls.some((c) => c.required)) {
      findings.push({
        locator: 'form',
        reasonHe:
          'בטופס קיימים שדות חובה אך לא נמצא מנגנון להצגת הודעות שגיאה טקסטואליות. יש לוודא שבעת שגיאה מוצגת הודעה בעברית, משויכת לשדה ומוכרזת לקורא מסך.',
      });
    }
    return cap(findings);
  },

  'captcha-detect': ({ evidence }) => {
    const e = evidence as Ev;
    const captcha = e.forms.captcha as { selector: string; tag: string; snippet: string }[];
    if (captcha.length === 0) return null;
    return cap(
      captcha.map((c) => ({
        locator: c.selector,
        snippet: c.snippet,
        reasonHe:
          'זוהה רכיב CAPTCHA. נדרש לוודא שקיימת חלופה טקסטואלית המתארת את תכליתו, וכן חלופה המכוונת לחוש אחר (למשל אתגר אודיו לצד אתגר חזותי).',
      })),
    );
  },

  // ── behaviour (keyboard walk / zoom) ──────────────────────────────────────

  'keyboard-walk': ({ bundle }) => {
    const kb = bundle.keyboard;
    if (!kb) return null;
    return cap(
      kb.unreachableInteractive.map((u) => ({
        locator: u.selector,
        snippet: u.text,
        reasonHe: `${u.reason}. הפעולה "${u.text || '(ללא טקסט)'}" אינה ניתנת לביצוע במקלדת.`,
      })),
    );
  },

  'click-handler-no-keyboard': ({ evidence }) => {
    const e = evidence as Ev;
    const pseudo = e.aria.pseudoControls as { selector: string; text: string; hasInlineHandler: boolean; snippet: string }[];
    return cap(
      pseudo.map((p) => ({
        locator: p.selector,
        snippet: p.snippet,
        reasonHe: `האלמנט "${p.text || '(ללא טקסט)'}" מתפקד כפקד אך אינו button או a, אין לו role ואינו נגיש ב-Tab. יש להמירו ל-<button> או להוסיף role, tabindex="0" וטיפול במקשי Enter/Space.`,
      })),
    );
  },

  'keyboard-trap': ({ bundle, notes }) => {
    const kb = bundle.keyboard;
    if (!kb) return null;
    if (kb.trap) {
      return [
        {
          locator: kb.trap.selector,
          snippet: kb.trap.name,
          reasonHe: `הפוקוס נתקע על הרכיב "${kb.trap.name || kb.trap.selector}" ולא התקדם הלאה אחרי ${kb.trap.repeatedTimes} לחיצות Tab. זוהי מלכודת מקלדת.`,
        },
      ];
    }
    if (kb.frameBoundary) {
      // Cannot see inside the frame, so cannot rule a trap in or out there.
      notes.push(
        `סריקת המקלדת הגיעה למסגרת משובצת (${kb.frameBoundary.selector}) ולא ניתן היה להמשיך מעבר לה. ` +
          'יש לבדוק ידנית שניתן לצאת מהמסגרת באמצעות Tab בלבד — תוכן צד-שלישי הוא מקור נפוץ למלכודות מקלדת.',
      );
      return null;
    }
    return [];
  },

  'focus-order-walk': ({ bundle, evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    const positive = e.focusable.positiveTabindex as { selector: string; tabindex: string; text: string }[];
    for (const p of positive) {
      findings.push({
        locator: p.selector,
        snippet: p.text,
        reasonHe: `שימוש ב-tabindex="${p.tabindex}" חיובי משנה את סדר המיקוד הטבעי ומנתק אותו מסדר הקריאה של העמוד.`,
      });
    }
    const hidden = e.focusable.hiddenButFocusable as { selector: string; text: string; snippet: string }[];
    for (const h of hidden) {
      findings.push({
        locator: h.selector,
        snippet: h.snippet,
        reasonHe: 'רכיב הניתן למיקוד נמצא בתוך אזור המסומן aria-hidden="true". הפוקוס יגיע אליו אך קורא המסך לא יכריז עליו דבר.',
      });
    }
    for (const m of bundle.keyboard?.orderMismatches ?? []) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: m.selector,
        snippet: m.name,
        reasonHe: `סדר המיקוד אינו תואם את הסדר החזותי: הרכיב "${m.name || m.selector}" מקבל פוקוס במקום ${m.focusPosition + 1} אך מופיע חזותית במקום ${m.visualPosition + 1}.`,
      });
    }
    return cap(findings);
  },

  'focus-visible-check': ({ bundle }) => {
    const kb = bundle.keyboard;
    if (!kb) return null;
    return cap(
      kb.missingFocusIndicator.map((m) => ({
        locator: m.selector,
        snippet: m.name,
        reasonHe: `הרכיב <${m.tag}> "${m.name || ''}" אינו מקבל אפקט חזותי כלשהו בעת מיקוד במקלדת. בדרך כלל הסיבה היא outline:none ללא חלופה.`,
      })),
    );
  },

  'context-change-on-focus': ({ bundle }) => {
    const kb = bundle.keyboard;
    if (!kb) return null;
    const changed = kb.stops.filter((s) => s.contextChange);
    return cap(
      changed.map((s) => ({
        locator: s.selector,
        snippet: s.name,
        reasonHe: `קבלת פוקוס על "${s.name || s.selector}" גרמה לשינוי הקשר (${s.contextChange?.kind}${s.contextChange?.detail ? `: ${s.contextChange.detail}` : ''}). שינוי הקשר מותר רק בעקבות פעולה מכוונת של המשתמש.`,
      })),
    );
  },

  'context-change-on-input': ({ evidence }) => {
    const e = evidence as Ev;
    const controls = e.forms.controls as { selector: string; onChangeHandler: boolean; tag: string; snippet: string; accessibleName: string }[];
    const suspects = controls.filter((c) => c.onChangeHandler && c.tag === 'select');
    if (suspects.length === 0) return [];
    return cap(
      suspects.map((c) => ({
        locator: c.selector,
        snippet: c.snippet,
        reasonHe: `לרשימה הנפתחת "${c.accessibleName || c.selector}" מוגדר מטפל onchange. יש לוודא שהוא אינו מנווט או שולח את הטופס אוטומטית — פעולה כזו דורשת כפתור שליחה מפורש או אזהרה מראש.`,
      })),
    );
  },

  'zoom-200-reflow': ({ bundle }) => {
    const zoom = bundle.zoom;
    if (!zoom) return null;
    const findings: Finding[] = [];
    if (zoom.blocksZoom) {
      findings.push({
        locator: 'meta[name="viewport"]',
        reasonHe: 'תגית ה-viewport חוסמת שינוי מרחק מתצוגה (user-scalable=no או maximum-scale=1), ולכן המשתמש אינו יכול להגדיל את הטקסט כלל.',
      });
    }
    for (const el of zoom.clippedElements) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: el.selector,
        snippet: el.text,
        reasonHe: 'בהגדלת הטקסט ל-200% הטקסט נחתך על ידי מכולה בגובה קבוע עם overflow מוסתר.',
      });
    }
    for (const el of zoom.lostElements) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: el.selector,
        snippet: el.text,
        reasonHe: 'בהגדלת הטקסט ל-200% התוכן נעלם מהתצוגה לחלוטין.',
      });
    }
    return cap(findings);
  },

  'timeout-detect': ({ evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    for (const m of e.motion.metaRefresh as { content: string }[]) {
      findings.push({
        locator: 'meta[http-equiv="refresh"]',
        snippet: `<meta http-equiv="refresh" content="${m.content}">`,
        reasonHe: 'העמוד מרענן או מפנה את עצמו אוטומטית באמצעות meta refresh, ללא אפשרות למשתמש לבטל או להאריך.',
      });
    }
    for (const t of e.motion.timers as { kind: string; delayMs: number }[]) {
      if (findings.length >= MAX_FINDINGS) break;
      const minutes = Math.round(t.delayMs / 60000);
      // Under 20 hours the criterion requires a control; above it, it does not.
      if (t.delayMs >= 5000 && t.delayMs < 20 * 60 * 60 * 1000) {
        findings.push({
          locator: 'script',
          snippet: `${t.kind}(${t.delayMs}ms)`,
          reasonHe: `זוהה טיימר של ${minutes >= 1 ? `${minutes} דקות` : `${Math.round(t.delayMs / 1000)} שניות`}. אם מדובר בהגבלת זמן לפעולה או בפקיעת התחברות, נדרשת למשתמש אפשרות לבטל, להאריך או להתאים אותה.`,
        });
      }
    }
    return cap(findings);
  },

  'moving-content-detect': ({ evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    for (const d of e.motion.deprecated as { selector: string; tag: string; snippet: string }[]) {
      findings.push({
        locator: d.selector,
        snippet: d.snippet,
        reasonHe: `שימוש בתגית <${d.tag}> שיוצרת תוכן נע או מהבהב ללא כל אפשרות עצירה.`,
      });
    }
    for (const c of e.motion.carousels as { selector: string; hasPauseControl: boolean; className: string }[]) {
      if (findings.length >= MAX_FINDINGS) break;
      if (!c.hasPauseControl) {
        findings.push({
          locator: c.selector,
          snippet: c.className,
          reasonHe: 'קרוסלה או סליידר ללא פקד השהיה/עצירה. אם התוכן מתקדם אוטומטית למעלה מ-5 שניות, נדרש פקד עצירה נגיש.',
        });
      }
    }
    for (const a of e.motion.animated as { selector: string; infinite: boolean; durationSec: number; animationName: string }[]) {
      if (findings.length >= MAX_FINDINGS) break;
      if (a.infinite) {
        findings.push({
          locator: a.selector,
          snippet: `animation: ${a.animationName} ${a.durationSec}s infinite`,
          reasonHe: 'אנימציה אינסופית ללא מנגנון עצירה. יש לספק פקד עצירה, ולכבד גם את העדפת prefers-reduced-motion.',
        });
      }
    }
    return cap(findings);
  },

  'flash-candidates': ({ evidence }) => {
    const e = evidence as Ev;
    const risky = (e.motion.animated as { selector: string; fastFlashRisk: boolean; durationSec: number; animationName: string }[]).filter((a) => a.fastFlashRisk);
    const gifs = e.motion.animatedGifs as { selector: string; src: string }[];
    const findings: Finding[] = risky.map((a) => ({
      locator: a.selector,
      snippet: `animation: ${a.animationName} ${a.durationSec}s`,
      reasonHe: `אנימציה במחזור של ${a.durationSec} שניות החוזרת אינסופית — קצב של כ-${Math.round(1 / Math.max(a.durationSec, 0.01))} פעמים בשנייה. נדרשת בדיקה ידנית שהיא אינה חוצה את סף שלוש ההבהובים בשנייה.`,
    }));
    for (const g of gifs) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: g.selector,
        snippet: g.src,
        reasonHe: 'קובץ GIF שעשוי להיות מונפש. יש לוודא שאינו מהבהב יותר משלוש פעמים בשנייה.',
      });
    }
    return cap(findings);
  },

  'markup-validity': ({ evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    for (const d of e.markup.duplicateIds as { id: string; selector: string; snippet: string }[]) {
      findings.push({
        locator: d.selector,
        snippet: d.snippet,
        reasonHe: `המזהה id="${d.id}" מופיע יותר מפעם אחת בעמוד. מזהה כפול שובר שיוך תוויות, aria-describedby ועוגנים בתוך העמוד.`,
      });
    }
    for (const r of e.markup.brokenRefs as { selector: string; attribute: string; missingId: string; snippet: string }[]) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: r.selector,
        snippet: r.snippet,
        reasonHe: `המאפיין ${r.attribute} מפנה למזהה "${r.missingId}" שאינו קיים בעמוד.`,
      });
    }
    for (const l of e.markup.orphanLabels as { selector: string; for: string; text: string }[]) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: l.selector,
        snippet: `<label for="${l.for}">${l.text}</label>`,
        reasonHe: `תווית מפנה ל-for="${l.for}" אך אין בעמוד שדה עם מזהה זה, ולכן היא אינה משויכת לשום פקד.`,
      });
    }
    return cap(findings);
  },

  'custom-widget-state': ({ evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    const widgets = e.aria.widgets as { selector: string; role: string; accessibleName: string; ariaExpanded: string | null; ariaChecked: string | null; ariaSelected: string | null; ariaControls: string | null; focusable: boolean; snippet: string; visible: boolean }[];

    // Roles whose state must be exposed for the widget to be usable at all.
    const NEEDS_EXPANDED = ['combobox', 'menu', 'menubar'];
    const NEEDS_CHECKED = ['checkbox', 'radio', 'switch'];
    const NEEDS_SELECTED = ['tab', 'option'];

    for (const w of widgets) {
      if (!w.visible) continue;
      if (NEEDS_EXPANDED.includes(w.role) && w.ariaExpanded === null) {
        findings.push({ locator: w.selector, snippet: w.snippet, reasonHe: `רכיב בתפקיד role="${w.role}" ללא aria-expanded. קורא מסך לא יוכל לדעת אם הוא פתוח או סגור.` });
      }
      if (NEEDS_CHECKED.includes(w.role) && w.ariaChecked === null) {
        findings.push({ locator: w.selector, snippet: w.snippet, reasonHe: `רכיב בתפקיד role="${w.role}" ללא aria-checked. מצב הסימון אינו נחשף לטכנולוגיה מסייעת.` });
      }
      if (NEEDS_SELECTED.includes(w.role) && w.ariaSelected === null) {
        findings.push({ locator: w.selector, snippet: w.snippet, reasonHe: `רכיב בתפקיד role="${w.role}" ללא aria-selected. לא ניתן לדעת איזה פריט נבחר.` });
      }
      if (!w.focusable && ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider', 'spinbutton'].includes(w.role)) {
        findings.push({ locator: w.selector, snippet: w.snippet, reasonHe: `רכיב בתפקיד role="${w.role}" אינו ניתן למיקוד במקלדת (חסר tabindex).` });
      }
      if (findings.length >= MAX_FINDINGS) break;
    }

    for (const b of e.aria.iconOnlyButtons as { selector: string; accessibleName: string; snippet: string }[]) {
      if (findings.length >= MAX_FINDINGS) break;
      if (!b.accessibleName) {
        findings.push({ locator: b.selector, snippet: b.snippet, reasonHe: 'כפתור המכיל אייקון בלבד ללא שם נגיש. יש להוסיף aria-label בעברית המתאר את הפעולה.' });
      }
    }
    return cap(findings);
  },

  'embedded-media-name': ({ evidence }) => {
    const e = evidence as Ev;
    const media = e.media as { selector: string; kind: string; accessibleName: string; snippet: string; ariaHidden: boolean; src: string }[];
    const findings: Finding[] = [];
    for (const m of media) {
      if (m.ariaHidden) continue;
      if (!m.accessibleName || /^(video|audio|iframe|embed|player)$/i.test(m.accessibleName)) {
        findings.push({
          locator: m.selector,
          snippet: m.snippet,
          reasonHe: `רכיב מדיה משובץ ללא שם נגיש שמזהה את תוכנו${m.src ? ` (מקור: ${m.src.slice(0, 80)})` : ''}. יש להוסיף title או aria-label המתאר מה הרכיב מכיל.`,
        });
      }
    }
    return cap(findings);
  },

  'caption-track-present': ({ evidence }) => {
    const e = evidence as Ev;
    const media = e.media as { selector: string; kind: string; hasCaptionTrack: boolean; isPlayerFrame: boolean; snippet: string; src: string }[];
    const videos = media.filter((m) => m.kind === 'video');
    const players = media.filter((m) => m.kind === 'player');
    const findings: Finding[] = [];

    for (const v of videos) {
      if (!v.hasCaptionTrack) {
        findings.push({
          locator: v.selector,
          snippet: v.snippet,
          reasonHe: 'רכיב וידאו ללא <track kind="captions">. אם לסרטון יש פס-קול, נדרשות כתוביות מסונכרנות בעברית.',
        });
      }
    }
    // A platform embed can carry captions the DOM cannot see, so this is
    // reported as something to verify rather than asserted as a failure.
    for (const p of players) {
      if (findings.length >= MAX_FINDINGS) break;
      findings.push({
        locator: p.selector,
        snippet: p.src.slice(0, 120),
        reasonHe: 'נגן וידאו חיצוני משובץ. יש לוודא בפלטפורמה שהועלתה לסרטון רצועת כתוביות בעברית — כתוביות אוטומטיות בלבד אינן עומדות בדרישה.',
      });
    }
    return cap(findings);
  },

  'text-in-image-detect': ({ evidence }) => {
    const e = evidence as Ev;
    const candidates = e.textImages as { selector: string; src: string; alt: string; width: number; height: number; isLogo: boolean }[];
    return cap(
      candidates
        .filter((c) => !c.isLogo)
        .map((c) => ({
          locator: c.selector,
          snippet: `${c.src.slice(0, 100)} (${c.width}×${c.height})`,
          reasonHe: `תמונה בגודל ${c.width}×${c.height} החשודה כמכילה טקסט${c.alt ? ` (טקסט חלופי: "${c.alt}")` : ' ללא טקסט חלופי'}. אם ניתן להשיג את אותה תצוגה בטקסט חי — אין להשתמש בתמונת טקסט.`,
        })),
    );
  },

  'foreign-language-run': ({ evidence }) => {
    const e = evidence as Ev;
    const runs = e.language.foreignRuns as { selector: string; text: string; detected: string }[];
    return cap(
      runs.map((r) => ({
        locator: r.selector,
        snippet: r.text,
        reasonHe: `קטע טקסט בשפה ${r.detected === 'latin' ? 'לועזית' : 'עברית'} בתוך עמוד בשפה אחרת, ללא מאפיין lang. קורא מסך יקריא אותו בהגייה של שפת העמוד.`,
      })),
    );
  },

  'color-only-meaning': ({ evidence }) => {
    const e = evidence as Ev;
    const findings: Finding[] = [];
    const links = e.colorUsage.linksInText as { selector: string; text: string; contrastWithText: number | null; hasNonColourCue: boolean }[];
    for (const l of links) {
      if (l.hasNonColourCue) continue;
      const ratio = l.contrastWithText;
      if (ratio === null || ratio < 3) {
        findings.push({
          locator: l.selector,
          snippet: l.text,
          reasonHe: `הקישור "${l.text}" מובחן מהטקסט שסביבו בצבע בלבד${ratio !== null ? `, ביחס ניגודיות ${ratio}:1 מול טקסט הסביבה` : ''}. נדרש קו תחתון או הבחנה אחרת, או יחס של 3:1 לפחות יחד עם שינוי עיצוב ב-hover וב-focus.`,
        });
      }
      if (findings.length >= MAX_FINDINGS) break;
    }
    return cap(findings);
  },
};

export function runCustomRule(id: string, ctx: RuleContext): Finding[] | null {
  const rule = CUSTOM_RULES[id];
  if (!rule) throw new Error(`Unknown custom rule "${id}" — referenced by overrides.ts but not implemented`);
  try {
    return rule(ctx);
  } catch (err) {
    // A rule that throws must not sink the whole page. Surface it as a finding
    // so the failure is visible rather than silently becoming a pass.
    return [
      {
        locator: 'engine',
        reasonHe: `בדיקה "${id}" נכשלה טכנית ולא ניתן להסתמך עליה: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}
