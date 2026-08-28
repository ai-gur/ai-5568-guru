# Authoring PowerPoint decks (.pptx) for IS 5568 part 2

## Every slide needs a title, and titles must differ

Slide titles are the navigation mechanism for a screen-reader user — the
equivalent of headings in a document. A deck of untitled slides cannot be
navigated at all.

- Use the **title placeholder from the slide layout**, not a free-floating text
  box. Only the placeholder is exposed as the slide title.
- If a title should not be visible, keep the placeholder and move it off the
  slide canvas, or set its text to transparent. Do **not** delete it.
- Titles must be unique. Five slides called "המשך" tell the reader nothing.

Check with **View → Outline View**: it shows only real titles and placeholder
text. Anything missing from the outline is invisible to the structure.

## Use layouts, not text boxes

**Home → Layout** and place content in the layout's placeholders. Content in
free-drawn text boxes:

- is not part of the slide's semantic structure;
- lands at the end of the reading order, or in an arbitrary position;
- does not appear in Outline View.

## Reading order

**Home → Arrange → Selection Pane** (חלונית הבחירה).

The pane lists shapes in z-order, and screen readers read it **bottom to top** —
the shape at the bottom of the list is read first. This inversion is the single
most common source of scrambled decks.

Set the title to be read first (bottom of the list), then content in the
intended sequence.

## Alt text

Right-click any image, chart, SmartArt or shape → **View Alt Text**.

- Describe what the object communicates.
- Tick **Mark as decorative** for purely visual elements.
- **Charts need real descriptions.** "תרשים מכירות" is not a description. Give
  the trend, the extremes and the conclusion, or put the underlying numbers on a
  following slide or in the notes. This is part 2 §6 (complex information).
- SmartArt: describe the relationship it depicts, not its shape.

## Tables

Insert real tables (Insert → Table). Do not build a table from aligned text
boxes — it looks like a table and is read as scattered fragments.

Mark the header row: **Table Design → ☑ Header Row**.

Avoid merged cells.

## Contrast and text size

Part 2 §3.6 document thresholds apply — 14pt bold or 18pt regular counts as
large text (3:1); anything smaller needs 4.5:1.

In practice for slides:

- Body text at 18pt or larger; never below 14pt.
- Watch text over photographs and gradients — the usual failure. Put a solid
  panel behind it rather than relying on a shadow.
- Do not rely on the theme's default colour pairings; several standard Office
  themes fail contrast for body text.

## Colour and sensory references

- Never encode meaning in colour alone — a red/green status pair needs a word or
  an icon.
- Rewrite "כפי שרואים בעיגול האדום" as "כפי שרואים בשקופית 7, בסעיף העלויות".

## Links

Descriptive display text, not a pasted URL. In a deck intended for on-screen
reading, spell out where the link goes.

## Speaker notes

Notes are accessible to screen readers and are a good place for the long
description of a complex chart. They are not a substitute for alt text — put a
short alternative on the object and the detail in the notes.

## Language

**Review → Language → Set Proofing Language** for the deck, and per-run for
foreign-language text.

## Deck title

**File → Info → Title.** This is the document name under criterion 2.4.2 —
`Presentation1.pptx` fails.

## Exporting to PDF

Save As → PDF → **Options** → ☑ Document structure tags for accessibility.
Never Print → PDF: it discards every tag.

## Verify

Run PowerPoint's **Review → Check Accessibility**, then:

```bash
python scripts/preflight.py deck.pptx
```

Then read the deck in Outline View. If the outline does not make sense on its
own, neither will the deck to someone who cannot see it.
