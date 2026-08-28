/**
 * axe-core → check-sheet row mapping.
 *
 * axe reports rule violations; the report needs criterion verdicts. The mapping
 * lives in `overrides.ts` (each row lists the axe rules that decide it), and
 * this module inverts it and validates it.
 *
 * Validation matters: if an axe upgrade renames or removes a rule, a row that
 * relied on it would quietly become unfailable and every page would show it as
 * passing. That is worse than a crash, so an unknown rule id is a hard error at
 * startup.
 */

import { createRequire } from 'node:module';
import type { Catalogue, Finding } from '@ai5568/criteria';
import type { AxeResult } from '../crawl/browser.ts';

const require = createRequire(import.meta.url);

interface AxeRuleMeta {
  ruleId: string;
  tags: string[];
}

/** Rule ids the installed axe-core build actually ships. */
function installedAxeRuleIds(): Set<string> {
  const axe = require('axe-core') as { getRules: () => AxeRuleMeta[] };
  return new Set(axe.getRules().map((r) => r.ruleId));
}

export interface AxeMapping {
  /** axe rule id → check-sheet row ids that it decides. */
  ruleToItems: Map<string, string[]>;
  /** Rules named in the catalogue that this axe build does not have. */
  unknownRules: string[];
}

export function buildAxeMapping(catalogue: Catalogue, opts: { strict?: boolean } = {}): AxeMapping {
  const installed = installedAxeRuleIds();
  const ruleToItems = new Map<string, string[]>();
  const unknownRules: string[] = [];

  for (const item of catalogue.items) {
    for (const rule of item.engine.axeRules) {
      if (!installed.has(rule)) {
        if (!unknownRules.includes(rule)) unknownRules.push(rule);
        continue;
      }
      const list = ruleToItems.get(rule) ?? [];
      list.push(item.id);
      ruleToItems.set(rule, list);
    }
  }

  if (unknownRules.length && opts.strict !== false) {
    throw new Error(
      `axe-core ${axeVersion()} does not provide these rules referenced by the criteria catalogue: ${unknownRules.join(', ')}.\n` +
        `Rows depending on them would silently never fail. Update packages/criteria/src/overrides.ts to the current rule names.`,
    );
  }

  return { ruleToItems, unknownRules };
}

export function axeVersion(): string {
  const axe = require('axe-core') as { version: string };
  return axe.version;
}

/** Turns axe violations into findings, grouped by the row they belong to. */
export function findingsFromAxe(axe: AxeResult | null, mapping: AxeMapping): Map<string, Finding[]> {
  const byItem = new Map<string, Finding[]>();
  if (!axe) return byItem;

  for (const violation of axe.violations) {
    const itemIds = mapping.ruleToItems.get(violation.id);
    if (!itemIds?.length) continue;

    for (const node of violation.nodes) {
      const finding: Finding = {
        locator: node.target.join(' , '),
        snippet: node.html,
        // axe's failureSummary is the most precise statement of what is wrong
        // with this specific element, so it is preserved verbatim alongside the
        // Hebrew rule description rather than replaced by a generic sentence.
        reasonHe: `${violation.help}. ${node.failureSummary?.replace(/\s*\n\s*/g, ' ').trim() ?? ''}`.trim(),
      };
      for (const itemId of itemIds) {
        const list = byItem.get(itemId) ?? [];
        if (list.length < 20) list.push(finding);
        byItem.set(itemId, list);
      }
    }
  }
  return byItem;
}

/**
 * axe's `incomplete` results — checks it could not decide, most often
 * colour-contrast against an image or a gradient background.
 *
 * These are never turned into a pass. They are handed to the LLM layer as
 * evidence, because "axe could not measure it" is precisely the case where a
 * human or a model has to look.
 */
export function incompleteFromAxe(axe: AxeResult | null, mapping: AxeMapping): Map<string, Finding[]> {
  const byItem = new Map<string, Finding[]>();
  if (!axe) return byItem;

  for (const inc of axe.incomplete) {
    const itemIds = mapping.ruleToItems.get(inc.id);
    if (!itemIds?.length) continue;
    for (const node of inc.nodes) {
      const finding: Finding = {
        locator: node.target.join(' , '),
        snippet: node.html,
        reasonHe: `${inc.help} — הבדיקה האוטומטית לא הצליחה להכריע ונדרשת בחינה.`,
      };
      for (const itemId of itemIds) {
        const list = byItem.get(itemId) ?? [];
        if (list.length < 10) list.push(finding);
        byItem.set(itemId, list);
      }
    }
  }
  return byItem;
}
