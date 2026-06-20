---
name: Appointment time timezone rendering
description: Server-side rendering of appointment date/time must use the clinic timezone, not server-local (UTC).
---

Appointment timestamps are stored in UTC. The server runs in UTC, so any server-side
formatting that uses local-clock methods (`Date#getHours`, `getDate`, etc.) renders the
wrong wall-clock time — e.g. a 1pm AEST booking texts/emails as 3am.

**Rule:** all server-side rendering of appointment date/time (SMS reminders, email
reminders, certificates) must format via `Intl.DateTimeFormat(..., { timeZone: "Australia/Sydney" })`.

**Why:** clinics are Australian and operate in local time; the email reminder path
(`server/email.ts`) already hardcodes `Australia/Sydney`. The SMS path originally used
server-local methods and drifted by the UTC offset.

**How to apply:** when adding any new patient-facing message that includes a time,
reuse the shared builders in `server/sms-templates.ts` or copy the email tz approach.
Note: `Australia/Sydney` observes DST (correct for NSW/VIC/TAS/ACT) but is wrong for
QLD/WA — there is currently no per-clinic timezone field, so Sydney is the app-wide default.
