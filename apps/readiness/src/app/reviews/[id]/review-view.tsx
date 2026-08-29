'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The review, from queued to read.
 *
 * One screen rather than two, because a scan of a real site takes minutes and a
 * page that only says "working…" gives a person nothing to judge progress by —
 * they reload, or they leave. The phases and the page count are what the
 * scanner already knows; showing them is the difference between waiting and
 * watching.
 */

interface Status {
  status: 'queued' | 'running' | 'done' | 'failed';
  phase: string;
  pagesScanned: number;
  documentsFound: number;
  costUsd: number;
  siteName: string | null;
  error: string | null;
  totals: { pass: number; fail: number; na: number; unverified: number };
}

interface Occurrence {
  url: string;
  locator: string;
  snippet?: string;
  reasonHe: string;
  alsoOn?: string[];
  pageCount?: number;
}

interface Finding {
  itemId: string;
  criterionNo: string;
  nameHe: string;
  level: string;
  part: string;
  method: string;
  confidence: number;
  effort: 'low' | 'medium' | 'high';
  goalHe: string;
  instruction: string;
  hebrewStrings?: Record<string, string>;
  pageCount: number;
  totalPages: number;
  occurrences: Occurrence[];
}

interface Report {
  site: { name: string; startUrl: string; origin: string };
  catalogue: { version: string; effectiveFrom: string } | null;
  startedAt: string;
  finishedAt: string;
  stats: { pagesScanned: number; documentsScanned: number; llmCostUsd: number; skipped: { url: string; reason: string }[] };
  findings: Finding[];
  unverified: { itemId: string; criterionNo: string; nameHe: string; noteHe: string; pageCount: number }[];
  notApplicable: { criterionNo: string; nameHe: string; noteHe: string; pageCount: number }[];
  passCount: number;
}

const PHASES: Record<string, string> = {
  crawl: 'סורק את עמודי האתר',
  statement: 'בודק את הצהרת הנגישות',
  evaluate: 'מעריך קריטריונים',
  judge: 'שכבת שיקול דעת',
  documents: 'מנתח מסמכים מקושרים',
  report: 'מפיק את הדוח',
};

const EFFORT_HE = { low: 'תיקון קצר', medium: 'תיקון בינוני', high: 'תיקון מורכב' } as const;

