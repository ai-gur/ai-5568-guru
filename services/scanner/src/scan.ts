/**
 * Scan orchestration: crawl → site context → per-page verdicts → judgement →
 * document analysis → report object.
 *
 * The report object this returns is what every emitter (HTML, XLSX, JSON, PDF,
 * remediation Markdown) renders. Nothing downstream re-derives verdicts.
 */

import type { Catalogue, CheckResult } from '@ai5568/criteria';
import { loadCatalogue } from '@ai5568/criteria';
import { buildAxeMapping, axeVersion } from './checks/axe-map.ts';
import { auditStatement, buildSiteContext, findStatementUrl } from './checks/site-context.ts';
import type { SiteContext } from './checks/custom-rules.ts';
import type { StatementAudit } from './checks/custom-rules.ts';
import { BrowserDriver, type PageBundle } from './crawl/browser.ts';
import { crawl, type CrawlEvents, type DiscoveredDocument } from './crawl/crawler.ts';
import { analyseDocuments } from './documents/analyse.ts';
import { evaluatePage, mergeJudgement, summarise, type PendingJudgement } from './verdict.ts';
import { CONTRACT_VERSION } from './types.ts';
import type { ScanOptions, ScanReport, TargetReport } from './types.ts';

/** Injected so the engine does not depend on the LLM package. */
export interface Judge {
  judge(
    batch: { bundle: PageBundle; pending: PendingJudgement[] }[],
    catalogue: Catalogue,
  ): Promise<Map<string, Map<string, { verdict: 'PASS' | 'FAIL' | 'NA'; confidence: number; findings: { locator: string; snippet?: string; reasonHe: string }[]; noteHe?: string }>>>;
  /** Called once the crawl has produced the cross-page view the site-level rows need. */
  setSiteContext(site: SiteContext): void;
  readonly stats: { calls: number; costUsd: number };
}

export interface ScanEvents extends CrawlEvents {
  onPhase?: (phase: string, detail?: string) => void;
  onJudgeProgress?: (done: number, total: number) => void;
}

/**
 * Re-exported so callers keep a single import for "scan a site".
 * The catalogue itself is owned and loaded by `@ai5568/criteria` — the scanner
 * is one of four consumers and has no business knowing where the file sits.
 */
export { loadCatalogue };

export async function scan(options: ScanOptions, judge: Judge | null, events: ScanEvents = {}): Promise<ScanReport> {
  const startedAt = new Date().toISOString();
  const catalogue = await loadCatalogue();
  const mapping = buildAxeMapping(catalogue);

  events.onPhase?.('crawl', `axe-core ${axeVersion()}`);
  const outcome = await crawl(options, events);

  // The accessibility statement is a site-level duty, so it is fetched once and
  // audited once even though every page's row reports the result.
  events.onPhase?.('statement');
  const statementUrl = findStatementUrl(outcome.pages);
  let statement: StatementAudit | null = null;
  if (statementUrl) {
    statement = await fetchAndAuditStatement(statementUrl, options, outcome.pages);
  }

  const site = buildSiteContext(outcome.pages, statement, statementUrl);
  judge?.setSiteContext(site);

  events.onPhase?.('evaluate');
  const evaluations = outcome.pages.map((bundle) => ({
    bundle,
    ...evaluatePage({
      catalogue,
      bundle,
      site,
      mapping,
      level: options.level,
      useAi: options.noAi ? false : judge !== null,
      obligation: options.obligation,
    }),
  }));

  // ── judgement ────────────────────────────────────────────────────────────
  const resultsByPage = new Map<string, CheckResult[]>();
  for (const ev of evaluations) resultsByPage.set(ev.bundle.url, [...ev.results]);

  if (judge && !options.noAi) {
    const withPending = evaluations.filter((e) => e.pending.length > 0);
    const totalPending = withPending.reduce((n, e) => n + e.pending.length, 0);
    events.onPhase?.('judge', `${totalPending} שורות לשיקול דעת`);

    const judgements = await judge.judge(
      withPending.map((e) => ({ bundle: e.bundle, pending: e.pending })),
      catalogue,
    );

    let done = 0;
    for (const ev of withPending) {
      const perPage = judgements.get(ev.bundle.url);
      const list = resultsByPage.get(ev.bundle.url) ?? [];
      for (const pending of ev.pending) {
        list.push(mergeJudgement(pending, perPage?.get(pending.item.id) ?? null));
        events.onJudgeProgress?.(++done, totalPending);
      }
      resultsByPage.set(ev.bundle.url, list);
    }
  } else {
    // No judgement layer: resolve whatever was parked so no row goes missing.
    for (const ev of evaluations) {
      const list = resultsByPage.get(ev.bundle.url) ?? [];
      for (const pending of ev.pending) list.push(mergeJudgement(pending, null));
      resultsByPage.set(ev.bundle.url, list);
    }
  }

  // ── assemble page reports ────────────────────────────────────────────────
  const order = new Map(catalogue.items.map((item, i) => [item.id, i]));
  const pageReports: TargetReport[] = outcome.pages.map((bundle) => {
    const results = (resultsByPage.get(bundle.url) ?? []).sort(
      (a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0),
    );
    const evidence = bundle.evidence as { meta?: { title?: string; siteName?: string } };
    return {
      kind: 'page' as const,
      url: bundle.url,
      name: evidence?.meta?.title || bundle.url,
      siteName: evidence?.meta?.siteName || new URL(options.url).hostname,
      templateHash: bundle.evidence?.templateHash,
      results,
      summary: summarise(results),
      scannedAt: new Date().toISOString(),
      ...(bundle.error ? { error: bundle.error } : {}),
    };
  });

  // ── documents (IS 5568 Part 2) ───────────────────────────────────────────
  let documentReports: TargetReport[] = [];
  if (options.documents && outcome.documents.length > 0) {
    events.onPhase?.('documents', `${outcome.documents.length} מסמכים`);
    documentReports = await analyseDocuments(outcome.documents, catalogue, options, judge);
  }

  const siteName =
    (pageReports.find((p) => p.siteName)?.siteName ?? new URL(options.url).hostname).trim() ||
    new URL(options.url).hostname;

  return {
    site: { name: siteName, startUrl: options.url, origin: new URL(options.url).origin },
    options,
    contractVersion: CONTRACT_VERSION,
    catalogueSource: catalogue.source,
    // Which reading of a rolling standard produced these verdicts. Without it
    // a later scan cannot tell a fixed site from an amended standard, and
    // `@ai5568/delta` refuses to call the comparison a delta.
    catalogue: {
      version: catalogue.version,
      effectiveFrom: catalogue.effectiveFrom,
      source: {
        file: catalogue.source.file,
        sheet: catalogue.source.sheet,
        sha256: catalogue.source.sha256,
        retrievedAt: catalogue.source.importedAt,
      },
    },
    obligation: options.obligation,
    startedAt,
    finishedAt: new Date().toISOString(),
    pages: pageReports,
    documents: documentReports,
    siteWideFailures: rankSiteWideFailures([...pageReports, ...documentReports], catalogue),
    stats: {
      pagesScanned: pageReports.length,
      pagesFailed: pageReports.filter((p) => p.summary.fail > 0).length,
      documentsScanned: documentReports.length,
      llmCalls: judge?.stats.calls ?? 0,
      llmCostUsd: judge?.stats.costUsd ?? 0,
      skipped: outcome.skipped,
    },
  };
}

