---
name: ai-guru-is-5568-accessibility-authoring
description: Use AI Guru - IS-5568-Accessibility to produce digital content that meets Israeli Standard IS 5568 (part 1 for web, part 2 for documents) while creating it. Use when writing or generating a website, web app, mobile app, PDF, Word/Excel/PowerPoint file, email template, or other digital content intended for an Israeli audience, including any Hebrew or Arabic RTL interface. Covers the non-negotiable baseline, per-format authoring rules, Hebrew RTL patterns, the accessibility statement, and a preflight self-check. Do NOT use for auditing content that already exists, legal applicability, or general WCAG guidance without Israeli context.
license: MIT
allowed-tools: Bash(python:*) Bash(node:*)
---

# AI Guru - IS-5568-Accessibility: Authoring

## What this skill is for

Use the AI Guru - IS-5568-Accessibility Authoring skill **while producing content**, not while auditing it. If you are
about to write HTML, generate a PDF, build a form, or author a Word document for
an Israeli audience, the cost of doing it accessibly now is near zero; the cost
of retrofitting it later is not, and under the Equal Rights Regulations the
operator carries statutory exposure of up to 50,000 NIS per claim in the
meantime.

Related skills — do not duplicate their content:

| Question | Skill |
|---|---|
| Am I legally required to comply? What are the penalties? Who is exempt? | `israeli-accessibility-compliance` |
| Does this existing site/document comply? | the `ai-guru-is-5568-accessibility-auditor` skill |
| **I am creating something right now — how do I get it right?** | **this skill** |

## Instructions

### Step 1 — Identify the content type and load its reference

Do this before writing anything. Each reference file is a checklist you work
through, not background reading.

| Producing | Read |
|---|---|
| Website, web app, HTML email, React/Vue/Angular component | `references/authoring-web.md` |
| Word document (.docx) | `references/authoring-word.md` |
| PowerPoint deck (.pptx) | `references/authoring-powerpoint.md` |
| Excel workbook (.xlsx) | `references/authoring-excel.md` |
| PDF (from any source) | `references/authoring-pdf.md` |
| iOS / Android / React Native app | `references/authoring-mobile.md` |
| Anything with Hebrew or Arabic text | `references/hebrew-rtl-patterns.md` **in addition** |
| An accessibility statement page | `references/accessibility-statement.md` |

The criteria themselves, with the exact Hebrew wording from the official check
sheet, are in `references/criteria-part1-web.md` (38 criteria, web) and
`references/criteria-part2-documents.md` (11 criteria + complex information,
downloadable documents).

### Step 2 — Apply the baseline

These ten rules hold for **every** content type. They are not a summary of the
standard; they are the subset that, done consistently, prevents most of what an
audit actually finds.

1. **Structure is marked up, not just styled.** A heading is a heading element
   or a heading style — never text that is merely large and bold. A list is a
   list. A data table has header cells. This single rule accounts for more
   real-world failures than any other.
2. **Every non-text element has a text alternative** that conveys the same
   information. Decorative elements are marked as decorative so assistive
   technology skips them. An empty `alt` on an informative image and a
   paragraph-long `alt` on a divider line are both failures.
3. **Contrast**: 4.5:1 for normal text, 3:1 for large text. Note that "large"
   differs by medium — 18.5px/24px on the web, but **14pt bold / 18pt regular in
   documents** (IS 5568 part 2 §3.6). Hebrew typefaces render thinner than Latin
   at the same size and weight, so clear the threshold with margin.
4. **Everything works from the keyboard**, in a logical order, with a visible
   focus indicator, and with no trap. If it can be clicked, it can be tabbed to
   and activated.
5. **Reading order matches visual order.** Do not reposition content with CSS
   `order`, floats, or absolute positioning in a way that separates the two.
6. **Never carry meaning in colour, shape, position or sound alone.** "The red
   field" and "the button on the right" must also name the thing.
7. **Never bake text into an image.** No scanned documents, no text-as-banner,
   no screenshots of tables. Part 2 prohibits scanned files outright.
8. **Give the page or document a meaningful, unique title** that describes it —
   not the site name, not `doc1.pdf`.
9. **Link text stands alone.** "לחץ כאן" is only acceptable when the
   surrounding sentence makes the destination unambiguous (part 2 says so
   explicitly); the safe default is descriptive link text.
10. **Declare language and direction**, and write every user-facing string —
    labels, errors, accessible names — in Hebrew for a Hebrew audience.

### Step 3 — Run preflight before declaring it done

```bash
python scripts/preflight.py <file-or-directory>
```

It checks what is mechanically checkable for the file type and prints what it
could not check. **A clean preflight is not compliance** — it is the floor.
Roughly two-thirds of the criteria need human judgement, and the script says so
rather than implying otherwise.

