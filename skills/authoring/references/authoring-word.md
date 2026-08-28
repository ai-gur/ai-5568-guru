# Authoring Word documents (.docx) for IS 5568 part 2

Applies to any `.docx` published for download. If the document is an
**interactive/fillable form**, part 1 applies instead — part 2 explicitly
excludes those.

## The one thing that matters most

**Use real heading styles.** Selecting text and making it 16pt bold produces
something that looks like a heading and is not one. A screen reader user
navigates a document by its heading list; a document with no real headings has
no navigation at all.

| Wrong | Right |
|---|---|
| Select text → increase size → bold | Apply the built-in style **כותרת 1 / Heading 1** |
| Dislike how the style looks | Right-click the style → **Modify** → restyle it |
| Use Heading 3 because Heading 2 is too big | Use Heading 2 and modify its size |

Check your work in **View → Navigation Pane**. What appears there is your
document's real structure. If it is empty or wrong, so is the document.

Note the part 2 concession: a document with only **one** heading level does not
require semantic tagging. From two levels up, the hierarchy must be continuous
(no `Heading 2` → `Heading 4` jumps).

## Alt text on images

Right-click the image → **View Alt Text** (עריכת טקסט חלופי).

- Describe the information the image carries, not its appearance.
- For a decorative image, tick **Mark as decorative** — do not leave the box
  empty, which is indistinguishable from "nobody looked at this".
- Do not let Word's auto-generated alt text stand. It is a guess, and it is
  presented to the reader as fact.
- Charts and diagrams need more than a caption: give the alt text the headline
  finding, and put the full description in body text or a linked data table
  (part 2 §6, complex information).

## Lists

Use the bullet and numbering buttons. A paragraph starting with a typed `-`,
`•` or `1.` is not a list.

Part 2 permits an alternative: **manual numbering that is continuous and
correctly represents the hierarchy** (1, 1.1, 1.1.1) is acceptable without
semantic tagging. Typed bullet characters are not.

## Tables

- Use real tables (Insert → Table). Never lay out content with tabs, spaces, or
  a table used purely for positioning.
- Mark the header row: select the first row → **Table Layout → Repeat Header
  Rows**. This is what exports as a `<th>` equivalent.
- Avoid merged and split cells — they break linear cell-by-cell navigation and
  the association between data and headers.
- No blank rows or columns for spacing; use paragraph spacing instead.
- Keep one table per topic. A screen reader announces "table with N columns" and
  the reader builds a mental model from it.

## Language

- Set the document language: **Review → Language → Set Proofing Language →
  עברית**.
- Mark foreign-language runs: select the text → set its language to English.
  This is what becomes `lang="en"` on export and stops a Hebrew screen reader
  reading English with Hebrew phonetics.

## Document title

**File → Info → Title** (not just the filename). Part 2 accepts either a
meaningful title *or* a meaningful filename — but the title is what a PDF
reader announces once `DisplayDocTitle` is set, so set both.

Avoid `doc1.docx`, `final_v3.docx`, `scan_0012.docx`.

## Contrast and text size

Part 2 §3.6 thresholds for **word-processing documents** — these are not the
web values:

| Size | Points | Minimum contrast |
|---|---|---|
| Regular | under 14 | 4.5:1 |
| Large, bold | 14 and up | 3:1 |
| Large, not bold | 14 and up | 4.5:1 |
| Very large | 18 and up | 3:1 |

Light grey body text is the usual failure. So is text over a coloured table
fill or a watermark.

## Colour and sensory references

- Never mark status by cell fill colour alone — add a word or a symbol.
- Rewrite "ראה בטבלה מימין" as "ראה טבלה 3 — פירוט העלויות". Number your tables
  and figures and refer to them by number.

## Links

Use descriptive display text, not a pasted URL. `Ctrl+K` → **Text to display**.

Part 2 relaxes this: "לחץ כאן" inside a sentence that makes the destination
clear does satisfy the criterion. A bare long URL as link text does not — a
screen reader reads it character by character.

## Reading order

Word's reading order is the document flow. Two things break it:

- **Floating text boxes** — they are read out of sequence, or not at all. Put
  content in the main flow, or in a real table.
- **Images with text wrapping** — set wrapping to **In Line with Text** where
  the image's position in the reading order matters.

## Exporting to PDF — where accessibility is usually lost

This is the single most common way a correctly authored document becomes a
non-compliant one.

**Windows:** File → Save As → PDF → **Options…** → tick:
- ☑ Document structure tags for accessibility
- ☑ Document properties

**macOS:** File → **Save As Adobe PDF** (not Print → PDF). The Print dialog's
"Save as PDF" produces an **untagged** file with no structure at all.

**LibreOffice:** File → Export as PDF → General → ☑ Tagged PDF (add document
structure), ☑ Export bookmarks.

After exporting, verify with `scripts/preflight.py yourfile.pdf`. If it reports
the PDF as untagged, the export setting did not take — do not ship it.

## Before you ship

Run Word's own **Review → Check Accessibility** first — it catches missing alt
text and merged cells cheaply — then `scripts/preflight.py`. Neither replaces
opening the file with a screen reader once.
