# The accessibility statement (הצהרת נגישות)

A published accessibility statement is a **legal requirement**, separate from
technical conformance. A site can pass every criterion in the check sheet and
still be non-compliant without one.

It is also the single most common finding in a real Israeli audit — usually not
because it is missing, but because it omits the known-limitations section or the
audit date.

## The seven required items

| # | Item | Common failure |
|---|---|---|
| 1 | The conformance level the site targets, and the standard | Naming WCAG without naming IS 5568, or claiming a level not actually met |
| 2 | The accessibility measures actually implemented | Generic boilerplate copied from another site |
| 3 | **Known accessibility limitations**, with an expected fix date | Omitted entirely — the most frequent finding |
| 4 | Name of the accessibility coordinator (רכז נגישות) | Missing, or "the accessibility team" with no name |
| 5 | Phone number for accessibility enquiries | — |
| 6 | Email address for accessibility enquiries | — |
| 7 | Date of the last accessibility audit **and** date the statement was updated | Only one of the two, or neither |

If there are genuinely no known limitations, **say so explicitly**. An empty
section reads as an omission, and an auditor cannot tell the difference.

## Where it goes

- Linked from **every page**, conventionally in the footer.
- Reachable in one click, not buried in a menu.
- The statement page itself must be accessible — it is audited like any other.

## Who needs a coordinator

The Regulations require a service provider that is a **public body**, or that
employs **25 or more people**, to appoint an accessibility coordinator. Smaller
operators still need a contact route for accessibility enquiries; they do not
need a formally appointed coordinator.

Note this 25-employee threshold is the trigger for the *coordinator*, not for
the website-accessibility duty itself — that one is universal, subject to the
revenue-based exemptions (see the `israeli-accessibility-compliance` skill).

## Template

Replace every bracketed value. Do not ship it with placeholders — a statement
containing `[שם]` is worse than none, because it demonstrates the duty was
treated as a formality.

```html
<article lang="he" dir="rtl">
  <h1>הצהרת נגישות</h1>

  <p>
    ב־[שם הארגון] אנו רואים חשיבות רבה במתן שירות שוויוני לכלל הציבור, ופועלים
    להנגשת האתר לאנשים עם מוגבלות בהתאם לתקן הישראלי ת"י 5568, המבוסס על
    הנחיות <span lang="en" dir="ltr">WCAG 2.0</span> ברמה AA, ובהתאם לתקנות
    שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013.
  </p>

  <h2>רמת הנגישות באתר</h2>
  <p>האתר הונגש לרמה AA של תקן ת"י 5568 חלק 1.</p>

  <h2>אמצעי הנגישות שבוצעו באתר</h2>
  <ul>
    <li>ניווט מלא באמצעות מקלדת בכל חלקי האתר</li>
    <li>תמיכה בקוראי מסך (NVDA, JAWS, VoiceOver)</li>
    <li>מבנה כותרות היררכי המאפשר ניווט מהיר בתוכן</li>
    <li>טקסט חלופי לכל התמונות הנושאות מידע</li>
    <li>יחס ניגודיות של 4.5:1 לפחות בטקסט רגיל</li>
    <li>אפשרות להגדלת הטקסט ל-200% ללא פגיעה בתוכן</li>
    <li>רכיב העדפות נגישות המאפשר שינוי ניגודיות, גודל טקסט ומרווח שורות</li>
    <li>[הוסיפו או הסירו לפי מה שבוצע בפועל]</li>
  </ul>

  <h2>מגבלות נגישות ידועות</h2>
  <ul>
    <li>
      [פרטו כל רכיב, עמוד או מסמך שטרם הונגש במלואו, ואת מועד התיקון הצפוי.
      לדוגמה: "מסמכי PDF שפורסמו לפני ינואר 2024 טרם הונגשו. הנגשתם צפויה
      להסתיים עד 30 ביוני 2026."]
    </li>
    <li>[אם אין מגבלות ידועות — כתבו זאת במפורש: "לא ידועות לנו מגבלות נגישות באתר."]</li>
  </ul>

  <h2>פנייה בנושא נגישות</h2>
  <p>
    נתקלתם בבעיית נגישות באתר? נשמח לשמוע. פנייתכם תטופל בהקדם על ידי רכז
    הנגישות שלנו.
  </p>
  <dl>
    <dt>רכז/ת נגישות</dt>
    <dd>[שם מלא]</dd>
    <dt>טלפון</dt>
    <dd><a href="tel:+97231234567" dir="ltr">03-1234567</a></dd>
    <dt>דואר אלקטרוני</dt>
    <dd><a href="mailto:negishut@example.co.il" dir="ltr">negishut@example.co.il</a></dd>
  </dl>

  <h2>תאריכים</h2>
  <dl>
    <dt>תאריך ביקורת הנגישות האחרונה</dt>
    <dd><time datetime="2026-07-29">29 ביולי 2026</time></dd>
    <dt>תאריך עדכון ההצהרה</dt>
    <dd><time datetime="2026-07-29">29 ביולי 2026</time></dd>
  </dl>
</article>
```

## What not to write

- **Do not claim a conformance level you have not verified.** The statement is
  evidence, and an inaccurate one is worse than a modest accurate one.
- **Do not credit an overlay widget** for the site's accessibility, and do not
  display a vendor "certified accessible" badge. Conformance is assessed against
  the rendered HTML.
- **Do not omit known limitations** to make the statement look better. Disclosing
  a limitation with a fix date is the compliant posture; concealing it is not.
- **Do not let the audit date go stale.** A statement dated four years ago
  invites the conclusion that nothing has been checked since.

## The 60-day cure period

A deviation only becomes an actionable violation if the operator received a fix
notice and failed to act within a reasonable time, no later than 60 days. The
statement is where that notice will arrive — route accessibility enquiries to
someone who will actually see and act on them.

See the `israeli-accessibility-compliance` skill for the enforcement framework.
