/**
 * Applicability probes — the "לא רלוונטי" decision.
 *
 * This is the part of an accessibility report that is most often abused. A tool
 * that marks a criterion Not Applicable because it could not test it produces a
 * clean-looking report that means nothing. The rule here is strict and
 * one-directional:
 *
 *     NA means the subject the criterion governs is ABSENT from this target.
 *     It never means "we could not tell".
 *
 * A page with no video makes the caption criteria NA. A page with video whose
 * captions we cannot verify is *not* NA — it goes to the LLM layer, or comes
 * back as a fail. Every NA carries a Hebrew reason naming the count that was
 * zero, so a reviewer can audit the decision.
 */

import type { ApplicabilityProbe } from '@ai5568/criteria';
import type { PageEvidence } from '../crawl/browser.ts';

export interface ApplicabilityVerdict {
  applicable: boolean;
  /** Why it does not apply. Goes straight into the report's findings column. */
  reasonHe?: string;
}

const APPLICABLE: ApplicabilityVerdict = { applicable: true };

function na(reasonHe: string): ApplicabilityVerdict {
  return { applicable: false, reasonHe };
}

/**
 * The counts the page probe emits, as a closed contract.
 *
 * Typed rather than a loose `Record<string, number>` on purpose: an absent key
 * would read as `0`, and `0` means "subject absent" — which means a probe bug
 * or a renamed field would silently turn criteria into "לא רלוונטי" instead of
 * failing loudly. Every field is required, so a change on the probe side breaks
 * the build here rather than quietly weakening the audit.
 */
export interface Counts {
  images: number;
  linkedImages: number;
  decorativeCandidates: number;
  complexImages: number;
  embeddedMedia: number;
  audioOnly: number;
  videoElements: number;
  timeBasedMedia: number;
  captcha: number;
  autoplayAudio: number;
  headings: number;
  lists: number;
  tables: number;
  forms: number;
  formControls: number;
  highStakesForms: number;
  validationSignals: number;
  focusable: number;
  timeLimits: number;
  movingContent: number;
  flashCandidates: number;
  links: number;
  foreignRuns: number;
  iframes: number;
  textLength: number;
  colourCoded: number;
  sensoryInstructions: number;
  textImages: number;
  sections: number;
  repeatedBlocks: number;
  /** Added by the scan, not the page probe — site-level rows need it. */
  sitePageCount: number;
}

const COUNT_KEYS: (keyof Counts)[] = [
  'images', 'linkedImages', 'decorativeCandidates', 'complexImages', 'embeddedMedia', 'audioOnly',
  'videoElements', 'timeBasedMedia', 'captcha', 'autoplayAudio', 'headings', 'lists', 'tables',
  'forms', 'formControls', 'highStakesForms', 'validationSignals', 'focusable', 'timeLimits',
  'movingContent', 'flashCandidates', 'links', 'foreignRuns', 'iframes', 'textLength',
  'colourCoded', 'sensoryInstructions', 'textImages', 'sections', 'repeatedBlocks',
];

/**
 * Validates the probe's output against the contract above.
 *
 * A missing key is a defect in the probe, and the honest response is to say so
 * — not to substitute a zero that would read as "this criterion does not apply".
 */
export function toCounts(raw: Record<string, unknown> | undefined, sitePageCount: number): Counts {
  const out = { sitePageCount } as Counts;
  const missing: string[] = [];
  for (const key of COUNT_KEYS) {
    const value = raw?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missing.push(key);
      out[key] = 0;
      continue;
    }
    out[key] = value;
  }
  if (missing.length) {
    throw new Error(
      `Page probe did not report these counts: ${missing.join(', ')}. ` +
        `Treating them as zero would mark criteria "לא רלוונטי" on no evidence — fix probes/page-probe.js instead.`,
    );
  }
  return out;
}

/**
 * Each probe reads the counts block the page probe produced. Keeping the
 * decision keyed to an explicit number (rather than re-querying the DOM) is
 * what makes "why was this NA?" answerable after the fact.
 */
type ProbeFn = (counts: Counts, evidence: PageEvidence) => ApplicabilityVerdict;

