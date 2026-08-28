/**
 * Engine metadata for every row of the official check sheet.
 *
 * Keyed by source row (`R04`…`R45`) so that re-running the importer refreshes
 * the Hebrew text from the sheet without touching any of this.
 *
 * `summaryHe` is the two-sentence rendition that goes in the report's
 * `תאור הקריטריון` column. It is hand-written rather than machine-truncated:
 * the sheet's descriptions are lettered lists (א/ב/ג/ד), and cutting one at the
 * second full stop would silently drop half of what the row checks.
 *
 * Rule-id note: axe rule ids are validated against the loaded axe-core build at
 * startup (see engine/src/checks/axe-map.ts). A rule that disappears in an axe
 * upgrade raises a loud error rather than silently making a row unfailable.
 */

import type { EngineSpec } from './schema.ts';

export const ENGINE_OVERRIDES: Record<string, EngineSpec> = {
  // ── הנחיה 1.1 חלופה טקסטואלית ───────────────────────────────────────────
  R04: {
    part: 1,
    summaryHe:
      'לכל תמונה נדרש טקסט חלופי המתאר את מהותה, ולתמונה המשמשת כקישור — טקסט המגדיר את מטרת הקישור. תמונות דקורטיביות יסומנו ב-alt ריק או יוצגו כרקע ב-CSS, ולתמונות מורכבות תסופק חלופה שוות ערך.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['image-alt', 'input-image-alt', 'area-alt', 'role-img-alt', 'svg-img-alt', 'object-alt', 'server-side-image-map'],
    customRules: ['hebrew-alt-text'],
    applicability: 'hasImages',
    evidenceSlice: 'images',
    rubricHe:
      'בדוק כל תמונה: (1) האם קיים alt; (2) האם ה-alt מתאר בפועל את המידע שהתמונה מעבירה, ולא שם קובץ, "תמונה", מחרוזת ריקה בתמונה אינפורמטיבית, או תיאור גנרי; (3) בתמונה שהיא קישור — האם ה-alt מתאר את יעד/מטרת הקישור ולא את מראה התמונה; (4) בתמונה דקורטיבית — האם alt ריק (alt=""), ולא תיאור מיותר. תמונה אינפורמטיבית עם alt ריק היא כשל. alt שהוא שם קובץ הוא כשל.',
    remediation: {
      goalHe: 'לכל תמונה טקסט חלופי שמעביר את אותו מידע שהתמונה מעבירה, בעברית.',
      instruction:
        'Add a Hebrew `alt` to every content image describing the information it carries, not its appearance. For an image inside a link, describe the link destination. For a purely decorative image use `alt=""` (and `role="presentation"` where the element is not an `<img>`), or move it to a CSS background. For a chart or diagram, add `alt` with the headline finding plus a longer description adjacent in the page or behind a visible link.',
      hebrewStrings: {
        decorative: '',
        logoPattern: 'לוגו {{שם החברה}}',
        chartPattern: 'תרשים {{נושא}} — {{הממצא המרכזי}}. תיאור מלא בהמשך העמוד.',
      },
      effort: 'low',
    },
  },

  R05: {
    part: 1,
    summaryHe: 'מולטימדיה משובצת (embedded) מזוהה באמצעות טקסט חלופי.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['object-alt', 'frame-title'],
    customRules: ['embedded-media-name'],
    applicability: 'hasEmbeddedMedia',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל רכיב מולטימדיה משובץ (object, embed, iframe של נגן, video, audio): האם קיים שם נגיש (title, aria-label, alt) שמזהה מה הרכיב מכיל? שם ריק, "video", או כתובת URL אינם מזהים את התוכן ולכן הם כשל.',
    remediation: {
      goalHe: 'לכל רכיב מדיה משובץ שם נגיש שמזהה את תוכנו.',
      instruction:
        'Give every embedded media element an accessible name in Hebrew that says what it contains: `title` on `<iframe>`, `aria-label` on `<video>`/`<audio>`, fallback content inside `<object>`. The name must identify the specific content ("הרצאה על זכויות עובדים"), not the medium ("וידאו").',
      effort: 'low',
    },
  },

  R06: {
    part: 1,
    summaryHe:
      'למדיה מבוססת-זמן, למבחן שחלופה מלאה תפגע באפקטיביותו ולתוכן המהווה חוויה חושית — נדרשת חלופה טקסטואלית. החלופה תזהה את התוכן ותתאר אותו לכל הפחות.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasTimeBasedMedia',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל פריט מדיה מבוססת-זמן, מבחן או חוויה חושית: האם קיים בדף טקסט נגיש שמזהה את הפריט ומתאר את תוכנו? נוכחות של כותרת בלבד ליד נגן אינה מספיקה אם היא אינה מתארת את התוכן.',
    remediation: {
      goalHe: 'לכל מדיה מבוססת-זמן חלופה טקסטואלית שמזהה ומתארת את התוכן.',
      instruction:
        'Add a text alternative adjacent to each time-based media item that identifies and describes it. This is the descriptive-identification requirement, separate from captions (row 1.2.2) and transcripts (row 1.2.1).',
      effort: 'medium',
    },
  },

  R07: {
    part: 1,
    summaryHe:
      'ל-CAPTCHA נדרשת חלופה טקסטואלית שמזהה ומתארת את תכליתו. בנוסף נדרשות צורות חלופיות המכוונות לחושים אחרים ומתאימות למוגבלויות שונות.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: ['captcha-detect'],
    applicability: 'hasCaptcha',
    evidenceSlice: 'forms',
    rubricHe:
      'אם קיים CAPTCHA: האם יש טקסט חלופי המסביר את תכליתו, והאם קיימת לפחות חלופה אחת המכוונת לחוש אחר (אודיו מול חזותי)? CAPTCHA חזותי בלבד הוא כשל.',
    remediation: {
      goalHe: 'ל-CAPTCHA תיאור טקסטואלי וחלופה בחוש אחר.',
      instruction:
        'Provide a text alternative describing the CAPTCHA\'s purpose, plus at least one alternative form targeting a different sense (audio alternative to a visual challenge). Prefer replacing the CAPTCHA with a non-interactive method (honeypot, token-based, risk scoring), which removes the barrier instead of working around it.',
      effort: 'high',
    },
  },

  // ── הנחיה 1.2 מדיה מבוססת-זמן ────────────────────────────────────────────
  R08: {
    part: 1,
    summaryHe:
      'לאודיו בלבד המוקלט מראש נדרש תסריט טקסטואלי המכיל את כל המידע האודיטורי הרלוונטי להבנת התוכן. התסריט יסופק במועד מוקדם ככל האפשר.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasAudioOnly',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל רכיב אודיו-בלבד מוקלט מראש: האם קיים בדף תמלול טקסטואלי נגיש, או קישור מפורש אליו? קישור שכותרתו אינה מבהירה שמדובר בתמלול אינו מספיק.',
    remediation: {
      goalHe: 'לכל אודיו מוקלט תמלול טקסטואלי מלא בעמוד או בקישור מסומן.',
      instruction:
        'Publish a full Hebrew transcript for every prerecorded audio-only item, either inline (collapsible region) or behind a link whose text says it is a transcript ("תמלול ההקלטה").',
      hebrewStrings: { transcriptLink: 'תמלול ההקלטה', transcriptHeading: 'תמלול' },
      effort: 'medium',
    },
  },

  R09: {
    part: 1,
    summaryHe:
      'לווידאו בלבד המוקלט מראש נדרש תסריט טקסטואלי או ערוץ אודיו המתאר את הערוץ הוויזואלי. יסופק במועד מוקדם ככל האפשר.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasVideoOnly',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל וידאו ללא פס-קול: האם קיים תיאור טקסטואלי של המתרחש, או ערוץ אודיו מתאר? היעדר שניהם הוא כשל.',
    remediation: {
      goalHe: 'לכל וידאו ללא קול תיאור טקסטואלי או אודיו של הערוץ החזותי.',
      instruction:
        'Add either a text description of everything shown, or a descriptive audio track. Silent looping decorative video that carries no information is out of scope — mark it `aria-hidden="true"` so this row becomes genuinely Not Applicable.',
      effort: 'medium',
    },
  },

  R10: {
    part: 1,
    summaryHe:
      'בווידאו הכולל סאונד יופיעו כתוביות מסונכרנות וחלופה טקסטואלית. יסופקו במועד מוקדם ככל האפשר.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['video-caption'],
    customRules: ['caption-track-present'],
    applicability: 'hasVideoWithAudio',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל וידאו עם פס-קול: האם קיים <track kind="captions"> או כתוביות מוטמעות בפלטפורמה החיצונית? כתוביות אוטומטיות בלבד אינן עומדות בדרישה כאשר איכותן נמוכה. בנוסף — האם קיימת חלופה טקסטואלית בדף?',
    remediation: {
      goalHe: 'לכל וידאו עם קול כתוביות מסונכרנות בעברית וחלופה טקסטואלית.',
      instruction:
        'Add `<track kind="captions" srclang="he" label="עברית">` with a reviewed caption file (auto-generated Hebrew captions need a human pass), and publish a transcript alongside. For YouTube/Vimeo embeds, upload a caption track to the platform — an embed with no caption track fails.',
      hebrewStrings: { trackLabel: 'עברית', transcriptHeading: 'תמלול הסרטון' },
      effort: 'medium',
    },
  },

  R11: {
    part: 1,
    summaryHe:
      'תיאורי אודיו או תסריט הכולל תיאורי אודיו מלווים את הווידאו ומתארים התרחשויות חזותיות שאינן מתוארות בפס-הקול. יסופקו במועד מוקדם ככל האפשר.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasVideoWithAudio',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל וידאו עם פס-קול: האם קיים תסריט מלא הכולל תיאור של ההתרחשויות החזותיות, או רצועת תיאור אודיו? תמלול הדיבור בלבד אינו מספיק לקריטריון זה.',
    remediation: {
      goalHe: 'לכל וידאו תיאור של המתרחש חזותית — ברצועת אודיו או בתסריט מלא.',
      instruction:
        'Provide a full script that includes visual events ("הקהל מוחא כפיים", "על המסך מוצג גרף עולה"), or an audio-description track. A speech-only transcript does not satisfy this row.',
      effort: 'high',
    },
  },

  R12: {
    part: 1,
    summaryHe:
      'תיאורי אודיו מלווים את הווידאו ומתארים את כל ההתרחשויות החזותיות שאינן מתוארות באודיו שבסרט. יסופקו במועד מוקדם ככל האפשר.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasVideoWithAudio',
    evidenceSlice: 'media',
    rubricHe:
      'עבור כל וידאו עם פס-קול: האם קיימת רצועת תיאור אודיו ממשית (audio description track) הניתנת להפעלה? קריטריון זה תובעני יותר מ-1.2.3 — כאן נדרשת רצועת אודיו, לא תסריט.',
    remediation: {
      goalHe: 'לכל וידאו רצועת תיאור אודיו ניתנת להפעלה.',
      instruction:
        'Add a selectable audio-description track (`<track kind="descriptions">` where the player supports it, or a separate described version of the video linked next to the original).',
      effort: 'high',
    },
  },

  // ── הנחיה 1.3 ניתן להתאמה ────────────────────────────────────────────────
  R13: {
    part: 1,
    summaryHe:
      'מידע, מבנה והקשרים המועברים חזותית חייבים להיות מובנים גם מהקוד: כותרות h1-h6, רשימות ul/ol/dl, טבלאות עם th ו-caption, וטפסים עם label ו-fieldset. אזורי העמוד יוגדרו באמצעות landmarks.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [
      'list', 'listitem', 'definition-list', 'dlitem',
      'td-headers-attr', 'th-has-data-cells', 'scope-attr-valid', 'td-has-header',
      'label', 'form-field-multiple-labels', 'select-name',
      'aria-required-children', 'aria-required-parent',
      'empty-heading', 'heading-order', 'p-as-heading', 'table-fake-caption', 'landmark-one-main',
    ],
    customRules: ['fake-heading-detect', 'landmark-coverage'],
    applicability: 'hasTextContent',
    evidenceSlice: 'structure',
    rubricHe:
      'בדוק: (1) האם טקסט שנראה כותרת חזותית (גדול/מודגש/צבעוני, פותח מקטע) מסומן כ-h1-h6 ולא כ-p או div; (2) האם רשימות חזותיות ממומשות כ-ul/ol/dl ולא כפסקאות עם תווי בולט; (3) האם טבלאות נתונים כוללות th עם scope ו-caption, ושלא נעשה שימוש בטבלה לפריסה; (4) האם לכל פקד טופס יש label משויך; (5) האם קיימים landmarks (header/nav/main/footer או role מקביל) המכסים את אזורי העמוד. כותרת מזויפת היא הכשל הנפוץ ביותר בקריטריון זה.',
    remediation: {
      goalHe: 'המבנה החזותי של העמוד משתקף במלואו בקוד הסמנטי.',
      instruction:
        'Replace visually-styled pseudo-headings with real `<h1>`–`<h6>` in hierarchical order; convert bullet-like paragraphs to `<ul>`/`<ol>`; give data tables `<caption>`, `<th scope="col|row">`; associate every form control with a `<label for>`; wrap regions in `<header>`, `<nav>`, `<main>`, `<footer>`. Do not add ARIA roles to `<div>`s where the native element exists.',
      effort: 'medium',
    },
  },

  R14: {
    part: 1,
    summaryHe: 'קיימת הפרדה מלאה בין תוכן לתצוגה על ידי שימוש ב-CSS.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['presentational-markup', 'layout-table-detect'],
    applicability: 'hasTextContent',
    evidenceSlice: 'structure',
    rubricHe:
      'בדוק שאין תגיות ומאפיינים עיצוביים בקוד: font, center, b/i במקום strong/em לצורך משמעות, bgcolor, align, width/height עיצוביים, טבלאות לפריסה, ו-&nbsp; רצופים ליצירת מרווח. שימוש נרחב ב-style inline לעיצוב מבני הוא כשל.',
    remediation: {
      goalHe: 'כל העיצוב ב-CSS; ה-HTML נושא משמעות בלבד.',
      instruction:
        'Remove presentational markup (`<font>`, `<center>`, `bgcolor`, `align`, spacer tables, runs of `&nbsp;`) and move it to CSS. Keep `<b>`/`<i>` only where there is no semantic emphasis; use `<strong>`/`<em>` where there is.',
      effort: 'medium',
    },
  },

  R15: {
    part: 1,
    summaryHe:
      'כאשר סדר הצגת התוכן משפיע על משמעותו, הרצף ייקבע בקוד. סדר המידע בקוד משפיע על סדר ההקראה בקורא מסך ולכן נדרשת בדיקה שסדר ההקראה לוגי.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['dom-visual-order-mismatch'],
    applicability: 'hasTextContent',
    evidenceSlice: 'readingOrder',
    rubricHe:
      'השווה את סדר ה-DOM לסדר החזותי (מיקום גיאומטרי, בהתחשב ב-RTL). דגל חריגות שנוצרו מ-flex/grid order, position absolute, או float — כאשר הן משנות את משמעות הרצף. הבדל שאינו משנה משמעות אינו כשל.',
    remediation: {
      goalHe: 'סדר ה-DOM תואם את סדר הקריאה המשמעותי.',
      instruction:
        'Reorder the DOM to match the intended reading order instead of repositioning with CSS `order`, `float`, or absolute positioning. In RTL layouts use logical properties (`inset-inline-start`, `margin-inline`) so the visual order follows direction rather than fighting it.',
      effort: 'medium',
    },
  },

  R16: {
    part: 1,
    summaryHe:
      'הוראות אינן מסתמכות על צבע, צורה או מיקום על המסך בלבד. הוראות אינן מסתמכות על סאונד בלבד.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasSensoryInstructions',
    evidenceSlice: 'sensoryText',
    rubricHe:
      'אתר טקסט שמפנה למאפיין חושי בלבד: "לחץ על הכפתור הירוק", "בתיבה מימין", "העיגול למטה", "המתן לצפצוף". כשל נקבע רק אם אין מזהה נוסף (שם, תווית, סדר) שמאפשר לזהות את היעד בלי אותו חוש. הפניה שכוללת גם שם הפקד אינה כשל.',
    remediation: {
      goalHe: 'כל הוראה מזהה את היעד גם בטקסט, לא רק בצבע/צורה/מיקום/צליל.',
      instruction:
        'Rewrite sensory-only instructions to name the target: "לחץ על הכפתור הירוק" → "לחץ על הכפתור \'שליחה\' (הירוק)". Keep the sensory cue as an addition, never as the only identifier.',
      effort: 'low',
    },
  },

  // ── הנחיה 1.4 בר-הבחנה ───────────────────────────────────────────────────
  R17: {
    part: 1,
    summaryHe:
      'צבע אינו האמצעי החזותי היחיד להעברת מידע, סימון פעולה, בקשת תגובה או הבחנה בפרט חזותי. קישורים בתוך טקסט לא יובחנו בצבע בלבד, אלא אם יחס הניגודיות מול הטקסט הרגיל הוא 3:1 והעיצוב משתנה גם ב-hover וב-focus.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['link-in-text-block'],
    customRules: ['color-only-meaning'],
    applicability: 'hasColorCodedContent',
    evidenceSlice: 'colorUsage',
    rubricHe:
      'בדוק: (1) האם קיים מידע שמובחן בצבע בלבד — סטטוסים, שדות חובה באדום, מקראות גרפים, שורות מודגשות; (2) קישורים בתוך פסקת טקסט — האם יש קו תחתון או הבחנה לא-צבעונית, ואם לא, האם יחס הניגודיות מול טקסט הסביבה הוא 3:1 לפחות וקיים שינוי עיצוב ב-hover/focus. שדה חובה המסומן בכוכבית אדומה בלבד ללא טקסט "שדה חובה" הוא כשל.',
    remediation: {
      goalHe: 'לכל הבחנה חזותית מלווה סימן שאינו צבע — טקסט, אייקון, קו תחתון או דפוס.',
      instruction:
        'Pair every colour-coded distinction with a non-colour cue: an icon plus text label for statuses, `underline` for in-text links (or 3:1 contrast against surrounding text *and* a hover/focus style change), patterns in charts, and the word "חובה" or `aria-required` for required fields rather than a red asterisk alone.',
      hebrewStrings: { requiredField: 'שדה חובה', errorPrefix: 'שגיאה:' },
      effort: 'low',
    },
  },

  R18: {
    part: 1,
    summaryHe:
      'לאודיו המתנגן אוטומטית בדף למשך יותר משלוש שניות נדרש מנגנון עצירה, הפסקה או שליטה בעוצמה.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['no-autoplay-audio'],
    customRules: [],
    applicability: 'hasAutoplayAudio',
    evidenceSlice: 'media',
    rubricHe:
      'אם קיים אודיו שמתנגן אוטומטית מעל 3 שניות: האם קיים פקד עצירה/השתקה הנגיש במקלדת ומופיע בתחילת העמוד? היעדר פקד, או פקד המופיע רק אחרי תוכן רב, הם כשל.',
    remediation: {
      goalHe: 'לאודיו אוטומטי פקד עצירה נגיש בתחילת העמוד.',
      instruction:
        'Best fix: do not autoplay audio. If it must, add a stop/mute control as one of the first focusable elements on the page, operable by keyboard, and remember the user\'s choice.',
      hebrewStrings: { stopButton: 'עצור את השמע' },
      effort: 'low',
    },
  },

  R19: {
    part: 1,
    summaryHe:
      'יחס ניגודיות של 4.5:1 לפחות לטקסט רגיל ו-3:1 לפחות לטקסט גדול (מעל 18pt או 14pt מודגש). למעט לוגו, טקסט על גבי תמונת רקע וטקסט שאינו נראה.',
    appliesTo: ['page'],
    method: 'auto',
    axeRules: ['color-contrast'],
    customRules: [],
    applicability: 'hasTextContent',
    evidenceSlice: 'contrast',
    rubricHe:
      'קריטריון זה נקבע חישובית. יחס מתחת ל-4.5:1 בטקסט רגיל או מתחת ל-3:1 בטקסט גדול הוא כשל, למעט לוגו וטקסט מוסתר.',
    remediation: {
      goalHe: 'כל טקסט עומד ביחס הניגודיות הנדרש מול רקעו בפועל.',
      instruction:
        'Darken the foreground or lighten the background until the measured ratio is met. Note that Hebrew typefaces render thinner than Latin at the same size and weight, so a ratio that only just clears 4.5:1 reads worse in Hebrew — aim above the minimum. Do not "fix" this by enlarging text to reach the 3:1 large-text threshold unless the larger size is a genuine design decision.',
      effort: 'low',
    },
  },

  R20: {
    part: 1,
    summaryHe:
      'בהגדלת הטקסט ל-200% אין פגיעה במידע ובפונקציונליות של העמוד.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['meta-viewport'],
    customRules: ['zoom-200-reflow'],
    applicability: 'hasTextContent',
    evidenceSlice: 'contrast',
    rubricHe:
      'בהגדלה ל-200%: האם נחתך טקסט, נעלם תוכן, מופיעה גלילה אופקית, או חופפים רכיבים באופן שמונע שימוש? הופעת פס גלילה אופקי בלבד בטבלה רחבה אינה בהכרח כשל; חיתוך טקסט או חסימת פקד הם כשל.',
    remediation: {
      goalHe: 'העמוד שמיש במלואו בהגדלת טקסט של 200%.',
      instruction:
        'Use relative units (`rem`, `em`, `%`) for text and containers, avoid fixed `height` on text boxes, remove `user-scalable=no` and `maximum-scale` from the viewport meta, and let containers wrap instead of clipping (`overflow: visible` or `auto`, never `hidden` on text).',
      effort: 'medium',
    },
  },

  R21: {
    part: 1,
    summaryHe:
      'אין להשתמש בתמונה של טקסט כאשר ניתן להשיג את אותה תצוגה חזותית בטקסט חי. פרט למקרים שבהם התמונה ניתנת להתאמה אישית או שהצגת הטקסט בתמונה חיונית — לוגו ומותג נחשבים חיוניים.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: ['text-in-image-detect'],
    applicability: 'hasTextImages',
    evidenceSlice: 'textImages',
    rubricHe:
      'אתר תמונות שמכילות טקסט משמעותי — באנרים, כרזות מבצע, אינפוגרפיקות, ציטוטים מעוצבים, טבלאות מחירים כתמונה, צילומי מסך של טקסט. לוגו ומותג פטורים. תמונה שהטקסט בה זמין במלואו גם כטקסט חי סמוך אינה כשל.',
    remediation: {
      goalHe: 'טקסט מוצג כטקסט חי; תמונות טקסט מוחלפות או מלוות בטקסט שווה ערך.',
      instruction:
        'Rebuild banners and promo graphics as live text over a background image using CSS. Where the image genuinely must stay (logo, brand mark), that is an exception. Never ship a scanned price list or a screenshot of a table as the only source of that information.',
      effort: 'medium',
    },
  },

  // ── הנחיה 2.1 מקלדת נגישה ────────────────────────────────────────────────
  R22: {
    part: 1,
    summaryHe:
      'כל הפעולות באתר ניתנות לביצוע במקלדת ומעבר הפוקוס לוגי ומותאם למבנה המסך. רכיבים שאינם HTML מאפשרים שימוש מלא במקלדת, וקבלת פוקוס אינה מעוררת שינוי משמעותי בדף.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['nested-interactive', 'scrollable-region-focusable'],
    customRules: ['keyboard-walk', 'click-handler-no-keyboard'],
    applicability: 'hasFocusableElements',
    evidenceSlice: 'keyboard',
    rubricHe:
      'בדוק: (1) רכיבים אינטראקטיביים שאינם נגישים ב-Tab — div/span עם onclick ללא tabindex ו-role; (2) פונקציונליות שזמינה רק ב-hover או רק בעכבר (תפריטי משנה, גרירה ללא חלופה); (3) רכיבי ARIA מותאמים ללא תמיכת מקשי חיצים/Enter/Escape. אלמנט עם מאזין קליק שאינו button/a ואינו ממומש כפקד הוא כשל.',
    remediation: {
      goalHe: 'כל פעולה בעמוד ניתנת לביצוע מהמקלדת בלבד.',
      instruction:
        'Convert click-handling `<div>`/`<span>` into `<button>`/`<a>`, or give them `role`, `tabindex="0"` and Enter/Space handlers. Give hover-only menus focus and keyboard equivalents. Implement the expected key bindings for every custom widget (arrows within a menu, Escape to close, Home/End within a list).',
      effort: 'high',
    },
  },

  R23: {
    part: 1,
    summaryHe:
      'הדף אינו כולל מלכודות מקלדת — אלמנטים שניתן להגיע אליהם במקלדת אך לא ניתן לנווט מהם הלאה.',
    appliesTo: ['page'],
    method: 'auto',
    axeRules: [],
    customRules: ['keyboard-trap'],
    applicability: 'hasFocusableElements',
    evidenceSlice: 'keyboard',
    rubricHe:
      'נקבע על ידי הליכת Tab אוטומטית: אם הפוקוס חוזר לאותו אלמנט פעמיים ברציפות, או אינו מתקדם אחרי מספר לחיצות, קיימת מלכודת. מודאל שכולא פוקוס בכוונה אך ניתן לסגירה ב-Escape אינו מלכודת.',
    remediation: {
      goalHe: 'ניתן לצאת מכל רכיב במקלדת בלבד.',
      instruction:
        'Fix focus-trapping widgets so Tab/Shift+Tab can leave them, and give every intentional focus trap (modal, dialog) an Escape handler and a visible close control. Embedded third-party players are a common source — check them explicitly.',
      effort: 'medium',
    },
  },

  // ── הנחיה 2.2 זמן מספיק ──────────────────────────────────────────────────
  R24: {
    part: 1,
    summaryHe:
      'בכל מצב של הגבלת זמן לקריאה, תגובה או פעולה — כולל time out — ניתנת למשתמש אפשרות לבטל, להאריך או להתאים את ההגבלה. למעט הגבלות זמן שמעל 20 שעות.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['meta-refresh'],
    customRules: ['timeout-detect'],
    applicability: 'hasTimeLimit',
    evidenceSlice: 'timing',
    rubricHe:
      'אתר הגבלות זמן: meta refresh, ספירה לאחור, פקיעת session, קרוסלה שמתקדמת אוטומטית, הודעה שנעלמת. עבור כל אחת — האם המשתמש יכול לבטל, להאריך או להתאים? הגבלה מעל 20 שעות פטורה.',
    remediation: {
      goalHe: 'לכל הגבלת זמן אפשרות ביטול, הארכה או התאמה.',
      instruction:
        'Warn before a session expires and offer a one-action extension. Remove `<meta http-equiv="refresh">`. Give auto-advancing carousels a pause control. Toast messages that carry information must persist until dismissed.',
      hebrewStrings: { extendSession: 'הארך את זמן ההתחברות', sessionWarning: 'ההתחברות שלך תפוג בעוד דקה' },
      effort: 'medium',
    },
  },

  R25: {
    part: 1,
    summaryHe:
      'ניתן להפסיק, לעצור או להסתיר מידע מהבהב, נע או נגלל המופיע למעלה מ-5 שניות. למידע המתעדכן אוטומטית ומוצג במקביל לתוכן אחר יסופק מנגנון עצירה או שליטה בתדירות, למעט כשהעדכון מהותי לפעולה.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['blink', 'marquee'],
    customRules: ['moving-content-detect'],
    applicability: 'hasMovingContent',
    evidenceSlice: 'motion',
    rubricHe:
      'אתר קרוסלות אוטומטיות, טיקרים, אנימציות מחזוריות, GIF נע, ותוכן שמתרענן לבדו. עבור כל אחד — האם קיים פקד עצירה נגיש במקלדת? כיבוד prefers-reduced-motion הוא שיפור אך אינו מחליף פקד עצירה גלוי.',
    remediation: {
      goalHe: 'לכל תוכן נע או מתעדכן אוטומטית פקד עצירה גלוי ונגיש.',
      instruction:
        'Add a visible, keyboard-reachable pause/stop control to carousels, tickers and auto-refreshing regions. Also honour `prefers-reduced-motion`, but do not treat that as a substitute for the control.',
      hebrewStrings: { pause: 'השהה', play: 'המשך', stopAnimation: 'עצור אנימציה' },
      effort: 'medium',
    },
  },

  // ── הנחיה 2.3 התקפים ─────────────────────────────────────────────────────
  R26: {
    part: 1,
    summaryHe:
      'אין הבהוב או ריצוד על המסך בקצב של יותר משלוש פעמים בשנייה, או מעבר לספי ההבהוב הכללי והאדום.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['blink', 'marquee'],
    customRules: ['flash-candidates'],
    applicability: 'hasFlashingCandidates',
    evidenceSlice: 'motion',
    rubricHe:
      'אתר מועמדים להבהוב: אנימציות CSS מהירות, GIF מהבהבים, וידאו עם חיתוכים מהירים, אפקטי stroboscope. הכלי מסמן מועמדים בלבד — כשל ודאי נקבע רק כשקצב ההבהוב ניתן למדידה ועולה על 3 לשנייה.',
    remediation: {
      goalHe: 'אין תוכן המהבהב יותר משלוש פעמים בשנייה.',
      instruction:
        'Slow or remove any flashing effect above 3 Hz. This is a seizure-safety criterion — when in doubt, remove the effect rather than tuning it.',
      effort: 'low',
    },
  },

  // ── הנחיה 2.4 ניתן לניווט ────────────────────────────────────────────────
  R27: {
    part: 1,
    summaryHe:
      'קיים מנגנון לעקיפת בלוקים החוזרים על עצמם במספר עמודים, כגון תפריטים ובאנרים. המנגנון תומך בניווט ישיר לתוכן העמוד.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['bypass', 'region', 'landmark-one-main'],
    customRules: ['skip-link-functional'],
    applicability: 'hasRepeatedBlocks',
    evidenceSlice: 'navigation',
    rubricHe:
      'בדוק: (1) קיים קישור דילוג שהוא מהראשונים בסדר ה-Tab; (2) הוא נעשה גלוי בקבלת פוקוס; (3) הוא מוביל ליעד קיים שמקבל פוקוס בפועל. קישור דילוג שמוסתר ב-display:none או שמצביע ל-id שאינו קיים הוא כשל. לחלופין — מבנה landmarks מלא.',
    remediation: {
      goalHe: 'קיים קישור דילוג פעיל לתוכן הראשי, או מבנה landmarks מלא.',
      instruction:
        'Add `<a href="#main-content" class="skip-link">דלג לתוכן הראשי</a>` as the first focusable element; make it visible on focus (offset it with `inset-inline-start`, not `left`, so it works in RTL); give the target `id="main-content"` and `tabindex="-1"` so focus actually lands there.',
      hebrewStrings: { skipLink: 'דלג לתוכן הראשי', skipNav: 'דלג לתפריט הניווט' },
      effort: 'low',
    },
  },

  R28: {
    part: 1,
    summaryHe: 'לכל העמודים יש כותרת ייחודית המתארת את תוכן העמוד או את הפונקציונליות שלו.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['document-title'],
    customRules: ['title-unique-across-site'],
    applicability: 'always',
    evidenceSlice: 'navigation',
    rubricHe:
      'בדוק: (1) קיים title לא ריק; (2) הוא מתאר את תוכן העמוד הספציפי ולא רק את שם האתר; (3) הוא ייחודי ביחס לשאר עמודי האתר שנסרקו. "דף הבית" בכל העמודים הוא כשל. כותרת שהיא שם האתר בלבד היא כשל.',
    remediation: {
      goalHe: 'לכל עמוד כותרת ייחודית שמתארת אותו.',
      instruction:
        'Set `<title>` to "{תיאור העמוד} | {שם האתר}", with the page-specific part first so screen-reader users hear it before the site name.',
      effort: 'low',
    },
  },

  R29: {
    part: 1,
    summaryHe: 'בניווט באמצעות מקלדת מעבר הפוקוס לוגי, אינטואיטיבי ומותאם למבנה העמוד.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['tabindex'],
    customRules: ['focus-order-walk'],
    applicability: 'hasFocusableElements',
    evidenceSlice: 'keyboard',
    rubricHe:
      'השווה את סדר הפוקוס בפועל לסדר החזותי ב-RTL. דגל: tabindex חיובי, קפיצות בין אזורים מרוחקים, פוקוס שנכנס לתוכן מוסתר, ומודאל שאינו לוכד פוקוס. סדר שנראה שונה אך שומר על היגיון קריאה אינו כשל.',
    remediation: {
      goalHe: 'סדר הפוקוס תואם את הסדר החזותי וההגיוני של העמוד.',
      instruction:
        'Remove positive `tabindex` values and let DOM order drive focus. Make hidden content genuinely unfocusable (`display:none`, `hidden`, or `inert`). Move focus into a dialog when it opens and return it to the trigger when it closes.',
      effort: 'medium',
    },
  },

  R30: {
    part: 1,
    summaryHe:
      'מטרת הקישור ברורה מטקסט הקישור או מההקשר שבו הוא נמצא. במקרה של חוסר בהירות יסופק title המסביר במדויק מהי מטרת הקישור.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['link-name'],
    customRules: ['generic-link-text'],
    applicability: 'hasLinks',
    evidenceSlice: 'links',
    rubricHe:
      'עבור כל קישור: האם ניתן להבין את יעדו מטקסט הקישור לבדו, או מהמשפט/הפסקה שסביבו? "לחץ כאן", "קרא עוד", "כאן", "לפרטים" ללא הקשר מבהיר הם כשל. קישור שטקסטו הוא כתובת URL ארוכה הוא כשל. שני קישורים באותו עמוד עם אותו טקסט אך יעדים שונים הם כשל.',
    remediation: {
      goalHe: 'טקסט כל קישור מתאר את יעדו, גם כשקוראים אותו לבדו.',
      instruction:
        'Rewrite link text to name the destination: "קרא עוד" → "קרא עוד על תנאי השירות". Where the visible text must stay short, extend the accessible name with `aria-label` or visually-hidden text — but prefer fixing the visible text, since sighted keyboard users read it too.',
      effort: 'low',
    },
  },

  R31: {
    part: 1,
    summaryHe:
      'יש יותר מדרך אחת להגיע לעמוד, אלא אם הוא שלב בתהליך או תוצאה של תהליך. דרכים אפשריות: מפת אתר, מנגנון חיפוש, תוכן עניינים, תפריט מלא, או bookmarks במסמכי PDF.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['multiple-ways-site'],
    applicability: 'isMultiPageSite',
    evidenceSlice: 'siteConsistency',
    rubricHe:
      'ברמת האתר: האם קיימות לפחות שתי דרכים להגיע לעמוד — תפריט, חיפוש, מפת אתר, פירורי לחם? עמוד שהוא שלב בתהליך (תשלום, אשף) פטור מהקריטריון.',
    remediation: {
      goalHe: 'לכל עמוד לפחות שתי דרכי הגעה.',
      instruction:
        'Add a site search, a sitemap page linked from the footer, or breadcrumbs — any two mechanisms satisfy this. Exclude genuine process steps from the requirement rather than bolting navigation onto a checkout flow.',
      hebrewStrings: { sitemap: 'מפת האתר', search: 'חיפוש באתר' },
      effort: 'medium',
    },
  },

  R32: {
    part: 1,
    summaryHe: 'כותרות ותוויות ברורות המבהירות את הנושא או המטרה.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: ['empty-heading'],
    customRules: [],
    applicability: 'hasHeadingsOrLabels',
    evidenceSlice: 'headingsLabels',
    rubricHe:
      'עבור כל כותרת ותווית: האם היא מתארת את תוכן המקטע או את מטרת השדה? כותרות גנריות ("מידע", "פרטים", "עוד"), תוויות שהן placeholder בלבד, ותוויות זהות לשדות שונים — כשל. כותרת קצרה אך ממוקדת אינה כשל.',
    remediation: {
      goalHe: 'כל כותרת ותווית מתארת במדויק את מה שהיא מכסה.',
      instruction:
        'Replace generic headings and labels with specific ones ("מידע" → "מידע על ביטול עסקה"). A `placeholder` is not a label — add a real `<label>`.',
      effort: 'low',
    },
  },

  R33: {
    part: 1,
    summaryHe:
      'כל מרכיב המקבל פוקוס בשימוש במקלדת מקבל אפקט ויזואלי — מהדפדפן או משינוי עיצוב של הרכיב.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['focus-visible-check'],
    applicability: 'hasFocusableElements',
    evidenceSlice: 'focusVisible',
    rubricHe:
      'עבור כל רכיב שמקבל פוקוס: האם יש הבדל חזותי מדיד בין מצב רגיל למצב פוקוס? outline:none ללא חלופה הוא כשל. אינדיקטור בניגודיות נמוכה מאוד מול הרקע הוא כשל מעשי.',
    remediation: {
      goalHe: 'לכל רכיב שמקבל פוקוס אינדיקטור חזותי ברור.',
      instruction:
        'Never ship `outline: none` without a replacement. Use `:focus-visible { outline: 3px solid <high-contrast>; outline-offset: 2px; }`. Verify the indicator is visible against every background it appears on, including inside dark sections.',
      effort: 'low',
    },
  },

  R34: {
    part: 1,
    summaryHe: 'יש שימוש בכותרות כדי לזהות קטעים (sections) בעמוד.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['heading-order', 'empty-heading'],
    customRules: ['section-heading-coverage'],
    applicability: 'hasSections',
    evidenceSlice: 'structure',
    rubricHe:
      'בדוק שכל מקטע תוכן משמעותי נפתח בכותרת, ושההיררכיה רציפה (אין דילוג מ-h2 ל-h4). עמוד ללא h1 הוא כשל. מקטע ארוך ללא כותרת הוא כשל.',
    remediation: {
      goalHe: 'כל מקטע תוכן נפתח בכותרת, בהיררכיה רציפה.',
      instruction:
        'Give the page exactly one `<h1>`, open each section with the next heading level down, and do not skip levels. Style heading levels with CSS rather than picking a level for its default size.',
      effort: 'low',
    },
  },

  // ── הנחיה 3.1 קריא ───────────────────────────────────────────────────────
  R35: {
    part: 1,
    summaryHe: 'בעמוד מוגדרת שפת הכתיבה בתגית ה-HTML, לדוגמה lang="he".',
    appliesTo: ['page'],
    method: 'auto',
    axeRules: ['html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch'],
    customRules: ['hebrew-lang-dir'],
    applicability: 'always',
    evidenceSlice: 'language',
    rubricHe:
      'נקבע אוטומטית: קיום lang תקין על תגית html. לתוכן עברי נדרש גם dir="rtl" — היעדרו נרשם כממצא נפרד לפי התוספת הישראלית.',
    remediation: {
      goalHe: 'תגית ה-html מצהירה על שפת העמוד, ובעברית גם על כיוון הכתיבה.',
      instruction: 'Set `<html lang="he" dir="rtl">` for Hebrew pages (`lang="ar"` for Arabic, also RTL; `lang="en"` with `dir="ltr"` for English).',
      effort: 'low',
    },
  },

  R36: {
    part: 1,
    summaryHe: 'בכל מקום בתוכן שבו משתנה שפת הכתיבה, השינוי מצוין בקוד באמצעות מאפיין lang.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['valid-lang'],
    customRules: ['foreign-language-run'],
    applicability: 'hasForeignLanguageParts',
    evidenceSlice: 'language',
    rubricHe:
      'אתר קטעי טקסט בשפה שונה משפת העמוד באורך משמעותי (מעל כמה מילים) שאינם מסומנים ב-lang. שמות מותג, מונחים טכניים ומילות השאלה שהשתרשו בעברית אינם דורשים סימון. פסקה שלמה באנגלית בתוך עמוד עברי ללא lang="en" היא כשל.',
    remediation: {
      goalHe: 'כל קטע בשפה זרה מסומן ב-lang, ובמידת הצורך גם ב-dir.',
      instruction:
        'Wrap foreign-language passages: `<span lang="en" dir="ltr">…</span>`. Inside Hebrew text, also mark LTR islands — phone numbers, IDs, order numbers, emails, code — with `dir="ltr"` so bidi does not scramble them.',
      effort: 'low',
    },
  },

  // ── הנחיה 3.2 ניתן לניבוי ────────────────────────────────────────────────
  R37: {
    part: 1,
    summaryHe:
      'כאשר רכיב מקבל פוקוס לא מתרחש שינוי משמעותי: פתיחת חלון חדש, העברת מוקד לרכיב אחר, מעבר לדף חדש או ארגון מחדש של תכני הדף.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['context-change-on-focus'],
    applicability: 'hasFocusableElements',
    evidenceSlice: 'keyboard',
    rubricHe:
      'נמדד בהליכת Tab: האם קבלת פוקוס גרמה לניווט, לפתיחת חלון, להזזת הפוקוס, או לשינוי מבני בדף? הופעת tooltip או הדגשה חזותית אינם שינוי משמעותי.',
    remediation: {
      goalHe: 'קבלת פוקוס אינה משנה את ההקשר.',
      instruction:
        'Move context changes from `onfocus` to `onclick`/`onchange` with explicit user intent. Never submit a form or navigate on focus.',
      effort: 'medium',
    },
  },

  R38: {
    part: 1,
    summaryHe:
      'שינוי ערך של פקד אינו גורם לשינוי משמעותי אוטומטי, אלא אם המשתמש יודע על כך מראש.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['context-change-on-input'],
    applicability: 'hasForms',
    evidenceSlice: 'forms',
    rubricHe:
      'אתר פקדים שמשנים הקשר בעת שינוי ערך — select ששולח טופס, שדה שמנווט אוטומטית, קלט שמעביר פוקוס לשדה הבא. כשל אלא אם קיימת אזהרה מראש הנגישה לקורא מסך.',
    remediation: {
      goalHe: 'שינוי ערך אינו מנווט או משנה מבנה בלי שהמשתמש ביקש.',
      instruction:
        'Add an explicit submit button instead of auto-submitting on `change`. If auto-advance must stay (OTP fields), announce it in advance with visible instructions and `aria-describedby`.',
      effort: 'medium',
    },
  },

  R39: {
    part: 1,
    summaryHe: 'מנגנוני הניווט באתר מופיעים באותו סדר בכל פעם שהם חוזרים, ויש להם אותו זיהוי.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['nav-consistency'],
    applicability: 'isMultiPageSite',
    evidenceSlice: 'siteConsistency',
    rubricHe:
      'השווה את רצף פריטי הניווט בין העמודים שנסרקו. שינוי סדר של אותם פריטים בין עמודים הוא כשל; הוספה או הסרה של פריטים לפי הקשר אינה כשל כל עוד הסדר היחסי נשמר.',
    remediation: {
      goalHe: 'סדר פריטי הניווט זהה בכל העמודים.',
      instruction: 'Render navigation from one shared component/partial so the order cannot drift between templates.',
      effort: 'low',
    },
  },

  R40: {
    part: 1,
    summaryHe: 'כל רכיבי ממשק המשתמש המופיעים במספר עמודים מזוהים באופן זהה.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [],
    customRules: ['component-identity'],
    applicability: 'isMultiPageSite',
    evidenceSlice: 'siteConsistency',
    rubricHe:
      'השווה שמות נגישים ואייקונים של רכיבים חוזרים בין עמודים: כפתור חיפוש שנקרא "חיפוש" בעמוד אחד ו-"חפש" באחר, אותו אייקון עם משמעויות שונות. חוסר עקביות בשם הנגיש הוא כשל.',
    remediation: {
      goalHe: 'לרכיב חוזר אותו שם נגיש ואותו אייקון בכל האתר.',
      instruction: 'Centralise labels for shared components in one strings module and reference it everywhere.',
      effort: 'low',
    },
  },

  // ── הנחיה 3.3 עזרה בקלט ──────────────────────────────────────────────────
  R41: {
    part: 1,
    summaryHe:
      'כאשר ניתן לזהות שגיאת קלט אוטומטית, מופיעה הודעת שגיאה טקסטואלית והיא מזוהה גם על ידי קוראי מסך. אם ידועות הצעות לתיקון הן מוצגות למשתמש, אלא אם הדבר יפגע באבטחה או במטרת התוכן.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['aria-valid-attr-value'],
    customRules: ['error-announcement'],
    applicability: 'hasFormsWithValidation',
    evidenceSlice: 'formErrors',
    rubricHe:
      'בדוק: (1) האם השגיאה מוצגת כטקסט ולא רק כמסגרת אדומה; (2) האם היא משויכת לשדה ב-aria-describedby ומסומנת ב-aria-invalid; (3) האם היא מוכרזת דרך role="alert" או aria-live; (4) האם היא מציעה תיקון קונקרטי; (5) האם היא בעברית. הודעה כללית בראש הטופס ללא שיוך לשדות היא כשל חלקי ותירשם ככשל.',
    remediation: {
      goalHe: 'כל שגיאה מוצגת כטקסט בעברית, משויכת לשדה ומוכרזת לקורא מסך.',
      instruction:
        'On validation failure set `aria-invalid="true"` on the field, render the message in an element referenced by `aria-describedby`, and announce it through `role="alert"`. Name the problem and the fix ("מספר תעודת זהות חייב להכיל 9 ספרות"), not just "שגיאה".',
      hebrewStrings: {
        required: 'שדה חובה — נא למלא',
        invalidEmail: 'כתובת דוא"ל אינה תקינה. לדוגמה: name@example.co.il',
        invalidId: 'מספר תעודת זהות חייב להכיל 9 ספרות',
        invalidPhone: 'מספר טלפון אינו תקין. לדוגמה: 050-1234567',
      },
      effort: 'medium',
    },
  },

  R42: {
    part: 1,
    summaryHe: 'כאשר המשתמש נדרש להזין מידע, מסופקות לו תוויות והוראות.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: ['label', 'form-field-multiple-labels', 'select-name', 'input-button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'label-title-only'],
    customRules: ['placeholder-as-label'],
    applicability: 'hasForms',
    evidenceSlice: 'forms',
    rubricHe:
      'עבור כל פקד: האם קיימת תווית גלויה ומשויכת? placeholder בלבד הוא כשל — הוא נעלם בהקלדה. בנוסף: האם סופקו הוראות פורמט לשדות שדורשים פורמט מסוים, והאם שדות חובה מסומנים בטקסט ולא בכוכבית בלבד?',
    remediation: {
      goalHe: 'לכל שדה תווית גלויה משויכת, והוראות פורמט היכן שנדרש.',
      instruction:
        'Give every control a visible `<label for>`. Keep `placeholder` as an example only, never as the label. Add format hints through `aria-describedby`, and mark required fields with the word "חובה" as well as `required`/`aria-required`.',
      hebrewStrings: { requiredMark: 'חובה', formatHint: 'פורמט: {{דוגמה}}' },
      effort: 'low',
    },
  },

  R43: {
    part: 1,
    summaryHe:
      'בטפסים הגוררים התחייבות משפטית, פעולה פיננסית, שינוי או מחיקה של נתוני משתמש, או תשובות במבחן — נדרש שהפעולה תהיה הפיכה, או שהנתונים ייבדקו לאיתור שגיאות, או שיתאפשרו בחינה חוזרת ואישור לפני שליחה סופית.',
    appliesTo: ['page'],
    method: 'llm',
    axeRules: [],
    customRules: [],
    applicability: 'hasHighStakesForm',
    evidenceSlice: 'forms',
    rubricHe:
      'אם הטופס גורר חיוב, התחייבות משפטית, מחיקת נתונים או הגשת מבחן: האם מתקיים לפחות אחד מהשלושה — הפיכות, בדיקת קלט עם הזדמנות לתיקון, או מסך אישור לפני שליחה? היעדר כל השלושה הוא כשל.',
    remediation: {
      goalHe: 'לפעולה בעלת השלכות קיימת דרך לבטל, לתקן או לאשר לפני ביצוע.',
      instruction:
        'Add a review-and-confirm step before final submission that shows every value the user entered and lets them go back and edit it. For destructive actions, prefer reversibility (undo window, soft delete) over a confirmation dialog.',
      hebrewStrings: { reviewHeading: 'בדיקת הפרטים לפני שליחה', confirm: 'אישור ושליחה', back: 'חזרה לעריכה' },
      effort: 'high',
    },
  },

  // ── הנחיה 4.1 תואם ───────────────────────────────────────────────────────
  R44: {
    part: 1,
    summaryHe:
      'בשימוש בשפות סימון: לכל אלמנט תגית פתיחה וסיום לפי הסטנדרטים, אין מאפיינים כפולים, כל המזהים ייחודיים, וה-nesting תקין.',
    appliesTo: ['page'],
    method: 'auto',
    axeRules: ['duplicate-id', 'duplicate-id-active', 'duplicate-id-aria'],
    customRules: ['markup-validity'],
    applicability: 'always',
    evidenceSlice: 'markupValidity',
    rubricHe:
      'נקבע אוטומטית: מזהים כפולים, מאפיינים כפולים, ותגיות שלא נסגרו או מקוננות שגוי. שגיאות שהדפדפן מתקן בשקט עדיין נחשבות כשל בקריטריון זה.',
    remediation: {
      goalHe: 'הקוד תקין: מזהים ייחודיים, תגיות סגורות ומקוננות כהלכה.',
      instruction:
        'Make every `id` unique (a duplicated `id` breaks `label for`, `aria-describedby` and in-page anchors), remove duplicate attributes, and fix unclosed or mis-nested tags.',
      effort: 'low',
    },
  },

  R45: {
    part: 1,
    summaryHe:
      'לכל רכיבי ממשק המשתמש — כולל שדות טופס, קישורים ורכיבים שנוצרו בתסריטים — השם והתפקיד מזוהים בקוד, ומצבים וערכים ניתנים להגדרה ומדווחים לטכנולוגיות מסייעות. לכל frame ו-iframe יש title המתאר את מטרתו.',
    appliesTo: ['page'],
    method: 'hybrid',
    axeRules: [
      'button-name', 'link-name', 'frame-title', 'frame-title-unique',
      'aria-allowed-attr', 'aria-allowed-role', 'aria-command-name', 'aria-hidden-body',
      'aria-hidden-focus', 'aria-input-field-name', 'aria-meter-name', 'aria-progressbar-name',
      'aria-required-attr', 'aria-roles', 'aria-toggle-field-name', 'aria-tooltip-name',
      'aria-valid-attr', 'aria-valid-attr-value', 'presentation-role-conflict',
    ],
    customRules: ['custom-widget-state'],
    applicability: 'hasFocusableElements',
    evidenceSlice: 'ariaWidgets',
    rubricHe:
      'בדוק לכל רכיב אינטראקטיבי: שם נגיש קיים ומשמעותי, role מתאים למה שהרכיב עושה בפועל, ומצבים (expanded/checked/selected/disabled) משתקפים ב-ARIA ומתעדכנים בזמן אמת. כפתור עם אייקון בלבד ללא aria-label הוא כשל. accordion ללא aria-expanded הוא כשל.',
    remediation: {
      goalHe: 'לכל רכיב ממשק שם, תפקיד ומצב שניתנים לקריאה בקוד.',
      instruction:
        'Give icon-only controls an `aria-label` in Hebrew. Use native elements before ARIA. Where a custom widget is unavoidable, follow the matching APG pattern in full — role, states, and keyboard interaction — and keep `aria-expanded`/`aria-selected`/`aria-checked` in sync with the visual state. Give every `<iframe>` a descriptive `title`.',
      hebrewStrings: { close: 'סגור', menu: 'תפריט', search: 'חיפוש', expand: 'הרחב', collapse: 'כווץ' },
      effort: 'medium',
    },
  },
};

export const OVERRIDE_ROW_IDS = Object.keys(ENGINE_OVERRIDES);
