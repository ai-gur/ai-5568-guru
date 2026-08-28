'use client';

import { FormEvent, useRef, useState, useTransition } from 'react';

type Tone = 'idle' | 'success' | 'error';

export function ReviewConsole() {
  const [url, setUrl] = useState('');
  const [tone, setTone] = useState<Tone>('idle');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      setTone('error');
      setMessage('הזינו כתובת אתר לסריקה.');
      setNotice('');
      // 3.3.1 — an error message nobody reaches is not an error message.
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setTone('idle');
    setMessage('');
    setNotice('');

    startTransition(async () => {
      try {
        const response = await fetch('/api/v1/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, maxPages: 50 }),
        });
        const payload = (await response.json()) as {
          id?: string;
          error?: string;
          notice?: string;
          maxPages?: number;
        };
        if (!response.ok) throw new Error(payload.error ?? 'לא ניתן להכניס את הסריקה לתור.');

        setTone('success');
        setMessage(`הסריקה נכנסה לתור. מזהה: ${payload.id}`);
        // Surfaced separately from the success message, and never merged into
        // it: "queued, and by the way it covers five pages of your site" is a
        // sentence a reader skims past. This is the fact they most need.
        if (payload.notice) setNotice(payload.notice);
      } catch (error) {
        setTone('error');
        setMessage(error instanceof Error ? error.message : 'אירעה שגיאה בלתי צפויה.');
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className="field-label" htmlFor="review-url">
        כתובת האתר לסריקה
      </label>
      <input
        className="url-input"
        id="review-url"
        name="url"
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://example.co.il"
        ref={inputRef}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        aria-invalid={tone === 'error'}
        aria-describedby="review-url-hint review-status"
        spellCheck={false}
        dir="ltr"
        required
      />
      <p className="field-hint" id="review-url-hint">
        סריקה מצומצמת פתוחה לכל כתובת ציבורית. סריקה מלאה תיפתח לאחר אימות בעלות על הדומיין.
      </p>

      <div className="action-row">
        <button className="button" type="submit" disabled={isPending}>
          {isPending ? 'מכניסים לתור…' : 'התחלת סריקה'}
        </button>
        <a className="button secondary" href="/reviews/demo">
          דוח לדוגמה
        </a>
      </div>

      {/*
        role="status" and aria-live="polite" so the outcome is announced without
        interrupting. The container is always present — a live region added to
        the DOM at the moment it gains content is frequently not announced.
      */}
      <p className={tone === 'error' ? 'error' : 'status-message'} id="review-status" role="status" aria-live="polite">
        {message || 'הסריקה עוברת על עמודים, ניווט מקלדת ומסמכים מקושרים.'}
      </p>

      {notice ? <p className="notice">{notice}</p> : null}
    </form>
  );
}
