/**
 * Drives real Tab presses through the page.
 *
 * Four criteria in the sheet are about behaviour that no static analysis can
 * see, and axe-core does not attempt: keyboard reachability (2.1.1), keyboard
 * traps (2.1.2), focus order (2.4.3), focus visibility (2.4.7), and context
 * change on focus (3.2.1). This walk is the evidence source for all of them.
 *
 * It is deliberately bounded and side-effect-light: Tab only, never Enter or
 * Space, so the page is not navigated or mutated by the audit itself.
 */

import type { Page } from 'playwright';

export interface FocusStop {
  index: number;
  selector: string;
  tag: string;
  role: string | null;
  name: string;
  /** Geometry, for comparing focus order against visual order. */
  top: number;
  left: number;
  right: number;
  visible: boolean;
  /**
   * Whether this element is, or wraps, an embedded frame. Focus that moves into
   * a cross-origin frame is invisible to the outer document, which reports the
   * wrapper as holding focus press after press — indistinguishable from a trap
   * unless the wrapper is checked for a frame inside it.
   */
  containsFrame: boolean;
  /** Whether a visible focus indicator appeared. */
  focusIndicator: {
    changed: boolean;
    outlineWidth: string;
    outlineStyle: string;
    outlineColor: string;
    boxShadow: string;
    /** Style diff against the same element unfocused. */
    diffs: string[];
  };
  /** Set when focusing this element changed the page context (criterion 3.2.1). */
  contextChange?: { kind: string; detail: string };
}

export interface KeyboardWalkResult {
  stops: FocusStop[];
  /** Focus stopped advancing — a trap (criterion 2.1.2). */
  trap: { selector: string; name: string; repeatedTimes: number } | null;
  /**
   * The walk reached an embedded frame and could not continue past it.
   *
   * When focus is inside an `<iframe>`, the top document's `activeElement`
   * stays on the frame element however many times Tab is pressed. That looks
   * identical to a keyboard trap from outside, so it must not be reported as
   * one — a third-party video embed would fail every page it appears on.
   */
  frameBoundary: { selector: string; name: string } | null;
  /** Focus left the document entirely (into browser chrome) and came back. */
  completedCycle: boolean;
  /** Elements with a click handler that the walk never reached (criterion 2.1.1). */
  unreachableInteractive: { selector: string; text: string; reason: string }[];
  /** Stops with no measurable focus indicator (criterion 2.4.7). */
  missingFocusIndicator: { selector: string; name: string; tag: string }[];
  /** Focus order that departs from visual order (criterion 2.4.3). */
  orderMismatches: { selector: string; name: string; focusPosition: number; visualPosition: number }[];
  truncated: boolean;
}

const MAX_STOPS = 150;

