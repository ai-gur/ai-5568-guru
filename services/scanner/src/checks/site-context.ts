/**
 * Cross-page facts.
 *
 * Four sheet rows cannot be decided by looking at one page — title uniqueness
 * (2.4.2), multiple ways to reach a page (2.4.5), consistent navigation (3.2.3)
 * and consistent identification (3.2.4) — and the Israeli additions about the
 * accessibility statement are site-wide duties. They are computed once here and
 * then applied to every page's rows.
 */

import type { PageBundle } from '../crawl/browser.ts';
import type { SiteContext, StatementAudit } from './custom-rules.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = Record<string, any>;

/**
 * Components considered "the same thing" across pages, keyed by a role-ish
 * label. Comparing accessible names for these is what surfaces a search button
 * called "חיפוש" on one page and "חפש" on another.
 */
function componentKey(name: string, tag: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (/חיפוש|חפש|search/.test(n)) return 'search';
  if (/תפריט|menu|נאבורג/.test(n)) return 'menu';
  if (/סגור|close/.test(n)) return 'close';
  if (/כניסה|התחבר|login|sign in/.test(n)) return 'login';
  if (/הרשמה|register|sign up/.test(n)) return 'register';
  if (/עגלה|סל|cart|basket/.test(n)) return 'cart';
  if (/צור קשר|יצירת קשר|contact/.test(n)) return 'contact';
  if (/נגישות|accessib/.test(n)) return 'accessibility';
  if (/דלג|skip/.test(n)) return 'skip';
  void tag;
  return null;
}

export function buildSiteContext(pages: PageBundle[], statement: StatementAudit | null, statementUrl: string | null): SiteContext {
  const titles = new Map<string, string>();
  const navSequences = new Map<string, string[]>();
  const componentNames = new Map<string, Map<string, string>>();
  let hasSearch = false;
  let hasSitemap = false;
  let hasBreadcrumbs = false;

  for (const page of pages) {
    if (page.error) continue;
    const e = page.evidence as Ev;
    if (!e?.meta) continue;

    titles.set(page.url, (e.meta.title ?? '').trim());

    const navs = (e.navigation?.navs ?? []) as { items: { text: string }[] }[];
    // The largest nav is the primary one; comparing every nav on the page would
    // report false inconsistencies between a header menu and a footer menu.
    const primary = navs.slice().sort((a, b) => b.items.length - a.items.length)[0];
    navSequences.set(page.url, (primary?.items ?? []).map((i) => i.text).filter(Boolean));

    const names = new Map<string, string>();
    const candidates = [
      ...((e.links ?? []) as { accessibleName: string }[]).map((l) => ({ name: l.accessibleName, tag: 'a' })),
      ...((e.aria?.widgets ?? []) as { accessibleName: string; role: string }[]).map((w) => ({ name: w.accessibleName, tag: w.role })),
      ...((e.aria?.iconOnlyButtons ?? []) as { accessibleName: string }[]).map((b) => ({ name: b.accessibleName, tag: 'button' })),
    ];
    for (const c of candidates) {
      const key = componentKey(c.name ?? '', c.tag);
      if (key && !names.has(key)) names.set(key, c.name.trim());
    }
    componentNames.set(page.url, names);

    if ((e.navigation?.searchMechanisms ?? 0) > 0) hasSearch = true;
    if ((e.navigation?.sitemapLinks ?? 0) > 0) hasSitemap = true;
    if ((e.navigation?.breadcrumbs ?? 0) > 0) hasBreadcrumbs = true;
  }

  return {
    pageCount: pages.filter((p) => !p.error).length,
    titles,
    navSequences,
    componentNames,
    statementUrl,
    statementContent: statement,
    hasSearch,
    hasSitemap,
    hasBreadcrumbs,
  };
}

/** The first accessibility-statement link found anywhere in the crawl. */
export function findStatementUrl(pages: PageBundle[]): string | null {
  for (const page of pages) {
    const links = ((page.evidence as Ev)?.navigation?.statementLinks ?? []) as { href: string; text: string }[];
    // Prefer a link whose text explicitly says "הצהרת נגישות" over a bare
    // "נגישות" link, which is often the widget toggle rather than the statement.
    const explicit = links.find((l) => /הצהרת נגישות|accessibility.?statement/i.test(l.text));
    if (explicit?.href) return explicit.href;
  }
  for (const page of pages) {
    const links = ((page.evidence as Ev)?.navigation?.statementLinks ?? []) as { href: string; text: string }[];
    if (links[0]?.href) return links[0].href;
  }
  return null;
}

/**
 * Checks the statement page for the seven items the Regulations expect.
 *
 * Deliberately generous on phrasing: statements are written by lawyers, by
 * agencies and by copy-paste, and the point is to find what is missing, not to
 * mark down wording. A false "missing" here would send an operator chasing
 * something they already have.
 */
export function auditStatement(url: string, text: string): StatementAudit {
  const t = text.replace(/\s+/g, ' ');

  const hasConformanceLevel = /\bAA\b|רמה\s*AA|רמת נגישות|WCAG|5568/i.test(t);
  const hasFeaturesList =
    /(אמצעי|התאמות|פעולות)\s*(ה?נגישות)?\s*(ש?בוצעו|באתר)|תומך ב|ניתן לנווט|קורא[יי]? מסך|ניגודיות|טקסט חלופי/.test(t);
  // Either a list of limitations, or an explicit statement that there are none.
  const hasKnownLimitations = /מגבלות\s*נגישות|חלקים שאינם נגישים|טרם הונגש|למרות מאמצינו|אין מגבלות ידועות|לא נמצאו מגבלות/.test(t);
  const hasCoordinatorName =
    /(רכז(?:ת)?\s*(?:ה)?נגישות|ממונה\s*(?:ה)?נגישות)\s*[:\-–]?\s*[֐-׿ A-Za-z'"״׳.-]{2,60}/.test(t);
  const hasPhone = /0\d{1,2}[-\s]?\d{7}|\+972[-\s]?\d{1,2}[-\s]?\d{7}|\*\d{4}/.test(t);
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(t);
  // Dates: dd/mm/yyyy, dd.mm.yyyy, or a Hebrew month name with a year.
  const dateNear = (labels: RegExp): boolean =>
    new RegExp(
      labels.source + '[^.]{0,60}?(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)',
      'i',
    ).test(t);
  const hasAuditDate = dateNear(/(ביקורת|בדיקת|סקר)\s*(ה)?נגישות|נבדק/);
  const hasUpdateDate = dateNear(/(עדכון|עודכן|תאריך)\s*(ה)?(הצהרה|הצהרת נגישות|אחרון)/);

  return {
    url,
    hasConformanceLevel,
    hasFeaturesList,
    hasKnownLimitations,
    hasCoordinatorName,
    hasPhone,
    hasEmail,
    hasAuditDate,
    hasUpdateDate,
  };
}
