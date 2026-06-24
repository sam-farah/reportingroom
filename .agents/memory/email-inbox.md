---
name: Email inbox (Microsoft 365 / provider-neutral)
description: Architectural constraints & invariants for the in-app two-way clinic email inbox
---

- The mail connector is a SINGLE GLOBAL mailbox for the whole deployment, not per-clinic. Only one clinic may own it. Enforce ownership ATOMICALLY (Postgres transaction-scoped advisory lock — see `storage.connectMailboxAtomic`), never check-then-write.
  **Why:** the Replit Outlook connector exposes one mailbox; an app-level "is anyone connected?" check has a TOCTOU race where two concurrent `/connect` calls both win.
  **How to apply:** `mailbox_sync_state.connected` is the single source of truth (no `msEmailConnected`/`msEmailAddress` clinic columns).

- Manual unlink of a thread from a patient must PERSIST `patientLinkSource="manual"` (not null). The sync auto-linker only links threads whose source `!== "manual"`; clearing it would let the next sync silently re-link.
  **Why:** staff intent to detach a conversation must survive future syncs.

- Inbound email HTML is attacker-controlled PHI rendered with `dangerouslySetInnerHTML`. Always sanitize server-side (`sanitize-html`) at the message-body route before returning — strip script/style/iframe/event-handlers and `javascript:` URLs.

- Encryption: only subject/snippet/lastSnippet/bodyHtml (+ attachment name) are encrypted at rest; addresses/names are plaintext (same scheme as patient PII). Schema comments overstate which fields are encrypted — trust the storage layer, not the comments.

- Provider-neutral by design (`server/mail/*`): keep Graph specifics inside the adapter so Gmail/IMAP can be added without touching routes/storage. The connector access-token getter is hand-written to the standard Replit connector pattern; reconcile it with the official integrations snippet once OAuth is actually completed.