For a full audit against all 60 checks, run the `ai-guru-is-5568-accessibility-auditor` skill.

### Step 4 — Report what you did, and what you did not

When you hand over the content, state plainly:

- which accessibility measures you applied;
- what still needs a human — screen-reader testing, caption review, colour
  judgement on brand assets;
- for a website: that an accessibility statement, a named accessibility
  coordinator (public bodies and employers of 25+), and a Regulation 35
  preferences widget are separate legal duties the content itself does not
  satisfy.

Do not describe content as "IS 5568 compliant" or "accessible" on the strength
of having followed this skill. Say what you did.

## The failure modes to avoid

These are the ways an LLM most often makes content *look* accessible while
making it no better. Each one is worse than doing nothing, because it defeats
the audit that would otherwise have caught the problem.

| Don't | Why | Instead |
|---|---|---|
| Invent `alt` text for an image you cannot see | A confident wrong description is undetectable by the person relying on it | Say the image needs a human-written alternative |
| Add an accessibility overlay widget | Overlays do not make a site compliant — assessment is against the rendered HTML. The FTC fined accessiBe $1M in April 2025 over that claim | Fix the markup; ship a *preferences* widget separately |
| Put `aria-hidden="true"` on something to silence a warning | Hides real content from real users | Fix the underlying naming or structure |
| Use ARIA where a native element exists | `role="button"` + keydown handler reimplements `<button>` badly | Use the native element |
| Style a `<div>` to look like a heading | The commonest real-world failure of criterion 1.3.1 | Use `<h2>`, restyle it in CSS |
| Use `placeholder` as the field label | It disappears on first keystroke | A visible `<label for>` |
| Mark required fields with a red asterisk only | Colour-only meaning, and invisible to a screen reader | The word "חובה" plus `required`/`aria-required` |
| Write `dir="rtl"` and consider RTL handled | Phone numbers, IDs and emails inside Hebrew text still render reversed | Mark LTR islands — see `references/hebrew-rtl-patterns.md` |
| Claim WCAG 2.1/2.2 conformance because you met those criteria | IS 5568 is anchored to WCAG 2.0 AA; sources differ on 2.1 alignment | State what you implemented, not a conformance level |

## Bundled resources

### References
- `references/criteria-part1-web.md` — the 38 web criteria, in the official
  Hebrew wording, each with the rule, a compliant RTL example, and the common
  failure.
- `references/criteria-part2-documents.md` — the 11 document criteria plus §6
  complex information, with the §3.6 large-text table that differs from the web.
- `references/authoring-web.md` — HTML, React/Vue, forms, components, SPAs.
- `references/authoring-word.md` — styles, alt text, tables, and the export
  settings that preserve tags (the commonest way a good .docx becomes a
  non-compliant .pdf).
- `references/authoring-powerpoint.md` — slide titles, the reading-order pane,
  placeholders vs text boxes.
- `references/authoring-excel.md` — sheet names, header rows, merged cells,
  colour-coded data.
- `references/authoring-pdf.md` — tagging, `/Lang`, `DisplayDocTitle`, PDF/UA,
  and why a scanned file cannot be made compliant by OCR alone.
- `references/authoring-mobile.md` — iOS, Android and React Native.
- `references/hebrew-rtl-patterns.md` — bidi, LTR islands, logical properties,
  Hebrew screen-reader behaviour.
- `references/accessibility-statement.md` — the seven required items and a
  fill-in template.

### Assets
- `assets/checklists/` — a one-page pre-publish checklist per content type.

### Scripts
- `scripts/preflight.py` — mechanical self-check of a produced HTML file,
  document, or directory. Reports what it checked, what failed, and explicitly
  what it could not determine.

## Gotchas

- **Part 2 is not part 1 with different words.** Downloadable documents are
  governed by a *shorter* list of criteria with *different* thresholds — large
  text is 14pt bold / 18pt regular, not the web pixel values — and part 2
  explicitly relaxes the link-purpose rule while explicitly prohibiting scanned
  files. Do not apply the web rules to a PDF by analogy.
- **Interactive PDF forms fall under part 1, not part 2.** Part 2 covers
  non-interactive documents only.
- **A correctly authored Word file exports to an inaccessible PDF** unless the
  export preserves tags. This is the single most common way document
  accessibility is lost.
- **The check sheet's levels are not always WCAG's.** It marks 1.2.1 and 2.4.10
  as AA where WCAG has them A and AAA. When targeting the Israeli standard,
  follow the sheet.
- **Bilingual public bodies**: a public body serving the public in Hebrew and
  Arabic should make content accessible in both, not Hebrew alone.
- **Level AA is the requirement.** Level A applies only where a heavy-burden
  exemption under Regulation 35(b)(2) has actually been granted.
