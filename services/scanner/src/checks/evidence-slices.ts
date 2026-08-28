/**
 * Evidence slicing.
 *
 * A criterion is judged from a narrow projection of the page, not the DOM. This
 * is the main lever on both cost and accuracy: handing a model 300 KB of markup
 * to answer "is this link's purpose clear?" buries the four links that matter
 * and makes the answer worse, not just more expensive.
 *
 * Rows that declare the same slice are batched into one request, so all the
 * link criteria share one link inventory instead of sending it three times.
 */

import type { EvidenceSlice } from '@ai5568/criteria';
import type { PageBundle, PageEvidence } from '../crawl/browser.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = Record<string, any>;

/** Slices that need a screenshot to be judgeable at all. */
export const VISUAL_SLICES: ReadonlySet<EvidenceSlice> = new Set<EvidenceSlice>([
  'colorUsage',
  'contrast',
  'textImages',
  'focusVisible',
  'sensoryText',
  'readingOrder',
]);

const MAX_ROWS = 60;

/**
 * Caps a collection from the (deliberately loose) evidence object.
 *
 * The probe's output is JSON with no compile-time shape, so this takes
 * `unknown` and hands back `any[]` rather than pretending to a type it cannot
 * verify. The slices are prompt payloads, not program logic — a shape mismatch
 * shows up as a missing field in the evidence, not as a wrong verdict.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function take(list: unknown, n = MAX_ROWS): any[] {
  return Array.isArray(list) ? list.slice(0, n) : [];
}

/**
 * Builds the slice. Returns a plain object that is JSON-serialised into the
 * prompt — deliberately not raw HTML, so the model sees resolved facts
 * (accessible name, computed contrast, visibility) rather than having to infer
 * them from markup.
 */
