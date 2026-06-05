---
name: Production PDF uploads need poppler in the live build
description: Why PDF worksheet OCR can work in dev but fail on the deployed site
---

PDF worksheet upload/OCR depends on `pdftoppm` (poppler). The converter resolves it at
startup via `bash -c "which pdftoppm"` and disables PDF handling if not found.

**Symptom:** dev logs `[pdfConverter] pdftoppm found at: ...` but production logs
`[pdfConverter] pdftoppm not found — PDF previews disabled`, so PDF uploads fail live
while image (PNG/JPEG) uploads still work.

**Why:** poppler is declared in `.replit` `[nix].packages`, which applies to both dev and
deployment — but a *previously published* build that predates the config (or a build that
didn't bundle it) won't have it. The live deployment is a separate environment from dev.

**How to apply:** When a user reports "uploads failing" only on the live site, check
deployment logs (not dev). If it's the poppler/pdftoppm message, the fix is to **republish**
so the current `.replit` nix config + latest code go live — not a code change.
