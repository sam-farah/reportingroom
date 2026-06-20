---
name: Verbal consent capture
description: How "verbal consent obtained for study" is captured and reaches the labelled worksheet.
---

The Begin Study flow (calendar.tsx) shows a verbal-consent screen between the
3-point ID check and the three worksheet options. Pressing the button PATCHes the
appointment's `verbalConsentAt` and only advances on save success.

**Decision:** consent is recorded on the appointment, then *inherited* onto the
report at creation time — both report paths (`/api/reports/generate` and
`create-draft-report`) copy `verbalConsentAt` from the patient's most recent
appointment that has it set. The labelled worksheet header (reporting-room.tsx
generateLabelledCanvas) renders it only when `report.verbalConsentAt` is present.

**Why:** mirrors the existing sonographer-inheritance pattern in the generate
route; keeps a durable audit record on the appointment that survives the
"report later / other device" path without threading the value through
dashboard → user-panel → upload route.

**How to apply:** if you ever need consent to be appointment-exact (not
"most recent by patient"), you must thread an appointmentId through worksheet/
report creation — neither sonographer nor consent currently does this.
