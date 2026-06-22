---
name: Remote patient consent (send-to-device)
description: Tenant-scoping and "today" rules for sending kiosk consent to a patient's phone/email.
---

Staff can send the kiosk consent to a patient's own device (SMS/email) for "today's study"; patient signs on mobile, stored like kiosk consent. Written consent (kiosk OR remote) is tracked by `writtenConsentAt` on the appointment, inherited by reports/drafts (same pattern as `verbalConsentAt`). Worksheet label: written → "Informed consent obtained for this study"; else verbal.

**Rule:** the consent-send route must scope patient resolution strictly to the requester's clinic.
- Linked patient: allow legacy null-clinic, but reject if `patient.clinicId != null && != user.clinicId`.
- Name fallback: only match patients where `p.clinicId === user.clinicId`. Never `(!appointment.clinicId || ...)` — a null-clinic appointment would then match ANY clinic's patient by name.
**Why:** without this, a null-clinic legacy appointment let one clinic send a consent link bound to another clinic's patient (cross-tenant PHI leak). Flagged in code review.
**How to apply:** any staff-initiated action that resolves a patient from an appointment.

**Rule:** consent wording is always read SERVER-SIDE from `clinic.kioskConsentText` — never trust client body text. Shared `generateConsentDocument()` is used by both kiosk and remote flows.

**Rule:** every consent date/time *rendered* must format in the CLINIC's timezone (via `resolveClinicTimeZone(clinic)` from `shared/timezones.ts`, default Sydney), never server/device local and never a hard-coded zone. Covers the signed-form header + signature-line "Date:" (`generateConsentDocument`, server runs in UTC) AND the labelled-worksheet consent line (`formatConsentDateTime` in reporting-room.tsx → `resolveClinicTimeZone(clinicData)`, so it's correct even off an Australian device). Same lesson as `appointment-time-timezone.md`. **Why:** the UTC server rendered a morning consent as the previous evening; a single hard-coded zone is also wrong for QLD/WA/NT/NZ clinics. Already-generated consent JPEGs keep their old baked-in time; only new ones are corrected.

There are TWO distinct "today" rules — do not conflate them:

**Rule A — send-window guard (send-consent route):** whether staff are allowed to issue a consent link for an appointment uses a ±24h window around now (not a strict same-calendar-day check).
**Why:** the server runs in UTC but clinics are Australian (UTC+10/11); a strict same-UTC-day check would false-reject legitimate same-day morning appointments. The token also expires in 24h.
**How to apply:** any "for today" appointment gating where clinic timezone is unknown.

**Rule B — once-per-day dedupe (both kiosk + remote sign POST):** a patient is only asked/recorded for consent once per day. Enforced by `hasConsentFormToday(patientId, timezone)` = a non-archived "Consent Form" patient document whose `documentDate` equals today's calendar date **in the CLINIC's timezone** (`clinicIsoDate(new Date(), resolveClinicTimeZone(clinic))`). Caller must resolve the clinic FIRST (load it before the check) and pass its timezone; the stored `documentDate` and the check both use the same clinic-local date, so the window rolls over at the clinic's local midnight and matches the date printed on the form.
**Do NOT widen the check to also accept the UTC date** (e.g. to catch pre-fix UTC-dated forms): during the clinic-local 00:00–early-morning window UTC is still the *previous* calendar day, so a UTC-date match would treat *yesterday's* consent as "today" and SKIP a genuinely-needed consent. A skipped medical/legal consent is far worse than a harmless duplicate form; legacy UTC-dated forms are a one-deployment-day concern only.
**Concurrency:** check-then-create is wrapped in `withConsentLock(patientId, fn)` — an in-process per-patient promise chain — so simultaneous submissions (double-tap, two tabs, kiosk+remote at once) can't both create a duplicate. Single Node process, so in-memory lock suffices.
**How to apply:** any new consent-write path must go through the same lock + hasConsentFormToday check.
