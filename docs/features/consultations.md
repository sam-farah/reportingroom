# Consultation Notes

Status: BUILT — DISABLED IN UI for testing (`CONSULTATIONS_ENABLED = false` in `client/src/pages/patients.tsx`; flip to true when ready to test).

"Add Consultation" button next to "Add Note" in the patient file header. Three modes:
- **Dictate**: voice → letter via Whisper.
- **Ambient**: records full doctor-patient conversation → Whisper transcribes → GPT-4o summarises into a structured letter with Presenting Complaint / History / Examination / Impression / Plan headings.
- **Type only**.

Drafts autosave (1.5s debounce + 30s heartbeat) with serialized PATCHes and optimistic concurrency (`expectedUpdatedAt`). Finalised consultations are fully read-only (inputs locked + server rejects edits).

Data: `consultations` table; routes under `/api/patients/:id/consultations` and `/api/consultations/:id` (including `/summarise` and `/finalise`); all clinic-scoped.
