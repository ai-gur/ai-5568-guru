/**
 * The judgement layer.
 *
 * Roughly two-thirds of the check sheet's rows cannot be decided by a rule —
 * "is the link's purpose clear from context?", "does this alt text describe the
 * image?", "do these instructions rely on colour alone?". Those rows go to
 * Claude with a narrow evidence slice and a rubric taken from the row itself.
 *
 * Three properties this layer is built to preserve:
 *
 *   Never upgrades a failure. A deterministic FAIL stays a FAIL; the model can
 *   only add detail. That precedence lives in verdict.ts and is not negotiable
 *   here.
 *
 *   Never invents locators. The model is instructed to cite selectors that
 *   appear in the slice, and any finding whose selector is not in the slice is
 *   dropped before it reaches the report. A report that points an engineer at
 *   an element that does not exist is worse than one that says nothing.
 *
 *   Never silently exceeds budget. Cost is estimated before each call and the
 *   run degrades to "unverified" rows rather than spending past the cap.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Catalogue, CheckItem, Finding, Verdict } from '@ai5568/criteria';
import type { PageBundle } from '../crawl/browser.ts';
import type { PendingJudgement } from '../verdict.ts';
import { buildSlice, estimateTokens, VISUAL_SLICES } from './evidence-slices.ts';
import type { SiteContext } from './custom-rules.ts';

export interface Judgement {
  verdict: Verdict;
  confidence: number;
  findings: Finding[];
  noteHe?: string;
}

const MODEL = 'claude-opus-5';
/** Published per-million-token prices for the model above. */
const PRICE_IN_PER_MTOK = 5;
const PRICE_OUT_PER_MTOK = 25;

/**
 * Thinking is on by default on this model, and `max_tokens` caps thinking plus
 * response text together — a budget sized only around the verdict JSON would
 * truncate mid-answer. `effort: 'low'` keeps that spend proportionate: this is
 * a bounded classification against an explicit rubric, not open-ended work.
 */
const MAX_OUTPUT_TOKENS = 8_000;
const EFFORT = 'low';
const MAX_SLICE_TOKENS = 24_000;

const SYSTEM_PROMPT = `אתה בודק נגישות מומחה, הבקיא בתקן הישראלי ת"י 5568 חלק 1 וחלק 2 ובהנחיות WCAG 2.0 ברמה AA.

תפקידך: להכריע עבור קריטריון בדיקה יחיד, על סמך הראיות שסופקו לך מעמוד אינטרנט או ממסמך, האם הוא "תקין", "לא תקין" או "לא רלוונטי".

כללי הכרעה מחייבים:

1. הכרע רק על סמך הראיות שסופקו. אל תשער מה עוד עשוי להיות בעמוד ואל תניח קיומם של רכיבים שאינם מופיעים בראיות.
2. כל ממצא חייב לצטט selector שמופיע כלשונו בראיות. אין להמציא selector, ואין להכליל ("כל הקישורים בעמוד"). אם אינך יכול להצביע על רכיב ספציפי — אל תדווח עליו כממצא.
3. "לא רלוונטי" מותר אך ורק כאשר הנושא שהקריטריון מסדיר נעדר לחלוטין מהראיות. אם הנושא קיים אך אינך בטוח אם הוא עומד בדרישה — זהו "לא תקין" בביטחון נמוך, ולא "לא רלוונטי".
4. אל תדווח ככשל על דבר שהקריטריון מתיר במפורש. קרא את הרובריקה בעיון — היא מגדירה מה נחשב כשל עבור קריטריון זה בדיוק.
5. שקול את ההקשר. לדוגמה, בקריטריון תכלית הקישור: טקסט "לחץ כאן" בתוך משפט שמבהיר את היעד מקיים את הדרישה.
6. הטקסט מיועד לקהל ישראלי — כתוב כל נימוק בעברית, בלשון עניינית וישירה, ותאר מה בדיוק שגוי ברכיב הספציפי.
7. ביטחון (confidence): 0.9 ומעלה כשהראיות חד-משמעיות; 0.6-0.8 כשההכרעה סבירה אך תלוית פרשנות; מתחת ל-0.6 כשהראיות דלות. אל תנפח את הביטחון.

החזר את התשובה כאובייקט JSON בלבד, לפי הסכימה שהוגדרה.`;

