---
name: Report amend/update payload validation
description: Why amending a finalized report can silently 500, and the rule for what the client may send to report update/amend routes.
---

# Report amend/update payload validation

**Rule:** When POSTing to `/api/reports/:id/amend` (and other report update routes
that validate with `insertReportSchema.partial().parse(...)`), send ONLY the
form-editable fields (patientName, patientUrNumber, patientDob, examDate,
studyType, indication, findings, impression, physicianId, sonographerId,
patientId). Never echo back the full report object from the API.

**Why:** `insertReportSchema` only omits `id` and `generatedAt`. The reports table's
`finalizedAt` / `amendedAt` are Drizzle `timestamp` columns, so drizzle-zod
validates them as `z.date()`. The API returns those as ISO **strings** (JSON), so
spreading the whole report back makes `z.date()` throw; the amend route catches it
and returns a generic **500 "Failed to amend report"**. Symptom: amending a
*finalized* report fails (a non-finalized report has `finalizedAt = null`, which
passes, so the bug only shows on finalized reports). `examDate` is a `text` column,
so its DD/MM/YYYY value is never the cause.

**How to apply:** The server's `storage.amendReport()` already sets
`isAmended/amendedAt/amendedBy/amendmentReason` and resets finalization itself, so
the client must not send those. Mirror the `handleSaveFinalize` curation pattern.
Optional future hardening: have the amend route strip server-managed fields before
validation and return 400 (not 500) with the Zod message.
