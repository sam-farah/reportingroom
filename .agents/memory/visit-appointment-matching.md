---
name: Matching clinical work to a visit's appointment
description: Rules for finding "the booking this worksheet/report/AoB belongs to" — clinic-timezone days, finding vs completing, and which statuses are safe to fall back to.
---

# Matching clinical work to a visit's appointment

Worksheet upload, report completion, Assignment of Benefit signing and draft-report
creation all need to answer "which booking does this belong to?". They must all go
through the one shared matcher (patient + calendar day), never a fresh inline copy.
There were three divergent copies before it was centralised.

## Day boundaries must be the CLINIC's midnight, never the server's

Appointment times are UTC instants and the server runs on UTC. Sydney is UTC+10/+11,
so a 9am booking is stored as 11pm UTC *the previous day*. Bounding a day with
`setHours(0,0,0,0)` therefore silently loses every morning booking whenever the
work and the booking straddle UTC midnight — e.g. a 9am scan whose worksheet is
uploaded at 11am.

**How to apply:** compare `clinicIsoDate(instant, tz)` on both sides, with `tz` from
`resolveClinicTimeZone(clinic)`. Never day-bound with `setHours`.

## Finding and completing are separate steps

**Rule:** the search must return bookings that are already completed; only the
*update* may skip them.

**Why:** an uploaded worksheet completes the booking early. Later steps still need
to *find* that booking for reasons that have nothing to do with status — the
visit's existing Assignment of Benefit form is looked up through it, and the
referring doctor is snapshotted off it. When completed bookings were filtered out
of the search, the report step found nothing and created a duplicate blank AoB form
that hid the signed one.

**How to apply:** return the match plus an `isOpen` flag; callers decide whether to
write.

## Which statuses may be fallen back to

Prefer the earliest still-open booking. When none is open:

- **Never** fall back to `cancelled` or `no_show` — hanging a signed AoB form or a
  referring doctor off them files billing against a visit that never happened.
- Fall back to a `completed` booking **only when there is exactly one** that day.
  Two completed bookings is a genuinely ambiguous two-study day; guessing bills the
  wrong study, so report no match instead.

## Order is part of the interface

Callers inherit the reporting doctor and consent timestamps from the same-day list.
Whoever consumes it must sort explicitly for the property they want (latest booking
with a doctor, latest consent timestamp) rather than trusting list order — that
implicit dependency on the database's `ORDER BY appointmentDate DESC` broke once
already when the shared matcher started returning earliest-first.
