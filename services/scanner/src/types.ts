/**
 * Scanner-internal types.
 *
 * The shapes that leave this service — `ScanOptions`, `TargetReport`,
 * `ScanReport` — belong to `@ai5568/report-contract`, because the private
 * remediation tooling and the WordPress plugin read them from a different
 * repository. They are re-exported here so callers inside the scanner keep one
 * import, but the contract is where they are defined and versioned.
 *
 * What stays here is what never crosses the boundary: the crawl records, and
 * the defaults, which are this scanner's behaviour rather than the report's
 * shape.
 */

import type { Target } from '@ai5568/criteria';
import type { ScanOptions } from '@ai5568/report-contract';

export type {
  ScanOptions,
  ScanReport,
  TargetReport,
  ObligationProfile,
  CatalogueRef,
} from '@ai5568/report-contract';
export { CONTRACT_VERSION } from '@ai5568/report-contract';

export const DEFAULT_OPTIONS: Omit<ScanOptions, 'url' | 'outDir'> = {
  maxPages: 100,
  maxDepth: 5,
  concurrency: 4,
  politenessDelayMs: 250,
  respectRobots: true,
  level: 'AA',
  noAi: false,
  budgetUsd: 10,
  documents: true,
  maxDocumentBytes: 40 * 1024 * 1024,
  timeoutMs: 30_000,
  viewport: { width: 1366, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 IS5568-Readiness/0.1 (+accessibility readiness review)',
};

/** One crawled page, before checks run. */
export interface PageRecord {
  url: string;
  /** URL as first discovered, before canonicalisation — kept for the report. */
  requestedUrl: string;
  depth: number;
  status: number;
  title: string;
  lang: string | null;
  dir: string | null;
  siteName: string;
  /** Skeleton hash used to group pages into templates. */
  templateHash: string;
  html: string;
  screenshotPath?: string;
  error?: string;
}

export interface DocumentRecord {
  url: string;
  /** Page(s) that linked to it. */
  referrers: string[];
  localPath: string;
  kind: Exclude<Target, 'page'>;
  bytes: number;
  /** Link text used to reach it — feeds the "meaningful name" criterion. */
  linkTexts: string[];
  error?: string;
}
