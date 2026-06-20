---
name: Twilio SMS webhook & reminder safety
description: Non-obvious correctness/security rules for the SMS feature (public webhooks, reminder scheduler) that a code review repeatedly flagged.
---

# Twilio SMS webhook & reminder safety

Three rules the architect review insisted on for the SMS patient-correspondence feature. Each was a severe finding before being fixed.

## 1. Public webhooks MUST verify the Twilio signature
`POST /api/sms/webhook` and `/api/sms/webhook/status` are unauthenticated by necessity (Twilio calls them). Without verification anyone can forge inbound patient messages or delivery statuses.
- Verify `X-Twilio-Signature`: HMAC-SHA1 over (full public URL + POST params sorted by key, concatenated key+value), base64, constant-time compare. Lives in `validateTwilioSignature` (`server/twilio.ts`).
- Rebuild the URL from `x-forwarded-proto`/`x-forwarded-host` (behind Replit's proxy `req.protocol` is wrong).
- 403 when SMS is unconfigured (no auth token to verify against → reject, never accept).
**Why:** medical PII; a forged inbound writes into a patient thread.

## 2. Inbound clinic attribution must be deterministic, never a guess
Single global Twilio number is shared across clinics. Do NOT fall back to "first SMS-enabled clinic".
- Only attribute when inbound `To` matches the configured number.
- Candidate set is ALL ACTIVE clinics, NOT clinics with appointment reminders enabled. Two-way replies must work even when the reminder toggle is off — gating inbound on the reminder flag silently drops every reply. (Use a separate "active clinics" query for inbound; the reminder-enabled query is only for the send scheduler.)
- Link to a patient only on a SINGLE unambiguous phone match across candidate clinics.
- If exactly one candidate clinic exists and no patient matches → attribute unlinked to it.
- If the phone matches patients in >1 clinic → refuse and log; do not guess.
**Why:** guessing leaks one clinic's patient reply into another clinic's inbox; and coupling inbound routing to the reminder flag makes replies vanish with no error.

## 3. Reminder scheduler: claim atomically, roll back ONLY on send failure
- Claim each appointment before sending: `UPDATE appointments SET sms_reminder_sent_at=now() WHERE id=? AND sms_reminder_sent_at IS NULL RETURNING id` (`claimAppointmentSmsReminder`). Skip if the claim returns nothing — prevents concurrent ticks double-sending.
- Put `sendSms()` in its own try. On send failure → `clearAppointmentSmsReminder` (release claim) + continue.
- After a successful send the claim STAYS. `createSmsMessage()` goes in a SEPARATE try that only logs on failure.
**Why:** the subtle bug — if DB logging is in the same try as a successful send, a transient DB error rolls back the claim and the next tick re-sends, texting the patient twice. Never roll back a claim after Twilio has accepted the message.
