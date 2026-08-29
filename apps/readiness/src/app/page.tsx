import type { Metadata } from 'next';
import { ReviewConsole } from '@/components/review-console';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'סריקה' };

/*
 * Laid out on the AI Guru editorial system: a 12-column hero, then tonal
 * section fields alternating paper and cream. Not a stack of bordered panels —
 * the No Card Field Rule in DESIGN.md is explicit that editorial content does
 * not become a grid of rounded cards, and that is exactly what this page was.
 *
 * The earlier version also carried a dashboard of invented figures — "12 sites
 * managed", "146 open findings". On a tool whose entire premise is not
 * overstating what it knows, fabricated numbers are the wrong thing in the most
 * embarrassing possible place. What replaces them is what the product actually
 * does and what it deliberately does not.
 */

export default function Home() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <section className="page-hero section-shell" aria-labelledby="page-title">
          <div className="page-hero__intro">
            <h1 id="page-title">סקירת מוכנות לת&quot;י 5568</h1>
            {/* The annotation face, in the position the system puts it: one
                short human note in copper, under the headline and above the
                lead — not a kicker above the title. */}
            <p className="page-hero__descriptor">לפני שבודק מוסמך מגיע</p>
            <p className="page-hero__lead">
              הסריקה עוברת על עמודי האתר והמסמכים המקושרים, בודקת אותם מול 60 שורות טופס הבדיקה של הנציבות,
              ומחזירה לכל ממצא את הרכיב המדויק ואת דרך התיקון.
            </p>
            <p className="notice">
              <strong>זו אינה בדיקת אודיט.</strong> אודיט הוא מעשה של גוף מוסמך. הסקירה מזהה ליקויים ומסבירה
              כיצד לתקנם — היא אינה קובעת עמידה בתקן ואינה תחליף לבודק נגישות מוסמך. חלק מהקריטריונים דורשים
              בדיקה אנושית שאף כלי אינו יכול להחליף.
            </p>
          </div>
        </section>

        <section className="editorial-section editorial-section--cream" aria-labelledby="new-review">
          <div className="section-shell">
            <div className="section-heading">
              <h2 id="new-review">סריקה חדשה</h2>
            </div>
            <ReviewConsole />
          </div>
        </section>

        <section className="editorial-section editorial-section--paper" aria-labelledby="how-title">
          <div className="section-shell">
            <div className="section-heading">
              <h2 id="how-title">איך זה עובד</h2>
              <p className="section-lead">
                שלושה כללים שהמנוע אוכף על עצמו, ולא הבטחות שיווקיות.
              </p>
            </div>

            <div className="feature-grid">
              <div className="feature">
                <h3>ראיה לכל ממצא</h3>
                <p>
                  כל ממצא מצביע על אלמנט, selector או מיקום במסמך. ממצא בלי מיקום אינו ניתן לתיקון, ולכן
                  אינו מדווח כממצא.
                </p>
              </div>

              <div className="feature">
                <h3>מה שלא נבדק נאמר במפורש</h3>
                <p>
                  קריטריון שהבדיקה שלו לא הצליחה לרוץ מסומן ככזה — לעולם לא כתקין. דוח שמדווח
                  &quot;עומד&quot; על משהו שלא נבדק הוא מצב הכשל היחיד עם השלכות אמיתיות.
                </p>
              </div>

              <div className="feature">
                <h3>מה שלא חל עליכם לא נספר</h3>
                <p>
                  תקנה 35ו פוטרת לפי מחזור, ותקנה 35ד תוחמת את חובת הווידאו. הסריקה מתחשבת בנתונים שתמסרו —
                  ובהיעדרם מניחה שהחובה חלה, ולא להפך.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </ProductShell>
  );
}
