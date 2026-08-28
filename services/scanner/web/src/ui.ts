/**
 * The web UI, served as a single self-contained RTL page.
 *
 * No build step and no framework: the whole interface is one form, a live
 * status region and a results list, and a bundler would add more to maintain
 * than it removes. More importantly, this page is the tool's own reference
 * implementation — it is scanned by `npm run verify:self`, so it has to be
 * hand-verifiable against the criteria rather than the output of a toolchain.
 *
 * Accessibility decisions worth naming:
 *   - progress is announced through a polite live region, not just animated;
 *   - status is icon + text + colour, never colour alone;
 *   - the form is fully labelled and operable without a pointer;
 *   - focus is moved to the results heading when a scan completes.
 */

export function renderApp(): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>בודק נגישות ת"י 5568</title>
<style>${STYLES}</style>
</head>
<body>
<a class="skip-link" href="#main">דלג לתוכן הראשי</a>

<header class="topbar">
  <h1>בודק נגישות — תקן ישראלי ת"י 5568</h1>
  <p class="sub">סריקת אתר מול גיליון הבדיקה הרשמי, כולל מסמכים להורדה לפי חלק 2</p>
</header>

<main id="main" tabindex="-1">
  <section class="card" aria-labelledby="new-scan-h">
    <h2 id="new-scan-h">סריקה חדשה</h2>
    <form id="scan-form" novalidate>
      <div class="field">
        <label for="url">כתובת האתר לבדיקה <span class="req">(חובה)</span></label>
        <input id="url" name="url" type="url" dir="ltr" required aria-required="true"
               placeholder="https://example.co.il" autocomplete="url"
               aria-describedby="url-hint url-error">
        <p id="url-hint" class="hint">הסריקה מתחילה מכתובת זו ועוקבת אחר קישורים באותו אתר.</p>
        <p id="url-error" class="error" role="alert" hidden></p>
      </div>

      <div class="grid">
        <div class="field">
          <label for="maxPages">מספר עמודים מרבי</label>
          <input id="maxPages" name="maxPages" type="number" min="1" max="2000" value="50" dir="ltr"
                 aria-describedby="maxPages-hint">
          <p id="maxPages-hint" class="hint">עמודים שלא נסרקו מפורטים בדוח.</p>
        </div>

        <div class="field">
          <label for="maxDepth">עומק סריקה</label>
          <input id="maxDepth" name="maxDepth" type="number" min="0" max="20" value="5" dir="ltr">
        </div>

        <div class="field">
          <label for="level">רמת נגישות</label>
          <select id="level" name="level" aria-describedby="level-hint">
            <option value="AA" selected>AA — רמת החובה</option>
            <option value="A">A — רק בפטור לפי תקנה 35(ב)(2)</option>
          </select>
          <p id="level-hint" class="hint">טופס הבדיקה הרשמי מחייב רמה AA.</p>
        </div>

        <div class="field">
          <label for="budgetUsd">תקציב שיקול דעת (דולר)</label>
          <input id="budgetUsd" name="budgetUsd" type="number" min="0.5" max="500" step="0.5" value="10" dir="ltr">
        </div>
      </div>

      <fieldset>
        <legend>אפשרויות</legend>
        <label class="check"><input type="checkbox" id="documents" checked> בדיקת מסמכים להורדה (PDF, Word, Excel, PowerPoint) לפי חלק 2</label>
        <label class="check"><input type="checkbox" id="noAi"> מצב ללא בינה מלאכותית — קריטריונים הדורשים שיקול דעת ידווחו כ"לא אומת"</label>
      </fieldset>

      <button type="submit" id="submit">התחלת סריקה</button>
    </form>
  </section>

  <section class="card" aria-labelledby="jobs-h">
    <h2 id="jobs-h" tabindex="-1">סריקות</h2>
    <p id="live" class="live" role="status" aria-live="polite"></p>
    <p class="note">הסריקות נשמרות בזיכרון בלבד ונמחקות עם הפעלה מחדש של השרת. קובצי הדוח נשמרים בדיסק.</p>
    <div id="jobs"><p class="empty">עדיין לא בוצעו סריקות.</p></div>
  </section>
</main>

<script>${SCRIPT}</script>
</body>
</html>`;
}

const STYLES = `
:root {
  --ink:#16191d; --ink-soft:#4a5058; --line:#d3d8de; --bg:#fff; --bg-soft:#f4f6f8;
  --pass-fg:#14532d; --pass-bg:#dcfce7; --fail-fg:#7f1d1d; --fail-bg:#fee2e2;
  --na-fg:#713f12; --na-bg:#fef3c7; --unv-fg:#3730a3; --unv-bg:#e0e7ff;
  --accent:#0b5cd5;
}
*{box-sizing:border-box}
body{margin:0;padding:0 0 4rem;font-family:"Segoe UI","Noto Sans Hebrew",Arial,sans-serif;
     font-size:1rem;line-height:1.6;color:var(--ink);background:var(--bg-soft)}
