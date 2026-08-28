/**
 * RTL HTML report.
 *
 * This file has an unusual constraint: it is itself a digital document covered
 * by the standard it reports on. A readiness report that fails its own review
 * is not a credible artifact, so everything here follows the rules it checks —
 * `lang`/`dir` declared, one `h1`, continuous heading hierarchy, real table
 * markup with `caption` and `scope`, a working skip link, visible focus rings,
 * contrast above 4.5:1, and status conveyed by icon **and** text, never colour
 * alone. `verify-self.ts` runs the scanner against this output.
 */

import type { Catalogue, CheckItem, CheckResult, Verdict } from '@ai5568/criteria';
import { VERDICT_HE, METHOD_HE } from '@ai5568/criteria';
import type { ScanReport, TargetReport } from '../../src/types.ts';

const VERDICT_ICON: Record<Verdict, string> = { PASS: '✔', FAIL: '✘', NA: '⊘' };
const VERDICT_CLASS: Record<Verdict, string> = { PASS: 'pass', FAIL: 'fail', NA: 'na' };

export function renderHtmlReport(report: ScanReport, catalogue: Catalogue): string {
  const items = new Map(catalogue.items.map((i) => [i.id, i]));
  const targets = [...report.pages, ...report.documents];

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>דוח נגישות ת"י 5568 — ${esc(report.site.name)}</title>
<style>${STYLES}</style>
</head>
<body>
<a class="skip-link" href="#main">דלג לתוכן הראשי</a>

<header class="page-header">
  <p class="eyebrow">דוח בדיקת נגישות</p>
  <h1>תקן ישראלי ת"י 5568 — ${esc(report.site.name)}</h1>
  <dl class="meta">
    <div><dt>כתובת האתר</dt><dd><a href="${esc(report.site.startUrl)}" dir="ltr">${esc(report.site.startUrl)}</a></dd></div>
    <div><dt>מועד הסריקה</dt><dd>${formatDate(report.startedAt)}</dd></div>
    <div><dt>רמת נגישות נבדקת</dt><dd>${esc(report.options.level)}</dd></div>
    <div><dt>עמודים שנסרקו</dt><dd>${report.stats.pagesScanned}</dd></div>
    <div><dt>מסמכים שנסרקו</dt><dd>${report.stats.documentsScanned}</dd></div>
  </dl>
</header>

<main id="main" tabindex="-1">
${renderSummary(report, targets)}
${renderSiteWide(report)}
${renderSkipped(report)}
${targets.map((t) => renderTarget(t, items)).join('\n')}
</main>

<footer class="page-footer">
  <h2>על הדוח</h2>
  <p>
    הדוח נערך על בסיס גיליון הבדיקה הרשמי <q>${esc(report.catalogueSource.sheet)}</q>
    (${esc(report.catalogueSource.file)}), כנדרש בתקנה 93(א) לתקנות שוויון זכויות לאנשים עם מוגבלות
    (התאמות נגישות לשירות), התשע"ג-2013. מספרי הקריטריונים, שמותיהם ורמות הנגישות הנדרשות מועתקים מהגיליון כלשונם.
  </p>
  <p class="caveat">
    <strong>מגבלות הדוח.</strong> בדיקה אוטומטית אינה תחליף לבדיקה ידנית ולבדיקה עם קוראי מסך.
    שורות המסומנות <q>לא אומת</q> לא נבדקו לגופן ואינן מהוות אישור לעמידה בקריטריון.
    כמו כן, עמידה בתקן אינה זהה לעמידה בתקנות: נדרשים גם הצהרת נגישות, רכז נגישות במקרים הרלוונטיים,
    ובמקרה של פטור מטעמי נטל כבד — חוות דעת של מורשה נגישות שירות.
  </p>
</footer>
</body>
</html>`;
}

function renderSummary(report: ScanReport, targets: TargetReport[]): string {
  const total = targets.reduce(
    (acc, t) => ({
      pass: acc.pass + t.summary.pass,
      fail: acc.fail + t.summary.fail,
      na: acc.na + t.summary.na,
      unverified: acc.unverified + t.summary.unverified,
    }),
    { pass: 0, fail: 0, na: 0, unverified: 0 },
  );
  const assessed = total.pass + total.fail;
  const rate = assessed > 0 ? Math.round((total.pass / assessed) * 100) : 0;
  // Genuine defects, separated from rows nothing managed to verify.
  const realFailures = total.fail - total.unverified;

  return `<section class="card" aria-labelledby="summary-h">
  <h2 id="summary-h">סיכום כללי</h2>
  <ul class="stats">
    <li class="stat pass"><span class="stat-icon" aria-hidden="true">✔</span><span class="stat-num">${total.pass}</span><span class="stat-label">תקין</span></li>
    <li class="stat fail"><span class="stat-icon" aria-hidden="true">✘</span><span class="stat-num">${realFailures}</span><span class="stat-label">לא תקין — נמצא ממצא</span></li>
    <li class="stat unverified"><span class="stat-icon" aria-hidden="true">?</span><span class="stat-num">${total.unverified}</span><span class="stat-label">לא תקין — לא אומת</span></li>
    <li class="stat na"><span class="stat-icon" aria-hidden="true">⊘</span><span class="stat-num">${total.na}</span><span class="stat-label">לא רלוונטי</span></li>
  </ul>
  <p class="rate">שיעור העמידה בקריטריונים שנבדקו לגופם: <strong>${rate}%</strong> (${total.pass} מתוך ${assessed}).</p>
  <p class="note">
    שורות <q>לא אומת</q> נספרות כ<q>לא תקין</q> בטופס הרשמי, משום שהתקן אינו מכיר במצב ביניים —
    אך הן מציינות שהבדיקה לא הוכרעה, ולא שנמצא כשל. יש לבדוק אותן ידנית.
  </p>
</section>`;
}

function renderSiteWide(report: ScanReport): string {
  if (report.siteWideFailures.length === 0) return '';
  const rows = report.siteWideFailures
    .slice(0, 15)
    .map(
      (f) => `<tr>
      <td dir="ltr" class="num">${esc(f.criterionNo)}</td>
      <td>${esc(f.criterionNameHe)}</td>
      <td class="num">${f.failCount} מתוך ${f.total}</td>
      <td><div class="bar" role="img" aria-label="${Math.round((f.failCount / f.total) * 100)} אחוז מהיעדים נכשלו"><span style="inline-size:${Math.round((f.failCount / f.total) * 100)}%"></span></div></td>
    </tr>`,
    )
    .join('\n');

  return `<section class="card" aria-labelledby="sitewide-h">
  <h2 id="sitewide-h">קריטריונים שנכשלו ברוב היעדים</h2>
  <p>כשל החוזר כמעט בכל העמודים נובע בדרך כלל מרכיב משותף — תבנית, תפריט או כותרת תחתונה. תיקון אחד שם מסלק שורות רבות בדוח.</p>
  <table>
    <caption>דירוג הקריטריונים לפי שיעור הכישלון</caption>
    <thead><tr><th scope="col">מס' קריטריון</th><th scope="col">קריטריון בדיקה</th><th scope="col">נכשל</th><th scope="col">שיעור</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderSkipped(report: ScanReport): string {
  if (report.stats.skipped.length === 0) return '';
  const shown = report.stats.skipped.slice(0, 50);
  return `<section class="card warn" aria-labelledby="skipped-h">
  <h2 id="skipped-h">כתובות שלא נסרקו (${report.stats.skipped.length})</h2>
  <p>הכתובות הבאות אותרו אך לא נבדקו. הדוח אינו מכסה אותן.</p>
  <ul class="url-list">${shown.map((s) => `<li><span dir="ltr">${esc(s.url)}</span> — ${esc(s.reason)}</li>`).join('')}</ul>
  ${report.stats.skipped.length > shown.length ? `<p>ועוד ${report.stats.skipped.length - shown.length} כתובות.</p>` : ''}
</section>`;
}

