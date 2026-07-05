# Email Inbox — Microsoft 365 via Replit's managed Outlook connector

Status: COMPLETE. ONE workspace-level mailbox (not per-clinic OAuth/IMAP) bound to a single clinic at the app layer.

`server/mail/outlook.ts` talks to Microsoft Graph, fetching a fresh access token per call from the Replit connector (`connector:ccfg_outlook_...`) — no credentials stored in our own DB. `server/mail/index.ts` exposes `resolveClinicMailProvider(clinicId)` (returns the provider only for the clinic that owns the binding, else null), `isEmailConfigured`, and `getMailboxOwnerClinicId` (so a second clinic can't claim the mailbox).

Admin → "Email" card: `POST /api/email/connect` binds the mailbox to the caller's clinic (owner/admin only, refuses if another clinic already owns it or the connector isn't authorized); `/api/email/disconnect` releases it.

Inbox UI at `client/src/pages/email.tsx` — threads can be linked to a patient, and attachments on a patient-linked thread can be saved into that patient's document file (`POST /api/email/attachments/:id/save-to-patient`, tracked via `emailAttachments.savedDocumentId` so each attachment can only be saved once).
