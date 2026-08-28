/**
 * IS 5568 Part 2 rules, applied to the facts the Python sidecar extracts.
 *
 * Same contract as the page rules: `[]` = pass, `[…]` = fail, `null` = no
 * opinion (falls through to judgement).
 *
 * Where Part 2 differs from Part 1 on purpose, the difference is honoured here
 * rather than smoothed over — most visibly in 2.4.4, where Part 2 explicitly
 * says a "לחץ כאן" link inside an explanatory sentence *does* satisfy the
 * criterion, and in 3.6, where "large text" is 14pt bold / 18pt regular rather
 * than the web's pixel thresholds.
 */

import type { Finding } from '@ai5568/criteria';

export interface DocumentFacts {
  kind: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';
  url: string;
  fileName: string;
  bytes: number;
  title: string | null;
  language: string | null;
  tagged: boolean | null;
  displayDocTitle: boolean | null;
  pageCount: number;
  images: { page?: number; slide?: number; sheet?: string; alt: string | null; decorative: boolean; width: number; height: number; name?: string; fromStructTree?: boolean }[];
  headings: { level: number | null; text: string; page?: number; slide?: number; sheet?: string; style?: string; fake?: boolean; missing?: boolean; duplicate?: boolean; generic?: boolean; sizePt?: number; bold?: boolean }[];
  lists: { items: number; manual?: boolean; style?: string; text?: string; line?: number }[];
  tables: { rows: number; cols: number; headerRowMarked?: boolean; headerCells?: number; dataCells?: number; mergedCells?: number; firstRowText?: string; sheet?: string; slide?: number }[];
  links: { uri: string; text: string; generic: boolean; isUrlText: boolean; page?: number }[];
  textRuns: { text: string; sizePt?: number; bold?: boolean; large?: boolean; color?: string | null; page?: number; slide?: number; sheet?: string; cell?: string; line?: number; style?: string }[];
  contrastFailures: { page?: number; text: string; ratio: number; required: number; sizePt: number; bold: boolean; large: boolean }[];
  readingOrderIssues: { slide?: number; page?: number; issue: string }[];
  sensoryPhrases: { match: string; page?: number; slide?: number; sheet?: string; cell?: string; line?: number; context?: string }[];
  complexInfo: { match: string; context?: string; page?: number; slide?: number; sheet?: string }[];
  scannedPages: { page: number; coverage: number }[];
  textImages: { page?: number; width: number; height: number }[];
  colouredRuns: { text?: string; color: string; page?: number; sheet?: string; cell?: string }[];
  textLength: number;
  counts: Record<string, number>;
  notes: string[];
  error: string | null;
}

export type DocRuleFn = (facts: DocumentFacts) => Finding[] | null;

const MAX = 20;
const cap = (f: Finding[]): Finding[] => f.slice(0, MAX);

/** Human-readable location inside the document, for the findings column. */
function at(item: { page?: number; slide?: number; sheet?: string; cell?: string; line?: number }): string {
  if (item.sheet) return `גיליון "${item.sheet}"${item.cell ? `, תא ${item.cell}` : ''}`;
  if (item.slide) return `שקופית ${item.slide}`;
  if (item.page) return `עמוד ${item.page}`;
  if (item.line) return `שורה ${item.line}`;
  return 'המסמך';
}

