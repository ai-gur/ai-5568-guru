/* eslint-disable */
/**
 * Page evidence probe. Runs inside the browser, returns one plain-JSON object.
 *
 * Two jobs:
 *   1. Feed the applicability probes, so a criterion is marked Not Applicable
 *      only when the thing it governs is genuinely absent from the page.
 *   2. Produce the per-criterion evidence slices the LLM layer judges from.
 *      Slices are narrow on purpose — handing a model the whole DOM makes it
 *      worse at the judgement, not just more expensive.
 *
 * Written as plain JS (not TS) so it can be injected verbatim and debugged in
 * DevTools against a live page.
 *
 * Installs `window.__is5568Probe()`.
 */
(function () {
  'use strict';

  var MAX_ITEMS = 200;          // per collection, keeps payloads bounded
  var SNIPPET_LEN = 300;
  var TEXT_LEN = 200;

  // ── helpers ───────────────────────────────────────────────────────────────

  function trunc(s, n) {
    if (s == null) return '';
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function outer(el) {
    try {
      var html = el.outerHTML || '';
      // Keep the opening tag plus a little content — enough to recognise the element.
      return trunc(html, SNIPPET_LEN);
    } catch (e) {
      return '';
    }
  }

  /** Stable, reasonably short CSS selector. Prefers id, then a nth-of-type path. */
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '#' + CSS.escape(el.id);
    }
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      var tag = node.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') {
        parts.unshift(tag);
        break;
      }
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      var parent = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      var siblings = Array.prototype.filter.call(parent.children, function (c) {
        return c.tagName === node.tagName;
      });
      if (siblings.length > 1) {
        parts.unshift(tag + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')');
      } else {
        parts.unshift(tag);
      }
      node = parent;
    }
    return parts.join(' > ');
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (parseFloat(style.opacity) === 0) return false;
    if (el.hasAttribute && el.hasAttribute('hidden')) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  /** Hidden from assistive tech (as opposed to merely off-screen, which is fine). */
  function isAriaHidden(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.getAttribute('aria-hidden') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Accessible name, simplified. Not a full AccName implementation — axe-core
   * does that properly and owns the pass/fail for naming criteria. This exists
   * so the LLM slices can show what a screen reader would roughly announce.
   */
  function accessibleName(el) {
    if (!el) return '';
    var labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      var parts = labelledby.split(/\s+/).map(function (id) {
        var t = document.getElementById(id);
        return t ? t.textContent : '';
      });
      var joined = parts.join(' ').trim();
      if (joined) return trunc(joined, TEXT_LEN);
    }
    var label = el.getAttribute('aria-label');
    if (label && label.trim()) return trunc(label, TEXT_LEN);

    var tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'area' || (tag === 'input' && el.type === 'image')) {
      if (el.hasAttribute('alt')) return trunc(el.getAttribute('alt'), TEXT_LEN);
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.labels && el.labels.length) {
        return trunc(Array.prototype.map.call(el.labels, function (l) { return l.textContent; }).join(' '), TEXT_LEN);
      }
      if (el.type === 'submit' || el.type === 'button') return trunc(el.value, TEXT_LEN);
    }
    var text = (el.textContent || '').trim();
    if (text) return trunc(text, TEXT_LEN);
    var title = el.getAttribute('title');
    if (title) return trunc(title, TEXT_LEN);
    return '';
  }

  function effectiveBackground(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg)) return bg;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }

  function parseRgb(s) {
    var m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance(c) {
    var ch = [c.r, c.g, c.b].map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function contrastRatio(fg, bg) {
    var a = parseRgb(fg), b = parseRgb(bg);
    if (!a || !b) return null;
    var l1 = luminance(a), l2 = luminance(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }

  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function cap(arr) {
    return arr.slice(0, MAX_ITEMS);
  }

  var HEBREW = /[֐-׿]/;
  var ARABIC = /[؀-ۿ]/;
  var LATIN = /[A-Za-z]/;

  function pageIsRtlLanguage() {
    var text = (document.body ? document.body.innerText : '') || '';
    var sample = text.slice(0, 4000);
    var heb = (sample.match(/[֐-׿]/g) || []).length;
    var ara = (sample.match(/[؀-ۿ]/g) || []).length;
    var lat = (sample.match(/[A-Za-z]/g) || []).length;
    return heb + ara > lat;
  }

  // ── collectors ────────────────────────────────────────────────────────────

  function collectImages() {
    var out = [];
    all('img, svg, [role="img"], input[type="image"], area, object, picture').forEach(function (el) {
      if (out.length >= MAX_ITEMS) return;
      var tag = el.tagName.toLowerCase();
      var rect = el.getBoundingClientRect();
      var alt = el.hasAttribute('alt') ? el.getAttribute('alt') : null;
      var src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('href') || '';
      var inLink = !!el.closest('a[href], button');
      var linkHref = inLink ? (el.closest('a[href]') || {}).href || '' : '';
      out.push({
        selector: selectorFor(el),
        tag: tag,
        src: trunc(src, 160),
        alt: alt,
        hasAltAttr: el.hasAttribute('alt'),
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        ariaHidden: isAriaHidden(el),
        title: el.getAttribute('title'),
        longdesc: el.getAttribute('longdesc'),
        inLink: inLink,
        linkHref: trunc(linkHref, 160),
        linkText: inLink ? trunc((el.closest('a[href]') || {}).textContent || '', 100) : '',
        /*
         * The accessible name of the enclosing link, which is what actually
         * decides this row for an image inside one.
         *
         * `alt=""` on an image whose link is named by `aria-label` is the
         * correct pattern, not a defect — adding alt as well makes a screen
         * reader announce the link twice. Without this field the evidence shows
         * an empty alt and a null aria-label *on the image*, and a judge
         * reasoning from it reports a missing text alternative on markup that
         * was already right.
         */
        linkAccessibleName: inLink ? trunc(accessibleName(el.closest('a[href], button')) || '', 120) : '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: isVisible(el),
        // A large image with no alt in the main content is a very different
        // finding from a 1px tracking pixel, so surface size to the model.
        likelyDecorative: (rect.width <= 24 && rect.height <= 24) || alt === '',
        snippet: outer(el),
        // Filenames leaking into alt is a distinctive, common failure.
        altLooksLikeFilename: !!(alt && /\.(jpe?g|png|gif|svg|webp)$/i.test(alt.trim())),
        caption: (function () {
          var fig = el.closest('figure');
          var cap = fig ? fig.querySelector('figcaption') : null;
          return cap ? trunc(cap.textContent, TEXT_LEN) : '';
        })(),
        nearbyText: (function () {
          var p = el.parentElement;
          return p ? trunc(p.textContent, 150) : '';
        })(),
      });
    });
    return out;
  }

  function collectMedia() {
    var out = [];
    all('video, audio, object, embed, iframe').forEach(function (el) {
      if (out.length >= MAX_ITEMS) return;
      var tag = el.tagName.toLowerCase();
      var src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      var sources = all('source', el).map(function (s) { return s.getAttribute('src') || ''; });
      var tracks = all('track', el).map(function (t) {
        return { kind: t.getAttribute('kind'), srclang: t.getAttribute('srclang'), label: t.getAttribute('label'), src: trunc(t.getAttribute('src') || '', 120) };
      });
      var isPlayerFrame = tag === 'iframe' && /youtube|youtu\.be|vimeo|dailymotion|wistia|jwplayer|kaltura|brightcove|soundcloud|spotify/i.test(src);
      out.push({
        selector: selectorFor(el),
        tag: tag,
        src: trunc(src, 200),
        sources: sources.map(function (s) { return trunc(s, 160); }),
        tracks: tracks,
        hasCaptionTrack: tracks.some(function (t) { return t.kind === 'captions' || t.kind === 'subtitles'; }),
        hasDescriptionTrack: tracks.some(function (t) { return t.kind === 'descriptions'; }),
        autoplay: el.hasAttribute('autoplay'),
        muted: el.hasAttribute('muted') || el.muted === true,
        loop: el.hasAttribute('loop'),
        controls: el.hasAttribute('controls'),
        title: el.getAttribute('title'),
        ariaLabel: el.getAttribute('aria-label'),
        accessibleName: accessibleName(el),
        isPlayerFrame: isPlayerFrame,
        ariaHidden: isAriaHidden(el),
        // `<video>` with no audio track can't be told apart from one that has
        // audio without playing it, so we report what we can see and let the
        // rubric handle the ambiguity rather than guessing.
        kind: tag === 'audio' ? 'audio' : tag === 'video' ? 'video' : isPlayerFrame ? 'player' : 'embed',
        nearbyText: (function () {
          var p = el.parentElement;
          return p ? trunc(p.textContent, 250) : '';
        })(),
        snippet: outer(el),
      });
    });
    return out;
  }

  function collectStructure() {
    var headings = cap(all('h1,h2,h3,h4,h5,h6,[role="heading"]').map(function (el) {
      var lvl = el.getAttribute('aria-level') || (el.tagName.match(/^H(\d)$/) ? el.tagName[1] : null);
      return {
        selector: selectorFor(el),
        level: lvl ? Number(lvl) : null,
        text: trunc(el.textContent, TEXT_LEN),
        empty: !(el.textContent || '').trim() && !el.querySelector('img[alt]:not([alt=""])'),
        visible: isVisible(el),
      };
    }));

    var bodyStyle = document.body ? getComputedStyle(document.body) : null;
    var baseSize = bodyStyle ? parseFloat(bodyStyle.fontSize) || 16 : 16;

    // Pseudo-headings: styled to look like a heading, not marked up as one.
    // This is consistently the highest-yield finding for criterion 1.3.1.
    var fakeHeadings = [];
    all('p, div, span, strong, b, td, li').forEach(function (el) {
      if (fakeHeadings.length >= 60) return;
      if (el.closest('h1,h2,h3,h4,h5,h6,[role="heading"]')) return;
      // The site wordmark: a link inside the banner landmark, carrying the
      // organisation's name at display size. It is site identity, not a section
      // heading, and marking it up as one would put a stray <h1> or <h2> on
      // every page of the site.
      //
      // This exclusion was added after the rule fired on our own header, which
      // is the worst possible reason to relax a check — so the test applied was
      // whether it would be a false positive on OTHER sites. It would: nearly
      // every site styles its wordmark larger or bolder than body text inside a
      // link home. The rule already skips icons, badges and bare numbers for
      // the same reason. Kept deliberately narrow: only inside a link, and only
      // within a banner.
      if (el.closest('header a, [role="banner"] a')) return;
      if (!isVisible(el)) return;
      // Hidden from assistive tech: it cannot be a heading a screen reader
      // should have been able to navigate to, so it is not a missing one.
      if (isAriaHidden(el)) return;
      /*
       * A list item is not an unmarked heading.
       *
       * `<ul><li>` already conveys the grouping this criterion asks for, and
       * every list item has a following sibling below it — so a styled list
       * satisfies the geometry test below on every single item. A real scan
       * reported six findings against three correctly marked-up lists.
       */
      var parentTag = el.parentElement ? el.parentElement.tagName : '';
      if (el.tagName === 'LI' && (parentTag === 'UL' || parentTag === 'OL' || parentTag === 'MENU')) return;

      var text = (el.textContent || '').trim();
      if (!text || text.length > 120) return;

      /*
       * Prose is not a heading either. A heading labels what follows; it does
       * not end in a full stop and it is not several clauses long. Lead
       * paragraphs are routinely set larger than body text — that is typography,
       * and marking one up as a heading would put a sentence in the document
       * outline.
       */
      if (/[.!?。]$/.test(text) && text.length > 45) return;
      if ((text.match(/[,;:،]/g) || []).length >= 2) return;
      // Icons, badges, tick marks and bare numbers are styled large or bold all
      // the time and are never headings. Require at least two actual letters —
      // without this, every "✔" and "12" in a stat tile is reported.
      if ((text.match(/[\p{L}]/gu) || []).length < 2) return;
      // Only consider leaf-ish nodes, or we flag every wrapper.
      if (el.children.length > 1) return;
      var st = getComputedStyle(el);
      if (st.display.indexOf('inline') === 0) return;
      var size = parseFloat(st.fontSize) || baseSize;
      var weight = parseInt(st.fontWeight, 10) || 400;
      var bigger = size >= baseSize * 1.2;
      var bolder = weight >= 600;
      if (!bigger && !bolder) return;
      // A heading introduces something: require a following sibling with content.
      var next = el.nextElementSibling;
      if (!next || !(next.textContent || '').trim()) return;
      // …and it must sit *above* that content. A candidate whose next sibling
      // starts on the same line is one of a row of chips, badges or stat tiles,
      // not a heading. Checking geometry rather than `display` is what catches
      // this: flex and grid children are blockified by CSS, so a bold span in a
      // chip row computes to `display: block` and looks like a heading to any
      // style-based test.
      var elRect = el.getBoundingClientRect();
      var nextRect = next.getBoundingClientRect();
      if (nextRect.top < elRect.bottom - 2) return;
      fakeHeadings.push({
        selector: selectorFor(el),
        text: trunc(text, 120),
        fontSizePx: Math.round(size * 10) / 10,
        fontWeight: weight,
        baseFontSizePx: Math.round(baseSize * 10) / 10,
        snippet: outer(el),
      });
    });

    var tables = cap(all('table').map(function (t) {
      var ths = all('th', t);
      var rows = all('tr', t);
      var hasCaption = !!t.querySelector('caption');
      var cellsWithScope = ths.filter(function (th) { return th.hasAttribute('scope'); }).length;
      // A layout table has no headers and no caption but does have structure.
      var looksLikeLayout = ths.length === 0 && !hasCaption && rows.length > 1;
      return {
        selector: selectorFor(t),
        rows: rows.length,
        cols: rows.length ? all('td,th', rows[0]).length : 0,
        thCount: ths.length,
        thWithScope: cellsWithScope,
        hasCaption: hasCaption,
        captionText: hasCaption ? trunc(t.querySelector('caption').textContent, 120) : '',
        hasSummary: t.hasAttribute('summary'),
        role: t.getAttribute('role'),
        looksLikeLayout: looksLikeLayout,
        nestedTables: all('table', t).length,
        mergedCells: all('td[colspan], td[rowspan], th[colspan], th[rowspan]', t).length,
        snippet: outer(t),
      };
    }));

    var lists = cap(all('ul, ol, dl').map(function (l) {
      return {
        selector: selectorFor(l),
        tag: l.tagName.toLowerCase(),
        items: l.children.length,
        // Direct children that aren't li/dt/dd break list semantics.
        invalidChildren: Array.prototype.filter.call(l.children, function (c) {
          var t = c.tagName.toLowerCase();
          return l.tagName === 'DL' ? t !== 'dt' && t !== 'dd' && t !== 'div' : t !== 'li' && t !== 'template' && t !== 'script';
        }).length,
      };
    }));

    // Paragraphs that are really lists typed by hand.
    var fakeLists = [];
    all('p, div').forEach(function (el) {
      if (fakeLists.length >= 30) return;
      if (el.children.length > 0) return;
      var text = (el.textContent || '').trim();
      if (!/^[\-–—•*▪◦●·]|^\d+[.)]\s/.test(text)) return;
      var sib = el.nextElementSibling;
      if (!sib) return;
      var sibText = (sib.textContent || '').trim();
      if (!/^[\-–—•*▪◦●·]|^\d+[.)]\s/.test(sibText)) return;
      fakeLists.push({ selector: selectorFor(el), text: trunc(text, 120), snippet: outer(el) });
    });

    var landmarks = all('header,nav,main,footer,aside,section[aria-label],section[aria-labelledby],form[aria-label],[role="banner"],[role="navigation"],[role="main"],[role="contentinfo"],[role="complementary"],[role="search"],[role="region"]').map(function (el) {
      return {
        selector: selectorFor(el),
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || null,
        label: el.getAttribute('aria-label') || accessibleName(el).slice(0, 60) || null,
      };
    });

    // Presentational markup — criterion 1.3.1 row 2 (content/presentation split).
    var presentational = cap(all('font, center, marquee, blink, [bgcolor], [align], basefont, big, strike, tt').map(function (el) {
      return { selector: selectorFor(el), tag: el.tagName.toLowerCase(), snippet: outer(el) };
    }));

    return {
      headings: headings,
      headingLevels: headings.map(function (h) { return h.level; }).filter(Boolean),
      hasH1: headings.some(function (h) { return h.level === 1; }),
      fakeHeadings: fakeHeadings,
      tables: tables,
      lists: lists,
      fakeLists: fakeLists,
      landmarks: landmarks,
      hasMain: landmarks.some(function (l) { return l.tag === 'main' || l.role === 'main'; }),
      presentational: presentational,
      // Long stretches of body text with no heading — used by 2.4.10.
      sectionCount: all('section, article').length,
      textLength: (document.body ? (document.body.innerText || '').length : 0),
    };
  }

  /**
   * Content deliberately removed from the visual layer but left for screen
   * readers — the `sr-only` / `visually-hidden` pattern.
   *
   * It has no visual position by design, so comparing its DOM position against
   * a visual one is meaningless: it will always look out of order. A real scan
   * reported a correctly built <figure> whose sr-only <figcaption> sits before
   * the image, which is exactly where it belongs.
   */
  function isScreenReaderOnly(el) {
    var r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return true;
    var s = getComputedStyle(el);
    if (s.clipPath && s.clipPath !== 'none') return true;
    if (s.clip && s.clip !== 'auto') return true;
    return false;
  }

  function collectReadingOrder() {
    // Compares DOM order against geometric order. In RTL, "first" means the
    // largest x, so the comparison has to know the page direction or every
    // Hebrew page reports as scrambled.
    var rtl = (document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction) === 'rtl';
    var blocks = all('main p, main li, main h1, main h2, main h3, article p, section p, body > div p').slice(0, 120);
    if (blocks.length < 3) {
      blocks = all('p, li, h1, h2, h3').slice(0, 120);
    }
    var items = blocks
      .filter(function (el) { return isVisible(el) && !isScreenReaderOnly(el); })
      .map(function (el, domIndex) {
        var r = el.getBoundingClientRect();
        return {
          selector: selectorFor(el),
          domIndex: domIndex,
          top: Math.round(r.top + window.scrollY),
          left: Math.round(r.left + window.scrollX),
          right: Math.round(r.right + window.scrollX),
          text: trunc(el.textContent, 80),
        };
      });

    var visual = items.slice().sort(function (a, b) {
      if (Math.abs(a.top - b.top) > 12) return a.top - b.top;
      return rtl ? b.right - a.right : a.left - b.left;
    });

    var mismatches = [];
    visual.forEach(function (item, visualIndex) {
      if (Math.abs(item.domIndex - visualIndex) > 2 && mismatches.length < 25) {
        mismatches.push({
          selector: item.selector,
          text: item.text,
          domPosition: item.domIndex,
          visualPosition: visualIndex,
        });
      }
    });

    // Explicit CSS reordering is the mechanism behind most real failures.
    var cssReordered = cap(all('*').filter(function (el) {
      if (!isVisible(el)) return false;
      var st = getComputedStyle(el);
      return (st.order && st.order !== '0') || st.flexDirection === 'row-reverse' || st.flexDirection === 'column-reverse' || (st.gridAutoFlow || '').indexOf('dense') !== -1;
    }).slice(0, 30).map(function (el) {
      var st = getComputedStyle(el);
      return { selector: selectorFor(el), order: st.order, flexDirection: st.flexDirection, text: trunc(el.textContent, 60) };
    }));

    return { rtl: rtl, mismatches: mismatches, cssReordered: cssReordered, sampled: items.length };
  }

  function collectSensoryText() {
    // Wording that points at a sense rather than naming the target.
    //
    // No `\b` around the Hebrew alternatives: JavaScript's word-boundary class
    // is ASCII-only, so `\b` never matches next to a Hebrew letter and every
    // one of these patterns would silently never fire. Boundaries are expressed
    // with explicit whitespace/punctuation classes instead.
    var B = '(?:^|[\\s,.;:!?()"\'\\u00ab\\u00bb\\u2013\\u2014-])';
    var patterns = [
      {
        // The discriminating part is the noun + sensory adjective pair, not the
        // verb. Matching on the verb would also mean enumerating Hebrew final
        // letter forms (לחץ ends in ץ, not צ) for no gain in precision.
        re: new RegExp(
          '(?:הכפתור|הקישור|התיבה|הריבוע|העיגול|המשולש|האייקון|הסמל|הכרטיס|השדה|התמונה)\\s+' +
            '(?:האדומ?|הירוק|הכחול|הצהוב|הכתום|הסגול|האפור|השחור|הלבן|המרובע|העגול|העליון|התחתון|הימני|השמאלי)',
          'g',
        ),
        kind: 'shape-or-colour',
      },
      {
        // Positional reference with no numbered anchor nearby to disambiguate it.
        re: new RegExp(
          B + '(?:מימין|משמאל|למעלה|למטה|בפינה|בתחתית|בראש העמוד|בצד ימין|בצד שמאל|בתיבה שמימין|בתיבה שמשמאל)' +
            '(?![^.!?]{0,30}(?:טבלה\\s*\\d|איור\\s*\\d|תרשים\\s*\\d|סעיף\\s*\\d))',
          'g',
        ),
        kind: 'position',
      },
      {
        re: new RegExp(B + '(?:בצבע\\s+\\S+|המסומנ(?:ים|ות|ת)?\\s+ב(?:אדום|ירוק|כחול|צהוב|כתום)|באדום|בירוק|בכחול)', 'g'),
        kind: 'colour',
      },
      { re: new RegExp(B + '(?:המתן|המתינו|חכה|חכו|תשמע|תשמעו)[^.!?]{0,30}(?:צליל|צפצוף|ביפ|קול)', 'g'), kind: 'sound' },
      { re: /\b(?:click|press|see|select|tap)\b[^.!?]{0,30}\b(?:red|green|blue|yellow|round|square|left|right|above|below)\b/gi, kind: 'sensory-en' },
    ];
    var out = [];
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
        if (!(node.nodeValue || '').trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var node;
    while ((node = walker.nextNode()) && out.length < 40) {
      var text = node.nodeValue;
      for (var i = 0; i < patterns.length; i++) {
        patterns[i].re.lastIndex = 0;
        var m = patterns[i].re.exec(text);
        if (m) {
          out.push({
            selector: selectorFor(node.parentElement),
            kind: patterns[i].kind,
            match: trunc(m[0], 120),
            context: trunc(text, 240),
          });
          break;
        }
      }
    }
    return out;
  }

  function collectColorUsage() {
    // Links sitting inside a block of text: if the only difference is colour,
    // the criterion requires 3:1 against the surrounding text plus a hover or
    // focus style change.
    var linksInText = [];
    all('p a[href], li a[href], td a[href], dd a[href]').slice(0, 80).forEach(function (a) {
      if (!isVisible(a)) return;
      var parent = a.parentElement;
      if (!parent) return;
      var linkStyle = getComputedStyle(a);
      var parentStyle = getComputedStyle(parent);
      var underlined = (linkStyle.textDecorationLine || linkStyle.textDecoration || '').indexOf('underline') !== -1;
      var bolder = (parseInt(linkStyle.fontWeight, 10) || 400) > (parseInt(parentStyle.fontWeight, 10) || 400);
      linksInText.push({
        selector: selectorFor(a),
        text: trunc(a.textContent, 80),
        color: linkStyle.color,
        surroundingColor: parentStyle.color,
        contrastWithText: contrastRatio(linkStyle.color, parentStyle.color),
        underlined: underlined,
        bolder: bolder,
        hasNonColourCue: underlined || bolder || !!a.querySelector('img, svg'),
        borderBottom: linkStyle.borderBottomWidth,
      });
    });

    // Text that carries meaning through colour alone: status words, required
    // markers, legend swatches.
    var colourCoded = [];
    all('span, td, li, div, small, em, strong, label').slice(0, 400).forEach(function (el) {
      if (colourCoded.length >= 40) return;
      if (!isVisible(el) || el.children.length > 0) return;
      var text = (el.textContent || '').trim();
      if (!text || text.length > 60) return;
      var st = getComputedStyle(el);
      var color = parseRgb(st.color);
      if (!color) return;
      // Only flag saturated, non-default colours — grey/near-black body text is fine.
      var maxc = Math.max(color.r, color.g, color.b);
      var minc = Math.min(color.r, color.g, color.b);
      if (maxc - minc < 60) return;
      colourCoded.push({
        selector: selectorFor(el),
        text: trunc(text, 60),
        color: st.color,
        // Does anything but colour distinguish it?
        hasIcon: !!el.querySelector('svg, img, i[class*="icon"]'),
        symbols: /[✓✔✗✘×!⚠★●▲]/.test(text),
        fontWeight: st.fontWeight,
      });
    });

    // Required-field marking, a very common Israeli audit finding.
    var requiredMarkers = all('label, .required, [aria-required="true"], [required]').slice(0, 60).map(function (el) {
      var text = (el.textContent || '').trim();
      return {
        selector: selectorFor(el),
        text: trunc(text, 80),
        hasAsterisk: text.indexOf('*') !== -1,
        // No `\b` on the Hebrew alternatives — see the note in collectSensoryText.
        saysRequired: /חובה|נדרש|שדה הכרחי|\brequired\b/i.test(text),
        ariaRequired: el.getAttribute('aria-required') === 'true' || el.hasAttribute('required'),
      };
    });

    return { linksInText: linksInText, colourCoded: colourCoded, requiredMarkers: requiredMarkers };
  }

  function collectTextImages() {
    // Images likely to contain text: banners, promos, wide short graphics.
    var out = [];
    all('img, [style*="background-image"]').forEach(function (el) {
      if (out.length >= 40) return;
      if (!isVisible(el)) return;
      var r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 40) return;
      var src = (el.getAttribute('src') || getComputedStyle(el).backgroundImage || '').toLowerCase();
      var alt = el.getAttribute('alt') || '';
      var cls = (el.className && el.className.toString ? el.className.toString() : '').toLowerCase();
      // Signals that an image is carrying text: a name or class that says so,
      // or the wide-and-short shape of a banner.
      //
      // Deliberately NOT keyed on the alt text being long: a well-written alt
      // *is* a sentence, so treating sentence-length alt as evidence of
      // text-in-image penalises exactly the images that were done correctly.
      var suspicious =
        /banner|promo|sale|campaign|hero|poster|title|headline|infographic|screenshot|price|מבצע|באנר|כרזה/.test(src + ' ' + cls) ||
        (r.width / Math.max(r.height, 1) > 2.5 && r.width > 400);
      var isLogo = /logo|לוגו|brand/.test(src + ' ' + cls + ' ' + alt.toLowerCase());
      if (!suspicious) return;
      out.push({
        selector: selectorFor(el),
        src: trunc(el.getAttribute('src') || getComputedStyle(el).backgroundImage, 160),
        alt: alt,
        width: Math.round(r.width),
        height: Math.round(r.height),
        isLogo: isLogo,
        className: trunc(cls, 80),
      });
    });
    return out;
  }

  function collectLinks() {
    var seen = {};
    var out = [];
    all('a[href], [role="link"]').forEach(function (a) {
      if (out.length >= MAX_ITEMS) return;
      var text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var name = accessibleName(a);
      var href = a.getAttribute('href') || '';
      var key = name + '||' + href;
      var generic = /^(לחץ כאן|לחצו כאן|כאן|קרא עוד|קראו עוד|למידע נוסף|לפרטים|עוד|המשך|click here|read more|more|here|link|details)$/i.test(text);
      var isUrlText = /^https?:\/\//i.test(text) && text.length > 30;
      // Sentence the link sits in — the criterion allows context to supply the purpose.
      var container = a.closest('p, li, td, dd, h1, h2, h3, h4, figcaption') || a.parentElement;
      out.push({
        selector: selectorFor(a),
        text: trunc(text, 120),
        accessibleName: name,
        href: trunc(href, 200),
        title: a.getAttribute('title'),
        ariaLabel: a.getAttribute('aria-label'),
        opensNewWindow: a.getAttribute('target') === '_blank',
        warnsNewWindow: /חלון חדש|new window|נפתח בלשונית/i.test(name + ' ' + (a.getAttribute('title') || '')),
        generic: generic,
        isUrlText: isUrlText,
        empty: !name,
        imageOnly: !text && !!a.querySelector('img, svg'),
        context: container ? trunc(container.textContent, 240) : '',
        visible: isVisible(a),
        duplicateKey: key,
        /*
         * Which landmark the link sits in.
         *
         * 3.2.3 and 3.2.4 are about components *repeated across pages* — a
         * header, a nav, a footer. Comparing a body link against them treats a
         * `mailto:` in an accessibility statement as the same component as the
         * footer's contact link, and reports the statement's own address as an
         * inconsistent label. That happened on a real site.
         */
        region: (function () {
          if (a.closest('footer, [role="contentinfo"]')) return 'footer';
          if (a.closest('header, [role="banner"]')) return 'header';
          if (a.closest('nav, [role="navigation"]')) return 'nav';
          return 'body';
        })(),
      });
      seen[key] = (seen[key] || 0) + 1;
    });

    // Same visible text pointing at different destinations is a real failure of
    // 2.4.4, and it can only be seen by looking across the whole page.
    var byName = {};
    out.forEach(function (l) {
      if (!l.accessibleName) return;
      byName[l.accessibleName] = byName[l.accessibleName] || new Set();
      byName[l.accessibleName].add(l.href);
    });
    out.forEach(function (l) {
      l.ambiguous = !!(l.accessibleName && byName[l.accessibleName] && byName[l.accessibleName].size > 1);
    });

    return out;
  }

  function collectForms() {
    var controls = cap(all('input, select, textarea, [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [role="spinbutton"], [role="slider"]').map(function (el) {
      var tag = el.tagName.toLowerCase();
      var type = (el.getAttribute('type') || '').toLowerCase();
      var labels = el.labels ? Array.prototype.map.call(el.labels, function (l) { return trunc(l.textContent, 80); }) : [];
      var describedby = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(function (id) {
        var t = document.getElementById(id);
        return t ? trunc(t.textContent, 120) : '(missing:' + id + ')';
      });
      return {
        selector: selectorFor(el),
        tag: tag,
        type: type,
        name: el.getAttribute('name'),
        accessibleName: accessibleName(el),
        labels: labels,
        hasVisibleLabel: labels.length > 0,
        placeholder: el.getAttribute('placeholder'),
        placeholderOnly: !!el.getAttribute('placeholder') && labels.length === 0 && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'),
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        ariaInvalid: el.getAttribute('aria-invalid'),
        describedBy: describedby,
        autocomplete: el.getAttribute('autocomplete'),
        inputmode: el.getAttribute('inputmode'),
        dir: el.getAttribute('dir'),
        pattern: el.getAttribute('pattern'),
        disabled: el.disabled === true,
        visible: isVisible(el),
        onChangeHandler: !!el.getAttribute('onchange'),
        snippet: outer(el),
      };
    }));

    var forms = all('form').map(function (f) {
      var action = f.getAttribute('action') || '';
      var text = (f.textContent || '').toLowerCase();
      // Whether the form carries legal/financial weight decides if 3.3.4 applies.
      var highStakes =
        /תשלום|לתשלום|רכישה|הזמנה|כרטיס אשראי|אשראי|סליקה|חתימה|הסכם|תנאי שימוש|ביטול|מחיקה|תרומה|payment|checkout|credit|purchase|donate|delete|subscribe/.test(text) ||
        !!f.querySelector('input[autocomplete*="cc-"], input[name*="card"], input[name*="credit"], input[type="password"]');
      return {
        selector: selectorFor(f),
        action: trunc(action, 160),
        method: (f.getAttribute('method') || 'get').toLowerCase(),
        novalidate: f.hasAttribute('novalidate'),
        controlCount: all('input,select,textarea', f).length,
        fieldsets: all('fieldset', f).length,
        legends: all('legend', f).length,
        submitLabel: (function () {
          var s = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          return s ? accessibleName(s) : '';
        })(),
        highStakes: highStakes,
        dir: getComputedStyle(f).direction,
      };
    });

    // Error surfaces already in the DOM, plus live regions that could carry them.
    var errorContainers = cap(all('[role="alert"], [aria-live], .error, .invalid, .field-error, [class*="error"], [id*="error"]').map(function (el) {
      return {
        selector: selectorFor(el),
        role: el.getAttribute('role'),
        ariaLive: el.getAttribute('aria-live'),
        text: trunc(el.textContent, 160),
        visible: isVisible(el),
        // Only meaningful when the container has an id a field can point at.
        referencedByField: !!el.id && !!document.querySelector('[aria-describedby~="' + CSS.escape(el.id) + '"]'),
      };
    }));

    var captcha = all('[class*="captcha" i], [id*="captcha" i], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, [data-sitekey]').map(function (el) {
      return { selector: selectorFor(el), tag: el.tagName.toLowerCase(), snippet: outer(el) };
    });

    return { controls: controls, forms: forms, errorContainers: errorContainers, captcha: captcha };
  }

  function collectLanguage() {
    var htmlEl = document.documentElement;
    var pageLang = (htmlEl.getAttribute('lang') || '').toLowerCase();
    var pageDir = htmlEl.getAttribute('dir') || getComputedStyle(htmlEl).direction;
    var rtlContent = pageIsRtlLanguage();

    // Foreign-language runs: a long stretch in the other script with no lang.
    var foreignRuns = [];
    all('p, li, td, h1, h2, h3, h4, blockquote, div').slice(0, 400).forEach(function (el) {
      if (foreignRuns.length >= 25) return;
      if (el.children.length > 0) return;
      if (!isVisible(el)) return;
      if (el.closest('[lang]') !== document.documentElement && el.closest('[lang]')) return;
      var text = (el.textContent || '').trim();
      if (text.length < 40) return;
      var heb = (text.match(/[֐-׿]/g) || []).length;
      var lat = (text.match(/[A-Za-z]/g) || []).length;
      var pageIsHeb = pageLang.indexOf('he') === 0 || rtlContent;
      if (pageIsHeb && lat > 30 && heb < lat * 0.15) {
        foreignRuns.push({ selector: selectorFor(el), text: trunc(text, 200), detected: 'latin', latinChars: lat, hebrewChars: heb });
      } else if (!pageIsHeb && heb > 30 && lat < heb * 0.15) {
        foreignRuns.push({ selector: selectorFor(el), text: trunc(text, 200), detected: 'hebrew', latinChars: lat, hebrewChars: heb });
      }
    });

    // LTR islands inside RTL text — phone numbers, IDs, emails, order refs.
    // Without dir="ltr" the bidi algorithm renders these in the wrong order,
    // which is one of the most common real-world Hebrew accessibility defects.
    var ltrIslands = [];
    if (rtlContent) {
      var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var patterns = [
        { re: /0\d{1,2}[-\s]?\d{7}|\+972[-\s]?\d{1,2}[-\s]?\d{7}/g, kind: 'phone' },
        { re: /\b\d{9}\b/g, kind: 'id-or-number' },
        { re: /[\w.+-]+@[\w-]+\.[\w.]+/g, kind: 'email' },
        { re: /\b[A-Z]{2,}-\d{3,}\b/g, kind: 'reference' },
      ];
      var n;
      while ((n = walker.nextNode()) && ltrIslands.length < 30) {
        var parent = n.parentElement;
        if (!parent) continue;

        // Already isolated? Three forms all solve the problem correctly and
        // none of them should be reported:
        //   dir="ltr"                     — explicit direction
        //   <bdi>                          — the element made for this
        //   unicode-bidi: isolate/plaintext — the CSS equivalent
        // Accepting only dir="ltr" would flag correct markup as a defect.
        var dirEl = parent.closest('[dir]');
        if (dirEl && dirEl.getAttribute('dir') === 'ltr') continue;
        if (parent.closest('bdi')) continue;
        var bidi = getComputedStyle(parent).unicodeBidi || '';
        if (bidi.indexOf('isolate') !== -1 || bidi.indexOf('plaintext') !== -1) continue;
        var value = n.nodeValue || '';
        if (!HEBREW.test(value) && value.trim().length < 4) continue;
        for (var i = 0; i < patterns.length; i++) {
          patterns[i].re.lastIndex = 0;
          var m = patterns[i].re.exec(value);
          if (m) {
            ltrIslands.push({
              selector: selectorFor(parent),
              kind: patterns[i].kind,
              match: trunc(m[0], 60),
              context: trunc(value, 160),
              hasDirLtr: false,
            });
            break;
          }
        }
      }
    }

    // Accessible names left in English on a Hebrew page — screen readers read
    // the accessible name, so this is heard by the user even though it is invisible.
    var englishNames = [];
    if (rtlContent) {
      all('button, a[href], input, select, textarea, [role="button"], [aria-label]').slice(0, 200).forEach(function (el) {
        if (englishNames.length >= 30) return;
        var name = accessibleName(el);
        if (!name || name.length < 3) return;
        if (HEBREW.test(name)) return;
        if (!LATIN.test(name)) return;
        // A URL, email or path is not English prose — it reads the same in any
        // language, and marking it lang="en" would be wrong rather than helpful.
        if (/^(https?:\/\/|www\.|mailto:|tel:|\/|[\w.+-]+@)/i.test(name)) return;
        if (/^[\w.+-]+\.[a-z]{2,}(\/|$)/i.test(name)) return;
        // Brand names and single tokens are usually legitimate.
        if (name.split(/\s+/).length === 1 && name.length < 12) return;
        englishNames.push({ selector: selectorFor(el), name: trunc(name, 80), source: el.getAttribute('aria-label') ? 'aria-label' : 'text' });
      });
    }

    return {
      pageLang: pageLang || null,
      pageDir: pageDir || null,
      rtlContent: rtlContent,
      xmlLang: htmlEl.getAttribute('xml:lang'),
      langElements: all('[lang]').length,
      foreignRuns: foreignRuns,
      ltrIslands: ltrIslands,
      englishAccessibleNames: englishNames,
    };
  }

  function collectMotionAndTiming() {
    var metaRefresh = all('meta[http-equiv="refresh" i]').map(function (m) {
      return { content: m.getAttribute('content') };
    });

    var animated = [];
    all('*').slice(0, 3000).forEach(function (el) {
      if (animated.length >= 40) return;
      if (!isVisible(el)) return;
      var st = getComputedStyle(el);
      var hasAnim = st.animationName && st.animationName !== 'none';
      var hasTransitionLoop = hasAnim && (st.animationIterationCount === 'infinite');
      if (!hasAnim) return;
      var durationSec = parseFloat(st.animationDuration) || 0;
      animated.push({
        selector: selectorFor(el),
        animationName: st.animationName,
        durationSec: durationSec,
        iterationCount: st.animationIterationCount,
        infinite: hasTransitionLoop,
        // Under ~0.33s per cycle is in flash-risk territory for criterion 2.3.1.
        fastFlashRisk: durationSec > 0 && durationSec < 0.34 && hasTransitionLoop,
        text: trunc(el.textContent, 60),
      });
    });

    var carousels = all('[class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="slick" i], [data-ride="carousel"], [class*="marquee" i]').slice(0, 20).map(function (el) {
      var controls = all('button, [role="button"]', el).map(function (b) { return accessibleName(b); }).filter(Boolean);
      return {
        selector: selectorFor(el),
        className: trunc((el.className || '').toString(), 100),
        controlNames: controls.slice(0, 10),
        hasPauseControl: controls.some(function (c) { return /pause|stop|השהה|עצור|הפסק/i.test(c); }),
        autoplayAttr: el.getAttribute('data-autoplay') || el.getAttribute('data-interval') || null,
      };
    });

    var autoplayMedia = all('video[autoplay], audio[autoplay]').map(function (el) {
      return {
        selector: selectorFor(el),
        tag: el.tagName.toLowerCase(),
        muted: el.hasAttribute('muted') || el.muted === true,
        loop: el.hasAttribute('loop'),
        controls: el.hasAttribute('controls'),
        durationSec: isFinite(el.duration) ? Math.round(el.duration) : null,
      };
    });

    var animatedGifs = all('img[src*=".gif" i]').slice(0, 20).map(function (el) {
      return { selector: selectorFor(el), src: trunc(el.getAttribute('src'), 120), alt: el.getAttribute('alt') };
    });

    var deprecated = all('blink, marquee').map(function (el) {
      return { selector: selectorFor(el), tag: el.tagName.toLowerCase(), snippet: outer(el) };
    });

    return {
      metaRefresh: metaRefresh,
      animated: animated,
      carousels: carousels,
      autoplayMedia: autoplayMedia,
      animatedGifs: animatedGifs,
      deprecated: deprecated,
      // Timers set by scripts can't be read from the DOM; the page-level hook
      // in the crawler records them instead (see instrumentation.js).
      timers: (window.__is5568Timers && window.__is5568Timers.slice(0, 40)) || [],
    };
  }

  function collectMarkup() {
    var ids = {};
    var duplicateIds = [];
    all('[id]').forEach(function (el) {
      var id = el.id;
      if (!id) return;
      ids[id] = (ids[id] || 0) + 1;
      if (ids[id] === 2) duplicateIds.push({ id: id, selector: selectorFor(el), snippet: outer(el) });
    });

    // Broken references — a duplicated or missing id silently breaks label
    // association and aria-describedby, which is why 4.1.1 matters in practice.
    var brokenRefs = [];
    ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns'].forEach(function (attr) {
      all('[' + attr + ']').slice(0, 200).forEach(function (el) {
        (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean).forEach(function (id) {
          if (!document.getElementById(id) && brokenRefs.length < 40) {
            brokenRefs.push({ selector: selectorFor(el), attribute: attr, missingId: id, snippet: outer(el) });
          }
        });
      });
    });

    var orphanLabels = all('label[for]').slice(0, 100).filter(function (l) {
      return !document.getElementById(l.getAttribute('for'));
    }).map(function (l) {
      return { selector: selectorFor(l), for: l.getAttribute('for'), text: trunc(l.textContent, 80) };
    });

    return {
      duplicateIds: duplicateIds,
      brokenRefs: brokenRefs,
      orphanLabels: orphanLabels,
      doctype: document.doctype ? document.doctype.name : null,
      totalElements: document.getElementsByTagName('*').length,
    };
  }

  function collectAriaWidgets() {
    var INTERACTIVE_ROLES = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'tablist', 'tabpanel', 'menu', 'menuitem', 'menubar', 'combobox', 'listbox', 'option', 'slider', 'spinbutton', 'dialog', 'alertdialog', 'tree', 'treeitem', 'grid', 'gridcell', 'accordion'];
    var widgets = cap(all('[role]').filter(function (el) {
      return INTERACTIVE_ROLES.indexOf((el.getAttribute('role') || '').toLowerCase()) !== -1;
    }).map(function (el) {
      var role = (el.getAttribute('role') || '').toLowerCase();
      return {
        selector: selectorFor(el),
        role: role,
        accessibleName: accessibleName(el),
        tabindex: el.getAttribute('tabindex'),
        focusable: el.tabIndex >= 0,
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaSelected: el.getAttribute('aria-selected'),
        ariaControls: el.getAttribute('aria-controls'),
        ariaHaspopup: el.getAttribute('aria-haspopup'),
        ariaDisabled: el.getAttribute('aria-disabled'),
        visible: isVisible(el),
        snippet: outer(el),
      };
    }));

    // Elements that behave like controls but aren't marked up as any.
    var pseudoControls = [];
    all('div, span, li, td, i').slice(0, 1500).forEach(function (el) {
      if (pseudoControls.length >= 40) return;
      if (!isVisible(el)) return;
      if (el.getAttribute('role') || el.tabIndex >= 0) return;
      var hasHandler = !!el.getAttribute('onclick');
      var cls = (el.className || '').toString().toLowerCase();
      var looksClickable = /\b(btn|button|clickable|link|toggle|tab|accordion|dropdown|close|menu-item)\b/.test(cls);
      var pointer = getComputedStyle(el).cursor === 'pointer';
      if (!hasHandler && !(looksClickable && pointer)) return;
      // Ignore wrappers whose only child is already a real control.
      if (el.querySelector('a[href], button, input, select, textarea, [role="button"], [role="link"]')) return;
      pseudoControls.push({
        selector: selectorFor(el),
        text: trunc(el.textContent, 80),
        className: trunc(cls, 80),
        hasInlineHandler: hasHandler,
        cursorPointer: pointer,
        snippet: outer(el),
      });
    });

    var iframes = all('iframe, frame').map(function (el) {
      return { selector: selectorFor(el), title: el.getAttribute('title'), src: trunc(el.getAttribute('src') || '', 160) };
    });

    var iconOnlyButtons = all('button, a[href], [role="button"]').slice(0, 200).filter(function (el) {
      var text = (el.textContent || '').trim();
      return !text && (el.querySelector('svg, img, i') || /icon|fa-|material-icons/.test((el.className || '').toString()));
    }).map(function (el) {
      return { selector: selectorFor(el), accessibleName: accessibleName(el), snippet: outer(el) };
    });

    return { widgets: widgets, pseudoControls: pseudoControls, iframes: iframes, iconOnlyButtons: iconOnlyButtons };
  }

  function collectNavigation() {
    var skipLinks = all('a[href^="#"]').slice(0, 20).map(function (a) {
      var targetId = (a.getAttribute('href') || '').slice(1);
      var target = targetId ? document.getElementById(targetId) || document.querySelector('[name="' + CSS.escape(targetId) + '"]') : null;
      var st = getComputedStyle(a);
      return {
        selector: selectorFor(a),
        text: trunc(a.textContent, 80),
        href: a.getAttribute('href'),
        targetExists: !!target,
        targetFocusable: target ? (target.tabIndex >= 0 || target.hasAttribute('tabindex')) : false,
        // display:none can't be revealed on focus; off-screen positioning can.
        permanentlyHidden: st.display === 'none' || st.visibility === 'hidden',
        looksLikeSkip: /דלג|דילוג|skip|לתוכן/i.test(a.textContent || ''),
        domPosition: all('a[href], button, input, select, textarea').indexOf(a),
      };
    });

    var navs = all('nav, [role="navigation"]').map(function (nav) {
      return {
        selector: selectorFor(nav),
        label: nav.getAttribute('aria-label') || null,
        items: all('a[href]', nav).slice(0, 60).map(function (a) {
          return { text: trunc(a.textContent, 60), href: trunc(a.getAttribute('href') || '', 160) };
        }),
      };
    });

    // Site-level obligations: accessibility statement, coordinator, widget.
    var statementLinks = all('a[href]').filter(function (a) {
      var t = (a.textContent || '') + ' ' + (a.getAttribute('href') || '') + ' ' + (a.getAttribute('aria-label') || '');
      return /הצהרת נגישות|הצהרה על נגישות|accessibility.?statement|נגישות/i.test(t);
    }).slice(0, 10).map(function (a) {
      return { selector: selectorFor(a), text: trunc(a.textContent, 80), href: trunc(a.href, 200) };
    });

    var searchMechanisms = all('input[type="search"], [role="search"], form[action*="search" i], input[name*="search" i], input[name*="q" i]').length;
    var sitemapLinks = all('a[href]').filter(function (a) {
      return /מפת אתר|מפת האתר|sitemap/i.test((a.textContent || '') + ' ' + (a.getAttribute('href') || ''));
    }).length;
    var breadcrumbs = all('[class*="breadcrumb" i], [aria-label*="breadcrumb" i], nav ol, [role="navigation"] ol').length;

    // Accessibility preferences widget, and whether it is a compliant
    // preferences tool or a third-party overlay making compliance claims.
    var OVERLAY_VENDORS = ['accessibe', 'userway', 'audioeye', 'equalweb', 'nagish', 'enable.co.il', 'accessiway', 'maxaccess', 'allyable'];
    var scripts = all('script[src]').map(function (s) { return (s.getAttribute('src') || '').toLowerCase(); }).join(' ');
    var detectedVendor = OVERLAY_VENDORS.filter(function (v) { return scripts.indexOf(v) !== -1; });
    var widgetCandidates = all('[class*="accessib" i], [id*="accessib" i], [class*="a11y" i], [id*="a11y" i], [aria-label*="נגישות"], [title*="נגישות"], [class*="negishut" i]').slice(0, 10).map(function (el) {
      return {
        selector: selectorFor(el),
        tag: el.tagName.toLowerCase(),
        accessibleName: accessibleName(el),
        focusable: el.tabIndex >= 0 || ['A', 'BUTTON'].indexOf(el.tagName) !== -1 || !!el.querySelector('a[href], button'),
        visible: isVisible(el),
      };
    });

    return {
      skipLinks: skipLinks,
      navs: navs,
      statementLinks: statementLinks,
      searchMechanisms: searchMechanisms,
      sitemapLinks: sitemapLinks,
      breadcrumbs: breadcrumbs,
      a11yWidget: { candidates: widgetCandidates, overlayVendors: detectedVendor },
      // Coordinator contact details, wherever they appear on the page.
      contacts: {
        emails: (document.body ? (document.body.innerText || '') : '').match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ? Array.from(new Set((document.body.innerText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []))).slice(0, 10) : [],
        phones: Array.from(new Set(((document.body ? document.body.innerText : '') || '').match(/0\d{1,2}[-\s]?\d{7}|\+972[-\s]?\d{1,2}[-\s]?\d{7}/g) || [])).slice(0, 10),
        mentionsCoordinator: /רכז(?:ת)? נגישות|ממונה נגישות/.test((document.body ? document.body.innerText : '') || ''),
      },
    };
  }

  function collectFocusable() {
    var FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable="true"], audio[controls], video[controls], details, summary';
    var els = all(FOCUSABLE).filter(function (el) {
      return !el.disabled && el.tabIndex >= 0 && isVisible(el);
    });
    var positiveTabindex = all('[tabindex]').filter(function (el) {
      return (parseInt(el.getAttribute('tabindex'), 10) || 0) > 0;
    }).map(function (el) {
      return { selector: selectorFor(el), tabindex: el.getAttribute('tabindex'), text: trunc(el.textContent, 60) };
    });

    // Focusable elements inside aria-hidden subtrees are announced as nothing.
    var hiddenButFocusable = els.filter(isAriaHidden).slice(0, 20).map(function (el) {
      return { selector: selectorFor(el), text: trunc(el.textContent, 60), snippet: outer(el) };
    });

    return {
      count: els.length,
      positiveTabindex: positiveTabindex,
      hiddenButFocusable: hiddenButFocusable,
      // A representative sample for the reading-order comparison.
      order: els.slice(0, 120).map(function (el, i) {
        var r = el.getBoundingClientRect();
        return {
          index: i,
          selector: selectorFor(el),
          tag: el.tagName.toLowerCase(),
          name: accessibleName(el),
          top: Math.round(r.top + window.scrollY),
          left: Math.round(r.left + window.scrollX),
          right: Math.round(r.right + window.scrollX),
        };
      }),
    };
  }

  function collectMeta() {
    var ogSite = document.querySelector('meta[property="og:site_name"]');
    var appName = document.querySelector('meta[name="application-name"]');
    var title = (document.title || '').trim();
    // Site name: og:site_name is the reliable source; otherwise the trailing
    // segment of the title after a separator; otherwise the host.
    var siteName = (ogSite && ogSite.getAttribute('content')) || (appName && appName.getAttribute('content')) || '';
    if (!siteName && title) {
      var parts = title.split(/\s[|\-–—•]\s/);
      if (parts.length > 1) siteName = parts[parts.length - 1].trim();
    }
    if (!siteName) siteName = location.hostname.replace(/^www\./, '');

    var viewport = document.querySelector('meta[name="viewport"]');
    return {
      url: location.href,
      title: title,
      siteName: siteName,
      lang: document.documentElement.getAttribute('lang'),
      dir: document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction,
      viewportContent: viewport ? viewport.getAttribute('content') : null,
      // user-scalable=no blocks zoom, which is a direct 1.4.4 failure.
      blocksZoom: viewport ? /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*(1(\.0)?|0)/i.test(viewport.getAttribute('content') || '') : false,
      description: (function () {
        var d = document.querySelector('meta[name="description"]');
        return d ? trunc(d.getAttribute('content'), 200) : null;
      })(),
      charset: document.characterSet,
    };
  }

  /**
   * DOM skeleton hash. Groups pages into templates so the LLM layer can reuse a
   * verdict across pages that differ only in content. Text is deliberately
   * excluded; structure and class names are what define a template.
   */
  function templateHash() {
    var parts = [];
    var walk = function (el, depth) {
      if (depth > 6 || parts.length > 4000) return;
      for (var i = 0; i < el.children.length; i++) {
        var c = el.children[i];
        var tag = c.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
        var cls = (c.className && c.className.toString ? c.className.toString() : '')
          .split(/\s+/)
          .filter(function (x) {
            // Drop hashed/utility classes that change per build or per element.
            return x && x.length < 25 && !/\d{3,}|^[a-z]{1,2}-\d|^css-|^sc-|^jsx-/.test(x);
          })
          .sort()
          .slice(0, 3)
          .join('.');
        parts.push(depth + tag + (cls ? '.' + cls : ''));
        walk(c, depth + 1);
      }
    };
    walk(document.body || document.documentElement, 0);
    var str = parts.join('|');
    // FNV-1a — no crypto in page context, and collisions here only cost a
    // redundant LLM call, never a wrong verdict.
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // Exposed for the keyboard walk and the zoom check, which are driven from
  // Node but need the same selector/name logic so their findings line up with
  // the ones the probe produces.
  window.__is5568SelectorFor = selectorFor;
  window.__is5568AccName = accessibleName;
  window.__is5568IsVisible = isVisible;

  /**
   * Zoom/reflow check for criterion 1.4.4. Called after the driver has scaled
   * text to 200%; compares against the measurements taken at 100%.
   */
  window.__is5568MeasureText = function () {
    var out = [];
    var els = all('p, li, h1, h2, h3, h4, td, label, button, a[href], span');
    for (var i = 0; i < els.length && out.length < 300; i++) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var text = (el.textContent || '').trim();
      if (!text || text.length < 10) continue;
      if (el.children.length > 0) continue;
      var r = el.getBoundingClientRect();
      out.push({
        selector: selectorFor(el),
        text: trunc(text, 60),
        width: Math.round(r.width),
        height: Math.round(r.height),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflow: getComputedStyle(el).overflow,
        // Text clipped by a fixed-height container is the classic 1.4.4 failure.
        clipped: el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY === 'hidden',
      });
    }
    return {
      items: out,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  };

  window.__is5568Probe = function () {
    var structure = collectStructure();
    var forms = collectForms();
    var navigation = collectNavigation();
    var media = collectMedia();
    var images = collectImages();
    var links = collectLinks();
    var motion = collectMotionAndTiming();
    var language = collectLanguage();
    var focusable = collectFocusable();
    var colorUsage = collectColorUsage();
    var sensoryText = collectSensoryText();
    var textImages = collectTextImages();
    var aria = collectAriaWidgets();

    return {
      meta: collectMeta(),
      templateHash: templateHash(),
      images: images,
      media: media,
      structure: structure,
      readingOrder: collectReadingOrder(),
      sensoryText: sensoryText,
      colorUsage: colorUsage,
      textImages: textImages,
      links: links,
      forms: forms,
      language: language,
      motion: motion,
      markup: collectMarkup(),
      aria: aria,
      navigation: navigation,
      focusable: focusable,

      /**
       * Counts that drive the applicability probes. Kept as an explicit block
       * so the NA decision is auditable: every "לא רלוונטי" in the report can
       * be traced to a number that was zero here.
       */
      counts: {
        images: images.filter(function (i) { return !i.ariaHidden; }).length,
        linkedImages: images.filter(function (i) { return i.inLink; }).length,
        decorativeCandidates: images.filter(function (i) { return i.likelyDecorative; }).length,
        complexImages: images.filter(function (i) {
          return /chart|graph|diagram|infographic|תרשים|גרף|תמונה מורכבת/i.test((i.src || '') + ' ' + (i.alt || '') + ' ' + (i.className || ''));
        }).length,
        embeddedMedia: media.filter(function (m) { return m.kind === 'embed' || m.kind === 'player'; }).length,
        audioOnly: media.filter(function (m) { return m.kind === 'audio'; }).length,
        videoElements: media.filter(function (m) { return m.kind === 'video' || m.kind === 'player'; }).length,
        timeBasedMedia: media.filter(function (m) { return m.kind !== 'embed'; }).length,
        captcha: forms.captcha.length,
        autoplayAudio: motion.autoplayMedia.filter(function (m) { return !m.muted; }).length,
        headings: structure.headings.length,
        lists: structure.lists.length,
        tables: structure.tables.length,
        forms: forms.forms.length,
        formControls: forms.controls.length,
        highStakesForms: forms.forms.filter(function (f) { return f.highStakes; }).length,
        validationSignals: forms.errorContainers.length + forms.controls.filter(function (c) { return c.required || c.pattern; }).length,
        focusable: focusable.count,
        timeLimits: motion.metaRefresh.length + motion.timers.length,
        movingContent: motion.animated.length + motion.carousels.length + motion.animatedGifs.length + motion.deprecated.length,
        flashCandidates: motion.animated.filter(function (a) { return a.fastFlashRisk; }).length + motion.animatedGifs.length,
        links: links.length,
        foreignRuns: language.foreignRuns.length,
        iframes: aria.iframes.length,
        textLength: structure.textLength,
        // Colour-coded content, in-text links and required markers all feed the
        // "is 1.4.1 relevant here?" decision.
        colourCoded: colorUsage.colourCoded.length + colorUsage.linksInText.length + colorUsage.requiredMarkers.length,
        sensoryInstructions: sensoryText.length,
        textImages: textImages.filter(function (t) { return !t.isLogo; }).length,
        sections: structure.sectionCount + structure.headings.length,
        repeatedBlocks: navigation.navs.length,
      },
    };
  };
})();
