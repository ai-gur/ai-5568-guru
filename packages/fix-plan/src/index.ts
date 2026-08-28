/**
 * @ai5568/fix-plan — the ordered set of changes that would close a review.
 *
 * This is the seam. A plan is produced from a report (the planner is private,
 * because turning findings into a safe, ordered, conflict-aware sequence is
 * automation) and consumed by an applier (also private, because running it is
 * labour). The *shape* is public, and so is any plan a customer receives:
 *
 *   the free product hands you the plan; the paid product runs it.
 *
 * A developer who reads a plan should be able to carry it out by hand, in
 * order, without our tools. If that ever stops being true, the plan has become
 * a licence dongle rather than a document, and the product has drifted.
 */

import type { Finding, Verdict } from '@ai5568/criteria';

export const FIX_PLAN_VERSION = '1.0.0' as const;

/** Where a change lands. Adding a surface must not require changing a plan. */
export type SurfaceId = 'git' | 'wordpress' | 'manual' | (string & {});

/**
 * Who has to do it.
 *
 * `human` is not a failure of the tooling — several criteria cannot be closed
 * by any machine (deciding what an image conveys, judging caption quality,
 * recording a real accessibility statement). Marking them honestly is what
 * keeps the delta report truthful.
 */
export type Actor = 'automatic' | 'human' | 'human-review-after-automatic';

export interface FixStep {
  /** Stable within a plan; referenced by the applied change and by the delta. */
  id: string;
  /** Catalogue row this step closes, e.g. 'R04'. */
  itemId: string;
  /** Which page or document. */
  targetUrl: string;
  /** The specific places that failed. Empty when the step is site-wide. */
  findings: Finding[];
  /** End state, in Hebrew — from `remediation.goalHe`. */
  goalHe: string;
  /** Concrete instruction. Markdown; from `remediation.instruction`. */
  instruction: string;
  /** Hebrew UI strings the fix needs, so nothing is invented. */
  hebrewStrings?: Record<string, string>;
  effort: 'low' | 'medium' | 'high';
  actor: Actor;
  /** Steps that must land first — e.g. add a landmark before a skip link. */
  dependsOn?: string[];
  /**
   * Steps that touch the same element and must not be applied together
   * blindly. Surfaced to the operator rather than resolved silently.
   */
  conflictsWith?: string[];
}

export interface FixPlan {
  version: typeof FIX_PLAN_VERSION;
  /** The review this plan closes. */
  reportedAt: string;
  /** Plans are only comparable, and only valid, against one catalogue. */
  catalogueVersion: string;
  site: { name: string; origin: string };
  /**
   * Ordered. Cheap and certain first: an applier that runs out of budget
   * should have banked the wins, not half-finished the hardest item.
   */
  steps: FixStep[];
  /**
   * Rows that could not be planned, and why — never omitted.
   * A plan that quietly drops what it cannot handle reads as complete.
   */
  unplanned: { itemId: string; targetUrl: string; reasonHe: string }[];
}

/** What an applier did, in enough detail to undo it. */
export interface AppliedChange {
  stepId: string;
  surface: SurfaceId;
  /** Surface-specific handle: a commit sha, a post revision id, a file path. */
  ref: string;
  appliedAt: string;
  /** Set once the step's own check has been re-run — never before. */
  verified?: { verdict: Verdict; at: string };
}

/**
 * Every applier implements this, and every applier can undo itself.
 *
 * `revert` is in the interface rather than in a guideline because accessibility
 * fixes touch live content. A surface that cannot undo its own work is a
 * surface that should not be trusted to do it.
 */
export interface Surface {
  readonly id: SurfaceId;
  /** Honest about what it cannot do; unsupported steps are shown, not dropped. */
  supports(step: FixStep): boolean;
  apply(step: FixStep): Promise<AppliedChange>;
  revert(change: AppliedChange): Promise<void>;
}
