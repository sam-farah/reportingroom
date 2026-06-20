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

**Rule:** the "today's study" date guard uses a ±24h window around now, NOT a strict same-calendar-day check.
**Why:** the server runs in UTC but clinics are Australian (UTC+10/11); a strict same-UTC-day check would false-reject legitimate same-day morning appointments. The token also expires in 24h.
**How to apply:** any "for today" appointment gating where clinic timezone is unknown.
