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
