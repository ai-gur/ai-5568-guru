/**
 * Turns evidence into one V / X / NA per check-sheet row.
 *
 * Precedence, in order:
 *
 *   1. Applicability. Subject absent → NA, with the reason.
 *   2. Deterministic rules. Any finding → FAIL. This is authoritative: the LLM
 *      layer can add findings to a FAIL but can never turn one into a PASS.
 *   3. Judgement. Rows the rules cannot fully decide go to the LLM with a
 *      focused evidence slice.
 *   4. Unverifiable. A row whose check could not run is reported as FAIL with
 *      confidence 0 and an explicit note — never as a pass. An audit that
 *      reports "compliant" for something it did not manage to test is the one
 *      failure mode with real legal consequences.
 */

import type { Catalogue, CheckItem, CheckResult, Finding, Method, Verdict } from '@ai5568/criteria';
import { itemApplies, standardExcludes } from '@ai5568/criteria';
import { checkApplicability, toCounts, type Counts } from './checks/applicability.ts';
import { findingsFromAxe, incompleteFromAxe, type AxeMapping } from './checks/axe-map.ts';
import { runCustomRule, type RuleContext, type SiteContext } from './checks/custom-rules.ts';
import type { PageBundle } from './crawl/browser.ts';

/** A row that needs judgement, parked until the LLM layer runs. */
export interface PendingJudgement {
  item: CheckItem;
  /** Findings the deterministic layer already produced (may be empty). */
  priorFindings: Finding[];
  /** axe results it could not decide — the LLM should look at these first. */
  incomplete: Finding[];
  /** FAIL already established; the LLM can only add detail. */
  alreadyFailed: boolean;
  /** Why a deterministic rule declined to judge, if it said. */
  ruleNotes: string;
}

export interface PageEvaluation {
  results: CheckResult[];
  pending: PendingJudgement[];
}

export interface EvaluateOptions {
  catalogue: Catalogue;
  bundle: PageBundle;
  site: SiteContext;
  mapping: AxeMapping;
  level: 'A' | 'AA';
  /** When false, judgement rows resolve without the LLM. */
  useAi: boolean;
}

