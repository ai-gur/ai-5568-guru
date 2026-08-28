import type { Metadata } from 'next';
import { ReviewConsole } from '@/components/review-console';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'סריקה' };

/*
 * The earlier version of this page carried a dashboard of invented figures —
 * "12 sites managed", "146 open findings". It was a mockup, and it read as one
 * once the product became real. On a tool whose entire premise is not
 * overstating what it knows, fabricated numbers are the wrong thing in the most
 * embarrassing possible place. What replaces them is what the product actually
 * does and what it deliberately does not.
 */

export default function Home() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <section aria-labelledby="page-title">
          <h1 id="page-title">סקירת מוכנות לת&quot;י 5568.</h1>
          <p>
            הסריקה עוברת על עמודי האתר והמסמכים המקושרים, בודקת אותם מול 60 שורות טופס הבדיקה של הנציבות,
            ומחזירה לכל ממצא את הרכיב המדויק ואת דרך התיקון.
          </p>

          <p className="notice">
            <strong>זו אינה בדיקת אודיט.</strong> אודיט הוא מעשה של גוף מוסמך. הסקירה מזהה ליקויים ומסבירה
            כיצד לתקנם — היא אינה קובעת עמידה בתקן ואינה תחליף לבודק נגישות מוסמך. חלק מהקריטריונים דורשים
            בדיקה אנושית שאף כלי אינו יכול להחליף.
          </p>
        </section>

        <section className="panel" aria-labelledby="new-review">
          <h2 id="new-review">סריקה חדשה</h2>
          <ReviewConsole />
        </section>

        <section aria-labelledby="how-title">
          <h2 id="how-title">איך זה עובד</h2>
          <div>
            <h3>ראיה לכל ממצא</h3>
            <p>
              כל ממצא מצביע על אלמנט, selector או מיקום במסמך. ממצא בלי מיקום אינו ניתן לתיקון, ולכן אינו
              מדווח כממצא.
            </p>

            <h3>מה שלא נבדק נאמר במפורש</h3>
            <p>
              קריטריון שהבדיקה שלו לא הצליחה לרוץ מסומן ככזה — לעולם לא כתקין. דוח שמדווח &quot;עומד&quot; על
              משהו שלא נבדק הוא מצב הכשל היחיד עם השלכות אמיתיות.
            </p>

            <h3>מה שלא חל עליכם לא נספר</h3>
            <p>
              תקנה 35ו פוטרת לפי מחזור, ותקנה 35ד תוחמת את חובת הווידאו. הסריקה מתחשבת בנתונים שתמסרו —
              ובהיעדרם מניחה שהחובה חלה, ולא להפך.
            </p>
          </div>
        </section>
      </main>
    </ProductShell>
  );
}
