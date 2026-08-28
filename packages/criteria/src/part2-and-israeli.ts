/**
 * Rows that the official web check sheet does not contain, but that an Israeli
 * audit still has to cover:
 *
 *   PART 2 (`D01`…`D11`) — IS 5568 Part 2 (2020), accessibility of downloadable
 *   digital documents. The sheet's own instructions say the check is run "עבור
 *   כל תבנית עמוד או עמוד ייחודי או מסמך (PDF, Word וכד')", but its 42 rows are
 *   written for web pages. Part 2 names a specific, much shorter set of criteria
 *   for documents, with its own large-text thresholds — so documents get their
 *   own rows rather than being forced through the web rows.
 *
 *   ISRAELI ADDITIONS (`IL01`…`IL06`) — duties that come from the Regulations
 *   rather than from WCAG: the accessibility statement, the coordinator's
 *   contact details, the Regulation 35 preferences widget, RTL declaration.
 *   These are reported in a clearly separated section, because a reader must be
 *   able to tell what is a WCAG criterion and what is Israeli law on top.
 *
 * Source for Part 2 wording: SI 5568 part 2, May 2020, sections 4, 5 and 6.
 */

import type { CheckItem, Target } from './schema.ts';

const DOC_TARGETS: Target[] = ['pdf', 'docx', 'pptx', 'xlsx', 'txt'];

/** IS 5568 Part 2 §3.6 — large-text thresholds for documents differ from the web ones. */
export const PART2_TEXT_THRESHOLDS = {
  /** Word-processing documents, in points. */
  document: { largePt: 14, veryLargePt: 18 },
  /** Web pages, in pixels — kept here for comparison; the web rows use these. */
  web: { largePx: 18.5, veryLargePx: 24 },
  /** Minimum contrast by size class, per the §3.6 table. */
  contrast: { normal: 4.5, large: 4.5, largeBold: 3, veryLarge: 3 },
} as const;

