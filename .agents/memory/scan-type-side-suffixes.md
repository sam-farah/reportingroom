---
name: Scan-type side suffixes
description: appointment.scanType entries may carry (Left)/(Right)/(Bilateral)/(Unilateral) suffixes — never exact-match scan names.
---

**Rule:** `appointment.scanType` is a comma-joined string whose entries may carry a side tag: `(Left)`, `(Right)`, `(Bilateral)` (from the online referral form) or `(Unilateral)` (from the calendar booking form's laterality buttons). Any consumer — checkbox matching, duration lookup, MBS billing, filtering/analytics — must parse via `parseScanWithSide` and compare on the canonical name, never with exact string equality.

**Why:** the calendar edit dialog exact-matched names against checkboxes, so referral-suffixed scans looked unticked, ticking added duplicates, unticking couldn't remove them, and the laterality map was reset on edit so re-calculated durations silently defaulted every scan to bilateral (wrong appointment lengths reported by staff).

**How to apply:**
- Bilateral is the implicit default: only a unilateral pick gets a persisted `(Unilateral)` tag; a side encoded in the name beats the form's in-memory laterality map.
- When staff change laterality so a stored `(Left)`/`(Right)` tag no longer agrees, drop the stale tag rather than letting it win the duration calc.
- The parser exists in three places (shared/mbs.ts + two page-local copies); extend all of them together when adding a new tag.
- Known legacy edge case (accepted): `"X (Left), X (Right)"` remains two unilateral entries, not collapsed to bilateral.