const PROBES: Record<ApplicabilityProbe, ProbeFn> = {
  always: () => APPLICABLE,

  hasImages: (c) => (c.images > 0 ? APPLICABLE : na('לא נמצאו תמונות בעמוד')),
  hasLinkedImages: (c) => (c.linkedImages > 0 ? APPLICABLE : na('לא נמצאו תמונות המשמשות כקישור')),
  hasDecorativeCandidates: (c) => (c.decorativeCandidates > 0 ? APPLICABLE : na('לא נמצאו תמונות דקורטיביות')),
  hasComplexImages: (c) => (c.complexImages > 0 ? APPLICABLE : na('לא נמצאו תרשימים, גרפים או מידע מורכב')),

  hasEmbeddedMedia: (c) => (c.embeddedMedia > 0 ? APPLICABLE : na('לא נמצאה מולטימדיה משובצת בעמוד')),
  hasAudioOnly: (c) => (c.audioOnly > 0 ? APPLICABLE : na('לא נמצאו רכיבי אודיו בעמוד')),
  // A <video> element cannot be split into "with sound" and "without sound"
  // from markup alone, so both video probes fire on the same population and the
  // rubric carries the distinction. Marking one of them NA would be a guess.
  hasVideoOnly: (c) => (c.videoElements > 0 ? APPLICABLE : na('לא נמצאו רכיבי וידאו בעמוד')),
  hasVideoWithAudio: (c) => (c.videoElements > 0 ? APPLICABLE : na('לא נמצאו רכיבי וידאו בעמוד')),
  hasTimeBasedMedia: (c) => (c.timeBasedMedia > 0 ? APPLICABLE : na('לא נמצאה מדיה מבוססת-זמן בעמוד')),
  hasCaptcha: (c) => (c.captcha > 0 ? APPLICABLE : na('לא נמצא רכיב CAPTCHA בעמוד')),
  hasAutoplayAudio: (c) => (c.autoplayAudio > 0 ? APPLICABLE : na('לא נמצא אודיו המתנגן אוטומטית בעמוד')),

  hasHeadingsOrLists: (c) => (c.headings > 0 || c.lists > 0 ? APPLICABLE : na('לא נמצאו כותרות או רשימות בעמוד')),
  // Criterion 2.4.6 covers headings *and* labels, so a page with a form but no
  // headings is still in scope — keying it to headings alone would wrongly
  // excuse exactly the pages where unclear labels do the most damage.
  hasHeadingsOrLabels: (c) =>
    c.headings > 0 || c.formControls > 0 ? APPLICABLE : na('לא נמצאו כותרות או תוויות בעמוד'),
  hasTables: (c) => (c.tables > 0 ? APPLICABLE : na('לא נמצאו טבלאות בעמוד')),
  hasSections: (c) => (c.sections > 0 || c.textLength > 400 ? APPLICABLE : na('העמוד אינו מחולק למקטעי תוכן')),

  hasForms: (c) => (c.formControls > 0 ? APPLICABLE : na('לא נמצאו שדות טופס בעמוד')),
  hasFormsWithValidation: (c) =>
    c.formControls > 0 ? APPLICABLE : na('לא נמצאו שדות טופס בעמוד, ולכן אין קלט שניתן לזהות בו שגיאות'),
  hasHighStakesForm: (c) =>
    c.highStakesForms > 0
      ? APPLICABLE
      : na('לא נמצא טופס הגורר התחייבות משפטית, פעולה פיננסית או שינוי נתונים'),

  hasFocusableElements: (c) => (c.focusable > 0 ? APPLICABLE : na('לא נמצאו רכיבים הניתנים למיקוד בעמוד')),
  hasLinks: (c) => (c.links > 0 ? APPLICABLE : na('לא נמצאו קישורים בעמוד')),

  hasTimeLimit: (c) => (c.timeLimits > 0 ? APPLICABLE : na('לא נמצאה הגבלת זמן, ריענון אוטומטי או טיימר בעמוד')),
  hasMovingContent: (c) => (c.movingContent > 0 ? APPLICABLE : na('לא נמצא תוכן נע, מהבהב או מתעדכן אוטומטית')),
  hasFlashingCandidates: (c) =>
    c.flashCandidates > 0 ? APPLICABLE : na('לא נמצאו אנימציות מהירות או תוכן מהבהב בעמוד'),

  hasRepeatedBlocks: (c) =>
    // Any navigation, or simply enough links to constitute a repeated block.
    c.repeatedBlocks > 0 || c.links >= 5 ? APPLICABLE : na('לא נמצאו בלוקים חוזרים הדורשים מנגנון עקיפה'),

  hasForeignLanguageParts: (c) => (c.foreignRuns > 0 ? APPLICABLE : na('לא נמצאו קטעי טקסט בשפה זרה בעמוד')),
  hasIframes: (c) => (c.iframes > 0 ? APPLICABLE : na('לא נמצאו מסגרות (iframe) בעמוד')),
  hasCustomWidgets: (c) => (c.focusable > 0 ? APPLICABLE : na('לא נמצאו רכיבי ממשק בעמוד')),

  hasTextContent: (c) => (c.textLength > 50 ? APPLICABLE : na('העמוד אינו מכיל תוכן טקסטואלי ממשי')),
  hasColorCodedContent: (c) => (c.colourCoded > 0 ? APPLICABLE : na('לא נמצא תוכן שמובחן באמצעות צבע')),
  hasSensoryInstructions: (c) =>
    c.sensoryInstructions > 0 ? APPLICABLE : na('לא נמצאו הוראות המסתמכות על מאפיין חושי'),
  hasTextImages: (c) => (c.textImages > 0 ? APPLICABLE : na('לא נמצאו תמונות המכילות טקסט')),

  // Site-level criteria: meaningless on a single page, so they are decided once
  // per scan and stamped onto every page's row.
  isMultiPageSite: (c) => (c.sitePageCount > 1 ? APPLICABLE : na('נסרק עמוד יחיד בלבד; הקריטריון נבדק ברמת האתר')),
};

