---
name: Worksheet authorisation before a report exists
description: resolveAuthorisedWorksheet only authorises via linked reports — it always 404s for pre-generation worksheets
---

The shared `resolveAuthorisedWorksheet` helper authorises a worksheet by
checking that at least one LINKED REPORT belongs to the caller's clinic.

**Why:** worksheets have no `clinicId`/owner column — only an optional
`patientId` — so reports are the usual ownership anchor. But a freshly
uploaded worksheet has no report yet, so any route that must run BEFORE
report generation (e.g. the pre-generation confirmation checkpoint) will
always get 404 "Worksheet not found" from this helper. This shipped as a
production bug once.

**How to apply:** for pre-report worksheet routes, authorise directly:
reject `isReportPage` rows; if reports are linked require one in the
caller's clinic; otherwise if `worksheet.patientId` is set require that
patient to be in the caller's clinic. Never rely on the shared helper for
anything reachable before generation.
