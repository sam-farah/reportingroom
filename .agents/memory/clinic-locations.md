---
name: Multi-location clinic calendars
description: How additional clinic locations / per-location calendars work and their invariants
---

**Rule:** `clinic_locations` holds additional sites; `appointments.locationId` / `calendar_events.locationId` NULL means the clinic's implicit "main" location. Never treat null as "no location chosen" — it IS the main calendar.

**Why:** The main clinic address predates locations; migrating existing rows to a synthetic "main" row was rejected to avoid touching historic data.

**How to apply:**
- Any client-supplied locationId must be validated with `resolveLocationId(clinicId, raw)` in server/routes.ts (invalid/foreign → null, i.e. main).
- Conflict detection (`findApptConflicts`) is per clinic AND per location — different locations never conflict.
- Deleting a location moves its appointments/events back to null (main) in `storage.deleteClinicLocation`; there is deliberately no DB FK.
- New booking flows must set locationId explicitly or they silently land on main (scan-request scheduling and referrer portal still do this — tasks #27/#28 cover it).
- Calendar UI filters client-side by `(row.locationId ?? null) === selectedLocationId`.
- `clinic_locations.locationSpecificPracticeNumber` is each site's Medicare LSPN; the clinic-level column of the same name now means the MAIN location's number. All of them are edited in Clinic Setup → Locations. See `assessment-of-benefit-form.md` for the never-fall-back-to-main rule.
- `users.defaultLocationId` is the per-user "site I work from" (same NULL = main convention, so "never chose" and "chose main" need no extra flag). It seeds the calendar's location and the scan-request scheduling form. `deleteClinicLocation` clears it like it clears appointments.
- Keep `resolveLocationId` permissive about **inactive** locations: appointments at a deactivated site must keep their location when edited. Narrow to active-only at the specific call site (e.g. the default-location preference), never in the shared helper.
- When a page seeds its location from a saved preference, the "user picked one here" ref must be set inside the picker's own handler, or the seeding effect snaps the view back on the next refetch.
