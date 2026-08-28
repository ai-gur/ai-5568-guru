/**
 * IS 5568 criteria catalogue — types.
 *
 * The catalogue has two layers that are deliberately kept apart:
 *
 *   1. FORM LAYER  — text copied verbatim out of the official check sheet
 *      (`sitedocs_internet_accessibility_form.xlsx`, tab `בדיקת נגישות לאינטרנט`).
 *      Filling that sheet is what Regulation 93(a) actually requires, so its
 *      numbering, Hebrew wording and Israeli level are authoritative and must
 *      never be paraphrased by us. Re-importing the form overwrites this layer.
 *
 *   2. ENGINE LAYER — how *we* decide the verdict for that row: which axe rules
 *      map onto it, what makes it Not Applicable, what evidence an LLM needs,
 *      and how to remediate. Lives in `overrides.ts`, keyed by row id, so a
 *      re-import of the form never destroys it.
 *
 * One form row is one report row. The sheet lists 1.1.1 four times (images,
 * embedded multimedia, time-based media, CAPTCHA) because those are four
 * separate things to check — collapsing them into a single "1.1.1" would lose
 * exactly the detail an auditor is looking for.
 */

/** What a check row can be run against. */
export type Target = 'page' | 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';

/** The three verdicts the report allows. */
export type Verdict = 'PASS' | 'FAIL' | 'NA';

/** Hebrew labels as they must appear in column `תוצאה` of the official form. */
export const VERDICT_HE: Record<Verdict, string> = {
  PASS: 'תקין',
  FAIL: 'לא תקין',
  NA: 'לא רלוונטי',
};

/** How a verdict was reached — surfaced as a badge so a reviewer knows what to spot-check. */
export type Method =
  | 'auto'        // deterministic rule (axe-core or one of our own); no judgement involved
  | 'ai'          // Claude assessed it from an evidence slice
  | 'auto+ai'     // rules ran clean, Claude checked the judgement part on top
  | 'na-probe';   // the subject the row governs is absent from this page/document

export const METHOD_HE: Record<Method, string> = {
  auto: 'אוטומטי',
  ai: 'בינה מלאכותית',
  'auto+ai': 'אוטומטי + בינה מלאכותית',
  'na-probe': 'בדיקת רלוונטיות',
};

/**
 * Which part of IS 5568 a row comes from.
 *   1  — Part 1, web pages (the form's own 42 rows)
 *   2  — Part 2, downloadable digital documents (PDF/Office)
 *  'IL'— Israeli legal additions that WCAG does not cover at all
 *        (accessibility statement, coordinator contact, Reg. 35 widget…)
 */
export type StandardPart = 1 | 2 | 'IL';

/** Text taken verbatim from the official check sheet. Do not edit by hand. */
export interface FormText {
  /** Source row in the sheet, e.g. 4 — used as the stable identity of a check. */
  sourceRow: number;
  /** Column A — the guideline this criterion sits under, short form. */
  guidelineHe: string;
  /** Column A — full guideline text, present only on the guideline's first row. */
  guidelineFullHe?: string;
  /** Column B — מס קריטריון, e.g. "1.1.1". Not unique across rows. */
  criterionNo: string;
  /** Column C — קריטריון בדיקה. */
  criterionNameHe: string;
  /** Column D — תאור הקריטריון, verbatim and complete. */
  descriptionHe: string;
  /** Column E — רמה נדרשת בישראל. Follows the sheet, which departs from WCAG in places. */
  level: 'A' | 'AA';
  /** Column G hyperlink — W3C techniques. */
  techniquesUrl?: string;
  /** Column H hyperlink — W3C "Understanding" page. */
  understandingUrl?: string;
}

/** Everything the engine needs in order to produce a verdict for a row. */
export interface EngineSpec {
  part: StandardPart;
  /**
   * Two-sentence maximum rendition of `descriptionHe`, for the report's
   * `תאור הקריטריון` column. Hand-authored, not machine-truncated — the full
   * text stays available in `form.descriptionHe`.
   */
  summaryHe: string;
  appliesTo: Target[];
  /**
   * `auto`   — a rule decides it outright; never sent to the LLM.
   * `hybrid` — rules catch the mechanical failures, the LLM judges the rest
   *            (e.g. an `alt` exists, but does it describe the image?).
   * `llm`    — no rule can decide this; judgement only.
   */
  method: 'auto' | 'hybrid' | 'llm';
  /** axe-core rule ids whose violations mean this row FAILs. */
  axeRules: string[];
  /** Our own rule ids (see engine/src/checks/custom-rules.ts). */
  customRules: string[];
  /** Applicability probe id. Returns NA + a Hebrew reason when the subject is absent. */
  applicability: ApplicabilityProbe;
  /** Which evidence slice to hand the LLM. Rows sharing a slice are batched into one call. */
  evidenceSlice: EvidenceSlice | null;
  /** The rubric Claude judges against — what specifically counts as a failure here. */
  rubricHe: string;
  /** How to fix it, used to build the remediation Markdown. */
  remediation: Remediation;
}