export function evaluatePage(opts: EvaluateOptions): PageEvaluation {
  const { catalogue, bundle, site, mapping, level, useAi } = opts;
  const results: CheckResult[] = [];
  const pending: PendingJudgement[] = [];

  const axeFindings = findingsFromAxe(bundle.axe, mapping);
  const axeIncomplete = incompleteFromAxe(bundle.axe, mapping);

  const pageItems = catalogue.items.filter(
    (item) => item.engine.appliesTo.includes('page') && itemApplies(item, level),
  );

  // A page that would not load cannot be assessed at all. Reporting every row as
  // failing would be noise; reporting them as passing would be a lie. Each row
  // is marked unverified with the load error as its finding.
  if (bundle.error) {
    for (const item of pageItems) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: [{ locator: bundle.url, reasonHe: `העמוד לא נטען ולכן לא ניתן היה לבדוק אותו: ${bundle.error}` }],
        noteHe: 'העמוד לא נטען',
      });
    }
    return { results, pending };
  }

  // Counts drive applicability. Site-level facts are folded in so that rows
  // like 2.4.5 (multiple ways) can be NA on a single-page scan.
  // `toCounts` throws if the probe under-reported, rather than letting a missing
  // count read as zero (which would mean "not applicable").
  const counts = toCounts(bundle.evidence?.counts as Record<string, unknown> | undefined, site.pageCount);

  for (const item of pageItems) {
    // ── 0. the standard cancels the criterion ──────────────────────────────
    // Higher precedence than applicability: this row does not exist as a duty,
    // whatever the page contains. It is still reported, because the form
    // demands the row, and the clause is quoted so a reviewer can check it.
    const excluded = standardExcludes(item);
    if (excluded) {
      results.push({
        itemId: item.id,
        verdict: 'NA',
        method: 'na-probe',
        confidence: 1,
        findings: [],
        noteHe: excluded.reasonHe,
      });
      continue;
    }

    // ── 1. applicability ───────────────────────────────────────────────────
    const applicability = checkApplicability(item.engine.applicability, counts, bundle.evidence);
    if (!applicability.applicable) {
      results.push({
        itemId: item.id,
        verdict: 'NA',
        method: 'na-probe',
        confidence: 1,
        findings: [],
        noteHe: applicability.reasonHe,
      });
      continue;
    }

    // ── 2. deterministic rules ─────────────────────────────────────────────
    const findings: Finding[] = [...(axeFindings.get(item.id) ?? [])];
    const ctx: RuleContext = { bundle, evidence: bundle.evidence, site, notes: [] };

    let anyRuleHadAnOpinion = item.engine.axeRules.length > 0 && bundle.axe !== null;
    for (const ruleId of item.engine.customRules) {
      const ruleFindings = runCustomRule(ruleId, ctx);
      if (ruleFindings === null) continue; // rule declined to judge
      anyRuleHadAnOpinion = true;
      findings.push(...ruleFindings);
    }
    const ruleNotes = ctx.notes.join(' ');

    const failed = findings.length > 0;
    const incomplete = axeIncomplete.get(item.id) ?? [];

    // ── 3. judgement ───────────────────────────────────────────────────────
    const needsJudgement = item.engine.method === 'llm' || item.engine.method === 'hybrid';

    if (needsJudgement && useAi) {
      pending.push({ item, priorFindings: dedupe(findings), incomplete, alreadyFailed: failed, ruleNotes });
      continue;
    }

    if (failed) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 1,
        findings: dedupe(findings),
      });
      continue;
    }

    /**
     * A judgement row with no judgement layer cannot be passed.
     *
     * The rules attached to these rows catch mechanical failures only — an
     * `empty-heading` check says nothing about whether a heading *describes*
     * its section, which is what 2.4.6 actually asks. Letting the mechanical
     * rule produce a PASS would mark the row compliant on evidence that never
     * addressed it.
     */
    if (needsJudgement) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: incomplete,
        noteHe:
          (ruleNotes ? `${ruleNotes} ` : '') +
          'קריטריון זה דורש שיקול דעת על התוכן. הבדיקות האוטומטיות לא מצאו כשל מכני, אך אין בכך כדי לאשר את הקריטריון — ' +
          'הסריקה בוצעה ללא שכבת הבינה המלאכותית (--no-ai) ולכן נדרשת בדיקה ידנית.',
      });
      continue;
    }

    // ── 4. nothing decided it ──────────────────────────────────────────────
    if (!anyRuleHadAnOpinion) {
      const base = useAi
        ? 'לא ניתן היה להכריע בקריטריון זה אוטומטית ובדיקת הבינה המלאכותית לא הושלמה. נדרשת בדיקה ידנית — הקריטריון אינו מסומן כתקין כל עוד לא אומת.'
        : 'קריטריון זה דורש שיקול דעת ואינו ניתן להכרעה אוטומטית. הסריקה בוצעה במצב ללא בינה מלאכותית (--no-ai) — נדרשת בדיקה ידנית.';
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: incomplete,
        // A rule-supplied reason is far more useful than the generic sentence,
        // so it leads.
        noteHe: ruleNotes ? `${ruleNotes} ${base}` : base,
      });
      continue;
    }

    // axe explicitly could not decide part of this row (typically contrast over
    // an image or gradient). Without a judgement layer to resolve it, the row
    // is unverified, and unverified is not the same as compliant.
    if (incomplete.length > 0) {
      results.push({
        itemId: item.id,
        verdict: 'FAIL',
        method: 'auto',
        confidence: 0,
        findings: incomplete,
        noteHe: 'הבדיקה האוטומטית לא הצליחה להכריע עבור הרכיבים המפורטים. נדרשת בחינה ידנית של פריטים אלה.',
      });
      continue;
    }

    results.push({
      itemId: item.id,
      verdict: 'PASS',
      method: 'auto',
      confidence: 1,
      findings: [],
      noteHe: passNote(item, counts),
    });
  }

  return { results, pending };
}