export async function keyboardWalk(page: Page): Promise<KeyboardWalkResult> {
  await page.evaluate(() => {
    (window as unknown as { __is5568Phase?: string }).__is5568Phase = 'keyboard-walk';
  });

  // Baseline styles for every focusable element while unfocused, so the focus
  // indicator can be measured as a *difference* rather than guessed from the
  // presence of an outline (many designs use box-shadow or a border instead).
  const baseline = await page.evaluate(() => {
    const probe = (window as unknown as { __is5568SelectorFor?: (el: Element) => string }).__is5568SelectorFor;
    const out: Record<string, { outlineWidth: string; outlineStyle: string; outlineColor: string; boxShadow: string; borderColor: string; backgroundColor: string; color: string; textDecoration: string }> = {};
    const els = Array.from(
      document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], summary, details, [contenteditable="true"]'),
    );
    for (const el of els.slice(0, 300)) {
      const key = probe ? probe(el) : '';
      if (!key) continue;
      const s = getComputedStyle(el);
      out[key] = {
        outlineWidth: s.outlineWidth,
        outlineStyle: s.outlineStyle,
        outlineColor: s.outlineColor,
        boxShadow: s.boxShadow,
        borderColor: s.borderColor,
        backgroundColor: s.backgroundColor,
        color: s.color,
        textDecoration: s.textDecorationLine || s.textDecoration,
      };
    }
    return out;
  });

  const stops: FocusStop[] = [];
  const seenSelectors = new Map<string, number>();
  let trap: KeyboardWalkResult['trap'] = null;
  let frameBoundary: KeyboardWalkResult['frameBoundary'] = null;
  let completedCycle = false;
  let truncated = false;

  // Start from the very top of the document so the first Tab lands on whatever
  // the page puts first — which is what the skip-link criterion cares about.
  await page.evaluate(() => {
    document.body?.focus();
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });

  const before = await page.evaluate(() => (window as unknown as { __is5568Snapshot: () => unknown }).__is5568Snapshot());

  for (let i = 0; i < MAX_STOPS; i++) {
    await page.keyboard.press('Tab');

    const stop = await page.evaluate(
      ({ baselineMap, index }) => {
        const w = window as unknown as {
          __is5568SelectorFor?: (el: Element) => string;
          __is5568AccName?: (el: Element) => string;
        };
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el === document.documentElement) return null;

        const selector = w.__is5568SelectorFor ? w.__is5568SelectorFor(el) : el.tagName.toLowerCase();
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const base = (baselineMap as Record<string, Record<string, string>>)[selector];

        const diffs: string[] = [];
        if (base) {
          for (const prop of ['outlineWidth', 'outlineStyle', 'outlineColor', 'boxShadow', 'borderColor', 'backgroundColor', 'color', 'textDecoration'] as const) {
            const now = prop === 'textDecoration' ? s.textDecorationLine || s.textDecoration : (s as unknown as Record<string, string>)[prop];
            if (base[prop] !== undefined && base[prop] !== now) diffs.push(`${prop}: ${base[prop]} → ${now}`);
          }
        }
        // An outline the UA draws counts even without a baseline diff.
        const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const hasShadow = s.boxShadow !== 'none' && s.boxShadow !== '';

        const containsFrame =
          el.tagName === 'IFRAME' || el.tagName === 'FRAME' || el.querySelector('iframe, frame') !== null;

        return {
          index,
          selector,
          containsFrame,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          name: w.__is5568AccName ? w.__is5568AccName(el) : (el.textContent || '').trim().slice(0, 80),
          top: Math.round(r.top + window.scrollY),
          left: Math.round(r.left + window.scrollX),
          right: Math.round(r.right + window.scrollX),
          visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden',
          focusIndicator: {
            changed: diffs.length > 0 || hasOutline || hasShadow,
            outlineWidth: s.outlineWidth,
            outlineStyle: s.outlineStyle,
            outlineColor: s.outlineColor,
            boxShadow: hasShadow ? s.boxShadow.slice(0, 120) : 'none',
            diffs,
          },
        } as FocusStop;
      },
      { baselineMap: baseline, index: i },
    );

    if (!stop) {
      // Focus left the document — the natural end of one cycle.
      completedCycle = true;
      break;
    }

    // A trap shows up as the same element holding focus across several presses.
    const repeats = (seenSelectors.get(stop.selector) ?? 0) + 1;
    seenSelectors.set(stop.selector, repeats);
    const lastTwo = stops.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((s) => s.selector === stop.selector)) {
      /*
       * A wrapper counts as much as the frame itself.
       *
       * Cloudflare Turnstile renders `<div><div><iframe>`, and focus entering
       * that iframe leaves the outer document's `activeElement` sitting on a
       * div — which then repeats and reads exactly like a trap. A real scan
       * reported a keyboard trap on a working CAPTCHA because of this, and the
       * remedy it implied was to remove the site's spam protection.
       *
       * Not seeing past a frame is not evidence of a trap behind it, so this
       * becomes a manual check rather than a finding.
       */
      if (stop.containsFrame) {
        frameBoundary = { selector: stop.selector, name: stop.name };
      } else {
        trap = { selector: stop.selector, name: stop.name, repeatedTimes: repeats };
      }
      break;
    }
    // Returned to the first stop: a full cycle, not a trap.
    if (stops.length > 3 && stop.selector === stops[0]?.selector) {
      completedCycle = true;
      break;
    }

    stops.push(stop);
    if (stops.length >= MAX_STOPS) truncated = true;
  }

  const after = await page.evaluate(() => (window as unknown as { __is5568Snapshot: () => unknown }).__is5568Snapshot());
  const contextEvents = await page.evaluate(
    () => (window as unknown as { __is5568ContextChanges: unknown[]; __is5568Navigations: unknown[] }),
  ).then((w) => [...((w.__is5568ContextChanges as { kind: string; url?: string; activeElement?: string; phase?: string }[]) ?? []), ...((w.__is5568Navigations as { kind: string; url?: string; activeElement?: string; phase?: string }[]) ?? [])])
    .catch(() => [] as { kind: string; url?: string; activeElement?: string; phase?: string }[]);

  for (const ev of contextEvents) {
    if (ev.phase !== 'keyboard-walk') continue;
    const match = stops.find((s) => ev.activeElement && s.selector.includes(ev.activeElement.split('[')[0] ?? ''));
    if (match) match.contextChange = { kind: ev.kind, detail: ev.url ?? '' };
  }

  await page.evaluate(() => {
    (window as unknown as { __is5568Phase?: string }).__is5568Phase = 'idle';
  });

  // Interactive-looking elements the walk never landed on.
  const reached = new Set(stops.map((s) => s.selector));
  const unreachableInteractive = await page
    .evaluate(() => {
      const w = window as unknown as { __is5568SelectorFor?: (el: Element) => string };
      const out: { selector: string; text: string; reason: string }[] = [];
      const candidates = Array.from(document.querySelectorAll('div, span, li, i, td'));
      for (const el of candidates) {
        if (out.length >= 30) break;
        const htmlEl = el as HTMLElement;
        if (htmlEl.tabIndex >= 0) continue;
        if (el.getAttribute('role')) continue;
        if (el.querySelector('a[href], button, input, select, textarea')) continue;
        const cls = (el.className || '').toString().toLowerCase();
        const pointer = getComputedStyle(el).cursor === 'pointer';
        const hasInline = el.hasAttribute('onclick');
        const looksClickable = /\b(btn|button|clickable|toggle|tab|accordion|dropdown|close|menu-item)\b/.test(cls);
        if (!hasInline && !(pointer && looksClickable)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        out.push({
          selector: w.__is5568SelectorFor ? w.__is5568SelectorFor(el) : el.tagName.toLowerCase(),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          reason: hasInline ? 'מאזין onclick על אלמנט שאינו פקד' : 'נראה כפקד (cursor:pointer + מחלקה) אך אינו נגיש ב-Tab',
        });
      }
      return out;
    })
    .catch(() => [] as { selector: string; text: string; reason: string }[]);

  /*
   * A frame wrapper is excluded.
   *
   * When focus moves into a cross-origin frame the indicator is drawn inside
   * it, by content the outer document cannot inspect — so the wrapper always
   * computes as "no style change" and reads as a missing focus indicator. A
   * real scan reported one against a working CAPTCHA. Same reasoning as the
   * trap check: not seeing something across a frame boundary is not evidence
   * that it is absent.
   */
  const missingFocusIndicator = stops
    .filter((s) => s.visible && !s.focusIndicator.changed && !s.containsFrame)
    .map((s) => ({ selector: s.selector, name: s.name, tag: s.tag }));

  // Focus order vs visual order, direction-aware.
  const rtl = await page.evaluate(() => getComputedStyle(document.documentElement).direction === 'rtl').catch(() => false);
  const visualSorted = stops
    .filter((s) => s.visible)
    .slice()
    .sort((a, b) => (Math.abs(a.top - b.top) > 12 ? a.top - b.top : rtl ? b.right - a.right : a.left - b.left));
  const orderMismatches: KeyboardWalkResult['orderMismatches'] = [];
  visualSorted.forEach((s, visualPos) => {
    const focusPos = stops.indexOf(s);
    if (Math.abs(focusPos - visualPos) > 3 && orderMismatches.length < 20) {
      orderMismatches.push({ selector: s.selector, name: s.name, focusPosition: focusPos, visualPosition: visualPos });
    }
  });

  void before;
  void after;

  return {
    stops,
    trap,
    frameBoundary,
    completedCycle,
    unreachableInteractive: unreachableInteractive.filter((u) => !reached.has(u.selector)),
    missingFocusIndicator,
    orderMismatches,
    truncated,
  };
}
