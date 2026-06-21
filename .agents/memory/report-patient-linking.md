---
name: Report → patient file linking
description: Why finalized reports can vanish from a patient's file, and the rule for auto-linking them safely.
---

# Reports appear in a patient's file ONLY by patientId

The patient file fetches reports strictly by the integer FK `reports.patientId`
(`getPatientReports` → `WHERE patient_id = ?`). The denormalised `patientName` /
`patientUrNumber` on a report are display-only and are NOT used for that query.

**Failure mode:** a report generated from a worksheet that was uploaded *without
selecting a patient* inherits `patientId = null`. Finalizing it does not change
that, so the finalized report exists but never shows under the patient. (`reports`
has no `clinic_id`; tenant scoping is derived via the linked patient.)

**Why:** observed live — a finalized report for a patient simply didn't appear in
their file because `patient_id` was null (worksheet had no patient).

**How to apply:** the finalize handler now backfills `patientId` when it is null,
matching within the finalizing user's clinic. Any future "report not showing up"
report should first check `reports.patient_id` for that row.

## Auto-linking medical records must be ambiguity-safe
When linking a report to a patient automatically, only link on an UNAMBIGUOUS
match: exact UR-number match, or exactly ONE patient matching full name **and**
DOB. Never link on name alone, and never pick the "first" of several candidates —
in a clinical system, mis-filing a record is worse than leaving it unlinked for a
human to resolve.
