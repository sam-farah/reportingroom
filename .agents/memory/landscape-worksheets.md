---
name: Landscape worksheet handling
description: How worksheet orientation drives on-screen display vs transmission rotation
---

# Landscape worksheets

`worksheets.orientation` ('portrait'|'landscape', default 'portrait') is the single flag.

**Source of truth for a report's primary worksheet = `report.worksheetId` (raw).** Never read the flag off the labelled copy — display and transmission both look it up on the raw id. The labelled copy inherits the flag on creation only as post-merge insurance (post-merge `report.worksheetId` becomes the labelled copy).

**On-screen:** wide image shown naturally (object-contain) IS upright. The "rotate/override" toggle only flips the persisted flag (PATCH `/api/worksheets/:id/orientation`); it does not rotate pixels on screen. Its real effect is changing transmission behavior.

**Transmission (PDF + copy-HTML + email):** the page ALWAYS stays portrait A4. For landscape worksheets the image is rotated 90° CW **into the image bytes** (`rotateDataUrl90CW` in `client/src/lib/image-orientation.ts`) at data-URL build time — NOT via CSS/page-orientation — so it survives fax gateways and Outlook. Reader turns the printout side-on.
**Why bytes not CSS:** fax/Outlook drop CSS transforms and page-orientation hints.

**Two client PDF paths must stay in sync:** `reporting-room.tsx` (inline `appendImagePage` + `buildDistributeHtml`) and `client/src/lib/report-distribution.ts` (patient-file distribute, used by report-distribute-dialog). Both had an auto `drawH>drawW → landscape page` branch that was REMOVED — always portrait now.

**Detection on upload:** `detectOrientationWithConfirm(file)` measures pixels, and only if width ≥ 1.2×height asks the uploader (window.confirm) landscape-vs-portrait. PDFs and drawn worksheets default portrait. Wired into every user-facing upload (file-upload.tsx, reporting-room reupload, extra-page upload). Existing rows default portrait → nothing pre-existing changes.

**Auth on the worksheet meta/orientation routes:** worksheets have no clinicId, so the `/api/worksheets/:id/meta` (GET) and `/orientation` (PATCH) routes MUST clinic-scope via `resolveAuthorisedWorksheet` — find a report in the caller's clinic referencing the worksheet (getReportsByWorksheet + clinic/patient check), else 404. Do NOT ship these authenticated-only; that's cross-tenant read/write by ID enumeration.