export function buildSlice(slice: EvidenceSlice, bundle: PageBundle): unknown {
  const e = bundle.evidence as PageEvidence & Ev;

  switch (slice) {
    case 'images':
      return {
        images: take(e.images).map((i: Ev) => ({
          selector: i.selector,
          tag: i.tag,
          src: i.src,
          alt: i.alt,
          hasAltAttribute: i.hasAltAttr,
          ariaLabel: i.ariaLabel,
          role: i.role,
          hiddenFromAssistiveTech: i.ariaHidden,
          insideLink: i.inLink,
          linkTarget: i.linkHref,
          sizePx: `${i.width}x${i.height}`,
          figcaption: i.caption,
          surroundingText: i.nearbyText,
          altLooksLikeFilename: i.altLooksLikeFilename,
        })),
      };

    case 'media':
      return {
        media: take(e.media).map((m: Ev) => ({
          selector: m.selector,
          type: m.kind,
          src: m.src,
          accessibleName: m.accessibleName,
          tracks: m.tracks,
          hasCaptionTrack: m.hasCaptionTrack,
          hasDescriptionTrack: m.hasDescriptionTrack,
          autoplay: m.autoplay,
          muted: m.muted,
          hasControls: m.controls,
          surroundingText: m.nearbyText,
        })),
        // Whether a transcript exists is a page-level question, so the model
        // needs the headings to look for one.
        pageHeadings: take(e.structure?.headings, 40).map((h: Ev) => h.text),
      };

    case 'structure':
      return {
        headings: take(e.structure?.headings, 50).map((h: Ev) => ({ level: h.level, text: h.text, selector: h.selector, empty: h.empty })),
        hasH1: e.structure?.hasH1,
        suspectedUnmarkedHeadings: take(e.structure?.fakeHeadings, 30),
        lists: take(e.structure?.lists, 25),
        suspectedTypedLists: take(e.structure?.fakeLists, 20),
        tables: take(e.structure?.tables, 20),
        landmarks: take(e.structure?.landmarks, 25),
        presentationalMarkup: take(e.structure?.presentational, 20),
        sectionCount: e.structure?.sectionCount,
        textLength: e.structure?.textLength,
      };

    case 'readingOrder':
      return {
        pageDirection: e.readingOrder?.rtl ? 'rtl' : 'ltr',
        cssReorderedElements: take(e.readingOrder?.cssReordered, 25),
        domVsVisualMismatches: take(e.readingOrder?.mismatches, 25),
        sampledBlocks: e.readingOrder?.sampled,
      };

    case 'sensoryText':
      return { sensoryReferences: take(e.sensoryText, 30) };

    case 'colorUsage':
      return {
        inTextLinks: take(e.colorUsage?.linksInText, 40),
        colourCodedText: take(e.colorUsage?.colourCoded, 40),
        requiredFieldMarkers: take(e.colorUsage?.requiredMarkers, 30),
      };

    case 'contrast':
      return {
        blocksZoom: e.meta?.blocksZoom,
        viewport: e.meta?.viewportContent,
        zoomAt200: bundle.zoom,
        // Contrast itself is decided by axe; what the model adds is judging the
        // cases axe flagged as undecidable, which are supplied as prior findings.
      };

    case 'textImages':
      return { candidateTextImages: take(e.textImages, 30) };

    case 'keyboard':
      return {
        focusableCount: e.focusable?.count,
        positiveTabindex: take(e.focusable?.positiveTabindex, 20),
        focusableInsideAriaHidden: take(e.focusable?.hiddenButFocusable, 20),
        elementsThatLookClickableButArentFocusable: take(e.aria?.pseudoControls, 25),
        tabOrder: take(bundle.keyboard?.stops, 60)?.map((s) => ({
          position: s.index,
          selector: s.selector,
          tag: s.tag,
          name: s.name,
          hasFocusIndicator: s.focusIndicator.changed,
          contextChange: s.contextChange ?? null,
        })),
        detectedTrap: bundle.keyboard?.trap ?? null,
        frameBoundaryReached: bundle.keyboard?.frameBoundary ?? null,
        focusOrderMismatches: bundle.keyboard?.orderMismatches ?? [],
        walkTruncated: bundle.keyboard?.truncated ?? false,
      };

    case 'timing':
      return {
        metaRefresh: e.motion?.metaRefresh,
        longTimers: take(e.motion?.timers, 25),
      };

    case 'motion':
      return {
        cssAnimations: take(e.motion?.animated, 30),
        carousels: take(e.motion?.carousels, 15),
        autoplayMedia: take(e.motion?.autoplayMedia, 10),
        animatedGifs: take(e.motion?.animatedGifs, 15),
        deprecatedMovingElements: take(e.motion?.deprecated, 10),
      };

    case 'links':
      return {
        links: take(e.links, 80).map((l: Ev) => ({
          selector: l.selector,
          visibleText: l.text,
          accessibleName: l.accessibleName,
          href: l.href,
          title: l.title,
          ariaLabel: l.ariaLabel,
          opensNewWindow: l.opensNewWindow,
          warnsAboutNewWindow: l.warnsNewWindow,
          // The criterion allows the surrounding sentence to supply the purpose,
          // so it must be in the slice or the model would over-report.
          surroundingContext: l.context,
          sameNameDifferentTarget: l.ambiguous,
          visible: l.visible,
        })),
      };

    case 'navigation':
      return {
        pageTitle: e.meta?.title,
        siteName: e.meta?.siteName,
        skipLinks: take(e.navigation?.skipLinks, 15),
        navigationBlocks: take(e.navigation?.navs, 6).map((n: Ev) => ({ label: n.label, itemCount: n.items?.length, items: take(n.items, 25) })),
        landmarks: take(e.structure?.landmarks, 20),
        searchMechanisms: e.navigation?.searchMechanisms,
        sitemapLinks: e.navigation?.sitemapLinks,
        breadcrumbs: e.navigation?.breadcrumbs,
      };

    case 'headingsLabels':
      return {
        headings: take(e.structure?.headings, 50).map((h: Ev) => ({ level: h.level, text: h.text, selector: h.selector })),
        formLabels: take(e.forms?.controls, 50).map((c: Ev) => ({
          selector: c.selector,
          type: c.type,
          label: c.labels?.join(' / ') ?? '',
          accessibleName: c.accessibleName,
          placeholder: c.placeholder,
          hint: c.describedBy?.join(' / ') ?? '',
        })),
      };

    case 'focusVisible':
      return {
        stopsWithoutIndicator: bundle.keyboard?.missingFocusIndicator ?? [],
        sampleIndicators: take(bundle.keyboard?.stops, 25)?.map((s) => ({
          selector: s.selector,
          tag: s.tag,
          outline: `${s.focusIndicator.outlineStyle} ${s.focusIndicator.outlineWidth} ${s.focusIndicator.outlineColor}`,
          boxShadow: s.focusIndicator.boxShadow,
          styleDiffs: s.focusIndicator.diffs,
        })),
      };

    case 'language':
      return {
        declaredLang: e.language?.pageLang,
        declaredDir: e.language?.pageDir,
        contentIsRtl: e.language?.rtlContent,
        elementsWithLang: e.language?.langElements,
        unmarkedForeignPassages: take(e.language?.foreignRuns, 25),
        unmarkedLtrIslands: take(e.language?.ltrIslands, 25),
        englishAccessibleNames: take(e.language?.englishAccessibleNames, 25),
      };

    case 'forms':
      return {
        forms: take(e.forms?.forms, 12),
        controls: take(e.forms?.controls, 50).map((c: Ev) => ({
          selector: c.selector,
          tag: c.tag,
          type: c.type,
          accessibleName: c.accessibleName,
          visibleLabels: c.labels,
          placeholder: c.placeholder,
          placeholderIsOnlyLabel: c.placeholderOnly,
          required: c.required,
          describedBy: c.describedBy,
          autocomplete: c.autocomplete,
          pattern: c.pattern,
          dir: c.dir,
        })),
        captcha: e.forms?.captcha,
      };

    case 'formErrors':
      return {
        errorContainers: take(e.forms?.errorContainers, 25),
        controls: take(e.forms?.controls, 40).map((c: Ev) => ({
          selector: c.selector,
          accessibleName: c.accessibleName,
          required: c.required,
          ariaInvalid: c.ariaInvalid,
          describedBy: c.describedBy,
          pattern: c.pattern,
        })),
        // The scan does not submit forms, so error *behaviour* is inferred from
        // markup. The rubric has to know that, or the model will assert things
        // it cannot see.
        note: 'הסריקה אינה שולחת טפסים; הערכת הודעות השגיאה מבוססת על הסימון בקוד בלבד.',
      };

    case 'markupValidity':
      return {
        duplicateIds: take(e.markup?.duplicateIds, 25),
        brokenAriaReferences: take(e.markup?.brokenRefs, 25),
        labelsPointingNowhere: take(e.markup?.orphanLabels, 25),
        doctype: e.markup?.doctype,
        elementCount: e.markup?.totalElements,
      };

    case 'ariaWidgets':
      return {
        widgets: take(e.aria?.widgets, 40),
        iconOnlyControls: take(e.aria?.iconOnlyButtons, 25),
        iframes: take(e.aria?.iframes, 20),
        elementsActingAsControls: take(e.aria?.pseudoControls, 25),
      };

    case 'siteConsistency': {
      /*
       * The cross-page comparison is supplied by the judge, which alone holds
       * it. But this slice also serves the site-level Israeli rows, and it used
       * to carry nothing else — so a judge asked "is there a preferences
       * widget?" was handed a note and no page evidence, and answered, entirely
       * reasonably, that there was none in the evidence.
       *
       * It said that about a site whose widget the keyboard walk had already
       * found and named. Absence from a slice is not absence from the page, and
       * the fix belongs here rather than in the prompt.
       */
      const e = bundle.evidence as Ev;
      return {
        note: 'ההשוואה בין העמודים מסופקת בהקשר הסריקה.',
        accessibilityWidget: e?.navigation?.a11yWidget ?? null,
        contacts: e?.navigation?.contacts ?? null,
        searchMechanisms: take(e?.navigation?.searchMechanisms, 10),
        sitemapLinks: take(e?.navigation?.sitemapLinks, 10),
        statementLinks: take(e?.navigation?.statementLinks, 10),
        skipLinks: take(e?.navigation?.skipLinks, 10),
      };
    }

    case 'documentStructure':
    case 'documentText':
    case 'documentComplexInfo':
      return { note: 'פרוסת מסמך — מסופקת על ידי מנתח המסמכים.' };

    default:
      return {};
  }
}

/** Rough token estimate, for the budget guard. Hebrew runs ~2 chars/token. */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? '').length / 2.5);
}
