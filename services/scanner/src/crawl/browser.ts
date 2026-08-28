/**
 * Browser driver: loads a page, gathers every piece of evidence, and hands
 * back one bundle for the check layer to reason over.
 *
 * Uses the Chrome already installed on the machine when it is there, and falls
 * back to Playwright's bundled Chromium. Both render identically for our
 * purposes; using the installed Chrome avoids a 150 MB download.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { keyboardWalk, type KeyboardWalkResult } from '../probes/keyboard-walk.ts';
import type { ScanOptions } from '../types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Shape returned by page-probe.js. Kept loose — the probe is the source of truth. */
export interface PageEvidence {
  meta: {
    url: string;
    title: string;
    siteName: string;
    lang: string | null;
    dir: string | null;
    viewportContent: string | null;
    blocksZoom: boolean;
    description: string | null;
    charset: string;
  };
  templateHash: string;
  counts: Record<string, number>;
  [key: string]: unknown;
}

export interface AxeViolationNode {
  target: string[];
  html: string;
  failureSummary: string;
  impact: string | null;
}

export interface AxeResult {
  violations: { id: string; impact: string | null; help: string; description: string; helpUrl: string; tags: string[]; nodes: AxeViolationNode[] }[];
  passes: { id: string; nodes: { target: string[] }[] }[];
  incomplete: { id: string; help: string; nodes: { target: string[]; html: string }[] }[];
  inapplicable: { id: string }[];
}

export interface ZoomResult {
  horizontalScrollAt200: boolean;
  clippedElements: { selector: string; text: string }[];
  lostElements: { selector: string; text: string }[];
  blocksZoom: boolean;
}

export interface PageBundle {
  url: string;
  requestedUrl: string;
  status: number;
  html: string;
  evidence: PageEvidence;
  axe: AxeResult | null;
  keyboard: KeyboardWalkResult | null;
  zoom: ZoomResult | null;
  screenshotPath?: string;
  links: { href: string; text: string }[];
  error?: string;
}

