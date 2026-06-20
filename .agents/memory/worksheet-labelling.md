---
name: Worksheet labelling & merge
description: How labelled worksheets are generated and why the raw upload is deleted after labelling
---

# Worksheet labelling

A "labelled" worksheet is a header-stamped copy of an uploaded ultrasound
worksheet (patient name/DOB/UR + exam metadata drawn above the original image).
It is generated **client-side** in `reporting-room.tsx` (`generateLabelledCanvas`)
and the labelled JPEG is drawn with the **full original worksheet below the
header** — so the labelled image is a strict superset of the raw upload.

## Merge-on-label decision
After a labelled copy is attached to a report (`PATCH /api/reports/:id` sets
`labelledWorksheetId`), the raw original worksheet is now redundant and is
deleted (row + disk file + `file_blobs`). The report's `worksheetId` is
repointed to the labelled copy, and the original's `originalName` + `ocrProcessed`
are copied onto the labelled row first.

**Why:** keeping both doubled image storage and cluttered the patient file, and
the labelled image already contains the raw worksheet. User explicitly asked to
keep only the labelled upload.

## Constraints (do not break)
- **Never clear `labelledWorksheetId`.** The client auto-label loop fires on any
  report where `worksheetId && !labelledWorksheetId` — clearing it causes an
  infinite re-labelling loop. After merge, `worksheetId === labelledWorksheetId`.
- **Repoint before delete**, and guard deletion with a check that no OTHER report
  references the original (`worksheetId`/`labelledWorksheetId`) — `reports.worksheetId`
  is an FK to `worksheets.id`, so a dangling delete throws.
- **Patient-file timeline filter** hides worksheets named `labelled-*` or
  referenced as `labelledWorksheetId`. A merged worksheet is BOTH of those, so the
  filter must also show any worksheet that is a report's primary `worksheetId`
  (`isPrimaryForReport`). This keeps OLD two-row data working (original shown,
  labelled hidden) and NEW merged single-row data visible.
- Old worksheets labelled before this change keep the two-row layout; not migrated.

## Double-label regression (force re-label after merge)
After merge, `worksheetId === labelledWorksheetId` (both point at the labelled,
header-stamped image; raw original deleted). The Distribute flow re-labels with
`force: true` to capture late edits — but with no raw source left, that reads the
already-labelled image and stacks a SECOND header. **Guard `labelReport` so it
refuses when `worksheetId === labelledWorksheetId`** (return early; the existing
labelled copy is already correct). Consequence: edits made AFTER labelling are not
re-stamped onto a merged worksheet — acceptable because consent/header data is
normally set before labelling. Existing already-double-labelled rows can't be
un-stacked (raw gone); fix is to replace/re-upload the worksheet.
