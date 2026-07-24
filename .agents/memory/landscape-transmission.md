---
name: Landscape worksheet transmission rotation
description: Why landscape worksheets went out un-rotated, and how sliver pages are avoided in report PDFs
---

Landscape worksheets: PDFs place the RAW wide image on a true landscape
A4 page (dimension-detected); only the HTML output bakes the 90° rotation
into the image bytes. See landscape-worksheets.md for the full split.

**Real root cause (corrected):** the "sideways + shrunken" worksheet in
sent PDFs was NOT double rotation — the image was never rotated at all.
Two contributing holes were fixed: (1) the labelling merge copied only
name/OCR fields to the labelled copy, dropping the orientation flag when
the raw worksheet was deleted (server now carries `orientation` across);
(2) a stale browser tab / old published bundle generates client-side
PDFs with old code — always confirm the user republished AND reloaded
before re-diagnosing client PDF output.

**How to apply:** when a client-generated PDF looks wrong, first compare
the embedded image dimensions (`pdfimages -list`) against the DB flag
(prod read-only query) — that tells you immediately whether rotation ran.
The rotate helper also guards on pixel dimensions (only rotates when
width > height), which is harmless belt-and-braces.

Related: the PDF page-slicing loops (duplicated in the distribution lib
and the reporting room) absorb a trailing block < 35mm into the previous
page, drawing that page at a UNIFORM scale (centred, max ~11% smaller —
no distortion), so a lone signature block never gets its own near-blank
page. Both copies must stay in sync.
