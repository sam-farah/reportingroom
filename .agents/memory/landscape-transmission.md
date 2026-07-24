---
name: Landscape worksheet transmission rotation
description: Rotate-for-transmission must be guarded by actual pixel dimensions, not just the orientation flag
---

Landscape-flagged worksheets are rotated 90° into the image bytes for
transmission (portrait A4 page, reader turns the printout side-on).

**Why:** a production report shipped with the worksheet sideways AND
shrunken because the stored image was already portrait-shaped (a labelled
copy saved pre-rotated) while the orientation flag on the raw worksheet
still said "landscape" — so the transmission path rotated it a second
time.

**How to apply:** any rotate-for-transmission decision must check the
actual pixel dimensions (only rotate when width > height), never trust
the orientation flag alone. The guard lives in the shared rotate helper
so all PDF/HTML/email paths inherit it.

Related: the PDF page-slicing loops (duplicated in the distribution lib
and the reporting room) absorb trailing slivers < 15mm into the previous
page by slight compression, so a lone signature line never gets its own
near-blank page. Both copies must be kept in sync.