export function checkApplicability(
  probe: ApplicabilityProbe,
  counts: Counts,
  evidence: PageEvidence,
): ApplicabilityVerdict {
  const fn = PROBES[probe];
  if (!fn) {
    // An unmapped probe must never silently pass as applicable-and-passing.
    throw new Error(`Unknown applicability probe "${probe}" — add it to checks/applicability.ts`);
  }
  return fn(counts, evidence);
}

/** Counts the Python sidecar emits for a document, as a closed contract. */
export interface DocCounts {
  images: number;
  headings: number;
  lists: number;
  tables: number;
  links: number;
  paragraphs: number;
  textLength: number;
  sensoryPhrases: number;
  complexInfo: number;
  scannedPages: number;
  textImages: number;
  colouredRuns: number;
  contrastFailures: number;
}

const DOC_COUNT_KEYS: (keyof DocCounts)[] = [
  'images', 'headings', 'lists', 'tables', 'links', 'paragraphs', 'textLength',
  'sensoryPhrases', 'complexInfo', 'scannedPages', 'textImages', 'colouredRuns', 'contrastFailures',
];

/** Same discipline as `toCounts`: a missing key is a sidecar bug, not a zero. */
export function toDocCounts(raw: Record<string, unknown> | undefined): DocCounts {
  const out = {} as DocCounts;
  const missing: string[] = [];
  for (const key of DOC_COUNT_KEYS) {
    const value = raw?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missing.push(key);
      out[key] = 0;
      continue;
    }
    out[key] = value;
  }
  if (missing.length) {
    throw new Error(
      `Document analyser did not report these counts: ${missing.join(', ')}. ` +
        `Fix finalize() in sidecar/analyze_document.py rather than defaulting them to zero.`,
    );
  }
  return out;
}

/**
 * Applicability for a document target. Part 2 has a much narrower set of
 * subjects, and the facts come from the Python sidecar rather than a DOM.
 */
export function checkDocumentApplicability(
  probe: ApplicabilityProbe,
  facts: { counts: Record<string, unknown> },
): ApplicabilityVerdict {
  const c = toDocCounts(facts.counts);
  switch (probe) {
    case 'always':
      return APPLICABLE;
    case 'hasImages':
      return c.images > 0 ? APPLICABLE : na('לא נמצאו תמונות במסמך');
    case 'hasComplexImages':
      return c.complexInfo > 0 ? APPLICABLE : na('לא נמצא מידע מורכב במסמך — תרשימים, נוסחאות או טבלאות מרובות שכבות');
    case 'hasHeadingsOrLists':
      return c.headings > 0 || c.lists > 0 || c.paragraphs > 3
        ? APPLICABLE
        : na('המסמך אינו מכיל מבנה של כותרות או רשימות');
    case 'hasTables':
      return c.tables > 0 ? APPLICABLE : na('לא נמצאו טבלאות במסמך');
    case 'hasLinks':
      return c.links > 0 ? APPLICABLE : na('לא נמצאו קישורים במסמך');
    case 'hasTextContent':
      return c.textLength > 50 ? APPLICABLE : na('המסמך אינו מכיל טקסט הניתן לחילוץ');
    case 'hasColorCodedContent':
      return c.colouredRuns > 0 ? APPLICABLE : na('לא נמצא תוכן שמובחן באמצעות צבע במסמך');
    case 'hasSensoryInstructions':
      return c.sensoryPhrases > 0 ? APPLICABLE : na('לא נמצאו הוראות המסתמכות על מאפיין חושי במסמך');
    case 'hasTextImages':
      // A scanned page is by definition an image of text, so this probe must
      // stay applicable whenever the document has no real text layer.
      return c.textImages > 0 || c.scannedPages > 0 || c.textLength < 50
        ? APPLICABLE
        : na('לא נמצאו תמונות המכילות טקסט במסמך');
    default:
      return na('הקריטריון אינו חל על מסמכים');
  }
}
