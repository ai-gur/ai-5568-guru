/**
 * Crawl orchestration: decides what to visit, in what order, and when to stop.
 *
 * Two things it does that a generic crawler would not:
 *
 *   Template clustering — pages sharing a DOM skeleton are grouped. Every page
 *   still gets its own report rows (the Regulation requires a filled sheet per
 *   page or per template), but the LLM layer can reuse a verdict across a
 *   cluster, which is what makes a 500-page site affordable.
 *
 *   Document harvesting — links to PDF/Office files are collected as they are
 *   found, because IS 5568 Part 2 applies to them and they are the single most
 *   commonly missed part of an Israeli audit.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserDriver, type PageBundle } from './browser.ts';
import { fetchRobots, fetchSitemapUrls, type Robots } from './robots.ts';
import { canonicalize, classifyLink, inScope, slugForUrl } from './url.ts';
import { guardUrl } from '@ai5568/scan-policy';
import type { ScanOptions } from '../types.ts';

export interface DiscoveredDocument {
  url: string;
  docType: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';
  referrers: string[];
  linkTexts: string[];
}

export interface CrawlOutcome {
  pages: PageBundle[];
  documents: DiscoveredDocument[];
  /** Templates keyed by skeleton hash, in discovery order. */
  templates: Map<string, string[]>;
  skipped: { url: string; reason: string }[];
}

export interface CrawlEvents {
  onPageStart?: (url: string, index: number, queued: number) => void;
  onPageDone?: (bundle: PageBundle, index: number, queued: number) => void;
  onDocumentFound?: (doc: DiscoveredDocument) => void;
}

interface QueueEntry {
  url: string;
  depth: number;
}

export async function crawl(options: ScanOptions, events: CrawlEvents = {}): Promise<CrawlOutcome> {
  const start = new URL(options.url);

  // The scanner fetches a URL supplied by a stranger from inside our network.
  // Refusing here, before anything is created on disk or a browser is started,
  // is the whole of the SSRF defence: see network-guard.ts for why the check is
  // on resolved addresses and not on the hostname.
  const guardEnabled = options.allowPrivateNetworkTargets !== true;
  if (guardEnabled) {
    const entryGuard = await guardUrl(options.url);
    if (!entryGuard.allowed) throw new Error(entryGuard.reasonHe ?? 'הכתובת נדחתה.');
  }
  const screenshotDir = join(options.outDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });

  const robots: Robots = options.respectRobots
    ? await fetchRobots(start.origin, options.userAgent, 10_000)
    : { isAllowed: () => true, sitemaps: [], crawlDelayMs: null };

  // robots.txt may ask for a slower rate than our default; honour the larger.
  const delayMs = Math.max(options.politenessDelayMs, robots.crawlDelayMs ?? 0);

  const seen = new Set<string>();
  const queue: QueueEntry[] = [];
  const skipped: { url: string; reason: string }[] = [];

  const enqueue = (rawUrl: string, depth: number, reasonIfSkipped = true): void => {
    const canonical = canonicalize(rawUrl);
    if (!canonical || seen.has(canonical)) return;
    if (!inScope(canonical, start, options.include, options.exclude)) return;
    if (depth > options.maxDepth) {
      if (reasonIfSkipped) skipped.push({ url: canonical, reason: `depth ${depth} exceeds --max-depth ${options.maxDepth}` });
      return;
    }
    if (options.respectRobots) {
      const u = new URL(canonical);
      if (!robots.isAllowed(u.pathname + u.search)) {
        skipped.push({ url: canonical, reason: 'disallowed by robots.txt' });
        return;
      }
    }
    seen.add(canonical);
    queue.push({ url: canonical, depth });
  };

  const startCanonical = canonicalize(options.url);
  if (!startCanonical) throw new Error(`Not a usable URL: ${options.url}`);
  seen.add(startCanonical);
  queue.push({ url: startCanonical, depth: 0 });

  // Sitemaps give better coverage than link-following alone, especially on
  // sites where a lot of content hangs off a search page.
  const sitemapSources = [...robots.sitemaps, new URL('/sitemap.xml', start.origin).toString()];
  for (const sm of sitemapSources.slice(0, 5)) {
    const urls = await fetchSitemapUrls(sm, options.userAgent, 10_000);
    for (const u of urls) enqueue(u, 1, false);
    if (urls.length) break;
  }

  const driver = new BrowserDriver(options);
  await driver.start();

  const pages: PageBundle[] = [];
  const templates = new Map<string, string[]>();
  const documentsByUrl = new Map<string, DiscoveredDocument>();

  try {
    let index = 0;
    while (queue.length > 0 && pages.length < options.maxPages) {
      // Concurrency is bounded per batch. A shared page pool would be faster,
      // but batching keeps the politeness delay meaningful and the progress
      // reporting honest.
      const batch = queue.splice(0, Math.min(options.concurrency, options.maxPages - pages.length));

      const results = await Promise.all(
        batch.map(async (entry, i) => {
          events.onPageStart?.(entry.url, index + i, queue.length);

          // Re-checked per page, not just at the entry point. A crawl follows
          // links the site controls, and a site under test can link inward —
          // `<a href="http://10.0.0.5/">` is a page like any other until this
          // says otherwise. Refused pages are recorded, never dropped quietly.
          if (guardEnabled) {
            const guard = await guardUrl(entry.url);
            if (!guard.allowed) {
              skipped.push({ url: entry.url, reason: guard.reasonHe ?? 'הכתובת נדחתה מטעמי אבטחת רשת' });
              return null;
            }
          }

          if (delayMs) await sleep(delayMs * i);
          const bundle = await driver.visit(entry.url, {
            screenshotPath: join(screenshotDir, `${slugForUrl(entry.url)}.png`),
          });
          return { bundle, depth: entry.depth };
        }),
      );

      for (const { bundle, depth } of results.filter((r) => r !== null)) {
        pages.push(bundle);
        events.onPageDone?.(bundle, index, queue.length);
        index++;

        const hash = bundle.evidence?.templateHash;
        if (hash) {
          const group = templates.get(hash) ?? [];
          group.push(bundle.url);
          templates.set(hash, group);
        }

        for (const link of bundle.links) {
          const canonical = canonicalize(link.href);
          if (!canonical) continue;
          const { kind, docType } = classifyLink(canonical);

          if (kind === 'document' && docType) {
            if (!options.documents) continue;
            // Documents are collected even when off-site: a PDF hosted on a CDN
            // is still content the operator publishes and is responsible for.
            const existing = documentsByUrl.get(canonical);
            if (existing) {
              if (!existing.referrers.includes(bundle.url)) existing.referrers.push(bundle.url);
              if (link.text && !existing.linkTexts.includes(link.text)) existing.linkTexts.push(link.text);
            } else {
              const doc: DiscoveredDocument = {
                url: canonical,
                docType,
                referrers: [bundle.url],
                linkTexts: link.text ? [link.text] : [],
              };
              documentsByUrl.set(canonical, doc);
              events.onDocumentFound?.(doc);
            }
            continue;
          }

          if (kind === 'page') enqueue(canonical, depth + 1);
        }
      }
    }

    // Anything still queued when a limit was reached is reported, never hidden.
    for (const entry of queue) {
      skipped.push({ url: entry.url, reason: `--max-pages ${options.maxPages} reached` });
    }
  } finally {
    await driver.stop();
  }

  return { pages, documents: [...documentsByUrl.values()], templates, skipped };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
