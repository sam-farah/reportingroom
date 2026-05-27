---
name: Multi-tenant route scoping
description: Every patient-scoped or clinic-scoped API route must check that the record belongs to the caller's clinicId — `isAuthenticated` alone is NOT enough.
---

**Rule:** For every new API route that touches patient-scoped data (patients, reports, worksheets, appointments, consultations, scan requests, notes, documents, distributions, etc.) the handler must:

1. Resolve `user = await storage.getUser(req.session.userId!)` and reject if `user.clinicId` is null.
2. Load the target record(s) and verify their `clinicId === user.clinicId` before returning, updating, or deleting. Return 403 on mismatch.
3. Never trust storage-layer methods (`getX(id)`) to be tenant-safe — they fetch by primary key only.

**Why:** Reporting Room is multi-tenant. A code review caught that the new consultations endpoints fetched/updated by `patientId`/`consultationId` alone, so any authenticated user in any clinic could read/edit/delete another clinic's consultations by guessing IDs. That's a multi-tenant data-isolation breach and exactly the class of bug HIPAA-style audits look for.

**How to apply:** When adding routes, write tiny per-route helpers like `requirePatientInClinic(req, res, patientId)` / `requireConsultationInClinic(req, res, id)` that resolve user + record + clinic match in one go and return `null` (with res already sent) on failure. See `server/routes.ts` consultation block for the pattern.