export const DOCUMENT_RULES: Record<string, DocRuleFn> = {
  'doc-image-alt': (f) => {
    const findings: Finding[] = [];
    for (const img of f.images) {
      if (img.decorative) continue;
      const alt = (img.alt ?? '').trim();
      if (!alt) {
        findings.push({
          locator: at(img),
          snippet: img.name ?? undefined,
          reasonHe: `תמונה ללא טקסט חלופי${img.name ? ` (${img.name})` : ''}. אם התמונה מעבירה מידע — נדרש תיאור; אם היא דקורטיבית — יש לסמנה ככזו כדי שטכנולוגיה מסייעת תתעלם ממנה.`,
        });
      } else if (/\.(jpe?g|png|gif|svg|webp|emf|wmf)$/i.test(alt) || /^(image|picture|תמונה|graphic)\s*\d*$/i.test(alt)) {
        findings.push({
          locator: at(img),
          snippet: alt,
          reasonHe: `הטקסט החלופי "${alt}" הוא שם קובץ או תיאור גנרי ואינו מתאר את המידע שהתמונה מעבירה.`,
        });
      }
      if (findings.length >= MAX) break;
    }
    // A tagged PDF whose figures never appear in the structure tree has no alt
    // text at all, however many images the page objects contain.
    if (f.kind === 'pdf' && f.images.length > 0 && f.tagged === false) {
      findings.push({
        locator: 'המסמך',
        reasonHe: 'המסמך אינו מתויג (untagged PDF), ולכן אין בו כלל מבנה שיכול לשאת טקסט חלופי לתמונות.',
      });
    }
    return cap(findings);
  },

  'doc-heading-structure': (f) => {
    const findings: Finding[] = [];
    const real = f.headings.filter((h) => !h.fake && !h.missing);
    const fake = f.headings.filter((h) => h.fake);

    for (const h of fake) {
      findings.push({
        locator: at(h),
        snippet: h.text,
        reasonHe: `הטקסט "${h.text}" מעוצב ככותרת (${h.sizePt ? `${h.sizePt} נק'` : ''}${h.bold ? ', מודגש' : ''}) אך אינו מסומן בסגנון כותרת סמנטי. יש להחיל עליו סגנון "כותרת" במקום עיצוב ידני.`,
      });
      if (findings.length >= MAX) break;
    }

    // The standard exempts a single-heading document from the tagging duty, so
    // the hierarchy check only starts at two levels.
    const levels = real.map((h) => h.level).filter((l): l is number => typeof l === 'number');
    const distinct = new Set(levels);
    if (distinct.size > 1) {
      let previous = 0;
      for (const h of real) {
        if (typeof h.level !== 'number') continue;
        if (previous && h.level > previous + 1) {
          findings.push({
            locator: at(h),
            snippet: h.text,
            reasonHe: `דילוג ברמת הכותרות: "${h.text}" היא רמה ${h.level} ומופיעה אחרי רמה ${previous}. במסמך עם כמה רמות כותרת ההיררכיה חייבת להיות רציפה.`,
          });
        }
        previous = h.level;
      }
    }

    // PowerPoint: every slide needs a title, and titles should be distinct.
    for (const h of f.headings) {
      if (h.missing) {
        findings.push({ locator: at(h), reasonHe: 'לשקופית אין כותרת. כותרת שקופית היא מנגנון הניווט העיקרי במצגת עבור משתמשי קורא מסך.' });
      } else if (h.duplicate) {
        findings.push({ locator: at(h), snippet: h.text, reasonHe: `כותרת השקופית "${h.text}" חוזרת על עצמה ואינה מאפשרת להבחין בין השקופיות.` });
      } else if (h.generic) {
        findings.push({ locator: at(h), snippet: h.text, reasonHe: `שם הגיליון "${h.text}" הוא שם ברירת מחדל ואינו מתאר את תוכנו.` });
      }
      if (findings.length >= MAX) break;
    }

    return cap(findings);
  },

  'doc-list-structure': (f) => {
    const manual = f.lists.filter((l) => l.manual);
    if (manual.length === 0) return [];
    // Part 2 explicitly permits continuous, hierarchical manual numbering as an
    // alternative to semantic tagging — so only typed *bullets* are reported,
    // and numbering is left to the judgement layer to check for continuity.
    const bullets = manual.filter((l) => !l.text || /^\s*[-–—•*▪◦●·]/.test(l.text));
    return cap(
      bullets.map((l) => ({
        locator: at(l),
        snippet: l.text,
        reasonHe: 'פריט רשימה שנוצר בהקלדת תו תבליט ידני במקום ברשימה אוטומטית. קורא מסך לא יזהה אותו כרשימה ולא יכריז על מספר הפריטים.',
      })),
    );
  },

  'doc-reading-order': (f) => {
    const findings: Finding[] = f.readingOrderIssues.map((i) => ({
      locator: at(i),
      reasonHe: i.issue,
    }));
    if (f.kind === 'pdf' && f.tagged === false) {
      findings.push({
        locator: 'המסמך',
        reasonHe: 'המסמך אינו מתויג, ולכן אין בו סדר קריאה מוגדר כלל — טכנולוגיה מסייעת תקרא את התוכן לפי סדר האובייקטים בקובץ, שאינו בהכרח סדר התצוגה.',
      });
    }
    // Merged cells break linear cell-by-cell navigation in a spreadsheet.
    for (const t of f.tables) {
      if ((t.mergedCells ?? 0) > 0 && findings.length < MAX) {
        findings.push({
          locator: at(t),
          reasonHe: `נמצאו ${t.mergedCells} תאים ממוזגים. מיזוג תאים משבש את הניווט הליניארי בטבלה ואת התאמת הנתונים לכותרות.`,
        });
      }
    }
    return cap(findings);
  },

  'doc-contrast': (f) => {
    if (f.contrastFailures.length === 0) return [];
    return cap(
      f.contrastFailures.map((c) => ({
        locator: at(c),
        snippet: c.text,
        reasonHe: `יחס ניגודיות ${c.ratio}:1 בטקסט "${c.text}" (${c.sizePt} נק'${c.bold ? ', מודגש' : ''}) — נדרש ${c.required}:1. לפי סעיף 3.6 של חלק 2, טקסט גדול במסמך הוא 14 נק' מודגש או 18 נק' רגיל.`,
      })),
    );
  },

  'doc-color-only': (f) => {
    if (f.colouredRuns.length === 0) return [];
    // Colour in a document is usually decorative, and reporting every coloured
    // run would bury the report. The judgement layer decides whether the colour
    // carries meaning; this rule only supplies the candidates.
    return null;
  },

  'doc-scanned-detect': (f) => {
    if (f.scannedPages.length === 0) return [];
    const pages = f.scannedPages.map((p) => p.page).slice(0, 12).join(', ');
    return [
      {
        locator: `עמודים ${pages}${f.scannedPages.length > 12 ? ' ועוד' : ''}`,
        reasonHe:
          `זוהו ${f.scannedPages.length} עמודים סרוקים ללא שכבת טקסט. חלק 2 של התקן אוסר במפורש שימוש בקבצים סרוקים — ` +
          'התוכן אינו נגיש לקורא מסך, אינו ניתן לחיפוש ואינו ניתן להגדלה ללא איבוד איכות.',
      },
    ];
  },

  'doc-text-image': (f) => {
    if (f.textImages.length === 0) return [];
    return cap(
      f.textImages.map((t) => ({
        locator: at(t),
        snippet: `${t.width}×${t.height}`,
        reasonHe: `תמונה רחבה ונמוכה (${t.width}×${t.height}) החשודה כתמונת טקסט — באנר או כרזה. אם ניתן להציג את אותו מידע בטקסט חי, אין להשתמש בתמונת טקסט.`,
      })),
    );
  },

  'doc-title': (f) => {
    const findings: Finding[] = [];
    const title = (f.title ?? '').trim();
    const fileName = f.fileName.replace(/\.[^.]+$/, '');
    // The standard accepts *either* a meaningful title or a meaningful filename.
    const genericFileName = /^(doc|document|scan|img|file|final|copy|new|untitled|מסמך|סרוק|העתק)[\s_-]*\d*$/i.test(fileName) || /^\d+$/.test(fileName);

    if (!title && genericFileName) {
      findings.push({
        locator: 'מאפייני המסמך',
        snippet: f.fileName,
        reasonHe: `למסמך אין כותרת (Title) ושם הקובץ "${f.fileName}" אינו בעל משמעות. התקן דורש שלפחות אחד מהשניים יתאר את תוכן המסמך.`,
      });
    } else if (!title) {
      findings.push({
        locator: 'מאפייני המסמך',
        snippet: f.fileName,
        reasonHe: `למסמך אין מאפיין כותרת (Title). שם הקובץ "${f.fileName}" משמש כרגע כשם המסמך — מומלץ להגדיר כותרת מפורשת.`,
      });
    }

    // A PDF can carry a good title and still announce the filename instead.
    if (f.kind === 'pdf' && title && f.displayDocTitle === false) {
      findings.push({
        locator: 'ViewerPreferences',
        reasonHe: `למסמך יש כותרת ("${title}") אך ההגדרה DisplayDocTitle כבויה, ולכן קוראי PDF יציגו ויכריזו את שם הקובץ במקום את הכותרת.`,
      });
    }
    return cap(findings);
  },

  'doc-complex-info': (f) => {
    if (f.complexInfo.length === 0) return [];
    // Whether a chart already has an adequate professional description is a
    // judgement call, so the candidates go to the LLM rather than failing here.
    return null;
  },
};

export function runDocumentRule(id: string, facts: DocumentFacts): Finding[] | null {
  const rule = DOCUMENT_RULES[id];
  if (!rule) throw new Error(`Unknown document rule "${id}" — referenced by the catalogue but not implemented`);
  try {
    return rule(facts);
  } catch (err) {
    return [
      {
        locator: 'engine',
        reasonHe: `בדיקת המסמך "${id}" נכשלה טכנית: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}