export const PART2_ITEMS: CheckItem[] = [
  {
    id: 'D01',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.1.1',
      criterionNameHe: 'תוכן שאינו טקסטואלי — תמונות במסמך',
      descriptionHe:
        'אם תמונה מעבירה מידע או מסר שאינו מוצג בגוף הטקסט, יוסף לה טקסט חלופי שיתאר את המידע ואת המסר של התמונה. לתמונות בעלות קישור יוסף טקסט חלופי המבהיר בקצרה לאן מפנה הקישור. אם תמונה מיועדת לקישוט (pure decoration), היא תוגדר באופן שהמשתמשים יוכלו להתעלם ממנה באמצעות טכנולוגיה מסייעת, ככל שהתוכנה מאפשרת. תמונות של תרשימים ואיורים המספקות מידע חיוני ילוו בטקסט חלופי שיתאר את התרשים או האיור. אובייקטים חזותיים כגון סימנים וצורות ילוו בטקסט חלופי.',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'לכל תמונה במסמך המעבירה מידע נדרש טקסט חלופי המתאר את המידע ואת המסר. תמונה דקורטיבית תסומן כך שטכנולוגיה מסייעת תתעלם ממנה.',
      appliesTo: DOC_TARGETS,
      method: 'hybrid',
      axeRules: [],
      customRules: ['doc-image-alt'],
      applicability: 'hasImages',
      evidenceSlice: 'documentStructure',
      rubricHe:
        'עבור כל תמונה במסמך: האם קיים טקסט חלופי? האם הוא מתאר את המידע ולא את הקובץ? האם תמונה דקורטיבית סומנה כארטיפקט (PDF) או כדקורטיבית (Office)? תמונה אינפורמטיבית ללא alt היא כשל.',
      remediation: {
        goalHe: 'לכל תמונה במסמך טקסט חלופי, ולתמונות דקורטיביות סימון מתאים.',
        instruction:
          'Word/PowerPoint: right-click the image → "עריכת טקסט חלופי" and describe the information it carries; tick "סמן כדקורטיבי" for purely decorative images. PDF: tag the image as `/Figure` with an `/Alt` string, or as an artifact when decorative. Re-export from the source document rather than patching the PDF where possible — patched tags are lost on the next export.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D02',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.3.1',
      criterionNameHe: 'מידע וקשרים — כותרות',
      descriptionHe:
        'טקסט המוצג ככותרת יגויית בגיוות סמנטי. במסמך שיש בו כותרת אחת, הגיוות הסמנטי ככותרת אינו חובה. במסמך שיש בו כמה רמות כותרת (לדוגמה כותרת ראשית ומשנית) יש לגייג את הכותרות בהיררכיה המתאימה (heading 1-6).',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'טקסט המוצג ככותרת יסומן בתגית כותרת סמנטית. במסמך עם כמה רמות כותרת יש לסמנן בהיררכיה מתאימה (heading 1-6).',
      appliesTo: DOC_TARGETS,
      method: 'hybrid',
      axeRules: [],
      customRules: ['doc-heading-structure'],
      applicability: 'hasHeadingsOrLists',
      evidenceSlice: 'documentStructure',
      rubricHe:
        'בדוק אם קיים טקסט שנראה ככותרת (גופן גדול/מודגש, פותח מקטע) אך אינו מסומן בסגנון כותרת. זהו הכשל הנפוץ ביותר במסמכי Word: כותרת שנוצרה בהדגשה והגדלה ידנית במקום בסגנון "כותרת 1". במסמך עם יותר מרמת כותרת אחת, גם היררכיה שבורה היא כשל.',
      remediation: {
        goalHe: 'כל כותרת במסמך מסומנת בסגנון כותרת סמנטי, בהיררכיה רציפה.',
        instruction:
          'Word: apply the built-in "כותרת 1/2/3" styles instead of bolding and enlarging text; restyle the style itself if you dislike its look. PowerPoint: use the slide-layout title placeholder, not a free text box. PDF: the `/H1`–`/H6` structure tags must exist and nest without skipping levels.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D03',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.3.1',
      criterionNameHe: 'מידע וקשרים — מבנה היררכי ברשימות',
      descriptionHe:
        'ביצירת רשימות תיעשה אחת מהפעולות: גיוות סמנטי של תבליטים ומספור אוטומטי; או שימוש במספור המייצג את ההיררכיה בין רמות התוכן באופן תקין ורציף (ללא גיוות סמנטי).',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'רשימות ייווצרו בגיוות סמנטי של תבליטים ומספור אוטומטי. לחלופין, במספור המייצג נכון ורציף את ההיררכיה בין רמות התוכן.',
      appliesTo: DOC_TARGETS,
      method: 'hybrid',
      axeRules: [],
      customRules: ['doc-list-structure'],
      applicability: 'hasHeadingsOrLists',
      evidenceSlice: 'documentStructure',
      rubricHe:
        'אתר רשימות שנוצרו בהקלדה ידנית של "-", "•", "1." בתחילת פסקה במקום ברשימה אוטומטית. שים לב שהתקן מתיר מספור ידני רציף והיררכי כחלופה — מספור ידני תקין ורציף אינו כשל, מספור שבור או תבליט מוקלד הוא כשל.',
      remediation: {
        goalHe: 'רשימות נוצרות ברשימה אוטומטית, או במספור היררכי רציף ותקין.',
        instruction:
          'Word/PowerPoint: use the bullet and numbering buttons rather than typing "-" or "1." manually. PDF: lists must carry `/L`, `/LI`, `/Lbl`, `/LBody` tags. Where manual numbering is kept, it must be continuous and reflect the hierarchy (1, 1.1, 1.1.1).',
        effort: 'low',
      },
    },
  },
  {
    id: 'D04',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.3.2',
      criterionNameHe: 'רצף בעל משמעות',
      descriptionHe:
        'סדר ההקראה בטכנולוגיה המסייעת יהיה בהלימה לסדר התצוגה. נושא זה חשוב במיוחד כאשר המידע מוצג בטבלאות.',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'סדר ההקראה בטכנולוגיה מסייעת תואם את סדר התצוגה. הדבר קריטי במיוחד כאשר המידע מוצג בטבלאות.',
      appliesTo: DOC_TARGETS,
      method: 'hybrid',
      axeRules: [],
      customRules: ['doc-reading-order'],
      applicability: 'hasTextContent',
      evidenceSlice: 'documentStructure',
      rubricHe:
        'השווה את סדר עץ התגיות/סדר הקריאה לסדר החזותי בעמוד. דגל תיבות טקסט צפות, עמודות, וטבלאות שסדר הקריאה בהן חוצה עמודות במקום שורות. במצגת — סדר הקריאה בחלונית "סדר הבחירה".',
      remediation: {
        goalHe: 'סדר ההקראה במסמך זהה לסדר הקריאה החזותי.',
        instruction:
          'PowerPoint: fix the order in "סידור" → "חלונית הבחירה" (the pane reads bottom-to-top). Word: avoid floating text boxes; use a single-column flow or real columns. PDF: correct the order in the Tags/Order panel of the tagging tool, and re-verify after every export.',
        effort: 'medium',
      },
    },
  },
  {
    id: 'D05',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.3.3',
      criterionNameHe: 'מאפייני חישה',
      descriptionHe:
        'אין לספק למשתמש הוראות המסתמכות רק על חוש הראייה או רק על חוש השמיעה.',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe: 'אין לספק הוראות המסתמכות על חוש הראייה בלבד או על חוש השמיעה בלבד.',
      appliesTo: DOC_TARGETS,
      method: 'llm',
      axeRules: [],
      customRules: [],
      applicability: 'hasSensoryInstructions',
      evidenceSlice: 'documentText',
      rubricHe:
        'אתר הוראות במסמך המפנות לצורה, צבע, גודל או מיקום בלבד: "ראה בטבלה מימין", "המסומן באדום", "בתרשים למטה". כשל רק אם אין מזהה נוסף כמו מספר טבלה או כותרת מקטע.',
      remediation: {
        goalHe: 'כל הפניה במסמך מזהה את היעד בשם או במספר, לא רק במיקום או בצבע.',
        instruction: 'Rewrite "ראה בטבלה מימין" as "ראה טבלה 3 — פירוט העלויות". Number tables and figures and refer to them by number.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D06',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.4.1',
      criterionNameHe: 'שימוש בצבע',
      descriptionHe:
        'צבע אינו האמצעי החזותי היחיד להעברת מידע, לסימון פעולה או להבחנה בפרט חזותי. אין הכוונה לאסור שימוש בצבע לצורכי עיצוב, אלא רק לאסור שימוש בצבע כאמצעי היחיד להעברת מידע.',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'צבע אינו האמצעי החזותי היחיד להעברת מידע, לסימון פעולה או להבחנה בפרט חזותי. שימוש בצבע לצורכי עיצוב מותר.',
      appliesTo: DOC_TARGETS,
      method: 'llm',
      axeRules: [],
      customRules: ['doc-color-only'],
      applicability: 'hasColorCodedContent',
      evidenceSlice: 'documentText',
      rubricHe:
        'אתר מידע שמובחן בצבע בלבד: שורות מודגשות בטבלה, מקרא גרף לפי צבע, טקסט אדום שמסמן שינוי. כשל אם אין סימן נוסף — טקסט, סמל או דפוס.',
      remediation: {
        goalHe: 'לכל הבחנה צבעונית במסמך מתלווה סימן שאינו צבע.',
        instruction: 'Add a text label, symbol, or pattern next to every colour-coded distinction. In charts, use patterns or direct labels rather than a colour-only legend.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D07',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.4.3',
      criterionNameHe: 'ניגודיות',
      descriptionHe:
        'בהצגה חזותית של טקסט ושל תמונות טקסט מתקיים יחס ניגודיות של 4.5:1 לפחות, ובטקסט גדול יחס ניגודיות של 3:1 לפחות. בתמונות סמליל (לוגו) — עבור טקסט שהוא חלק מסמליל או משם מותג — אין דרישת מינימום ליחס ניגודיות.',
      level: 'AA',
    },
    engine: {
      part: 2,
      summaryHe:
        'יחס ניגודיות של 4.5:1 לפחות לטקסט רגיל, ו-3:1 לפחות לטקסט גדול. טקסט שהוא חלק מלוגו או משם מותג פטור מהדרישה.',
      appliesTo: DOC_TARGETS,
      method: 'auto',
      axeRules: [],
      customRules: ['doc-contrast'],
      applicability: 'hasTextContent',
      evidenceSlice: 'documentText',
      rubricHe:
        'חושב לפי ספי §3.6 של חלק 2: במסמכי עיבוד תמלילים טקסט גדול הוא 14 נקודות ומעלה מודגש, או 18 נקודות ומעלה. שים לב שהספים שונים מאלה של דפי אינטרנט.',
      remediation: {
        goalHe: 'כל טקסט במסמך עומד ביחס הניגודיות הנדרש.',
        instruction:
          'Darken text or lighten backgrounds. Watch out for light-grey body text and for text placed over a photograph or a coloured table fill — both are frequent failures. Remember the document thresholds (14pt bold / 18pt), which are not the web ones.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D08',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 1: ניתן לתפיסה בחושים',
      criterionNo: '1.4.5',
      criterionNameHe: 'תמונות טקסט',
      descriptionHe:
        'העברת מידע תיעשה באמצעות טקסט ולא באמצעות תמונות טקסט. אין להציג תמונות טקסט, כגון צילומי מסך של טקסט, עמודים או פסקאות, אלא את הטקסט עצמו. אין להשתמש בקבצים סרוקים. עבור טקסט שאינו ניתן להצגה אלא כתמונה, יש לספק גם הסבר. קריטריון זה אינו חל על טקסט המהווה חלק מסמליל (לוגו).',
      level: 'AA',
    },
    engine: {
      part: 2,
      summaryHe:
        'העברת מידע תיעשה בטקסט ולא בתמונות טקסט, ואין להשתמש בקבצים סרוקים. טקסט שאינו ניתן להצגה אלא כתמונה ילווה בהסבר; טקסט בלוגו פטור.',
      appliesTo: DOC_TARGETS,
      method: 'hybrid',
      axeRules: [],
      customRules: ['doc-scanned-detect', 'doc-text-image'],
      applicability: 'hasTextImages',
      evidenceSlice: 'documentText',
      rubricHe:
        'כשל ודאי: מסמך סרוק ללא שכבת טקסט — התקן אוסר זאת מפורשות. כשל נוסף: צילומי מסך של טקסט או טבלאות, עמודים שהוטמעו כתמונה. לוגו פטור.',
      remediation: {
        goalHe: 'המסמך מכיל טקסט אמיתי; אין קבצים סרוקים ואין צילומי מסך של טקסט.',
        instruction:
          'Rebuild scanned documents from the source file. Where no source exists, run OCR and then proof-read the result — unproofed Hebrew OCR is unreliable and an unchecked text layer is not compliance. Replace screenshots of tables with real tables.',
        effort: 'high',
      },
    },
  },
  {
    id: 'D09',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 2: ניתן לתפעול',
      criterionNo: '2.4.2',
      criterionNameHe: 'שם המסמך',
      descriptionHe:
        'שם המסמך יהיה בעל משמעות. ניתן לממש זאת באמצעות שם הקובץ או לחלופין באמצעות כותרת. אופן גיוות הכותרת משתנה בין סוג מסמך אחד לסוג מסמך אחר.',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'שם המסמך יהיה בעל משמעות. ניתן לממש זאת באמצעות שם הקובץ או באמצעות כותרת המסמך.',
      appliesTo: DOC_TARGETS,
      method: 'hybrid',
      axeRules: [],
      customRules: ['doc-title'],
      applicability: 'always',
      evidenceSlice: 'documentStructure',
      rubricHe:
        'בדוק את מאפיין ה-Title של המסמך ואת שם הקובץ. התקן מקבל כל אחד מהשניים. כשל: שם קובץ כמו "doc1.pdf", "scan_0012.pdf", "final_v3.docx" יחד עם Title ריק. ב-PDF יש לוודא גם שהמציג מוגדר להציג את הכותרת ולא את שם הקובץ (DisplayDocTitle).',
      remediation: {
        goalHe: 'למסמך שם או כותרת שמתארים את תוכנו.',
        instruction:
          'Set the document Title property (Word: קובץ → מידע → כותרת) and give the file a descriptive name. For PDF, also set `/ViewerPreferences /DisplayDocTitle true` so readers announce the title instead of the filename.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D10',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 2: ניתן לתפעול',
      criterionNo: '2.4.4',
      criterionNameHe: 'תכלית הקישור',
      descriptionHe:
        'תכליתו של כל קישור תהיה ברורה מטקסט הקישור או מהטקסט המלווה אותו ומההקשר שהוא נתון בו. יוצאים מכלל זה מקרים שבהם תכלית הקישור אינה ברורה לאיש.',
      level: 'A',
    },
    engine: {
      part: 2,
      summaryHe:
        'תכלית כל קישור תהיה ברורה מטקסט הקישור או מהטקסט המלווה ומההקשר. קישור המשולב בפסקה והכולל מילים כמו "לחץ כאן" מקיים את הדרישה אם הטקסט המלווה מבהיר אותה.',
      appliesTo: DOC_TARGETS,
      method: 'llm',
      axeRules: [],
      customRules: [],
      applicability: 'hasLinks',
      evidenceSlice: 'documentText',
      rubricHe:
        'עבור כל קישור במסמך: האם מטרתו ברורה מהטקסט או מהמשפט שסביבו? שים לב שחלק 2 מקל כאן במפורש — "לחץ כאן" בתוך משפט מבהיר אינו כשל. קישור שטקסטו כתובת URL ארוכה ללא הקשר הוא כשל.',
      remediation: {
        goalHe: 'תכלית כל קישור ברורה מהטקסט או מההקשר שסביבו.',
        instruction: 'Give links descriptive display text rather than a raw URL. Where the visible text is generic, make sure the surrounding sentence names the destination.',
        effort: 'low',
      },
    },
  },
  {
    id: 'D11',
    form: {
      sourceRow: 0,
      guidelineHe: 'עקרון 2: ניתן לתפעול',
      criterionNo: '2.4.6',
      criterionNameHe: 'כותרות ותוויות',
      descriptionHe:
        'כותרות ותוויות המשמשות לתיאור נושא או תכלית. טקסט שאינו משמש להגדרת הנושא או תכלית התוכן שיבוא אחריו — לדוגמה פסקה או משפט — אין לסמנו ככותרת.',
      level: 'AA',
    },
    engine: {
      part: 2,
      summaryHe:
        'כותרות ותוויות משמשות לתיאור נושא או תכלית. אין לסמן ככותרת טקסט שאינו מגדיר את הנושא של התוכן שיבוא אחריו.',
      appliesTo: DOC_TARGETS,
      method: 'llm',
      axeRules: [],
      customRules: [],
      applicability: 'hasHeadingsOrLists',
      evidenceSlice: 'documentStructure',
      rubricHe:
        'שים לב לכיוון הכשל הייחודי כאן: לא רק כותרת שאינה מתארת, אלא גם פסקה שלמה או משפט שסומנו בטעות בסגנון כותרת. שניהם כשל.',
      remediation: {
        goalHe: 'סגנון כותרת מוחל רק על כותרות אמיתיות, והן מתארות את המקטע.',
        instruction: 'Remove heading styles from paragraphs that were styled as headings for their looks, and rewrite vague headings to name their section.',
        effort: 'low',
      },
    },
  },
];

/**
 * IS 5568 Part 2 §6 — complex information. Kept separate because it is a
 * standalone clause, not one of the WCAG-derived criteria.
 */
export const PART2_COMPLEX_INFO: CheckItem = {
  id: 'D12',
  form: {
    sourceRow: 0,
    guidelineHe: 'סעיף 6: מידע מורכב',
    criterionNo: '5568-2/6',
    criterionNameHe: 'מידע מורכב',
    descriptionHe:
      'מסמכים הכוללים מידע מורכב, לדוגמה תרשימים, משוואות, נוסחאות, גרפים וטבלאות מרובות שכבות, יְלוּוּ בתיאור חלופי טקסטואלי מקצועי ככל שניתן.',
    level: 'AA',
  },
  engine: {
    part: 2,
    summaryHe:
      'מסמכים הכוללים מידע מורכב — תרשימים, משוואות, נוסחאות, גרפים וטבלאות מרובות שכבות — ילוו בתיאור חלופי טקסטואלי מקצועי ככל שניתן.',
    appliesTo: DOC_TARGETS,
    method: 'llm',
    axeRules: [],
    customRules: ['doc-complex-info'],
    applicability: 'hasComplexImages',
    evidenceSlice: 'documentComplexInfo',
    rubricHe:
      'אתר מידע מורכב: גרפים, תרשימים, נוסחאות, וטבלאות מרובות שכבות (כותרות מקוננות, תאים ממוזגים). עבור כל אחד — האם קיים תיאור טקסטואלי מקצועי שמעביר את אותו מידע? טקסט חלופי קצר בן כמה מילים אינו מספיק לגרף — נדרש תיאור שמאפשר להסיק את אותן מסקנות.',
    remediation: {
      goalHe: 'לכל מידע מורכב תיאור טקסטואלי מקצועי המעביר את אותו מידע.',
      instruction:
        'Next to each chart, add a text description covering the trend, the extremes and the conclusion, or provide the underlying data as a real table. Write equations in a formula editor (MathML/OMML) rather than pasting them as images. Flatten multi-layer tables into several simple tables where possible.',
      effort: 'high',
    },
  },
};

/**
 * Israeli legal additions. Not WCAG criteria and not in the check sheet — these
 * come from the Equal Rights Regulations and are reported in their own section
 * so nobody mistakes them for standard rows.
 *
 * `IL05` deliberately checks that the accessibility widget behaves as a
 * *preferences* tool. An overlay that rewrites the DOM and claims to make the
 * site compliant is a liability, not a fix — the FTC fined accessiBe $1M in
 * April 2025 over exactly that claim.
 */
export const ISRAELI_ITEMS: CheckItem[] = [
  {
    id: 'IL01',
    form: {
      sourceRow: 0,
      guidelineHe: 'תוספת ישראלית — תקנות שוויון זכויות',
      criterionNo: 'IL-1',
      criterionNameHe: 'הצהרת נגישות',
      descriptionHe:
        'באתר מתפרסמת הצהרת נגישות הנגישה מכל עמוד, הכוללת את רמת הנגישות, אמצעי הנגישות שבוצעו, מגבלות נגישות ידועות, פרטי רכז הנגישות, דרך פנייה בנושא נגישות, תאריך הביקורת האחרונה ותאריך עדכון ההצהרה.',
      level: 'A',
    },
    engine: {
      part: 'IL',
      summaryHe:
        'באתר מתפרסמת הצהרת נגישות הנגישה מכל עמוד. ההצהרה כוללת את רמת הנגישות, האמצעים שבוצעו, מגבלות ידועות, פרטי רכז הנגישות, דרך פנייה ותאריכי ביקורת ועדכון.',
      appliesTo: ['page'],
      method: 'hybrid',
      axeRules: [],
      customRules: ['accessibility-statement'],
      applicability: 'always',
      evidenceSlice: 'siteConsistency',
      rubricHe:
        'בדוק: (1) קיים קישור להצהרת נגישות בכל עמוד, בדרך כלל בכותרת התחתונה; (2) עמוד ההצהרה קיים ונטען; (3) הוא מכיל את שבעת הפריטים הנדרשים. היעדר מגבלות נגישות ידועות או היעדר תאריך ביקורת הם ממצאי הביקורת הנפוצים ביותר בסעיף זה.',
      remediation: {
        goalHe: 'הצהרת נגישות מלאה, מקושרת מכל עמוד באתר.',
        instruction:
          'Publish an accessibility statement covering all seven required items and link it from the footer of every page. If there are no known limitations, say so explicitly — an empty limitations section reads as an omission. Keep the audit date current.',
        hebrewStrings: { statementLink: 'הצהרת נגישות', statementHeading: 'הצהרת נגישות' },
        effort: 'medium',
      },
    },
  },
  {
    id: 'IL02',
    form: {
      sourceRow: 0,
      guidelineHe: 'תוספת ישראלית — תקנות שוויון זכויות',
      criterionNo: 'IL-2',
      criterionNameHe: 'פרטי רכז נגישות ודרך פנייה',
      descriptionHe:
        'מפורסמים שם רכז הנגישות ודרכי התקשרות עמו — טלפון ודואר אלקטרוני — לצורך פניות וטיפול בתלונות בנושא נגישות.',
      level: 'A',
    },
    engine: {
      part: 'IL',
      summaryHe:
        'מפורסמים שם רכז הנגישות ודרכי ההתקשרות עמו, טלפון ודואר אלקטרוני. הפרטים משמשים לפניות ולטיפול בתלונות נגישות.',
      appliesTo: ['page'],
      method: 'hybrid',
      axeRules: [],
      customRules: ['coordinator-contact'],
      applicability: 'always',
      evidenceSlice: 'siteConsistency',
      rubricHe:
        'בדוק שבהצהרת הנגישות מופיעים שם רכז נגישות ולפחות שתי דרכי התקשרות. שים לב שחובת מינוי רכז חלה על גוף ציבורי או מעסיק של 25 עובדים ומעלה; באתר קטן יותר די בדרך פנייה בנושא נגישות.',
      remediation: {
        goalHe: 'פרטי רכז הנגישות ודרכי פנייה מפורסמים באתר.',
        instruction: 'Add the coordinator\'s name, phone and email to the accessibility statement. Route incoming accessibility complaints to them — the 60-day cure clock starts when a fix notice arrives.',
        effort: 'low',
      },
    },
  },
  {
    id: 'IL03',
    form: {
      sourceRow: 0,
      guidelineHe: 'תוספת ישראלית — תקן 5568 חלק 1',
      criterionNo: 'IL-3',
      criterionNameHe: 'הצהרת כיוון כתיבה RTL',
      descriptionHe:
        'בתוכן בעברית או בערבית מוגדר כיוון הכתיבה באמצעות dir="rtl", וקטעים בשפה משמאל-לימין בתוך הטקסט מסומנים ב-dir="ltr".',
      level: 'A',
    },
    engine: {
      part: 'IL',
      summaryHe:
        'בתוכן בעברית או בערבית מוגדר כיוון הכתיבה ב-dir="rtl". קטעים בשפה משמאל-לימין בתוך הטקסט — מספרי טלפון, תעודת זהות ודוא"ל — מסומנים ב-dir="ltr".',
      appliesTo: ['page'],
      method: 'hybrid',
      axeRules: [],
      customRules: ['hebrew-lang-dir', 'ltr-island-marked'],
      applicability: 'hasTextContent',
      evidenceSlice: 'language',
      rubricHe:
        'בדוק קיום dir="rtl" בתוכן עברי, ואיים של תוכן LTR — מספרי טלפון, ת"ז, מספרי הזמנה, כתובות דוא"ל, מונחים באנגלית — שאינם מסומנים ב-dir="ltr" ולכן מוצגים בסדר שגוי.',
      remediation: {
        goalHe: 'כיוון הכתיבה מוצהר, ואיי LTR בתוך טקסט עברי מסומנים.',
        instruction:
          'Set `dir="rtl"` on `<html>`. Wrap LTR content inside Hebrew text with `<span dir="ltr">`, especially phone numbers, ID numbers and order references, which bidi otherwise renders in the wrong order. Use CSS logical properties (`margin-inline-start`, `inset-inline-end`) instead of `left`/`right`.',
        effort: 'low',
      },
    },
  },
  {
    id: 'IL04',
    form: {
      sourceRow: 0,
      guidelineHe: 'תוספת ישראלית — תקנות שוויון זכויות',
      criterionNo: 'IL-4',
      criterionNameHe: 'הודעות ושגיאות בעברית',
      descriptionHe:
        'בתוכן המיועד לקהל דובר עברית, מחרוזות הממשק, הודעות השגיאה והשמות הנגישים מוצגים בעברית.',
      level: 'A',
    },
    engine: {
      part: 'IL',
      summaryHe:
        'בתוכן המיועד לקהל דובר עברית, מחרוזות הממשק והודעות השגיאה מוצגות בעברית. הדבר חל גם על שמות נגישים המיועדים לקוראי מסך.',
      appliesTo: ['page'],
      method: 'hybrid',
      axeRules: [],
      customRules: ['hebrew-ui-strings'],
      applicability: 'hasTextContent',
      evidenceSlice: 'language',
      rubricHe:
        'אתר שמות נגישים והודעות באנגלית בעמוד עברי: aria-label="close", "Submit", "Required field". שמות מותג ומונחים טכניים מקובלים אינם כשל.',
      remediation: {
        goalHe: 'כל מחרוזות הממשק והשגיאות בעברית בעמודים בעברית.',
        instruction: 'Translate accessible names, button labels and validation messages to Hebrew. Screen-reader users hear the accessible name, so an English `aria-label` on a Hebrew page is read out in English.',
        effort: 'low',
      },
    },
  },
  {
    id: 'IL05',
    form: {
      sourceRow: 0,
      guidelineHe: 'תוספת ישראלית — תקנה 35',
      criterionNo: 'IL-5',
      criterionNameHe: 'רכיב העדפות נגישות',
      descriptionHe:
        'באתר קיים רכיב המאפשר למשתמש לשנות העדפות תצוגה — ניגודיות, גודל טקסט, מרווח שורות, הדגשת קישורים ועצירת אנימציות — הנגיש במקלדת. הרכיב הוא כלי העדפות משתמש ואינו מתיימר להנגיש את האתר בעצמו.',
      level: 'A',
    },
    engine: {
      part: 'IL',
      summaryHe:
        'באתר קיים רכיב העדפות נגישות הנגיש במקלדת, המאפשר שינוי ניגודיות, גודל טקסט, מרווח שורות והדגשת קישורים. הרכיב הוא כלי העדפות ואינו תחליף להנגשת האתר עצמו.',
      appliesTo: ['page'],
      method: 'hybrid',
      axeRules: [],
      customRules: ['a11y-widget-present', 'a11y-widget-keyboard', 'overlay-antipattern'],
      applicability: 'always',
      evidenceSlice: 'siteConsistency',
      rubricHe:
        'בדוק: (1) קיים רכיב העדפות נגישות; (2) ניתן להגיע אליו ולהפעילו במקלדת; (3) הוא אינו תוסף overlay שמצהיר שהוא הופך את האתר לנגיש. רכיב שמזריק alt אוטומטי או משכתב ARIA הוא סיכון משפטי ולא תיקון — יש לסמנו כממצא.',
      remediation: {
        goalHe: 'רכיב העדפות נגישות נגיש במקלדת, ללא הצהרות תאימות שווא.',
        instruction:
          'Ship a preferences widget that only toggles CSS classes on `<html>` — contrast, text size, line spacing, link highlighting, reduced motion — reachable by keyboard (Alt+A detected via `e.code`, not `e.key`). Do not use a third-party overlay that claims to make the site compliant. See `references/widget-implementation.md` in the israeli-accessibility-compliance skill for a full implementation.',
        effort: 'high',
      },
    },
  },
  {
    id: 'IL06',
    form: {
      sourceRow: 0,
      guidelineHe: 'תוספת ישראלית — תקנות שוויון זכויות',
      criterionNo: 'IL-6',
      criterionNameHe: 'הודעה על ביצוע התאמות נגישות',
      descriptionHe:
        'בוצעו בשירות האינטרנט התאמות נגישות לפי התקנות, יצוין במקום בולט לעין באתר כי בוצעו בו התאמות נגישות עבור אנשים עם מוגבלות.',
      level: 'A',
    },
    engine: {
      part: 'IL',
      summaryHe:
        'כאשר בוצעו התאמות נגישות, יצוין הדבר במקום בולט לעין באתר. הדרישה מופיעה בהוראות טופס הבדיקה הרשמי.',
      appliesTo: ['page'],
      method: 'hybrid',
      axeRules: [],
      customRules: ['accessibility-notice-visible'],
      applicability: 'always',
      evidenceSlice: 'siteConsistency',
      rubricHe:
        'בדוק שקיים ציון גלוי לעין — סמל נגישות, קישור "הצהרת נגישות" בכותרת התחתונה או רכיב ההעדפות — שמודיע שבוצעו התאמות נגישות. הודעה שמופיעה רק בעמוד פנימי שאינו מקושר אינה "בולטת לעין".',
      remediation: {
        goalHe: 'ציון גלוי באתר על ביצוע התאמות הנגישות.',
        instruction: 'Put an accessibility link or icon in the footer of every page, visible without scrolling through a menu, pointing at the accessibility statement.',
        effort: 'low',
      },
    },
  },
];

export const NON_FORM_ITEMS: CheckItem[] = [...PART2_ITEMS, PART2_COMPLEX_INFO, ...ISRAELI_ITEMS];