/**
 * Structured output schema. Every object needs `additionalProperties: false`
 * and a complete `required` list — the constrained-decoding layer rejects
 * schemas without them, and the whole point here is that a verdict cannot come
 * back in a shape the report has to guess at.
 */
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['PASS', 'FAIL', 'NA'],
      description: 'PASS = תקין, FAIL = לא תקין, NA = לא רלוונטי (רק כשהנושא נעדר לחלוטין מהראיות).',
    },
    confidence: { type: 'number', description: 'מידת הביטחון בהכרעה, בין 0 ל-1.' },
    findings: {
      type: 'array',
      description: 'הרכיבים הספציפיים שנכשלו. מערך ריק כאשר ההכרעה היא PASS או NA.',
      items: {
        type: 'object',
        properties: {
          locator: { type: 'string', description: 'ה-selector המדויק כפי שהוא מופיע בראיות.' },
          snippet: { type: 'string', description: 'הטקסט או הקוד הרלוונטי מהרכיב. מחרוזת ריקה אם אין.' },
          reasonHe: { type: 'string', description: 'מה בדיוק שגוי ברכיב זה, בעברית.' },
        },
        required: ['locator', 'snippet', 'reasonHe'],
        additionalProperties: false,
      },
    },
    noteHe: {
      type: 'string',
      description:
        'משפט אחד בעברית: עבור NA — מדוע הקריטריון אינו רלוונטי; עבור PASS — מה אימת את עמידתו; עבור FAIL — הערה כללית. מחרוזת ריקה אם אין.',
    },
  },
  required: ['verdict', 'confidence', 'findings', 'noteHe'],
  additionalProperties: false,
} as const;

interface CacheEntry {
  judgement: Judgement;
  model: string;
}

export interface JudgeOptions {
  apiKey: string;
  budgetUsd: number;
  /** Directory for the verdict cache. Reused across scans of the same site. */
  cacheDir: string;
  concurrency: number;
  site: SiteContext;
  onProgress?: (done: number, total: number, costUsd: number) => void;
}

export class ClaudeJudge {
  readonly stats = { calls: 0, costUsd: 0, cacheHits: 0, skippedForBudget: 0 };

  private readonly client: Anthropic;
  private readonly options: JudgeOptions;
  private readonly cache = new Map<string, CacheEntry>();
  private cacheLoaded = false;
  private site: SiteContext;

  constructor(options: JudgeOptions) {
    this.options = options;
    this.site = options.site;
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  /**
   * Supplies the cross-page view once the crawl has produced it.
   *
   * The judge is constructed before the crawl runs (it owns the budget and the
   * cache), but the site-level rows — title uniqueness, navigation consistency,
   * component identity — cannot be judged without the comparison set.
   */
  setSiteContext(site: SiteContext): void {
    this.site = site;
  }

  private get cachePath(): string {
    return join(this.options.cacheDir, 'judgements.json');
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const raw = JSON.parse(await readFile(this.cachePath, 'utf8')) as Record<string, CacheEntry>;
      for (const [key, value] of Object.entries(raw)) {
        // A cached verdict from a different model is not this model's verdict.
        if (value.model === MODEL) this.cache.set(key, value);
      }
    } catch {
      /* first run */
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await mkdir(dirname(this.cachePath), { recursive: true });
      await writeFile(this.cachePath, JSON.stringify(Object.fromEntries(this.cache), null, 0), 'utf8');
    } catch {
      /* cache is an optimisation; failing to persist it must not fail the scan */
    }
  }

  /**
   * Judges every pending row across every page.
   *
   * Work is keyed by (criterion, evidence hash), so pages sharing a template
   * resolve from one call — on a large site the same header, footer and nav
   * appear on every page and would otherwise be re-judged hundreds of times.
   */
  async judge(
    batch: { bundle: PageBundle; pending: PendingJudgement[] }[],
    catalogue: Catalogue,
  ): Promise<Map<string, Map<string, Judgement>>> {
    await this.loadCache();

    interface Task {
      url: string;
      item: CheckItem;
      pending: PendingJudgement;
      bundle: PageBundle;
      key: string;
    }

    const tasks: Task[] = [];
    for (const { bundle, pending } of batch) {
      for (const p of pending) {
        tasks.push({ url: bundle.url, item: p.item, pending: p, bundle, key: this.cacheKey(p, bundle) });
      }
    }

    const results = new Map<string, Map<string, Judgement>>();
    const record = (url: string, itemId: string, judgement: Judgement): void => {
      const perPage = results.get(url) ?? new Map<string, Judgement>();
      perPage.set(itemId, judgement);
      results.set(url, perPage);
    };

    // Group identical work so it is done once.
    const byKey = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = byKey.get(task.key) ?? [];
      list.push(task);
      byKey.set(task.key, list);
    }

