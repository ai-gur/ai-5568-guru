/**
 * @ai5568/report-contract — what a readiness review produces.
 *
 * This is the boundary between the public scanner and the private remediation
 * tooling, and between the scanner and the WordPress plugin. Breaking it breaks
 * consumers that live in a different repository and ship on their own schedule,
 * so it carries a version and changes additively.
 *
 * Two fields exist because the law made them necessary, not because they were
 * convenient:
 *
 *   `catalogue`   — regulation 35 defines the standard as "כתיקונם מזמן לזמן",
 *                   a rolling reference. Two reviews of the same site are only
 *                   comparable when they were produced against the same
 *                   catalogue version, so every report states its own.
 *
 *   `obligation`  — regulation 35ו exempts by turnover, and 35ד bounds the
 *                   video duty by turnover too. Without these facts a review
 *                   reports failures against duties the subject does not have.
 */

import type { CheckResult, Target } from '@ai5568/criteria';

export const CONTRACT_VERSION = '1.0.0' as const;

/** Which catalogue produced this report. Required for any delta comparison. */
export interface CatalogueRef {
  version: string;
  effectiveFrom: string;
  /** Provenance of the underlying legal source, so a report can cite itself. */
  source: { file: string; sheet?: string; sha256?: string; retrievedAt?: string };
}

/**
 * Facts about the duty-bearer that change which criteria apply at all.
 * Absent means "unknown" — never assume the most lenient reading, and never
 * silently drop a criterion because a field was not supplied.
 */
export interface ObligationProfile {
  /** Regulation 35א(ב): public authorities have no turnover-based relief. */
  publicAuthority?: boolean;
  /** Regulation 35ו(ז)(ט): ≤100,000 exempt outright; ≤1,000,000 for a pre-2017 site. */
  averageTurnoverIls?: number;
  /** Regulation 35ד: the video duty starts above 5,000,000 for non-authorities. */
  editsOrProducesVideo?: boolean;
  /** Regulation 35ו(ט): the relief applies only to a service started before 26.10.2017. */
  serviceStartedBefore2017?: boolean;
  /** Regulation 35ג(ג): an accessible equivalent site exempts the application. */
  hasEquivalentAccessibleWebsite?: boolean;
}

export interface ScanOptions {
  url: string;
  maxPages: number;
  maxDepth: number;
  /** Same-registrable-domain by default; set to widen or narrow. */
  include?: RegExp[];
  exclude?: RegExp[];
  concurrency: number;
  /** Milliseconds between requests to the same host. */
  politenessDelayMs: number;
  respectRobots: boolean;
  /** Playwright storageState path, for sites behind a login. */
  storageState?: string;
  /** Conformance target. AA is the rule; A applies only under a 35(ב)(2) exemption. */
  level: 'A' | 'AA';
  /** Skip the LLM layer entirely — automation-only run. */
  noAi: boolean;
  /** Hard ceiling on LLM spend for the scan, in USD. */
  budgetUsd: number;
  /** Download and analyse linked documents (IS 5568 Part 2). */
  documents: boolean;
  maxDocumentBytes: number;
  timeoutMs: number;
  viewport: { width: number; height: number };
  userAgent: string;
  outDir: string;
  /** Optional local source tree, used to suggest which files to edit. */
  sourceRoot?: string;
  /** Supplied by the requester; narrows which duties apply. */
  obligation?: ObligationProfile;
  /**
   * ⚠️ Disables the SSRF guard. For scanning fixtures on localhost, and for
   * an operator deliberately reviewing an internal staging site from inside
   * that network.
   *
   * It must never be settable from a user-supplied request body — that would
   * turn the public API into a proxy into our own network. The web layer drops
   * it; only a local caller can set it.
   *
   * It lives in the report rather than in a private variable so that a review
   * produced with the guard off says so, in writing, to whoever reads it.
   */
  allowPrivateNetworkTargets?: boolean;
}

/** Everything the report needs about one reviewed target. */
export interface TargetReport {
  kind: 'page' | 'document';
  url: string;
  /** Page title, or document title/filename. */
  name: string;
  siteName: string;
  templateHash?: string;
  results: CheckResult[];
  /** `unverified` is a subset of `fail` — see summarise() in verdict.ts. */
  summary: { pass: number; fail: number; na: number; unverified: number };
  scannedAt: string;
  error?: string;
}

export interface ScanReport {
  /** Version of this contract, so a consumer can refuse what it cannot read. */
  contractVersion?: string;
  site: { name: string; startUrl: string; origin: string };
  options: ScanOptions;
  catalogueSource: { file: string; sheet: string; importedAt: string };
  /** Preferred over `catalogueSource`; required for delta comparison. */
  catalogue?: CatalogueRef;
  obligation?: ObligationProfile;
  startedAt: string;
  finishedAt: string;
  pages: TargetReport[];
  documents: TargetReport[];
  /** Criteria that failed on most targets — the fix-first list. */
  siteWideFailures: { itemId: string; criterionNo: string; criterionNameHe: string; failCount: number; total: number }[];
  stats: {
    pagesScanned: number;
    pagesFailed: number;
    documentsScanned: number;
    llmCalls: number;
    llmCostUsd: number;
    /** Pages found but not scanned because a limit was hit — never hidden. */
    skipped: { url: string; reason: string }[];
  };
}

export type { CheckResult, Target };