export function ReviewView({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showNa, setShowNa] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/reviews/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('לא ניתן לקרוא את מצב הסריקה.');
      const next = (await res.json()) as Status;
      setStatus(next);

      if (next.status === 'done') {
        const r = await fetch(`/api/v1/reviews/${id}/report`, { cache: 'no-store' });
        if (r.ok) setReport((await r.json()) as Report);
        else setError('הסריקה הסתיימה אך הדוח אינו זמין.');
        return;
      }
      if (next.status === 'failed') {
        setError(next.error ?? 'הסריקה נכשלה.');
        return;
      }
      timer.current = setTimeout(() => void poll(), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בלתי צפויה.');
    }
  }, [id]);

  useEffect(() => {
    void poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }

  if (!report) {
    const phase = status ? (PHASES[status.phase] ?? status.phase) : 'מתחיל';
    return (
      <section aria-labelledby="progress-heading">
        <h2 id="progress-heading">הסריקה פועלת</h2>

        {/*
          A determinate bar would be a lie — the page count is not known until
          the crawl finishes. An indeterminate one that respects
          prefers-reduced-motion is the honest version, and the numbers beside
          it carry the actual information.
        */}
        <div
          className="scan-bar"
          role="progressbar"
          aria-label="התקדמות הסריקה"
          aria-valuetext={`${phase}, ${status?.pagesScanned ?? 0} עמודים נסרקו`}
        >
          <span />
        </div>

        {/* Announced politely, so a screen reader is told without being interrupted. */}
        <p role="status" aria-live="polite" className="scan-phase">
          {phase}
          {status && status.pagesScanned > 0 ? ` · ${status.pagesScanned} עמודים` : ''}
          {status && status.documentsFound > 0 ? ` · ${status.documentsFound} מסמכים` : ''}
        </p>

        <p className="field-hint">
          סריקה מלאה של אתר אמיתי אורכת כמה דקות. אפשר להשאיר את העמוד פתוח — הוא יתעדכן לבד.
        </p>
      </section>
    );
  }

  const { findings, unverified, notApplicable, stats } = report;

  return (
    <>
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">סיכום</h2>

        <p className="notice">
          <strong>זו אינה בדיקת אודיט.</strong> הדוח מזהה ליקויים ומסביר כיצד לתקנם. הוא אינו קובע עמידה
          בתקן ואינו תחליף לבודק נגישות מוסמך.
        </p>

        <dl className="totals">
          <div>
            <dt>ליקויים לטיפול</dt>
            <dd>{findings.length}</dd>
          </div>
          <div>
            <dt>דורש בדיקה ידנית</dt>
            <dd>{unverified.length}</dd>
          </div>
          <div>
            <dt>עמודים שנסרקו</dt>
            <dd>{stats.pagesScanned}</dd>
          </div>
          <div>
            <dt>מסמכים</dt>
            <dd>{stats.documentsScanned}</dd>
          </div>
        </dl>

        {unverified.length > 0 ? (
          <p className="field-hint">
            {unverified.length} קריטריונים לא ניתנו לאימות אוטומטי. הם <strong>אינם ממצא של אי-עמידה</strong> —
            הם דורשים בדיקה אנושית. הם מפורטים בהמשך.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="findings-heading">
        <h2 id="findings-heading">מה לתקן</h2>
        {findings.length === 0 ? (
          <p>לא נמצאו ליקויים הניתנים לאיתור אוטומטי בעמודים שנסרקו.</p>
        ) : (
          <>
            <p className="field-hint">
              מסודר מהרחב לצר: קריטריון שנכשל בכל העמודים הוא כמעט תמיד רכיב אחד משותף, ותיקון אחד מנקה את
              כולם.
            </p>
            <ol className="findings">
              {findings.map((f) => {
                const isOpen = open === f.itemId;
                return (
                  <li key={f.itemId} className="finding">
                    <h3>
                      <button
                        type="button"
                        className="finding-toggle"
                        aria-expanded={isOpen}
                        aria-controls={`detail-${f.itemId}`}
                        onClick={() => setOpen(isOpen ? null : f.itemId)}
                      >
                        <span className="finding-no" dir="ltr">
                          {f.criterionNo}
                        </span>
                        <span className="finding-name">{f.nameHe}</span>
                      </button>
                    </h3>

                    <p className="finding-meta">
                      <span>
                        {f.pageCount} מתוך {f.totalPages} עמודים
                      </span>
                      <span>{EFFORT_HE[f.effort]}</span>
                      <span>רמה {f.level}</span>
                      <span>{f.part}</span>
                      {f.confidence < 0.75 ? <span>ודאות נמוכה — כדאי לאמת ידנית</span> : null}
                    </p>

                    <div id={`detail-${f.itemId}`} hidden={!isOpen} className="finding-detail">
                      <h4>מה צריך להשתנות</h4>
                      <p>{f.goalHe}</p>

                      <h4>איפה זה קורה</h4>
                      <ul className="occurrences">
                        {f.occurrences.map((o, i) => (
                          <li key={`${o.url}-${o.locator}-${i}`}>
                            <code dir="ltr">{o.locator}</code>
                            <span> — {o.reasonHe}</span>
                            <br />
                            <a href={o.url} dir="ltr" rel="noreferrer">
                              {o.url}
                            </a>
                            {/*
                              Said once, with a count, rather than repeated per
                              page: the same selector on sixteen pages is one
                              shared component and one fix.
                            */}
                            {o.pageCount && o.pageCount > 1 ? (
                              <span className="field-hint"> ועוד {o.pageCount - 1} עמודים באותו מיקום</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      <h4>איך לתקן</h4>
                      <pre className="instruction" dir="ltr">
                        {f.instruction}
                      </pre>

                      {f.hebrewStrings && Object.keys(f.hebrewStrings).length > 0 ? (
                        <>
                          <h4>מחרוזות עברית מוכנות</h4>
                          <ul>
                            {Object.entries(f.hebrewStrings).map(([k, v]) => (
                              <li key={k}>
                                <code dir="ltr">{k}</code>: {v === '' ? '(ריק)' : v}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      {unverified.length > 0 ? (
        <section aria-labelledby="unverified-heading">
          <h2 id="unverified-heading">דורש בדיקה ידנית</h2>
          <p className="field-hint">
            הבדיקה האוטומטית לא הצליחה להכריע בקריטריונים האלה. <strong>הם אינם מדווחים כתקינים</strong>, וגם
            אינם ממצא — הם ממתינים לבדיקה אנושית, כגון הרצת קורא מסך או שיפוט על איכות כתוביות.
          </p>
          <ul className="plain-list">
            {unverified.map((u) => (
              <li key={u.itemId}>
                <strong dir="ltr">{u.criterionNo}</strong> {u.nameHe}
                {u.noteHe ? <div className="field-hint">{u.noteHe}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="na-heading">
        <h2 id="na-heading">לא רלוונטי לאתר הזה</h2>
        <p className="field-hint">
          {notApplicable.length} קריטריונים אינם חלים — הנושא שהם מסדירים נעדר מהאתר, או שהתקן או התקנות
          פוטרים אותו. הם מוצגים כדי שהדוח יהיה שלם, ולא כדי שתעשו איתם משהו.
        </p>
        <button type="button" className="button secondary" aria-expanded={showNa} onClick={() => setShowNa(!showNa)}>
          {showNa ? 'הסתרה' : `הצגת ${notApplicable.length} הקריטריונים`}
        </button>
        <ul className="plain-list" hidden={!showNa}>
          {notApplicable.map((n) => (
            <li key={n.criterionNo + n.nameHe}>
              <strong dir="ltr">{n.criterionNo}</strong> {n.nameHe}
              {n.noteHe ? <div className="field-hint">{n.noteHe}</div> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="provenance-heading">
        <h2 id="provenance-heading">על הסריקה הזו</h2>
        <ul className="plain-list">
          <li>
            אתר: <span dir="ltr">{report.site.startUrl}</span>
          </li>
          <li>
            נסרק: {stats.pagesScanned} עמודים, {stats.documentsScanned} מסמכים
          </li>
          {report.catalogue ? (
            <li>
              גרסת קטלוג: <span dir="ltr">{report.catalogue.version}</span> — הדוח נבדק מול גרסה זו של התקן,
              והשוואה לסריקה עתידית תקפה רק מול אותה גרסה.
            </li>
          ) : null}
          {stats.skipped.length > 0 ? (
            <li>
              {stats.skipped.length} כתובות לא נסרקו. הן אינן חלק מהדוח, ולכן הדוח אינו מתאר אותן.
            </li>
          ) : null}
        </ul>
      </section>
    </>
  );
}
