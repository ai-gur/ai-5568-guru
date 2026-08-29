'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHero } from '@/components/page-components';
import { ProductShell } from '@/components/product-shell';

interface Domain {
  id: string;
  domain: string;
  verified_at: string | null;
  method: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  token: string;
}

export default function Domains() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/v1/domains');
    if (response.status === 401) {
      setDomains([]);
      setError('נדרשת כניסה כדי לנהל דומיינים.');
      return;
    }
    const payload = (await response.json()) as { domains?: Domain[]; error?: string };
    if (payload.error) setError(payload.error);
    setDomains(payload.domains ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/v1/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: input }),
    });
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      setError(payload.error);
      return;
    }
    setInput('');
    await load();
  }

  async function verify(domain: string) {
    setBusy(domain);
    setError('');
    const response = await fetch('/api/v1/domains/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });
    const payload = (await response.json()) as { verified?: boolean; detailHe?: string };
    if (!payload.verified && payload.detailHe) setError(payload.detailHe);
    setBusy(null);
    await load();
  }

  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <PageHero title="דומיינים" descriptor="הוכחת בעלות לפני סריקה מלאה" />
        <p>
          סריקה מצומצמת פתוחה לכל כתובת ציבורית. סריקה מלאה — שעוברת על מאות עמודים ומורידה כל מסמך מקושר —
          דורשת הוכחה שהדומיין בשליטתכם. זה מגן גם עליכם וגם על בעלי אתרים אחרים.
        </p>

        <section className="panel" aria-labelledby="add-domain">
          <h2 id="add-domain">הוספת דומיין</h2>
          <form onSubmit={add} noValidate>
            <label className="field-label" htmlFor="domain">
              שם הדומיין
            </label>
            <input
              className="url-input"
              id="domain"
              name="domain"
              dir="ltr"
              placeholder="example.co.il"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-describedby="domains-status"
              required
            />
            <div className="action-row">
              <button className="button" type="submit">
                הוספה
              </button>
            </div>
          </form>
          <p className={error ? 'error' : 'status-message'} id="domains-status" role="status" aria-live="polite">
            {error || 'לאחר ההוספה יוצג הערך שיש לפרסם.'}
          </p>
        </section>

        <section aria-labelledby="list-heading">
          <h2 id="list-heading">הדומיינים שלכם</h2>

          {domains === null ? (
            <p role="status">טוען…</p>
          ) : domains.length === 0 ? (
            <p>עדיין לא הוספתם דומיין.</p>
          ) : (
            <ul>
              {domains.map((item) => (
                <li key={item.id}>
                  <h3 dir="ltr">{item.domain}</h3>
                  <p>
                    {item.verified_at ? (
                      <>
                        ✓ מאומת
                        {item.method === 'dns_txt' ? ' באמצעות רשומת DNS TXT' : ' באמצעות קובץ בשורש האתר'}
                      </>
                    ) : (
                      'טרם אומת — סריקות יוגבלו לחמישה עמודים.'
                    )}
                  </p>

                  {!item.verified_at ? (
                    <>
                      <p>פרסמו את הערך הזה, ואז לחצו על אימות:</p>
                      {/*
                        A token is meant to be copied exactly. Presented as code,
                        LTR, so bidi cannot reorder it inside a Hebrew paragraph
                        and hand someone a value that looks right and is not.
                      */}
                      <p>
                        <code dir="ltr">{item.token}</code>
                      </p>
                      <p className="field-hint">
                        כרשומת DNS מסוג TXT על {item.domain}, או כקובץ בכתובת{' '}
                        <span dir="ltr">https://{item.domain}/.well-known/ai5568-verify.txt</span>
                      </p>
                      {item.last_error ? <p className="error">{item.last_error}</p> : null}
                      <div className="action-row">
                        <button
                          className="button"
                          type="button"
                          onClick={() => void verify(item.domain)}
                          disabled={busy === item.domain}
                        >
                          {busy === item.domain ? 'בודקים…' : 'אימות'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </ProductShell>
  );
}