.skip-link{position:absolute;inset-inline-start:-9999px;top:0;z-index:10;padding:.75rem 1.25rem;background:var(--ink);color:#fff;font-weight:700}
.skip-link:focus{inset-inline-start:0}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
main:focus{outline:none}
h2:focus{outline:none}

.topbar{padding:1.5rem;background:var(--ink);color:#fff}
.topbar h1{margin:0;font-size:1.5rem}
.topbar .sub{margin:.25rem 0 0;color:#c3cad3;font-size:.9375rem}

.card{max-inline-size:64rem;margin:1.5rem auto;padding:1.5rem;background:var(--bg);
      border:1px solid var(--line);border-radius:.5rem}
h2{margin:0 0 1rem;font-size:1.25rem}
h3{margin:0;font-size:1.0625rem}

.field{margin-block-end:1rem}
label{display:block;font-weight:600;margin-block-end:.25rem}
.req{color:var(--fail-fg);font-weight:700}
input,select{inline-size:100%;padding:.5rem .625rem;font:inherit;color:var(--ink);
             border:1px solid var(--line);border-radius:.25rem;background:#fff}
input[type=checkbox]{inline-size:auto;margin-inline-end:.5rem}
.hint{margin:.25rem 0 0;font-size:.875rem;color:var(--ink-soft)}
.error{margin:.25rem 0 0;font-size:.875rem;color:var(--fail-fg);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:0 1rem}
fieldset{margin:0 0 1rem;padding:.75rem 1rem;border:1px solid var(--line);border-radius:.25rem}
legend{font-weight:600;padding:0 .25rem}
.check{font-weight:400;display:flex;align-items:flex-start;margin-block-end:.5rem}
button{padding:.625rem 1.5rem;font:inherit;font-weight:700;color:#fff;background:var(--accent);
       border:2px solid var(--accent);border-radius:.25rem;cursor:pointer}
button:hover{background:#0847a6;border-color:#0847a6}
button[disabled]{background:var(--ink-soft);border-color:var(--ink-soft);cursor:not-allowed}

.live{min-block-size:1.5rem;font-weight:600}
.note,.empty{color:var(--ink-soft);font-size:.9375rem}

.job{padding:1rem;margin-block-end:.75rem;border:1px solid var(--line);border-radius:.375rem;background:var(--bg-soft)}
.job-head{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:baseline;justify-content:space-between}
.job-url{font-size:.875rem;color:var(--ink-soft);word-break:break-all}
.status{display:inline-flex;align-items:center;gap:.375rem;padding:.1875rem .5rem;border-radius:.25rem;
        font-size:.875rem;font-weight:700;border:1px solid}
.status.running{background:var(--unv-bg);color:var(--unv-fg);border-color:var(--unv-fg)}
.status.done{background:var(--pass-bg);color:var(--pass-fg);border-color:var(--pass-fg)}
.status.failed{background:var(--fail-bg);color:var(--fail-fg);border-color:var(--fail-fg)}
.status.queued{background:var(--na-bg);color:var(--na-fg);border-color:var(--na-fg)}
.totals{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0 0;padding:0;list-style:none}
.totals li{padding:.1875rem .5rem;border-radius:.25rem;font-size:.875rem;font-weight:600;border:1px solid}
.t-pass{background:var(--pass-bg);color:var(--pass-fg);border-color:var(--pass-fg)}
.t-fail{background:var(--fail-bg);color:var(--fail-fg);border-color:var(--fail-fg)}
.t-unv{background:var(--unv-bg);color:var(--unv-fg);border-color:var(--unv-fg)}
.t-na{background:var(--na-bg);color:var(--na-fg);border-color:var(--na-fg)}
.downloads{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0 0;padding:0;list-style:none}
.downloads a{display:inline-block;padding:.25rem .625rem;background:#fff;border:1px solid var(--accent);
             border-radius:.25rem;color:var(--accent);font-weight:600;text-decoration:none;font-size:.875rem}
.downloads a:hover{background:var(--accent);color:#fff}
.job-error{margin:.5rem 0 0;color:var(--fail-fg);font-weight:600}
`;

const SCRIPT = `
(function () {
  'use strict';
  var form = document.getElementById('scan-form');
  var urlInput = document.getElementById('url');
  var urlError = document.getElementById('url-error');
  var submit = document.getElementById('submit');
  var live = document.getElementById('live');
  var jobsEl = document.getElementById('jobs');
  var jobsHeading = document.getElementById('jobs-h');
  var announced = {};

  function setError(msg) {
    if (msg) {
      urlError.textContent = msg;
      urlError.hidden = false;
      urlInput.setAttribute('aria-invalid', 'true');
      urlInput.focus();
    } else {
      urlError.hidden = true;
      urlInput.setAttribute('aria-invalid', 'false');
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setError('');
    var url = urlInput.value.trim();
    if (!url) { setError('נא להזין כתובת אתר.'); return; }

    submit.disabled = true;
    submit.textContent = 'מתחיל…';

    fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: url,
        maxPages: Number(document.getElementById('maxPages').value),
        maxDepth: Number(document.getElementById('maxDepth').value),
        level: document.getElementById('level').value,
        budgetUsd: Number(document.getElementById('budgetUsd').value),
        documents: document.getElementById('documents').checked,
        noAi: document.getElementById('noAi').checked
      })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) { setError(res.body.error || 'הסריקה לא התחילה.'); return; }
        live.textContent = 'הסריקה החלה.';
        refresh();
      })
      .catch(function () { setError('לא ניתן היה ליצור קשר עם השרת.'); })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = 'התחלת סריקה';
      });
  });

  function statusLabel(s) {
    return { queued: 'ממתין', running: 'רץ', done: 'הושלם', failed: 'נכשל' }[s] || s;
  }
  function statusIcon(s) {
    return { queued: '◷', running: '⟳', done: '✔', failed: '✘' }[s] || '•';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderJob(j) {
    var realFail = j.totals.fail - j.totals.unverified;
    var downloads = (j.outputs || []).map(function (o) {
      return '<li><a href="/api/jobs/' + j.id + '/download/' + encodeURIComponent(o.file) + '"' +
        (o.format === 'html' ? ' target="_blank" rel="noopener"' : '') + '>' +
        esc(o.format.toUpperCase()) + (o.format === 'html' ? ' (נפתח בלשונית חדשה)' : '') + '</a></li>';
    }).join('');

    return '<article class="job" aria-labelledby="job-' + j.id + '-h">' +
      '<div class="job-head">' +
        '<h3 id="job-' + j.id + '-h">' + esc(j.siteName || j.url) + '</h3>' +
        '<span class="status ' + j.status + '"><span aria-hidden="true">' + statusIcon(j.status) + '</span>' +
          esc(statusLabel(j.status)) + ' — ' + esc(j.phase) + '</span>' +
      '</div>' +
      '<p class="job-url" dir="ltr">' + esc(j.url) + '</p>' +
      (j.status === 'running'
        ? '<p>נסרקו ' + j.pagesScanned + ' עמודים' + (j.documentsFound ? ', נמצאו ' + j.documentsFound + ' מסמכים' : '') + '.</p>'
        : '') +
      (j.status === 'done'
        ? '<ul class="totals">' +
            '<li class="t-pass">✔ תקין ' + j.totals.pass + '</li>' +
            '<li class="t-fail">✘ לא תקין ' + realFail + '</li>' +
            '<li class="t-unv">? לא אומת ' + j.totals.unverified + '</li>' +
            '<li class="t-na">⊘ לא רלוונטי ' + j.totals.na + '</li>' +
          '</ul>' +
          (j.skipped ? '<p class="note">' + j.skipped + ' כתובות לא נסרקו — מפורטות בדוח.</p>' : '') +
          (j.costUsd ? '<p class="note">עלות שיקול דעת: $' + j.costUsd.toFixed(2) + '</p>' : '') +
          '<ul class="downloads">' + downloads + '</ul>'
        : '') +
      (j.error ? '<p class="job-error">שגיאה: ' + esc(j.error) + '</p>' : '') +
    '</article>';
  }

  function refresh() {
    fetch('/api/jobs')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var list = data.jobs || [];
        if (!list.length) { jobsEl.innerHTML = '<p class="empty">עדיין לא בוצעו סריקות.</p>'; return; }
        jobsEl.innerHTML = list.map(renderJob).join('');

        var running = list.filter(function (j) { return j.status === 'running' || j.status === 'queued'; });
        if (running.length) {
          var j = running[0];
          live.textContent = j.phase + ' — נסרקו ' + j.pagesScanned + ' עמודים.';
        }
        // Announce each completion once, and move focus so a keyboard user
        // lands on the results rather than hunting for what changed.
        list.forEach(function (j) {
          if ((j.status === 'done' || j.status === 'failed') && !announced[j.id]) {
            announced[j.id] = true;
            live.textContent = j.status === 'done'
              ? 'הסריקה של ' + (j.siteName || j.url) + ' הושלמה. הדוחות מוכנים להורדה.'
              : 'הסריקה של ' + j.url + ' נכשלה: ' + (j.error || '');
            jobsHeading.focus();
          }
        });
      })
      .catch(function () { /* transient; the next tick retries */ });
  }

  setInterval(refresh, 1500);
  refresh();
})();
`;
