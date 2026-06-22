---
name: Appointment time timezone rendering
description: Server-side rendering of appointment date/time must use the clinic timezone, not server-local (UTC).
---

Appointment timestamps are stored in UTC. The server runs in UTC, so any server-side
formatting that uses local-clock methods (`Date#getHours`, `getDate`, etc.) renders the
wrong wall-clock time — e.g. a 1pm AEST booking texts/emails as 3am.

**Rule:** all server-side rendering of appointment date/time (SMS reminders, email
reminders, certificates, signed consent documents) must format via
`Intl.DateTimeFormat(..., { timeZone })` (or `toLocale*String` with the same
`timeZone`) where `timeZone` is the CLINIC's timezone, not a hard-coded one. Resolve
it with `resolveClinicTimeZone(clinic)` from `shared/timezones.ts` (falls back to the
`DEFAULT_CLINIC_TIMEZONE = "Australia/Sydney"` when missing/invalid). This also applies
to any *client* rendering that must be clinic-time regardless of device (e.g. the
consent line on the labelled worksheet — `resolveClinicTimeZone(clinicData)`).

**Why:** clinics are Australian/NZ and operate in their own local time. The app used to
hard-code `Australia/Sydney` everywhere, which renders the wrong wall-clock date/time for
QLD/WA/NT (no daylight saving) and NZ. There is now a per-clinic `clinics.timezone`
column (NOT NULL, default `Australia/Sydney` for backward compat), editable in the
super-admin clinic create form and the clinic settings form, validated server-side with
`isValidClinicTimeZone` on both write routes.

**How to apply:** when adding any new patient-facing message that includes a date/time,
load the clinic and pass `resolveClinicTimeZone(clinic)` to the formatter (server) or
`resolveClinicTimeZone(clinicData)` (client). Reuse the shared builders in
`server/sms-templates.ts`/`server/email.ts` which already take a timezone param. Never
re-introduce a hard-coded `Australia/Sydney`. Out of scope (intentionally still
clinic-agnostic): report "Generated" date and the OpenAI examDate.
