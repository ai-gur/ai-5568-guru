# Authoring Excel workbooks (.xlsx) for IS 5568 part 2

Spreadsheets are navigated cell by cell. A screen-reader user hears a cell
reference and its content, and reconstructs the table from the header row. Every
rule below exists to keep that reconstruction possible.

## Name every sheet

`Sheet1`, `גיליון1` and `Sheet1 (2)` tell the reader nothing. Sheet names are
the workbook's table of contents — they are announced when moving between
sheets and are the document's structure under criterion 1.3.1.

Delete unused sheets rather than leaving them empty.

## Define a real header row

Select the data range → **Insert → Table** (or Home → Format as Table) → tick
**My table has headers**.

This is what makes Excel expose a header relationship to assistive technology.
Bolding the first row does nothing structurally.

Alternatively, define a **Print Titles** row (Page Layout → Print Titles → Rows
to repeat at top), which serves the same purpose for the exported document.

## One table per sheet, starting at A1

- Do not place several independent tables on one sheet — a reader has no way to
  tell where one ends and the next begins.
- Start at A1. Leading blank rows and columns used for visual padding are read
  as empty cells and obscure where the data begins.
- No blank rows or columns *inside* a table; use borders and row height for
  spacing.

## Avoid merged cells

Merged cells break linear navigation and destroy the association between a value
and its header. Where a merged cell is used for a spanning title, prefer
**Center Across Selection** (Format Cells → Alignment → Horizontal) — it looks
identical and leaves the cells intact.

## Never encode meaning in fill colour alone

A red fill meaning "overdue" is invisible to a screen-reader user and to many
sighted ones. Add a status column with the word, or a symbol alongside the
colour.

The same applies to conditional formatting: pair every colour rule with a text
or icon rule.

## Alt text on images and charts

Right-click → **View Alt Text** for every image, chart and shape.

A chart needs more than a name. Under part 2 §6 (complex information) it needs a
description that conveys the same information — the trend, the extremes, the
conclusion. The underlying data is usually already on a sheet; say which one:

> "תרשים עמודות: הכנסות לפי רבעון 2025. עלייה מ-1.2 מיליון ש\"ח ברבעון הראשון
> ל-2.1 מיליון ברבעון הרביעי. הנתונים המלאים בגיליון 'הכנסות'."

## Cell content

- Put units in the header (`סכום (₪)`), not in every cell — repeated units are
  read aloud on every row.
- Use real dates and numbers, not text that looks like them; number formatting
  is announced, text is not.
- Give formula results a plain-language header. A column called `=SUM(D2:D40)`
  helps nobody.
- Do not use empty cells to mean zero or "not applicable" — say so.

## Contrast

Part 2 §3.6 document thresholds: 4.5:1 for regular text, 3:1 for 14pt bold or
18pt regular and above. The usual failures are light grey text on white and
dark text on a saturated fill.

## Links

Descriptive display text (`Ctrl+K` → Text to display), not a pasted URL.

## Workbook title and language

- **File → Info → Title** — the document name under criterion 2.4.2.
- **Review → Language** for the workbook.

## Freeze panes

Freezing the header row (View → Freeze Panes) keeps context visible for sighted
users while scrolling. It does not create a header relationship — you still need
the table definition above.

## Verify

```bash
python scripts/preflight.py workbook.xlsx
```

Then run Excel's **Review → Check Accessibility**, and navigate one sheet with
the keyboard alone — Ctrl+Arrow to move between data regions. If you cannot tell
where the data starts and ends, neither can a screen-reader user.
