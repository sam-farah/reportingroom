---
name: Kiosk check-in privacy (public shared screen)
description: How the public kiosk search must avoid leaking other patients' identities.
---

# Kiosk check-in privacy

The kiosk (`/kiosk`, `client/src/pages/kiosk.tsx` + public `GET /api/kiosk/appointments/today`) runs on a SHARED PUBLIC screen with no auth. The search must NEVER return a list of patients.

## Rule: only ever return ONE patient, once uniquely identified
The endpoint returns a status object, never an array:
- one name match → `{status:"single", appointment}`
- >1 name match → `{status:"multiple"}` (NO names/details; UI then asks for date of birth)
- name+dob → one → `single`; still >1 (same name+same DOB) → `{status:"ambiguous"}` (see reception); else `none`.
**Why:** the old version returned every name-matching appointment and the UI listed each one's name+time+scan, so anyone typing a common surname read others' PHI.
**How to apply:** any public/kiosk lookup keyed on a human-typed name must disambiguate with a second private factor (DOB) server-side and never echo the candidate list to the client.

## Clinic scoping with legacy null rows
Appointments are scoped to the kiosk's clinic (resolved from `?clinicId=` param, else first clinic — same as `/api/kiosk/settings`). Filter is `clinicId === resolved || clinicId == null`: many legacy appointments have `clinic_id = NULL` and would otherwise become un-checkable, but a DIFFERENT known clinic's rows are still excluded so they can't leak onto another tenant's kiosk.

## Client stale-response guard
Name-typed search is debounced and fires many overlapping requests. Use a monotonic `searchSeqRef` and drop any response whose seq isn't current, and clear the visible card immediately on name change — otherwise a slow earlier response can paint a stale patient over the new query.
