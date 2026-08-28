'use client';

import { useEffect, useState } from 'react';

/**
 * The Regulation 35ה preferences widget.
 *
 * Two things this fixes from the earlier version:
 *
 *   It persists. Holding the setting in component state meant a user who needs
 *   increased contrast lost it on every navigation and had to switch it on
 *   again, page after page. That is not a rough edge — for the person it is
 *   built for, a control that forgets is close to no control at all.
 *
 *   It closes on Escape and returns focus to the trigger, so a keyboard user is
 *   not left with focus inside a panel that is no longer there.
 */

type Preference = 'contrast' | 'text' | 'spacing';
type State = Record<Preference, boolean>;

const OFF: State = { contrast: false, text: false, spacing: false };
const STORAGE_KEY = 'ai5568:display-preferences';

function read(): State {
  // Storage can throw outright — a private window, or a browser set to block
  // site data. A display preference is never worth breaking the page over.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return OFF;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      contrast: parsed.contrast === true,
      text: parsed.text === true,
      spacing: parsed.spacing === true,
    };
  } catch {
    return OFF;
  }
}

export function PreferencesControl() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<State>(OFF);

  // Read after mount, not during render: the server has no localStorage, and
  // reading during render would make the markup disagree with the DOM.
  useEffect(() => setEnabled(read()), []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = String(enabled.contrast);
    root.dataset.textSize = String(enabled.text);
    root.dataset.spacing = String(enabled.spacing);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    } catch {
      // Nothing to do. The preference still applies for this visit.
    }
  }, [enabled]);

  function toggle(preference: Preference) {
    setEnabled((current) => ({ ...current, [preference]: !current[preference] }));
  }

  return (
    <div
      className="preferences a11y-preferences"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        setOpen(false);
        // Focus has to go somewhere deliberate, or it falls to the document
        // and the next Tab restarts from the top of the page.
        (event.currentTarget.querySelector('.preferences-trigger') as HTMLButtonElement | null)?.focus();
      }}
    >
      <button
        className="preferences-trigger"
        type="button"
        aria-label="העדפות נגישות ותצוגה"
        aria-expanded={open}
        aria-controls="accessibility-preferences"
        onClick={() => setOpen((current) => !current)}
      >
        העדפות תצוגה
      </button>
      {/*
        Always in the DOM, hidden with `hidden` rather than unmounted.
        `aria-controls` on the trigger names this id, and an aria-controls
        pointing at an element that does not exist is a 4.1.1 failure — which
        our own scanner duly reported on this component. Assistive technology
        also handles a hidden-then-shown region more predictably than one that
        appears in the accessibility tree only after a click.
      */}
      <section
        className="preferences-panel"
        id="accessibility-preferences"
        aria-label="העדפות תצוגה ונגישות"
        hidden={!open}
      >
          <p>ההגדרות נשמרות בדפדפן שלכם וממשיכות לפעול בין עמודים.</p>
          <label>
            <input type="checkbox" checked={enabled.contrast} onChange={() => toggle('contrast')} /> ניגודיות מוגברת
          </label>
          <label>
            <input type="checkbox" checked={enabled.text} onChange={() => toggle('text')} /> טקסט מוגדל
          </label>
          <label>
            <input type="checkbox" checked={enabled.spacing} onChange={() => toggle('spacing')} /> ריווח טקסט מוגדל
          </label>
        <button className="preferences-reset" type="button" onClick={() => setEnabled(OFF)}>
          איפוס הגדרות
        </button>
      </section>
    </div>
  );
}