export class BrowserDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private probeSource = '';
  private instrumentationSource = '';
  private axeSource = '';
  private readonly options: ScanOptions;

  constructor(options: ScanOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    this.probeSource = await readFile(resolve(HERE, '../probes/page-probe.js'), 'utf8');
    this.instrumentationSource = await readFile(resolve(HERE, '../probes/instrumentation.js'), 'utf8');
    this.axeSource = await readFile(resolve(HERE, '../../../../node_modules/axe-core/axe.min.js'), 'utf8');

    const launchOptions = { args: ['--disable-dev-shm-usage', '--no-sandbox'] };
    try {
      this.browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
    } catch {
      // No system Chrome, or a channel mismatch — bundled Chromium is fine.
      this.browser = await chromium.launch(launchOptions);
    }

    this.context = await this.browser.newContext({
      viewport: this.options.viewport,
      userAgent: this.options.userAgent,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      ignoreHTTPSErrors: true,
      ...(this.options.storageState ? { storageState: this.options.storageState } : {}),
    });
    this.context.setDefaultTimeout(this.options.timeoutMs);

    // Instrumentation has to be in place before any page script runs.
    await this.context.addInitScript({ content: this.instrumentationSource });
  }

  async stop(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }

  /**
   * Loads a URL and collects everything. Failures are captured on the bundle
   * rather than thrown: one broken page must not end the scan, and a page that
   * could not be loaded still belongs in the report.
   */
  async visit(url: string, opts: { screenshotPath?: string; runBehaviouralChecks?: boolean } = {}): Promise<PageBundle> {
    if (!this.context) throw new Error('BrowserDriver.start() was not called');
    const page = await this.context.newPage();
    const bundle: PageBundle = {
      url,
      requestedUrl: url,
      status: 0,
      html: '',
      evidence: {} as PageEvidence,
      axe: null,
      keyboard: null,
      zoom: null,
      links: [],
    };

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs });
      bundle.status = response?.status() ?? 0;

      // `networkidle` hangs on sites with long-polling or analytics beacons, so
      // wait for it but do not let it decide whether the page counts as loaded.
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(400);

      bundle.url = page.url();
      bundle.html = await page.content();

      await page.addScriptTag({ content: this.probeSource });
      bundle.evidence = (await page.evaluate(() => (window as unknown as { __is5568Probe: () => unknown }).__is5568Probe())) as PageEvidence;

      bundle.links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) }))
          .filter((l) => l.href),
      );

      bundle.axe = await this.runAxe(page);

      if (opts.runBehaviouralChecks !== false) {
        bundle.keyboard = await keyboardWalk(page).catch(() => null);
        bundle.zoom = await this.checkZoom(page).catch(() => null);
      }

      if (opts.screenshotPath) {
        await page
          .screenshot({ path: opts.screenshotPath, fullPage: true, animations: 'disabled', timeout: 15000 })
          .then(() => {
            bundle.screenshotPath = opts.screenshotPath;
          })
          .catch(() => undefined);
      }
    } catch (err) {
      bundle.error = err instanceof Error ? err.message : String(err);
    } finally {
      await page.close().catch(() => undefined);
    }

    return bundle;
  }

  private async runAxe(page: Page): Promise<AxeResult | null> {
    try {
      await page.addScriptTag({ content: this.axeSource });
      return (await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe;
        return (await axe.run(document, {
          // IS 5568 is anchored to WCAG 2.0 AA. `best-practice` rules are
          // included because several of them (region, heading-order, skip-link)
          // are the only automated signal for sheet rows that WCAG tags do not
          // cover — they are mapped explicitly, never applied wholesale.
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
          resultTypes: ['violations', 'incomplete', 'inapplicable'],
          elementRef: false,
        })) as unknown;
      })) as AxeResult;
    } catch {
      return null;
    }
  }

  /**
   * Criterion 1.4.4: text at 200% must not lose information or function.
   *
   * Scales text rather than the whole page, which is what the criterion is
   * about (page zoom is a different, easier case that most sites survive).
   */
  private async checkZoom(page: Page): Promise<ZoomResult> {
    const before = (await page.evaluate(() =>
      (window as unknown as { __is5568MeasureText: () => { items: { selector: string; text: string }[] } }).__is5568MeasureText(),
    )) as { items: { selector: string; text: string }[]; horizontalScroll: boolean };

    await page.addStyleTag({
      content: `html { font-size: 200% !important; }`,
    });
    await page.waitForTimeout(350);

    const after = (await page.evaluate(() =>
      (window as unknown as {
        __is5568MeasureText: () => {
          items: { selector: string; text: string; clipped: boolean }[];
          horizontalScroll: boolean;
        };
      }).__is5568MeasureText(),
    )) as { items: { selector: string; text: string; clipped: boolean }[]; horizontalScroll: boolean };

    const beforeSelectors = new Set(before.items.map((i) => i.selector));
    const afterSelectors = new Set(after.items.map((i) => i.selector));

    const blocksZoom = (await page.evaluate(() => {
      const v = document.querySelector('meta[name="viewport"]');
      return v ? /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*(1(\.0)?|0)/i.test(v.getAttribute('content') || '') : false;
    })) as boolean;

    return {
      horizontalScrollAt200: after.horizontalScroll && !before.horizontalScroll,
      clippedElements: after.items.filter((i) => i.clipped).slice(0, 25).map((i) => ({ selector: i.selector, text: i.text })),
      // Text that was measurable at 100% and vanished at 200% has been clipped
      // out of the layout entirely — the most serious form of this failure.
      lostElements: before.items
        .filter((i) => beforeSelectors.has(i.selector) && !afterSelectors.has(i.selector))
        .slice(0, 25)
        .map((i) => ({ selector: i.selector, text: i.text })),
      blocksZoom,
    };
  }
}
