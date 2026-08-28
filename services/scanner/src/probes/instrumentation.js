/* eslint-disable */
/**
 * Installed before any page script runs (Playwright `addInitScript`).
 *
 * Some criteria are about *behaviour*, which cannot be read out of a static
 * DOM: whether the page sets a session timeout (2.2.1), whether focusing a
 * control navigates away (3.2.1), whether changing a value submits a form
 * (3.2.2). This wrapper records those events so the probe can report them as
 * evidence instead of the LLM having to guess from markup.
 *
 * Wrappers stay transparent: originals are always called, return values pass
 * through, and any bookkeeping failure is swallowed so instrumentation can
 * never change how the page under test behaves.
 */
(function () {
  'use strict';

  window.__is5568Timers = [];
  window.__is5568ContextChanges = [];
  window.__is5568Navigations = [];

  function note(list, entry) {
    try {
      if (list.length < 100) list.push(entry);
    } catch (e) {
      /* never let instrumentation break the page */
    }
  }

  // Long timers are the fingerprint of a session timeout or auto-redirect.
  var origSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay) {
    if (typeof delay === 'number' && delay >= 5000) {
      note(window.__is5568Timers, { kind: 'timeout', delayMs: delay, stack: shortStack() });
    }
    return origSetTimeout.apply(this, arguments);
  };

  var origSetInterval = window.setInterval;
  window.setInterval = function (fn, delay) {
    if (typeof delay === 'number' && delay >= 1000) {
      note(window.__is5568Timers, { kind: 'interval', delayMs: delay, stack: shortStack() });
    }
    return origSetInterval.apply(this, arguments);
  };

  function shortStack() {
    try {
      var lines = (new Error().stack || '').split('\n').slice(2, 4);
      return lines.map(function (l) { return l.trim().slice(0, 120); }).join(' | ');
    } catch (e) {
      return '';
    }
  }

  // Navigation and history changes, attributed to whatever had focus at the
  // time — that is what tells 3.2.1 (on focus) from 3.2.2 (on input).
  function describeActive() {
    var el = document.activeElement;
    if (!el || el === document.body) return null;
    var tag = el.tagName ? el.tagName.toLowerCase() : '?';
    var name = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('name') || el.id);
    return tag + (name ? '[' + name + ']' : '');
  }

  ['pushState', 'replaceState'].forEach(function (method) {
    var orig = history[method];
    history[method] = function () {
      note(window.__is5568Navigations, {
        kind: method,
        url: String(arguments[2] || ''),
        activeElement: describeActive(),
        phase: window.__is5568Phase || 'idle',
      });
      return orig.apply(this, arguments);
    };
  });

  var origOpen = window.open;
  window.open = function () {
    note(window.__is5568ContextChanges, {
      kind: 'window.open',
      url: String(arguments[0] || ''),
      activeElement: describeActive(),
      phase: window.__is5568Phase || 'idle',
    });
    return origOpen.apply(this, arguments);
  };

  var origSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    note(window.__is5568ContextChanges, {
      kind: 'form.submit',
      activeElement: describeActive(),
      phase: window.__is5568Phase || 'idle',
    });
    return origSubmit.apply(this, arguments);
  };

  // `location.href = …` and `location.assign(…)` during a focus/input phase.
  ['assign', 'replace'].forEach(function (method) {
    try {
      var orig = location[method];
      location[method] = function () {
        note(window.__is5568ContextChanges, {
          kind: 'location.' + method,
          url: String(arguments[0] || ''),
          activeElement: describeActive(),
          phase: window.__is5568Phase || 'idle',
        });
        return orig.apply(location, arguments);
      };
    } catch (e) {
      /* location methods are non-configurable in some engines */
    }
  });

  // Records what the DOM looked like structurally, so a context change caused
  // by focus (major re-layout) can be distinguished from a tooltip appearing.
  window.__is5568Snapshot = function () {
    return {
      url: location.href,
      focusableCount: document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]').length,
      elementCount: document.getElementsByTagName('*').length,
      activeElement: describeActive(),
      title: document.title,
    };
  };
})();