/**
 * A row is NA only when the thing it governs is absent. "No images on the page"
 * makes 1.1.1(a) NA; "images all have alt" makes it PASS. Conflating the two is
 * the classic way an audit report becomes worthless, so probes are explicit.
 */
export type ApplicabilityProbe =
  | 'always'              // never NA — e.g. page title, language, parsing
  | 'hasImages'
  | 'hasLinkedImages'
  | 'hasDecorativeCandidates'
  | 'hasComplexImages'
  | 'hasEmbeddedMedia'
  | 'hasAudioOnly'
  | 'hasVideoOnly'
  | 'hasVideoWithAudio'
  | 'hasTimeBasedMedia'
  | 'hasCaptcha'
  | 'hasAutoplayAudio'
  | 'hasHeadingsOrLists'
  | 'hasHeadingsOrLabels'
  | 'hasTables'
  | 'hasForms'
  | 'hasFormsWithValidation'
  | 'hasHighStakesForm'
  | 'hasFocusableElements'
  | 'hasTimeLimit'
  | 'hasMovingContent'
  | 'hasFlashingCandidates'
  | 'hasRepeatedBlocks'
  | 'hasLinks'
  | 'hasForeignLanguageParts'
  | 'hasIframes'
  | 'hasCustomWidgets'
  | 'hasTextContent'
  | 'hasColorCodedContent'
  | 'hasSensoryInstructions'
  | 'hasTextImages'
  | 'isMultiPageSite'
  | 'hasSections';

/**
 * Evidence slices. The whole DOM is far too much to send per criterion — and
 * sending it makes the model worse, not just more expensive. Each slice is a
 * focused projection of the page built by a probe in engine/src/probes.
 */
export type EvidenceSlice =
  | 'images'
  | 'media'
  | 'structure'        // heading tree, lists, tables, landmarks
  | 'readingOrder'     // DOM order vs geometric order
  | 'sensoryText'      // text referring to shape/colour/position/sound
  | 'colorUsage'
  | 'contrast'
  | 'textImages'
  | 'keyboard'
  | 'timing'
  | 'motion'
  | 'links'
  | 'navigation'
  | 'headingsLabels'
  | 'focusVisible'
  | 'language'
  | 'forms'
  | 'formErrors'
  | 'markupValidity'
  | 'ariaWidgets'
  | 'siteConsistency'   // cross-page: navigation order, component identity
  | 'documentStructure' // Part 2
  | 'documentText'
  | 'documentComplexInfo';

export interface Remediation {
  /** One-line statement of the end state the page must reach. */
  goalHe: string;
  /** Concrete instruction to a coding agent. Markdown, may contain code fences. */
  instruction: string;
  /** Hebrew UI strings the fix commonly needs, so the agent does not invent them. */
  hebrewStrings?: Record<string, string>;
  /** Rough implementation cost, used only to order the remediation file. */
  effort: 'low' | 'medium' | 'high';
}

/** A single row of the check sheet, fully specified. */
export interface CheckItem {
  /** Stable id, e.g. "R04". Derived from the source row so it survives re-imports. */
  id: string;
  form: FormText;
  engine: EngineSpec;
}

export interface Catalogue {
  /** Where the form text came from, so a report can cite its own provenance. */
  source: {
    file: string;
    sheet: string;
    importedAt: string;
    rowCount: number;
  };
  items: CheckItem[];
}

/** A finding: one concrete place where a check failed. */
export interface Finding {
  /** CSS selector, or a document locator like "page 3 / figure 2". */
  locator: string;
  /** Trimmed source snippet, so the reader can see what we saw. */
  snippet?: string;
  /** Why this specific element fails, in Hebrew — this is what goes in the report. */
  reasonHe: string;
}

/** The result of running one CheckItem against one target. */
export interface CheckResult {
  itemId: string;
  verdict: Verdict;
  method: Method;
  /** 0–1. Always 1 for `auto` and `na-probe`; the model's own estimate for `ai`. */
  confidence: number;
  findings: Finding[];
  /** For NA — why the row does not apply here. For PASS — what satisfied it. */
  noteHe?: string;
}

export const LEVELS = ['A', 'AA'] as const;

/** Sheet-declared level ordering, for "does this row apply at level A only?" filters. */
export function levelApplies(itemLevel: 'A' | 'AA', target: 'A' | 'AA'): boolean {
  return target === 'AA' ? true : itemLevel === 'A';
}