function renderTarget(target: TargetReport, items: Map<string, CheckItem>): string {
  const id = `t-${hash(target.url)}`;
  const israeli = target.results.filter((r) => items.get(r.itemId)?.engine.part === 'IL');
  const standard = target.results.filter((r) => items.get(r.itemId)?.engine.part !== 'IL');

  return `<section class="card target" aria-labelledby="${id}-h">
  <header class="target-header">
    <h2 id="${id}-h">${esc(target.kind === 'page' ? 'עמוד' : 'מסמך')}: ${esc(target.name)}</h2>
    <dl class="meta">
      <div><dt>שם האתר</dt><dd>${esc(target.siteName)}</dd></div>
      <div><dt>${esc(target.kind === 'page' ? 'כותרת העמוד' : 'שם המסמך')}</dt><dd>${esc(target.name)}</dd></div>
      <div><dt>כתובת</dt><dd><a href="${esc(target.url)}" dir="ltr">${esc(target.url)}</a></dd></div>
    </dl>
    <p class="target-summary">
      <span class="chip pass">✔ תקין: ${target.summary.pass}</span>
      <span class="chip fail">✘ לא תקין: ${target.summary.fail}</span>
      ${target.summary.unverified > 0 ? `<span class="chip unverified">? מהם לא אומתו: ${target.summary.unverified}</span>` : ''}
      <span class="chip na">⊘ לא רלוונטי: ${target.summary.na}</span>
    </p>
    ${target.error ? `<p class="error-banner"><strong>שגיאה:</strong> ${esc(target.error)}</p>` : ''}
  </header>

  ${renderResultTable(standard, items, `${id}-std`, 'קריטריוני התקן', 'טבלת הבדיקה לפי גיליון הבדיקה הרשמי')}
  ${israeli.length ? renderResultTable(israeli, items, `${id}-il`, 'תוספות ישראליות (מעבר לגיליון)', 'חובות הנובעות מתקנות שוויון זכויות ואינן חלק מ-WCAG') : ''}
</section>`;
}