/**
 * Criteria failing across the most targets — the fix-first list.
 *
 * A criterion failing on 40 of 40 pages is almost always one shared template or
 * component, and fixing it clears 40 rows at once. Ordering by that ratio is
 * what makes the report actionable rather than just long.
 */
function rankSiteWideFailures(targets: TargetReport[], catalogue: Catalogue): ScanReport['siteWideFailures'] {
  const byItem = new Map<string, { fail: number; total: number }>();
  for (const t of targets) {
    for (const r of t.results) {
      const entry = byItem.get(r.itemId) ?? { fail: 0, total: 0 };
      // NA rows are excluded from the denominator: a criterion that is NA on
      // most pages should not look like it "mostly passes".
      if (r.verdict === 'NA') continue;
      entry.total++;
      if (r.verdict === 'FAIL') entry.fail++;
      byItem.set(r.itemId, entry);
    }
  }

  const items = new Map(catalogue.items.map((i) => [i.id, i]));
  return [...byItem.entries()]
    .filter(([, v]) => v.fail > 0)
    .map(([itemId, v]) => {
      const item = items.get(itemId);
      return {
        itemId,
        criterionNo: item?.form.criterionNo ?? itemId,
        criterionNameHe: item?.form.criterionNameHe ?? '',
        failCount: v.fail,
        total: v.total,
      };
    })
    .sort((a, b) => b.failCount / b.total - a.failCount / a.total || b.failCount - a.failCount);
}

/** Loads the statement page and runs the seven-item completeness audit. */
async function fetchAndAuditStatement(
  url: string,
  options: ScanOptions,
  alreadyCrawled: PageBundle[],
): Promise<StatementAudit | null> {
  // Avoid a second fetch when the crawl already visited it.
  const existing = alreadyCrawled.find((p) => p.url === url && !p.error);
  if (existing) {
    const text = stripHtml(existing.html);
    if (text.length > 100) return auditStatement(url, text);
  }

  const driver = new BrowserDriver(options);
  try {
    await driver.start();
    const bundle = await driver.visit(url, { runBehaviouralChecks: false });
    if (bundle.error) return null;
    return auditStatement(url, stripHtml(bundle.html));
  } catch {
    return null;
  } finally {
    await driver.stop();
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

export type { DiscoveredDocument };
