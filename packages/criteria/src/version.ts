/**
 * Catalogue version.
 *
 * Regulation 35 defines the binding standard as ת"י 5568 "כתיקונם מזמן לזמן" —
 * a rolling reference. The duty therefore moves when the standard moves, and a
 * review is only meaningful against a stated version of the catalogue.
 *
 * Two reviews are comparable only when they carry the same version here. That
 * is not bookkeeping: a row that changed between two scans may have changed
 * because the site changed or because the standard did, and those are different
 * news for the customer. `@ai5568/delta` refuses to call it a delta otherwise.
 *
 * BUMP THIS whenever anything that can change a verdict changes:
 *   - the check sheet is re-imported from a new form
 *   - an engine override, rubric or applicability probe is edited
 *   - a `standardOverride` is added, removed or altered
 *   - a criterion is added or removed
 *
 * Not on comment edits, formatting, or changes to remediation prose that cannot
 * move a verdict. The version answers "would this catalogue judge a site
 * differently?", nothing else.
 *
 * Format is calendar-based — `YYYY.MM.N` — because the thing it tracks is a
 * legal instrument that changes on dates, not a library that changes on
 * features.
 */

export const CATALOGUE_VERSION = '2026.08.1';

/** When this catalogue's reading of the standard takes effect. */
export const EFFECTIVE_FROM = '2026-08-28';

/**
 * What this catalogue is derived from, so a report can cite its own provenance
 * rather than asking the reader to trust it.
 *
 * `authority` follows the same three tiers the source library uses: what the
 * law requires, what the Commission interprets, and what is professional
 * guidance. Blending them is how a resource loses credibility with the body we
 * would want to be listed by.
 */
export type SourceAuthority = 'binding' | 'interpretation' | 'guidance';

export interface CatalogueSource {
  id: string;
  titleHe: string;
  authority: SourceAuthority;
  /** Where it came from. Empty only for a document with no stable public URL. */
  url?: string;
  /** Publication or last-amendment date of the instrument itself. */
  publishedOn?: string;
  /** When we fetched the copy we read. */
  retrievedOn?: string;
  /** Of the local copy, where one is kept. Lets a reader verify they have ours. */
  sha256?: string;
  /** Which catalogue rows it feeds. */
  feeds: string;
}

export const CATALOGUE_SOURCES: CatalogueSource[] = [
  {
    id: 'commissioner-check-sheet',
    titleHe: 'טופס בדיקות נגישות לאתר אינטרנט — נציבות שוויון זכויות',
    authority: 'binding',
    url: 'https://www.gov.il/he/pages/website_accessibility',
    publishedOn: '2025-07-08',
    retrievedOn: '2026-08-28',
    sha256: 'e78a80ce7cd50c8894790e0c1d06f2220a3971525820da29be9417cafa7e5b0b',
    feeds: 'חלק 1 — R04–R45 (42 שורות), בייבוא אוטומטי',
  },
  {
    id: 'si-5568-1-2023',
    titleHe: 'ת"י 5568 חלק 1 — נגישות אתרי אינטרנט (ספטמבר 2023)',
    authority: 'binding',
    url: 'https://www.sii.org.il/',
    publishedOn: '2023-09',
    retrievedOn: '2026-08-28',
    feeds: 'שבע הסטיות הלאומיות; standardOverride ב-R12 ו-R36',
  },
  {
    id: 'si-5568-2',
    titleHe: 'ת"י 5568 חלק 2 — נגישות מסמכים דיגיטליים',
    authority: 'binding',
    publishedOn: '2020-06',
    retrievedOn: '2026-08-28',
    feeds: 'חלק 2 — D01–D12 (12 שורות)',
  },
  {
    id: 'service-accessibility-regulations',
    titleHe: 'תקנות שוויון זכויות (התאמות נגישות לשירות), תשע"ג-2013 — סימן ג\' כנוסחו בתיקון התשע"ח-2017',
    authority: 'binding',
    url: 'https://www.nevo.co.il/law_html/law01/500_865.htm',
    publishedOn: '2017-10-26',
    retrievedOn: '2026-08-28',
    feeds: 'תוספות ישראליות IL01–IL06; רמת AA; ספי הפטור',
  },
];
