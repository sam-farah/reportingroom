---
name: Extra report worksheet pages — PHI serving & deletion
description: How extra (multi) worksheet pages on a report are stored, served safely, and deleted without FK violations.
---

# Extra report worksheet pages

A report can carry one or more EXTRA worksheet pages (e.g. Left / Right) in
addition to its primary worksheet, created by upload (image/PDF) or by drawing.
Each extra page is stored as an ordinary `worksheets` row linked through a join
table, so the PDF-append path stays uniform with the primary worksheet.

## Serving rule (PHI)
- Extra-page images are PHI and must be served ONLY through the authenticated,
  clinic-scoped, report-scoped image endpoint — never the app-wide public
  worksheet image route.
- The durable guard is a per-ROW marker on the worksheet row
  (`worksheets.is_report_page`), NOT the join row. The join row can be orphaned
  by page-delete or report-delete; a join-based guard then fails OPEN. A column
  on the row itself holds regardless of referential state.
- **Why:** the public worksheet image route is an app-wide, enumerable
  capability-URL surface (pre-existing design); adding multi-page worksheets must
  not widen PHI exposure even transiently during/after deletion.

## Deletion rule
- The page→worksheet foreign key has NO cascade. On delete you MUST remove the
  join row BEFORE the worksheet row, or the delete throws an FK violation.
- Worksheet/file cleanup is best-effort; the `is_report_page` marker preserves
  the access block even if cleanup fails or leaves an orphan.
- **How to apply:** any new path that detaches an extra page (page-delete,
  report-delete cascade, failed-create compensation) must delete the join row
  first and rely on the marker — not the join row — for the security invariant.
