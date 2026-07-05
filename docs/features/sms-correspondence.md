# SMS Patient Correspondence

Status: BUILT — activates when Twilio credentials are set. Two parts, both clinic-scoped.

## Automated appointment reminders
A background scheduler (`server/sms-scheduler.ts`, runs every 15 min) texts patients ahead of their appointment. Per-clinic settings live in Admin → Clinic Settings → "SMS Appointment Reminders" card: `smsRemindersEnabled` toggle, `smsReminderTemplate` (placeholders `{patient} {scan} {clinic} {date} {time}`), and `smsReminderLeadHours` (default 24). Each appointment is claimed atomically (`claimAppointmentSmsReminder` — `UPDATE ... WHERE sms_reminder_sent_at IS NULL RETURNING`) before sending, so a reminder is never sent twice even under concurrent ticks; the claim is only rolled back if the Twilio send itself fails (never on a post-send DB error).

Reminders and registration links can also be triggered manually — from the calendar appointment dialog, and from the scan-request scheduling confirmation screen (`client/src/pages/requests.tsx`, alongside the equivalent email actions) — via `POST /api/appointments/:id/send-sms-reminder` and `POST /api/patients/:id/send-sms-registration`. Both check `isSmsConfigured()` (503 if not) and are hidden/disabled client-side when SMS isn't configured or the patient has no phone on file.

## Two-way conversation inbox
`client/src/pages/messages.tsx` (Messages nav item, MessageSquare icon, rendered via dashboard `activePanel`). Staff text patients and replies thread per patient. Inbound replies arrive via the PUBLIC `POST /api/sms/webhook`; delivery status via `POST /api/sms/webhook/status`. Both webhooks verify the `X-Twilio-Signature` (HMAC-SHA1 over URL + sorted params, constant-time compare in `validateTwilioSignature`) and 403 if SMS is unconfigured or the signature is invalid. Inbound routing is deterministic: only attributed when `To` matches the configured number, linked only on a single unambiguous patient match, and refused (logged) when a phone matches multiple clinics.

## Backend
`server/twilio.ts` (Twilio REST API via fetch, no SDK; creds read fresh every call, never cached/logged), routes under `/api/sms/*`, `smsMessages` table, `clinics.smsReminders*`, `appointments.smsReminderSentAt`. Needs secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`. Until set, all SMS code runs cleanly but sends are disabled (503 on manual send) and webhooks reject.
