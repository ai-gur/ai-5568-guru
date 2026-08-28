# Authoring web content for IS 5568 part 1

Read `hebrew-rtl-patterns.md` alongside this for any Hebrew or Arabic content.

## Page skeleton

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <!-- No user-scalable=no and no maximum-scale: both block zoom outright (1.4.4) -->
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Page-specific part first, so a screen reader hears it before the site name (2.4.2) -->
  <title>הזמנת תור | מרפאת הצפון</title>
</head>
<body>
  <a class="skip-link" href="#main">דלג לתוכן הראשי</a>

  <header>
    <nav aria-label="ניווט ראשי">…</nav>
  </header>

  <main id="main" tabindex="-1">
    <h1>הזמנת תור</h1>
    …
  </main>

  <footer>
    <a href="/accessibility">הצהרת נגישות</a>
  </footer>
</body>
</html>
```

```css
.skip-link {
  position: absolute;
  inset-inline-start: -9999px;   /* not `left` — see hebrew-rtl-patterns.md */
  top: 0;
  padding: .75rem 1.25rem;
  background: #16191d;
  color: #fff;
}
.skip-link:focus { inset-inline-start: 0; }
```

Three details that are usually got wrong:

- `tabindex="-1"` on the skip target. Without it the browser scrolls but focus
  stays where it was, and the next Tab returns to the navigation.
- The skip link must be **the first focusable element** and must become visible
  on focus. `display: none` cannot be revealed on focus; off-screen positioning
  can.
- Landmarks (`header`/`nav`/`main`/`footer`) are the accepted alternative
  bypass mechanism. Having both is better.

## Structure

```html
<!-- Wrong: looks like a heading, is not one (1.3.1 — the most common failure) -->
<p class="section-title">השירותים שלנו</p>

<!-- Correct: real heading, styled in CSS -->
<h2>השירותים שלנו</h2>
```

- Exactly one `<h1>` per page.
- Never skip levels — `h2` then `h4` is a failure even if it looks right.
- Choose the level by position in the hierarchy, then style it. Never choose a
  level for its default font size.
- Lists are `<ul>`/`<ol>`/`<dl>`. A paragraph beginning with `-` or `•` is not
  a list, and a screen reader will not announce the item count.
- Use `<strong>`/`<em>` for meaning; `<b>`/`<i>` only for typographic
  convention with no emphasis.

## Images

```html
<!-- Informative -->
<img src="/img/team.jpg" alt="צוות המרפאה עומד בכניסה למרפאה החדשה">

<!-- Decorative — empty alt, never a missing alt -->
<img src="/img/divider.svg" alt="">

<!-- Functional: describe the destination, not the picture -->
<a href="/cart"><img src="/img/cart.svg" alt="עגלת הקניות"></a>

<!-- Complex: short alt + full description in the page -->
<figure>
  <img src="/img/chart.png" alt="תרשים עמודות: פניות לפי חודש, שיא באוקטובר">
  <figcaption>
    פניות לפי חודש בשנת 2025. המגמה עולה מ-120 פניות בינואר ל-410 באוקטובר,
    ויורדת ל-260 בדצמבר.
  </figcaption>
</figure>

<!-- Icon-only control: the accessible name is the control's purpose -->
<button aria-label="סגור את החלון"><svg aria-hidden="true" focusable="false">…</svg></button>
```

Rules of thumb: if removing the image would lose information, it needs a
description. If the image is inside a link or button, the alternative describes
the *action*. A decorative SVG inside a labelled control gets
`aria-hidden="true" focusable="false"` so it is not announced twice.

## Forms

```html
<form novalidate>
  <div class="field">
    <label for="email">כתובת דוא"ל <span class="req">(חובה)</span></label>
    <input id="email" name="email" type="email" dir="ltr"
           autocomplete="email" required aria-required="true"
           aria-describedby="email-hint email-error" aria-invalid="false">
    <p id="email-hint" class="hint">לדוגמה: name@example.co.il</p>
    <p id="email-error" class="error" role="alert" hidden>
      כתובת הדוא"ל אינה תקינה. ודאו שהיא כוללת @ ושם מתחם.
    </p>
  </div>

  <fieldset>
    <legend>אופן יצירת הקשר המועדף</legend>
    <label><input type="radio" name="contact" value="phone"> טלפון</label>
    <label><input type="radio" name="contact" value="email"> דוא"ל</label>
  </fieldset>

  <button type="submit">שליחת הפנייה</button>