function renderResultTable(
  results: CheckResult[],
  items: Map<string, CheckItem>,
  id: string,
  heading: string,
  captionText: string,
): string {
  if (results.length === 0) return '';
  const rows = results
    .map((r) => {
      const item = items.get(r.itemId);
      if (!item) return '';
      const cls = VERDICT_CLASS[r.verdict];
      const unverified = r.verdict === 'FAIL' && r.confidence === 0;
      return `<tr class="row-${cls}${unverified ? ' row-unverified' : ''}">
      <td dir="ltr" class="num">${esc(item.form.criterionNo)}</td>
      <th scope="row" class="criterion">${esc(item.form.criterionNameHe)}</th>
      <td class="desc">${esc(item.engine.summaryHe)}</td>
      <td dir="ltr" class="level">${esc(item.form.level)}</td>
      <td class="verdict">
        <span class="badge ${cls}"><span class="badge-icon" aria-hidden="true">${VERDICT_ICON[r.verdict]}</span>${esc(VERDICT_HE[r.verdict])}</span>
        <span class="method">${esc(METHOD_HE[r.method])}${r.method === 'ai' || r.method === 'auto+ai' ? ` · ביטחון ${r.confidence.toFixed(2)}` : ''}</span>
        ${unverified ? '<span class="method warnflag">לא אומת</span>' : ''}
      </td>
      <td class="findings">${renderFindings(r)}</td>
    </tr>`;
    })
    .join('\n');

  return `<h3 id="${id}">${esc(heading)}</h3>
  <div class="table-scroll">
  <table class="results" aria-labelledby="${id}">
    <caption>${esc(captionText)}</caption>
    <thead>
      <tr>
        <th scope="col">מס' קריטריון</th>
        <th scope="col">קריטריון בדיקה</th>
        <th scope="col">תאור הקריטריון</th>
        <th scope="col">רמה נדרשת בישראל</th>
        <th scope="col">תוצאה</th>
        <th scope="col">ממצאים</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  </div>`;
}

