# Authoring PDFs for IS 5568 part 2

## The rule that decides everything else

**A PDF is either tagged or it is not accessible.** Tags are the structure tree
that tells assistive technology what is a heading, a list, a table cell, a
figure. Without them a screen reader gets a stream of positioned glyphs and
guesses at the order.

There is no way to make an untagged PDF accessible by adjusting its appearance.

## Never publish a scanned document

Part 2 says so explicitly: *"אין להשתמש בקבצים סרוקים"*. A scan is an image of
text — unreadable by a screen reader, unsearchable, and it degrades when
enlarged.

If a scan is all that exists:

1. **Rebuild from the source file** if it exists anywhere. This is almost always
   cheaper than the alternatives.
2. If it does not: run OCR, then **proof-read the output**. Hebrew OCR is
   unreliable — final letters, gershayim and niqqud are frequently wrong. An
   unproofed text layer is not compliance; it is a plausible-looking text layer
   that says something different from the page.
3. Then tag the result. OCR alone produces text without structure.

## Produce PDFs by export, not by print

| Source | Do | Do not |
|---|---|---|
| Word (Windows) | Save As → PDF → Options → ☑ Document structure tags | Print → Microsoft Print to PDF |
| Word (macOS) | File → **Save As Adobe PDF** | File → Print → Save as PDF |
| PowerPoint | Save As → PDF → Options → ☑ Document structure tags | Print → PDF |
| LibreOffice | Export as PDF → ☑ Tagged PDF | Print → PDF |
| InDesign | Export → Adobe PDF (Interactive or Print) → ☑ Create Tagged PDF | Export → PDF (Print) with tagging off |
| Google Docs | Download → PDF (tags basic structure) | Print → PDF |
| Headless Chrome | CDP `Page.printToPDF` with `generateTaggedPDF: true` | Playwright `page.pdf()` — produces untagged output |
| LaTeX | `\usepackage{tagpdf}` or LaTeX's tagging-enabled format | Plain `pdflatex` |

The Print path renders to paper and loses every tag. This is the most common
cause of an inaccessible PDF from an accessible source.

## Metadata Chromium and most exporters omit

Even a correctly tagged PDF usually lacks these, and each is a part 2 finding:

| Property | Why | How |
|---|---|---|
| `/Lang` | Assistive tech has no declared language | Acrobat: File → Properties → Advanced → Language |
| Document Title | Readers announce the filename instead | File → Properties → Description → Title |
| `DisplayDocTitle` | Makes readers use the Title rather than the filename | Acrobat: File → Properties → Initial View → Show: Document Title |

Programmatically, with `pikepdf`:

```python
import pikepdf

with pikepdf.open("report.pdf", allow_overwriting_input=True) as pdf:
    pdf.Root["/Lang"] = pikepdf.String("he-IL")
    prefs = pdf.Root.get("/ViewerPreferences")
    if prefs is None:
        prefs = pdf.make_indirect(pikepdf.Dictionary())
        pdf.Root["/ViewerPreferences"] = prefs
    prefs["/DisplayDocTitle"] = True
    with pdf.open_metadata() as meta:
        meta["dc:title"] = "דוח שנתי 2025"
        meta["dc:language"] = ["he-IL"]
    pdf.docinfo["/Title"] = pikepdf.String("דוח שנתי 2025")
    pdf.save("report.pdf")
```

## Tag structure to check

| Content | Tag |
|---|---|
| Headings | `/H1`–`/H6`, continuous, no skipped levels |
| Paragraphs | `/P` |
| Lists | `/L` → `/LI` → `/Lbl` + `/LBody` |
| Tables | `/Table` → `/TR` → `/TH` (with `/Scope`) and `/TD` |
| Images carrying meaning | `/Figure` with an `/Alt` string |
| Decorative images, rules, page furniture | **Artifact** — not a `/Figure` with empty alt |
| Links | `/Link` with the destination in the tag |

Reading order lives in the tag tree, not in the visual layout. In Acrobat this
is the **Tags** panel and the **Order** panel; verify it after every export, not
just the first.

## Hebrew-specific

- **Embed the fonts.** A Hebrew PDF relying on a system font renders differently
  or not at all elsewhere, and text extraction can fail entirely.
- **Check text extraction actually works.** Select a Hebrew paragraph in a
  reader and copy it. If you get reversed text, mojibake or nothing, the
  encoding is broken and no screen reader will read it either — regardless of
  tagging.
- **Set `/Lang` to `he-IL`**, and mark foreign-language spans in the source
  document before exporting.
- Contrast thresholds are the **document** ones from §3.6 — 14pt bold / 18pt
  regular counts as large — not the web pixel values.

## Interactive forms are part 1, not part 2

A fillable PDF form falls under IS 5568 part 1. Every field needs a tooltip
(which becomes its accessible name), a logical tab order, and the form must be
completable by keyboard alone. Part 2's shorter criteria list does not cover it.

## Verify

```bash
python scripts/preflight.py report.pdf
```

For a formal PDF/UA verdict, **veraPDF** (open source, needs Java) is the
reference checker. Acrobat Pro's built-in accessibility check is convenient but
more permissive.

Neither replaces opening the file with NVDA or VoiceOver once and listening to
the first two pages.