/** Folds an LLM assessment into a row that the deterministic layer left open. */
export function mergeJudgement(
  pending: PendingJudgement,
  judgement: { verdict: Verdict; confidence: number; findings: Finding[]; noteHe?: string } | null,
): CheckResult {
  const { item, priorFindings, alreadyFailed } = pending;

  // The LLM never ran or failed: fall back to whatever the rules established,
  // and if they established nothing, say so rather than passing the row.
  if (!judgement) {
    if (alreadyFailed) {
      return { itemId: item.id, verdict: 'FAIL', method: 'auto', confidence: 1, findings: priorFindings };
    }
    return {
      itemId: item.id,
      verdict: 'FAIL',
      method: 'auto',
      confidence: 0,
      findings: pending.incomplete,
      noteHe: 'בדיקת שיקול הדעת לא הושלמה עבור קריטריון זה. נדרשת בדיקה ידנית — הקריטריון אינו מסומן כתקין כל עוד לא אומת.',
    };
  }

  const method: Method = priorFindings.length > 0 || item.engine.axeRules.length > 0 ? 'auto+ai' : 'ai';

  // An automated failure stands regardless of what the model concluded.
  if (alreadyFailed) {
    return {
      itemId: item.id,
      verdict: 'FAIL',
      method,
      confidence: 1,
      findings: dedupe([...priorFindings, ...judgement.findings]),
      noteHe: judgement.noteHe,
    };
  }

  if (judgement.verdict === 'NA') {
    return {
      itemId: item.id,
      verdict: 'NA',
      method,
      confidence: judgement.confidence,
      findings: [],
      noteHe: judgement.noteHe ?? 'הקריטריון אינו רלוונטי לעמוד זה',
    };
  }

  if (judgement.verdict === 'FAIL') {
    return {
      itemId: item.id,
      verdict: 'FAIL',
      method,
      confidence: judgement.confidence,
      findings: dedupe(judgement.findings),
      noteHe: judgement.noteHe,
    };
  }

  return {
    itemId: item.id,
    verdict: 'PASS',
    method,
    confidence: judgement.confidence,
    findings: [],
    noteHe: judgement.noteHe,
  };
}

/** A short statement of what satisfied the row, so PASS rows are auditable too. */
function passNote(item: CheckItem, counts: Counts): string {
  switch (item.engine.applicability) {
    case 'hasImages':
      return `נבדקו ${counts.images} תמונות — לכולן טקסט חלופי תקין.`;
    case 'hasLinks':
      return `נבדקו ${counts.links} קישורים.`;
    case 'hasForms':
      return `נבדקו ${counts.formControls} שדות טופס.`;
    case 'hasFocusableElements':
      return `נבדקו ${counts.focusable} רכיבים הניתנים למיקוד.`;
    case 'hasTables':
      return `נבדקו ${counts.tables} טבלאות.`;
    default:
      return 'לא נמצאו ממצאים בבדיקה האוטומטית.';
  }
}

/** Same element reported by several rules should appear once. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = `${f.locator}||${f.reasonHe.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.slice(0, 20);
}

/**
 * The report only ever shows three verdicts, as the official form requires.
 * `unverified` is a *subset* of `fail` — rows marked "לא תקין" because nothing
 * managed to verify them, rather than because a defect was found. Reporting it
 * separately keeps the headline number honest without inventing a fourth state.
 */
export function summarise(results: CheckResult[]): { pass: number; fail: number; na: number; unverified: number } {
  return {
    pass: results.filter((r) => r.verdict === 'PASS').length,
    fail: results.filter((r) => r.verdict === 'FAIL').length,
    na: results.filter((r) => r.verdict === 'NA').length,
    unverified: results.filter((r) => r.verdict === 'FAIL' && r.confidence === 0).length,
  };
}