</form>
```

- A visible `<label for>` on every control. `placeholder` is an example, never
  a label — it disappears on the first keystroke and is invisible to some
  assistive technology.
- Required marked in **text**, not by a red asterisk alone (1.4.1).
- On validation failure: set `aria-invalid="true"`, unhide the message, and let
  `role="alert"` announce it. Move focus to the first invalid field.
- Error messages name the problem **and** the fix.
- Group related radios/checkboxes in `<fieldset>` with a `<legend>`.
- Use `autocomplete` tokens — they help everyone and are a genuine cognitive
  accessibility win.
- Never navigate or submit on `change`/`focus` (3.2.1, 3.2.2). If a `<select>`
  must trigger something, add an explicit submit button.

## Interactive components

Use the native element. Every time.

```html
<!-- Wrong: reimplements <button> badly and usually incompletely -->
<div class="btn" onclick="save()">שמירה</div>

<!-- Correct -->
<button type="button" onclick="save()">שמירה</button>
```

When a native element genuinely does not exist, follow the matching ARIA
Authoring Practices pattern **in full** — role, states, and keyboard
interaction. A partial implementation is worse than a plain `<div>`, because it
claims a contract it does not honour.

```html
<!-- Accordion: state is exposed and kept in sync -->
<h3>
  <button type="button" aria-expanded="false" aria-controls="panel-1" id="acc-1">
    שעות פעילות
  </button>
</h3>
<div id="panel-1" role="region" aria-labelledby="acc-1" hidden>…</div>
```

Checklist for any custom widget:

- Reachable with Tab, operable with Enter/Space (and arrows where the pattern
  says so), dismissible with Escape.
- `aria-expanded` / `aria-selected` / `aria-checked` updated on every state
  change, not just set once at render.
- Focus moves into a dialog when it opens and returns to the trigger when it
  closes; the rest of the page is `inert` meanwhile.
- No positive `tabindex` anywhere.

## Focus

```css
/* Never ship this without a replacement */
:focus { outline: none; }

/* Do this instead */
:focus-visible {
  outline: 3px solid #0b5cd5;
  outline-offset: 2px;
}
```

Check the indicator against every background it can appear on, including inside
dark sections and over images.

## Motion, timing and media

- Anything that moves, blinks or auto-updates for more than 5 seconds needs a
  visible, keyboard-reachable pause control (2.2.2). Honouring
  `prefers-reduced-motion` is good, but it is not a substitute for the control.
- No `<meta http-equiv="refresh">`.
- Session timeouts need a warning and a one-action extension (2.2.1).
- Nothing flashes more than three times per second (2.3.1).
- `<video>` with sound needs `<track kind="captions" srclang="he" label="עברית">`
  with reviewed captions, plus a transcript. Auto-generated Hebrew captions need
  a human pass. A platform embed with no caption track fails.
- Autoplaying audio longer than 3 seconds needs a stop control among the first
  focusable elements — or, better, do not autoplay.

## Single-page apps

Route changes are invisible to assistive technology unless you make them
visible:

```js
// On route change
document.title = `${pageTitle} | ${siteName}`;   // 2.4.2
mainRef.current?.focus();                         // focus lands in the new view
liveRegionRef.current.textContent = `נטען: ${pageTitle}`;  // announced
```

Keep one polite live region mounted at the app root for status messages. A live
region rendered inside a portal that unmounts loses late announcements.

## Contrast and zoom

- 4.5:1 normal text, 3:1 large text (≥18.5px, or ≥14pt bold in documents).
- Text must remain usable at 200% with no clipping and no loss of function —
  use relative units, avoid fixed heights on text containers, and never
  `overflow: hidden` on text.
- Links inside a paragraph need a non-colour cue (underline), or 3:1 contrast
  against surrounding text plus a hover/focus style change (1.4.1).

## What to verify before shipping

Run `scripts/preflight.py`, then manually:

1. Tab through the whole page. Everything reachable, nothing trapped, focus
   always visible, order matches the visual layout.
2. Zoom text to 200%. Nothing clipped or lost.
3. Turn on NVDA or VoiceOver and read one full flow.
4. Check the accessibility statement exists and is linked from every page.
