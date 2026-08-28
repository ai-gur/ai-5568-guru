# Hebrew and RTL patterns

Read this alongside the format-specific guide whenever the content contains
Hebrew or Arabic. Most of what follows is invisible in review — the text *looks*
right to a sighted reader while being wrong to a screen reader or in a different
browser.

## `dir="rtl"` is the beginning, not the end

Setting direction on the root element handles the overall flow. It does not
handle the two things that actually break:

### 1. LTR islands inside RTL text

Phone numbers, ID numbers, order references, email addresses, IBANs, version
strings and code fragments are left-to-right runs inside a right-to-left
paragraph. The Unicode bidirectional algorithm resolves them by surrounding
context, and when the run ends with a neutral character — a period, a closing
parenthesis, a hyphen — it lands in the wrong place.

```html
<!-- Renders as 1234567-03 or worse, depending on surrounding punctuation -->
<p>ניתן ליצור קשר בטלפון 03-1234567.</p>

<!-- Correct -->
<p>ניתן ליצור קשר בטלפון <span dir="ltr">03-1234567</span>.</p>
```

`<bdi>` is the better tool when the value comes from data and you do not know
its direction in advance — it isolates the run without asserting a direction:

```html
<p>שלום, <bdi>{{userName}}</bdi>, ההזמנה שלך היא <bdi>ORD-88213</bdi>.</p>
```

Mark these every time: phone, ID (ת"ז), order/reference numbers, email, URLs,
currency with a Latin symbol, file names, code, English product names.

### 2. Physical CSS properties

`left`, `right`, `margin-left`, `padding-right`, `text-align: left`, `border-left`
are all direction-blind. In an RTL layout they point the wrong way, and the
classic symptom is a skip link positioned off-screen with `left: -9999px` that
becomes unreachable rather than hidden.

```css
/* Wrong in RTL */
.skip-link { left: -9999px; }
.card      { margin-left: 1rem; border-left: 3px solid; text-align: left; }

/* Correct — logical properties follow the writing direction */
.skip-link { inset-inline-start: -9999px; }
.card      { margin-inline-start: 1rem; border-inline-start: 3px solid; text-align: start; }
```

| Physical | Logical |
|---|---|
| `left` / `right` | `inset-inline-start` / `inset-inline-end` |
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `border-left` / `border-right` | `border-inline-start` / `border-inline-end` |
| `text-align: left` / `right` | `text-align: start` / `end` |
| `width` / `height` | `inline-size` / `block-size` |
| `top` / `bottom` | `inset-block-start` / `inset-block-end` |

Note that `top`/`bottom` and `height` do **not** need changing for RTL — they
change for vertical writing modes, which Hebrew does not use. Use logical
properties consistently anyway; mixing the two systems is where bugs hide.

## Icons and directional imagery

Arrows, chevrons, progress indicators, "back"/"next" controls and speech-bubble
tails all point the wrong way in RTL. Mirror them:

```css
[dir="rtl"] .icon-arrow-next { transform: scaleX(-1); }
```

Do **not** mirror: logos, clocks, checkmarks, media play buttons (▶ stays
pointing right in RTL — media transport controls are not directional), numerals,
or anything containing Latin text.

## Language marking

```html
<html lang="he" dir="rtl">
  ...
  <p>המערכת מבוססת על <span lang="en" dir="ltr">React</span> ומספקת ממשק מלא.</p>
  <blockquote lang="en" dir="ltr">
    <p>Accessibility is not a feature, it is a baseline.</p>
  </blockquote>
```

Mark a foreign-language run when it is a meaningful stretch of prose in that
language. Do **not** mark brand names, product names, or loanwords that have
entered Hebrew — a screen reader pronouncing "React" with Hebrew phonetics is
correct behaviour for a term Hebrew speakers say that way.

Arabic content uses `lang="ar" dir="rtl"`. A public body serving the public in
both Hebrew and Arabic should make content accessible in both.

## Accessible names must be in Hebrew

Screen readers announce the accessible name, not the visible text. An English
`aria-label` on a Hebrew page is heard in English by a Hebrew-speaking user,
even though nothing on screen looks wrong.

```html
<!-- Wrong: reads as "close" to a Hebrew speaker -->
<button aria-label="close">✕</button>

<!-- Correct -->
<button aria-label="סגור את החלון">✕</button>
```

Audit these specifically: `aria-label`, `aria-labelledby` targets, `title`,
`alt`, `<label>`, validation messages, `aria-live` announcements, and the
accessible names of icon-only controls.

## Hebrew screen readers

| Reader | Platform | Notes for authors |
|---|---|---|
| NVDA | Windows | Free, the most common in Israel. Hebrew via eSpeak-ng. |
| JAWS | Windows | Institutional. Hebrew via Eloquence. |
| VoiceOver | macOS / iOS | Built in, native Hebrew TTS. |
| TalkBack | Android | Built in, Hebrew via Google TTS. |

Practical consequences:

- **Reading order follows the DOM, not the visual layout.** In an RTL grid
  built with `order`, what looks first is read last.
- **Punctuation-heavy Hebrew reads poorly** when abbreviations use gershayim
  inconsistently. Write `ת"ז`, `דוא"ל` conventionally.
- **Numbers embedded in Hebrew** are read left-to-right; unmarked LTR islands
  are read in the wrong order, not just displayed wrongly.

## Typography and contrast

Hebrew typefaces have no capitals, no ascenders/descenders to speak of, and
generally lighter stems than Latin faces at the same nominal size. Two
consequences:

- A contrast ratio that just clears 4.5:1 in a Latin face reads worse in Hebrew.
  Aim higher; treat 4.5:1 as the failure boundary rather than the target.
- Avoid ultra-light weights for body text entirely.
- Do not rely on ALL-CAPS styling for emphasis — it does nothing in Hebrew.

Prefer typefaces with real Hebrew coverage: Arial Hebrew, Noto Sans Hebrew,
Rubik, Assistant, Heebo, David. A Latin-only webfont with a system fallback
means the Hebrew renders in a different face than designed, at a different
optical size.

## Forms

```html
<form dir="rtl" novalidate>
  <label for="tz">מספר תעודת זהות <span class="req">(חובה)</span></label>
  <input id="tz" name="tz" type="text" inputmode="numeric" pattern="[0-9]{9}"
         dir="ltr" required aria-required="true"
         aria-describedby="tz-hint tz-error" aria-invalid="false">
  <p id="tz-hint" class="hint">9 ספרות, ללא מקפים</p>
  <p id="tz-error" class="error" role="alert" hidden>
    מספר תעודת זהות חייב להכיל 9 ספרות
  </p>
</form>
```

Points that matter:

- `dir="ltr"` on the input itself — the user types digits left to right.
- `inputmode="numeric"` gives a numeric keypad without the semantics of
  `type="number"` (which strips leading zeros and adds spinners).
- Required is marked in **text**, not by a red asterisk alone.
- The error is a real element referenced by `aria-describedby`, announced via
  `role="alert"`, and says what to do — not just "שגיאה".
- `novalidate` because the browser's own validation messages appear in the
  browser's UI language, which may not be Hebrew.

## Tables

```html
<table dir="rtl">
  <caption>סיכום הזמנות אחרונות</caption>
  <thead>
    <tr>
      <th scope="col">מספר הזמנה</th>
      <th scope="col">תאריך</th>
      <th scope="col">סכום</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row" dir="ltr">ORD-12345</th>
      <td>04/03/2026</td>
      <td dir="ltr">1,234.50 ₪</td>
    </tr>
  </tbody>
</table>
```

The order number and the amount are LTR islands inside an RTL table and need
marking, exactly as in prose.
