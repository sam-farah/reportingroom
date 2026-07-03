---
name: Email inbox (single workspace mailbox via Replit Outlook connector)
description: Architectural constraints & invariants for the in-app two-way email inbox
---

- The mailbox is a SINGLE workspace-level connection (Replit's managed Outlook connector, Microsoft Graph), bound to exactly ONE clinic at the app layer — not per-clinic OAuth/IMAP. `mailbox_connections` still has a clinicId column but only one row is ever "connected" at a time; `getMailboxOwnerClinicId()` finds who owns it so a second clinic can't claim it.
  **Why:** an earlier per-clinic multi-provider (Microsoft/Google OAuth + IMAP/SMTP) design was rejected in code review as unnecessary complexity for a workspace that only needs one shared mailbox; Replit's managed connector removes all custom OAuth/token-storage surface.
  **How to apply:** resolve the provider via `resolveClinicMailProvider(clinicId)` — returns a provider only if that clinic currently owns the binding, else null. No credentials are stored in our DB; `server/mail/outlook.ts` fetches a fresh access token from the connector on every call (never cached).

- Mailbox CONFIG routes (`/api/email/connect`, `/disconnect`) are owner/admin-only — guard with `["clinic_owner","admin"].includes(role)`, not just `isAuthenticated`. Connect also refuses if another clinic already owns the binding or the connector itself isn't authorized yet. Read/sync routes (status, threads, sync-now) are any authenticated clinic member.
  **Why:** these routes rebind a shared, workspace-wide resource; any staff member could otherwise hijack or disconnect it (broken access control).

- Manual unlink of a thread from a patient must PERSIST `patientLinkSource="manual"` (not null). The sync auto-linker only links threads whose source `!== "manual"`; clearing it would let the next sync silently re-link.
  **Why:** staff intent to detach a conversation must survive future syncs.

- Inbound email HTML is attacker-controlled PHI rendered with `dangerouslySetInnerHTML`. Always sanitize server-side (`sanitize-html`) at the message-body route before returning — strip script/style/iframe/event-handlers and `javascript:` URLs.

- Encryption: only subject/snippet/lastSnippet/bodyHtml (+ attachment name) are encrypted at rest; addresses/names are plaintext (same scheme as patient PII). Schema comments overstate which fields are encrypted — trust the storage layer, not the comments.

- Saving an email attachment into a patient's document file requires the thread to already be linked to a patient (never guess/auto-link at save time) and is idempotent per attachment via `emailAttachments.savedDocumentId` — check it before re-fetching bytes from Graph, and set it via a dedicated storage method after `createPatientDocument` succeeds.

- Provider adapter lives in `server/mail/outlook.ts` behind the `MailProvider` interface in `server/mail/types.ts`; routes/storage stay provider-agnostic (`emailMessages.graphId` naming is a holdover, not a hard Graph-only assumption). If another provider is ever added, it needs a new adapter, not route/storage churn — but as of this design there is intentionally only one mailbox for the whole workspace, not one per provider per clinic.
