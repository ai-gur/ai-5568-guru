'use client';

import { FormEvent, useRef, useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ProductShell } from '@/components/product-shell';

/**
 * Sign-in by emailed link.
 *
 * No password field, deliberately. A password is a credential we would have to
 * take responsibility for — reset flows, strength rules, breach handling — for
 * a product whose whole value is a scan report. The link does the same job with
 * nothing to leak.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [tone, setTone] = useState<'idle' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setTone('error');
      setMessage('הזינו כתובת דוא"ל.');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    startTransition(async () => {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) {
        setTone('error');
        setMessage('לא הצלחנו לשלוח את הקישור. נסו שוב בעוד רגע.');
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // The same message whether or not the address has an account. Saying
      // "no such user" would turn this form into a way to test which addresses
      // are registered here.
      setTone('sent');
      setMessage('אם הכתובת תקינה, נשלח אליה קישור כניסה. הקישור תקף לזמן מוגבל.');
    });
  }

  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <h1>כניסה</h1>
        <p>
          כניסה נדרשת כדי לאמת בעלות על דומיין ולהריץ סריקה מלאה. סריקה מצומצמת פתוחה לכל כתובת ציבורית
          ואינה דורשת חשבון.
        </p>

        <section className="panel" aria-labelledby="signin-heading">
          <h2 id="signin-heading">קישור כניסה בדוא&quot;ל</h2>
          <form onSubmit={submit} noValidate>
            <label className="field-label" htmlFor="email">
              כתובת דוא&quot;ל
            </label>
            <input
              className="url-input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              ref={inputRef}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={tone === 'error'}
              aria-describedby="signin-status"
              required
            />
            <div className="action-row">
              <button className="button" type="submit" disabled={isPending || tone === 'sent'}>
                {isPending ? 'שולחים…' : 'שליחת קישור'}
              </button>
            </div>
            <p
              className={tone === 'error' ? 'error' : 'status-message'}
              id="signin-status"
              role="status"
              aria-live="polite"
            >
              {message || 'לא נדרשת סיסמה.'}
            </p>
          </form>
        </section>
      </main>
    </ProductShell>
  );
}
