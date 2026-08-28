#!/usr/bin/env python3
"""
Adds the accessibility metadata Chromium's tagged-PDF export leaves out.

Chromium writes a structure tree but not `/Lang`, not an XMP `dc:title`, and
not `/ViewerPreferences /DisplayDocTitle` — so a reader announces the filename
instead of the document title, and assistive technology has no declared
language. Both are IS 5568 part 2 findings (2.4.2 and, for language, part 1
3.1.1 carried over), which makes them mandatory for a report that claims to
meet the standard it audits.

    python postprocess_pdf.py report.pdf --title "..." --lang he-IL
"""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Set accessibility metadata on a tagged PDF.")
    parser.add_argument("path", help="PDF to modify in place")
    parser.add_argument("--title", required=True, help="Document title (announced instead of the filename)")
    parser.add_argument("--lang", default="he-IL", help="Natural language of the document")
    args = parser.parse_args()

    try:
        import pikepdf
    except ImportError:
        print(
            "pikepdf is not installed — run: python -m pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    try:
        with pikepdf.open(args.path, allow_overwriting_input=True) as pdf:
            root = pdf.Root

            # Natural language of the document.
            root["/Lang"] = pikepdf.String(args.lang)

            # Announce the title rather than the filename.
            prefs = root.get("/ViewerPreferences")
            if prefs is None:
                prefs = pdf.make_indirect(pikepdf.Dictionary())
                root["/ViewerPreferences"] = prefs
            prefs["/DisplayDocTitle"] = True

            # Title in both the docinfo dictionary and XMP; readers disagree on
            # which one they consult, so both are set.
            with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
                meta["dc:title"] = args.title
                meta["dc:language"] = [args.lang]
            pdf.docinfo["/Title"] = pikepdf.String(args.title)

            if not root.get("/MarkInfo", {}).get("/Marked", False):
                # Not fatal — the metadata is still worth writing — but the
                # caller needs to know the tagging step did not take.
                print(
                    "warning: PDF is not marked as tagged (/MarkInfo /Marked absent). "
                    "Chromium's generateTaggedPDF may not have applied.",
                    file=sys.stderr,
                )

            pdf.save(args.path)
    except Exception as exc:  # noqa: BLE001
        print(f"failed to post-process {args.path}: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