    const unique = [...byKey.entries()];
    let done = 0;
    const total = unique.length;

    // Bounded concurrency: a simple worker pool over the unique work items.
    const queue = unique.slice();
    const workers = Array.from({ length: Math.max(1, this.options.concurrency) }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [key, group] = next;
        const first = group[0];
        if (!first) continue;

        const judgement = await this.resolve(key, first.item, first.pending, first.bundle, catalogue);
        for (const task of group) record(task.url, task.item.id, judgement);

        done++;
        this.options.onProgress?.(done, total, this.stats.costUsd);
      }
    });

    await Promise.all(workers);
    await this.saveCache();
    return results;
  }

  private async resolve(
    key: string,
    item: CheckItem,
    pending: PendingJudgement,
    bundle: PageBundle,
    catalogue: Catalogue,
  ): Promise<Judgement> {
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.cacheHits++;
      return cached.judgement;
    }

    const slice = this.sliceFor(item, pending, bundle);
    const promptTokens = estimateTokens(slice) + 900;
    const estimatedCost = (promptTokens / 1e6) * PRICE_IN_PER_MTOK + (MAX_OUTPUT_TOKENS / 1e6) * PRICE_OUT_PER_MTOK;

    if (this.stats.costUsd + estimatedCost > this.options.budgetUsd) {
      this.stats.skippedForBudget++;
      return {
        verdict: 'FAIL',
        confidence: 0,
        findings: pending.incomplete,
        noteHe: `תקציב הבדיקה (${this.options.budgetUsd}$) מוצה לפני שקריטריון זה נבדק. נדרשת בדיקה ידנית, או הרצה חוזרת עם --budget גבוה יותר.`,
      };
    }

    try {
      const judgement = await this.callModel(item, pending, bundle, slice, catalogue);
      this.cache.set(key, { judgement, model: MODEL });
      return judgement;
    } catch (err) {
      console.error(`[judge] ${item.id} on ${bundle.url}:`, err instanceof Error ? err.message : String(err));
      return {
        verdict: 'FAIL',
        confidence: 0,
        findings: pending.incomplete,
        /*
         * The reader is a site owner, not an operator of this service. A raw
         * provider error — status code, request id, JSON envelope — tells them
         * nothing they can act on and reads as the report breaking down. The
         * detail belongs in the log; the row still says honestly that it was not
         * checked, which is the part with consequences.
         */
        noteHe: 'הבדיקה האוטומטית של קריטריון זה לא הושלמה מסיבה טכנית, ולכן הוא אינו מדווח כתקין. נדרשת בדיקה ידנית.',
      };
    }
  }

  private sliceFor(item: CheckItem, pending: PendingJudgement, bundle: PageBundle): unknown {
    const base = item.engine.evidenceSlice ? buildSlice(item.engine.evidenceSlice, bundle) : {};

    if (item.engine.evidenceSlice === 'siteConsistency') {
      // Cross-page rows need the comparison set, which only the scan holds.
      const site = this.site;

      /*
       * 3.2.3 and 3.2.4 are scoped to "a set of Web pages". A translated site is
       * not one set: comparing "דלג לתוכן הראשי" against "Skip to main content"
       * reports the translation itself as an inconsistency, which is both wrong
       * and the kind of wrong that costs an operator a day. Comparison stays
       * inside the language of the page being judged.
       */
      const baseLang = (value: string | null | undefined): string =>
        (value ?? '').split('-')[0]?.toLowerCase() ?? '';
      const lang = baseLang(site.langs.get(bundle.url));
      const sameLanguage = (url: string): boolean => baseLang(site.langs.get(url)) === lang;

      const within = <T>(m: Map<string, T>, limit: number): [string, T][] =>
        [...m.entries()].filter(([url]) => sameLanguage(url)).slice(0, limit);

      return {
        /*
         * The page's own evidence, which the site-level rows need as much as any
         * other row: asked "is there a preferences widget?", a judge given only
         * titles and navigation sequences answers "not in the evidence" — about
         * a site whose widget the probe had already found and named. This branch
         * used to build that slice and then discard it.
         */
        ...(base as Record<string, unknown>),
        thisPage: bundle.url,
        pageLanguage: lang || null,
        comparisonScope: `עמודים בשפה ${lang || '(לא הוגדרה)'} בלבד`,
        pageCount: site.pageCount,
        titlesAcrossSite: within(site.titles, 40).map(([url, title]) => ({ url, title })),
        navigationSequences: within(site.navSequences, 15).map(([url, items]) => ({ url, items })),
        componentNamesPerPage: within(site.componentNames, 15).map(([url, names]) => ({ url, names: Object.fromEntries(names) })),
        accessibilityStatement: site.statementContent,
        hasSearch: site.hasSearch,
        hasSitemap: site.hasSitemap,
        hasBreadcrumbs: site.hasBreadcrumbs,
      };
    }

    void pending;
    return base;
  }

  private async callModel(
    item: CheckItem,
    pending: PendingJudgement,
    bundle: PageBundle,
    slice: unknown,
    catalogue: Catalogue,
  ): Promise<Judgement> {
    void catalogue;
    const sliceJson = truncateJson(slice, MAX_SLICE_TOKENS);

    const content: Anthropic.ContentBlockParam[] = [];

    const priorText =
      pending.priorFindings.length > 0
        ? `\n\nממצאים שכבר אותרו על ידי הבדיקות האוטומטיות עבור קריטריון זה (הם עומדים בעינם — תפקידך להוסיף עליהם, לא לבטלם):\n` +
          pending.priorFindings.map((f) => `- ${f.locator}: ${f.reasonHe}`).join('\n')
        : '';

    const incompleteText =
      pending.incomplete.length > 0
        ? `\n\nרכיבים שהבדיקה האוטומטית לא הצליחה להכריע לגביהם — בחן אותם ראשונים:\n` +
          pending.incomplete.map((f) => `- ${f.locator}: ${f.snippet ?? ''}`).join('\n')
        : '';

    const ruleNoteText = pending.ruleNotes ? `\n\nהערת מנוע הבדיקה: ${pending.ruleNotes}` : '';

    content.push({
      type: 'text',
      text:
        `## הקריטריון הנבדק\n` +
        `מספר: ${item.form.criterionNo}\n` +
        `שם: ${item.form.criterionNameHe}\n` +
        `רמה נדרשת בישראל: ${item.form.level}\n` +
        `הנחיה: ${item.form.guidelineHe}\n\n` +
        `### נוסח הקריטריון מטופס הבדיקה הרשמי\n${item.form.descriptionHe}\n\n` +
        `### רובריקה — מה נחשב כשל בקריטריון זה\n${item.engine.rubricHe}\n\n` +
        `## העמוד הנבדק\n` +
        `כתובת: ${bundle.url}\n` +
        `כותרת: ${(bundle.evidence as { meta?: { title?: string } })?.meta?.title ?? ''}\n` +
        `שפה מוצהרת: ${(bundle.evidence as { meta?: { lang?: string } })?.meta?.lang ?? '(לא הוגדרה)'}\n` +
        priorText +
        incompleteText +
        ruleNoteText +
        `\n\n## הראיות\n\`\`\`json\n${sliceJson}\n\`\`\``,
    });

    // Screenshots only where the criterion is genuinely visual — they are the
    // single largest cost in a request and add nothing to, say, a link audit.
    if (item.engine.evidenceSlice && VISUAL_SLICES.has(item.engine.evidenceSlice) && bundle.screenshotPath) {
      const image = await readFile(bundle.screenshotPath).catch(() => null);
      if (image && image.byteLength < 4_500_000) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: image.toString('base64') },
        });
        content.push({
          type: 'text',
          text:
            'צילום המסך המצורף מציג את העמוד כפי שהוא נראה למשתמש. השתמש בו כדי לאמת את הראיות המבניות.' +
            (bundle.screenshotTruncated
              ? ' שים לב: העמוד ארוך מהצילום, והצילום מציג את החלק העליון בלבד. אל תסיק מהיעדרות רכיב מהצילום שהוא נעדר מהעמוד.'
              : ''),
        });
      }
    }

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // The system prompt is byte-identical across every call in a scan, so a
      // cache breakpoint here turns thousands of re-sends into cache reads.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
      messages: [{ role: 'user', content }],
    });

    this.stats.calls++;
    const usage = response.usage;
    this.stats.costUsd +=
      (usage.input_tokens / 1e6) * PRICE_IN_PER_MTOK + (usage.output_tokens / 1e6) * PRICE_OUT_PER_MTOK;

    // Safety classifiers can decline a request outright. Accessibility auditing
    // is benign, but a security-adjacent page could trip one — and `content` is
    // empty when that happens, so this must be checked before reading it.
    if (response.stop_reason === 'refusal') {
      throw new Error('הבקשה נדחתה על ידי מסנני הבטיחות של המודל עבור קריטריון זה');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('התשובה נקטעה לפני שהושלמה (max_tokens)');
    }

    // With a json_schema output format the response is a text block of valid
    // JSON — but thinking blocks precede it, so index by type, not position.
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!text) throw new Error('המודל לא החזיר תוכן טקסטואלי');

    let raw: RawJudgement;
    try {
      raw = JSON.parse(text) as RawJudgement;
    } catch {
      throw new Error(`לא ניתן היה לפענח את תשובת המודל כ-JSON: ${text.slice(0, 200)}`);
    }

    return this.sanitise(raw, slice, item);
  }

  /**
   * Drops findings whose locator does not appear in the evidence.
   *
   * A hallucinated selector sends an engineer to an element that is not there,
   * and quietly discredits every other row in the report. Anything that cannot
   * be traced back to the slice is removed rather than trusted.
   */
  private sanitise(raw: RawJudgement, slice: unknown, item: CheckItem): Judgement {
    const sliceText = JSON.stringify(slice ?? {});
    const verdict: Verdict = raw.verdict === 'PASS' || raw.verdict === 'NA' ? raw.verdict : 'FAIL';
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5)));

    const findings: Finding[] = [];
    let dropped = 0;
    for (const f of raw.findings ?? []) {
      const locator = String(f.locator ?? '').trim();
      const reasonHe = String(f.reasonHe ?? '').trim();
      if (!locator || !reasonHe) continue;
      // Site-level slices carry URLs rather than selectors, so they are exempt.
      const traceable = item.engine.evidenceSlice === 'siteConsistency' || sliceText.includes(locator);
      if (!traceable) {
        dropped++;
        continue;
      }
      findings.push({ locator, snippet: f.snippet ? String(f.snippet) : undefined, reasonHe });
      if (findings.length >= 20) break;
    }

    let noteHe = raw.noteHe ? String(raw.noteHe) : undefined;
    if (dropped > 0) {
      noteHe = [noteHe, `(${dropped} ממצאים נוספים שדווחו לא אותרו בראיות והוסרו מהדוח.)`].filter(Boolean).join(' ');
    }

    // A FAIL with no traceable finding left is not a usable failure report.
    if (verdict === 'FAIL' && findings.length === 0) {
      return {
        verdict: 'FAIL',
        confidence: Math.min(confidence, 0.4),
        findings: [],
        noteHe: noteHe ?? 'הבדיקה הצביעה על אי-עמידה בקריטריון אך לא ניתן היה לשייך אותה לרכיב ספציפי. נדרשת בדיקה ידנית.',
      };
    }

    return { verdict, confidence, findings, noteHe };
  }

  /**
   * Cache key. Keyed on the evidence rather than the URL, so the shared header
   * and footer of a 500-page site are judged once.
   */
  private cacheKey(pending: PendingJudgement, bundle: PageBundle): string {
    const item = pending.item;
    const slice = item.engine.evidenceSlice ? buildSlice(item.engine.evidenceSlice, bundle) : {};
    const payload = JSON.stringify({
      item: item.id,
      rubric: item.engine.rubricHe,
      slice,
      prior: pending.priorFindings.map((f) => `${f.locator}|${f.reasonHe}`),
      // Site-level rows depend on the whole crawl, so include the page URL to
      // avoid collapsing pages that must be compared against each other.
      url: item.engine.evidenceSlice === 'siteConsistency' ? bundle.url : '',
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 32);
  }
}

