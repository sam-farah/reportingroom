---
name: Appointment clinic scoping & kiosk registered-state
description: Why appointments must get clinicId server-side, and how kiosk consent/registration break on null clinic_id or latest-token-only checks.
---

# Appointment clinicId must be set server-side

The appointment-create route once spread the client body and never set `clinicId`,
so appointments could be saved with `clinic_id = NULL` (and could be cross-tenant if
a client posted another clinic's id).

**Rule:** server resolves `clinicId` from the session user (`user.clinicId`), strips
any client-supplied `clinicId`, and rejects (400) if the user has no clinic.

**Why:** null `clinic_id` silently breaks every clinic-scoped flow keyed off the
appointment — kiosk consent wording lookup, registration-token clinic, SMS/email
reminders. A check-in then showed "consent failed (no wording set up)" even though
the clinic had wording, purely because the clinic lookup keyed off a null id.

**How to apply:** any insert of a tenant-owned row must take the tenant id from the
authenticated session, never the request body. When reading legacy rows that may
still have null `clinicId`, fall back to a *resolved* record's clinic
(`appointment.clinicId ?? patient.clinicId`) — only after the patient is resolved,
so the fallback can't leak across clinics.

# Kiosk "registered" must check ANY completed token

Registration-status judged "registered" from the *latest* registration token only.
A newer **pending** token (e.g. a re-sent registration link) masked an older
**completed** one, so a fully-registered patient showed as not registered. The
endpoint also auto-creates a pending token when it thinks the patient is
unregistered, which compounds the masking.

**Rule:** a patient is registered if ANY of their registration tokens is
`completed` (`hasCompletedRegistration`), not just the most recent. Keep
`hasCoreFields` (address AND emergency contact) only as a secondary signal.
