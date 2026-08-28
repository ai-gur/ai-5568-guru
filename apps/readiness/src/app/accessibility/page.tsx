import type { Metadata } from 'next';
import { ProductShell } from '@/components/product-shell';

export const metadata: Metadata = { title: 'הצהרת נגישות' };

/*
 * Regulation 35ה requires this page, and names what it must contain: the
 * adaptations made, the accessibility coordinator's contact details where one
 * must be appointed, and a way to report a missing adaptation or request one.
 *
 * It is also the page that decides whether anyone takes this product seriously.
 * A tool that reviews other people's accessibility statements and publishes a
 * thin one of its own has answered the question about itself. So it names its
 * own known limitations rather than claiming there are none — which is exactly
 * what IL01 checks for on every site we scan.
 *
 * ⚠️ The coordinator details below are placeholders and must be filled in
 * before this goes public. An accessibility statement with a fake contact is
 * worse than no statement: it promises a channel that does not answer.
 */

export default function AccessibilityStatement() {
  return (
    <ProductShell>
      <main className="page" id="main" tabIndex={-1}>
        <h1>הצהרת נגישות</h1>

        <p>
          אתר זה נבנה כך שיעמוד בדרישות ת&quot;י 5568 חלק 1 ברמה AA, בהתאם לתקנות שוויון זכויות לאנשים עם
          מוגבלות (התאמות נגישות לשירות), התשע&quot;ג-2013.
        </p>

        <h2>רמת הנגישות שאליה מכוון האתר</h2>
        <p>רמה AA לפי ת&quot;י 5568 חלק 1 (ספטמבר 2023), המאמץ את WCAG 2.0 עם שינויים לאומיים.</p>

        <h2>התאמות הנגישות שבוצעו</h2>
        <ul>
          <li>מבנה סמנטי, כותרות היררכיות ואזורי דף מסומנים.</li>
          <li>ניווט מלא במקלדת, עם קישור דילוג לתוכן וסימון פוקוס ברור בכל רכיב.</li>
          <li>הכרזת שפה ו-RTL, וסימון קטעים בכיוון הפוך (כגון כתובות אתרים) כדי שלא יתערבבו.</li>
          <li>ניגודיות צבעים העומדת בדרישות, ואי-הסתמכות על צבע כאמצעי מסירת מידע יחיד.</li>
          <li>רכיב העדפות תצוגה — ניגודיות מוגברת, הגדלת טקסט והגדלת ריווח — הנשמר בין עמודים.</li>
          <li>כיבוד העדפת המערכת להפחתת אנימציות.</li>
          <li>הודעות שגיאה מזוהות בטקסט ולא בצבע בלבד, ומוכרזות לטכנולוגיה מסייעת.</li>
        </ul>

        <h2>מגבלות נגישות ידועות</h2>
        <p>
          אנו מציינים אותן במפורש, ולא טוענים שאין כאלה. דוחות שהמערכת מפיקה עשויים לכלול צילומי מסך של
          אתרים חיצוניים שאין לנו שליטה על נגישותם. במקרה שבו תוכן כזה חוסם מכם מידע — פנו אלינו ונספק אותו
          בדרך חלופית.
        </p>

        <h2>רכז הנגישות</h2>
        <p>
          {/* TODO — must be real before launch. */}
          שם: <span data-placeholder>[להשלמה]</span>
          <br />
          דוא&quot;ל: <span dir="ltr">ai@aiguru.co.il</span>
          <br />
          טלפון: <span data-placeholder>[להשלמה]</span>
        </p>

        <h2>דיווח על בעיית נגישות</h2>
        <p>
          נתקלתם ברכיב שאינו נגיש, או שאתם זקוקים להתאמה שאינה קיימת? כתבו לנו לכתובת שלמעלה ונטפל בפנייה.
          תיאור העמוד והפעולה שניסיתם לבצע יעזור לנו לאתר את הבעיה מהר יותר.
        </p>

        <h2>תאריכים</h2>
        <p>
          תאריך בדיקת הנגישות האחרונה: <time dateTime="2026-08-28">28 באוגוסט 2026</time>
          <br />
          תאריך עדכון ההצהרה: <time dateTime="2026-08-28">28 באוגוסט 2026</time>
        </p>
      </main>
    </ProductShell>
  );
}