interface RawJudgement {
  verdict?: string;
  confidence?: number;
  findings?: { locator?: string; snippet?: string; reasonHe?: string }[];
  noteHe?: string;
}

/** Trims the largest arrays first so the slice keeps its shape when over budget. */
function truncateJson(value: unknown, maxTokens: number): string {
  let json = JSON.stringify(value, null, 1);
  if (estimateTokens(json) <= maxTokens) return json;

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    const arrayKeys = Object.entries(clone)
      .filter(([, v]) => Array.isArray(v))
      .sort((a, b) => (b[1] as unknown[]).length - (a[1] as unknown[]).length);

    for (const [key] of arrayKeys) {
      const arr = clone[key] as unknown[];
      for (const limit of [40, 25, 15, 8]) {
        if (arr.length <= limit) break;
        clone[key] = [...arr.slice(0, limit), `…(${arr.length - limit} פריטים נוספים הושמטו מחמת אורך)`];
        json = JSON.stringify(clone, null, 1);
        if (estimateTokens(json) <= maxTokens) return json;
      }
    }
    json = JSON.stringify(clone, null, 1);
  }

  const maxChars = maxTokens * 2.5;
  return json.length > maxChars ? `${json.slice(0, maxChars)}\n…(הראיות נקטעו מחמת אורך)` : json;
}
