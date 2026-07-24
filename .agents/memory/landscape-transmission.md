---
name: Landscape worksheet transmission rotation
description: Why landscape worksheets went out un-rotated, and how sliver pages are avoided in report PDFs
---

Landscape-flagged worksheets are rotated 90° into the image bytes for
transmission (portrait A4 page, reader turns the printout side-on).

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
and the reporting room) absorb a trailing block < 32mm into the previous
page by slight vertical compression (max ~11%), so a lone signature
block never gets its own near-blank page. Both copies must stay in sync.
