---
name: Email inbox (per-clinic, multi-provider)
description: Architectural constraints & invariants for the in-app two-way clinic email inbox
---

- The mailbox connection is PER-CLINIC, not a single global mailbox. Each clinic self-configures its own connection (`mailbox_connections`, unique per clinicId) and picks ONE of three methods: Microsoft OAuth (our own Azure app), Google OAuth (our own Google app), or generic IMAP/SMTP. `mailbox_sync_state` holds sync cursors only — it is NOT the connection source of truth.
  **Why:** the earlier design was a single deployment-wide Replit Outlook connector owned by one clinic; that does not work for a multi-tenant app where every clinic needs its own mailbox.
  **How to apply:** resolve providers per clinic via `resolveClinicMailProvider(clinicId)` / `isEmailConfigured(clinicId)`; the scheduler iterates `listConnectedMailboxConnections()`. There is no global `mailProvider` singleton and no `connectMailboxAtomic`.

- Mailbox CONFIG routes (connect/imap, oauth start, oauth callback, disconnect) are owner/admin-only — guard with `["clinic_owner","admin"].includes(role)`, not just `isAuthenticated`. Read/sync routes (status, conversations, sync-now) are any authenticated clinic member.
  **Why:** these routes change the clinic-wide mailbox; any staff member could otherwise hijack or disconnect it (broken access control).

- OAuth state is HMAC-signed + expiring AND single-use: `/start` stores a nonce in `req.session.pendingOAuthNonce`, the callback must match it then `delete`s it. The callback also re-loads the user and re-verifies they still own/administer the signed `clinicId` (role/membership can change between start and callback). Signed state alone is not enough — it is replayable without the session nonce.

- OAuth provider tokens (`refreshToken`/`accessToken`) and the IMAP/SMTP `password` are encrypted at rest in `upsertMailboxConnection` (same AES scheme as patient PII), decrypted only on read. Never log them.

- IMAP/SMTP connect must run a save-time connection test (`testImapSmtpConnection`) before persisting, so a bad host/password fails fast instead of silently never syncing.

- Manual unlink of a thread from a patient must PERSIST `patientLinkSource="manual"` (not null). The sync auto-linker only links threads whose source `!== "manual"`; clearing it would let the next sync silently re-link.
  **Why:** staff intent to detach a conversation must survive future syncs.

- Inbound email HTML is attacker-controlled PHI rendered with `dangerouslySetInnerHTML`. Always sanitize server-side (`sanitize-html`) at the message-body route before returning — strip script/style/iframe/event-handlers and `javascript:` URLs.

- Encryption: only subject/snippet/lastSnippet/bodyHtml (+ attachment name) are encrypted at rest; addresses/names are plaintext (same scheme as patient PII). Schema comments overstate which fields are encrypted — trust the storage layer, not the comments.

- Provider-neutral by design (`server/mail/*`): keep Graph/Gmail/IMAP specifics inside each adapter so routes/storage stay provider-agnostic. `emailMessages.graphId` stores the provider's message id for ALL providers (not just Graph). Adding another provider = a new adapter + an oauth.ts config entry, no route/storage churn.