function renderFindings(r: CheckResult): string {
  if (r.findings.length === 0) {
    return r.noteHe ? `<p class="note-only">${esc(r.noteHe)}</p>` : '';
  }
  const shown = r.findings.slice(0, 20);
  const list = shown
    .map(
      (f) => `<li>
      <code dir="ltr" class="locator">${esc(f.locator)}</code>
      ${f.snippet ? `<pre dir="ltr" lang="en"><code>${esc(clip(f.snippet, 400))}</code></pre>` : ''}
      <p class="reason"${langAttr(f.reasonHe)}>${isolateQuoted(esc(f.reasonHe))}</p>
    </li>`,
    )
    .join('');
  const more = r.findings.length > shown.length ? `<p class="more">ועוד ${r.findings.length - shown.length} ממצאים.</p>` : '';
  const note = r.noteHe ? `<p class="note-only">${esc(r.noteHe)}</p>` : '';
  return `${note}<ol class="finding-list">${list}</ol>${more}`;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function esc(value: string | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Isolates quoted values inside Hebrew finding text.
 *
 * Findings quote what they found — `הטקסט "banner-sale.png" ...`, a phone
 * number, a selector. Those runs are left-to-right inside right-to-left prose,
 * and the bidi algorithm resolves the trailing punctuation against the wrong
 * side, so `"03-1234567".` renders with the period misplaced.
 *
 * `<bdi>` is the element for exactly this: isolate a run whose direction is not
 * known in advance, without asserting a direction on it. Found by running the
 * scanner against its own report — the same defect it reports on other sites.
 *
 * Operates on already-escaped HTML, so it matches the `&quot;` entity.
 */
function isolateQuoted(escaped: string): string {
  return escaped.replace(/&quot;([^&]{1,120}?)&quot;/g, (whole, inner: string) => {
    // Only isolate runs that are actually LTR-leaning; quoting a Hebrew phrase
    // needs no isolation and wrapping it would add markup for nothing.
    const hebrew = (inner.match(/[֐-׿]/g) ?? []).length;
    const ltr = (inner.match(/[A-Za-z0-9]/g) ?? []).length;
    if (ltr === 0 || hebrew > ltr) return whole;
    return `&quot;<bdi>${inner}</bdi>&quot;`;
  });
}

/**
 * Marks predominantly-English text with `lang="en" dir="ltr"`.
 *
 * axe-core's failure summaries are English and land inside a Hebrew document.
 * Unmarked, a screen reader reads them with Hebrew phonetics — which is exactly
 * the defect criterion 3.1.2 covers, and which this tool reports on other
 * people's sites. Found by running the scanner against its own report.
 */
function langAttr(text: string): string {
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return latin > 20 && hebrew < latin * 0.15 ? ' lang="en" dir="ltr"' : '';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  // Explicit Gregorian calendar: he-IL can otherwise resolve to the Hebrew
  // calendar depending on the runtime's ICU data, which is not what a review
  // report should show.
  return new Intl.DateTimeFormat('he-IL-u-ca-gregory', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jerusalem',
  }).format(d);
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Colours are chosen so every foreground/background pair clears 4.5:1, and the
 * status colours stay distinguishable under the common forms of colour vision
 * deficiency — which is also why each status carries an icon and a word.
 */
const STYLES = `
:root {
  --ink: #16191d;
  --ink-soft: #4a5058;
  --line: #d3d8de;
  --bg: #ffffff;
  --bg-soft: #f4f6f8;
  --pass-fg: #14532d;
  --pass-bg: #dcfce7;
  --fail-fg: #7f1d1d;
  --fail-bg: #fee2e2;
  --na-fg: #713f12;
  --na-bg: #fef3c7;
  --unverified-fg: #3730a3;
  --unverified-bg: #e0e7ff;
  --focus: #0b5cd5;
}
* { box-sizing: border-box; }
html { font-size: 100%; }
body {
  margin: 0;
  padding: 0 0 4rem;
  font-family: "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif;
  font-size: 1rem;
  line-height: 1.65;
  color: var(--ink);
  background: var(--bg-soft);
}
.skip-link {
  position: absolute;
  inset-inline-start: -9999px;
  top: 0;
  z-index: 10;
  padding: .75rem 1.25rem;
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}
.skip-link:focus { inset-inline-start: 0; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
main:focus { outline: none; }

.page-header {
  padding: 2rem 1.5rem;
  background: var(--ink);
  color: #fff;
}
.page-header .eyebrow { margin: 0; font-size: .875rem; letter-spacing: .08em; color: #c3cad3; }
.page-header h1 { margin: .25rem 0 1rem; font-size: 1.75rem; line-height: 1.3; }
.page-header a { color: #a8c7f5; }

.meta { display: flex; flex-wrap: wrap; gap: .5rem 2rem; margin: 0; }
.meta div { margin: 0; }
.meta dt { font-size: .8125rem; color: var(--ink-soft); margin: 0; }
.page-header .meta dt { color: #c3cad3; }
.meta dd { margin: 0; font-weight: 600; }

.card {
  max-inline-size: 92rem;
  margin: 1.5rem auto;
  padding: 1.5rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: .5rem;
}
.card.warn { border-inline-start: 6px solid var(--na-fg); }
h2 { margin: 0 0 .75rem; font-size: 1.375rem; }
h3 { margin: 1.5rem 0 .5rem; font-size: 1.0625rem; }
p { margin: .5rem 0; }
.note, .caveat { color: var(--ink-soft); font-size: .9375rem; }

.stats { display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; margin: 0 0 1rem; padding: 0; }
.stat {
  display: flex; align-items: baseline; gap: .5rem;
  padding: .75rem 1rem; border-radius: .375rem; border: 2px solid transparent;
}
.stat-icon { font-size: 1.25rem; }
.stat-num { font-size: 1.5rem; font-weight: 700; }
.stat-label { font-size: .9375rem; }
.stat.pass { background: var(--pass-bg); color: var(--pass-fg); border-color: var(--pass-fg); }
.stat.fail { background: var(--fail-bg); color: var(--fail-fg); border-color: var(--fail-fg); }
.stat.na { background: var(--na-bg); color: var(--na-fg); border-color: var(--na-fg); }
.stat.unverified { background: var(--unverified-bg); color: var(--unverified-fg); border-color: var(--unverified-fg); }
.rate { font-size: 1.0625rem; }

.target-header { border-block-end: 1px solid var(--line); padding-block-end: 1rem; margin-block-end: .5rem; }
.target-summary { display: flex; flex-wrap: wrap; gap: .5rem; margin: .75rem 0 0; }
.chip { padding: .25rem .625rem; border-radius: 1rem; font-size: .875rem; font-weight: 600; border: 1px solid; }
.chip.pass { background: var(--pass-bg); color: var(--pass-fg); border-color: var(--pass-fg); }
.chip.fail { background: var(--fail-bg); color: var(--fail-fg); border-color: var(--fail-fg); }
.chip.na { background: var(--na-bg); color: var(--na-fg); border-color: var(--na-fg); }
.chip.unverified { background: var(--unverified-bg); color: var(--unverified-fg); border-color: var(--unverified-fg); }
.error-banner { background: var(--fail-bg); color: var(--fail-fg); padding: .75rem 1rem; border-radius: .375rem; }

/* Wide tables scroll inside their own container so the page never does. */
.table-scroll { overflow-x: auto; }
table { inline-size: 100%; border-collapse: collapse; font-size: .9375rem; }
caption { text-align: start; padding-block-end: .5rem; color: var(--ink-soft); font-size: .875rem; }
th, td { padding: .625rem .75rem; border: 1px solid var(--line); vertical-align: top; text-align: start; }
thead th { background: var(--bg-soft); font-size: .875rem; position: sticky; top: 0; }
tbody th { font-weight: 600; }
.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.level { text-align: center; font-weight: 700; }
.criterion { inline-size: 14%; }
.desc { inline-size: 26%; color: var(--ink-soft); }
.verdict { inline-size: 11%; }
.findings { inline-size: 34%; }

.badge { display: inline-flex; align-items: center; gap: .375rem; padding: .1875rem .5rem; border-radius: .25rem; font-weight: 700; border: 1px solid; white-space: nowrap; }
.badge-icon { font-size: 1rem; }
.badge.pass { background: var(--pass-bg); color: var(--pass-fg); border-color: var(--pass-fg); }
.badge.fail { background: var(--fail-bg); color: var(--fail-fg); border-color: var(--fail-fg); }
.badge.na { background: var(--na-bg); color: var(--na-fg); border-color: var(--na-fg); }
.method { display: block; margin-block-start: .25rem; font-size: .75rem; color: var(--ink-soft); }
.warnflag { color: var(--unverified-fg); font-weight: 700; }

/* Flat, opaque colours rather than color-mix()/alpha: a contrast checker (ours
   included) cannot compute a ratio against a blended or semi-transparent
   background, so it reports the row as undecidable instead of passing. These
   are the pre-blended values, and every text colour used on them clears 4.5:1. */
.row-pass { background: #f2fbf5; }
.row-fail { background: #fef7f7; }
.row-na   { background: #fefaf0; }
.row-unverified { background: #f5f6fe; }

.finding-list { margin: .25rem 0; padding-inline-start: 1.25rem; }
.finding-list li { margin-block-end: .75rem; }
.locator { display: inline-block; background: var(--bg-soft); padding: .125rem .375rem; border-radius: .25rem; font-size: .8125rem; word-break: break-all; }
pre { margin: .25rem 0; padding: .5rem; background: var(--bg-soft); border-radius: .25rem; overflow-x: auto; font-size: .8125rem; }
pre code { white-space: pre-wrap; word-break: break-word; }
.reason { margin: .25rem 0 0; }
.note-only { color: var(--ink-soft); }
.more { font-weight: 600; }

.bar { display: block; inline-size: 100%; min-inline-size: 6rem; block-size: .75rem; background: var(--bg-soft); border: 1px solid var(--line); border-radius: .375rem; overflow: hidden; }
.bar span { display: block; block-size: 100%; background: var(--fail-fg); }

.url-list { font-size: .875rem; }
.url-list li { margin-block-end: .25rem; word-break: break-all; }

.page-footer { max-inline-size: 92rem; margin: 2rem auto 0; padding: 0 1.5rem; }
.page-footer h2 { font-size: 1.125rem; }

@media print {
  body { background: #fff; }
  .card { break-inside: avoid; border-color: #999; }
  .skip-link { display: none; }
  thead th { position: static; }
}
`;
