import type { Metadata } from 'next';
import { ProductShell } from '@/components/product-shell';
import { sendSignInLink } from './actions';

export const metadata: Metadata = { title: 'כניסה' };

/**
 * Sign-in by emailed link. No password field, deliberately: a password is a
 * credential we would have to take responsibility for — resets, strength rules,
 * breach handling — for a product whose value is a scan report.
 *
 * A server component with a server action, so it works with no JavaScript and
 * the address is never placed in a URL. See actions.ts for why that matters.
 */

const MESSAGES = {
  sent: 'אם הכתובת תקינה, נשלח אליה קישור כניסה. הקישור תקף לזמן מוגבל.',
  invalid: 'הזינו כתובת דוא"ל תקינה.',
  disabled: 'הכניסה מושבתת זמנית עד להשלמת הגדרת שרת הדואר. סריקה מצומצמת פועלת ואינה דורשת חשבון.',
} as const;

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; error?: string }>;
}) {
  const params = await searchParams;
  const state =
    params.state === 'sent'
      ? 'sent'
      : params.state === 'invalid'
        ? 'invalid'
        : params.state === 'disabled'
          ? 'disabled'
          : null;

  const linkError =
    params.error === 'invalid-link'
      ? 'הקישור אינו תקף או שכבר נעשה בו שימוש. בקשו קישור חדש.'
      : params.error === 'missing-code'
        ? 'הקישור חסר. בקשו קישור חדש.'
        : null;

  const isError = state === 'invalid' || linkError !== null;
  const isDisabled = state === 'disabled';

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

          {/*
            method="post" via the server action. A GET form would put the
            address in the query string the moment anyone submits it — which is
            how it ends up in history, in Referer headers, and in access logs.
          */}
          <form action={sendSignInLink}>
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
              aria-invalid={isError}
              aria-describedby="signin-status"
              required
            />
            <div className="action-row">
              <button className="button" type="submit">
                שליחת קישור
              </button>
            </div>
          </form>

          {/*
            Rendered on the server after the redirect, so the outcome is in the
            document rather than announced into a live region that a screen
            reader may or may not have been watching.
          */}
          <p className={isError ? 'error' : isDisabled ? 'notice' : 'status-message'} id="signin-status" role="status">
            {linkError ?? (state ? MESSAGES[state] : 'לא נדרשת סיסמה.')}
          </p>
        </section>
      </main>
    </ProductShell>
  );
}
