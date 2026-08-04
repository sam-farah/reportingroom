---
name: Scheduler referral ticks (Chrome extension overlay)
description: Rules for the extension that marks Clinic to Cloud bookings whose referral already exists in ReportingRoom — matching safety, CORS routing, and host-page etiquette.
---

# Matching bookings to referrals

The practice scheduler shows **only a display name and a mobile number** per
booking — no DOB, no UR number. That pair has to carry the whole match.

**Rule: a false tick is dangerous, a missing tick is merely annoying.**
A tick tells staff a referral is already done, so a wrong one causes real work to
be skipped. Every ambiguity resolves to "no tick".

**Why prefix matching on given names is banned:** households share a phone
number, and the phone is half the match. Production data contains two different
patients on one number. A "one name is a prefix of the other" rule would match
Dan → Daniela and tick the wrong member of a family. Given names must match
exactly or through a **curated** nickname table. Add entries as real cases turn
up; never reach back for a general rule.

**Surname-only records fail closed** for the same reason.

**A referral's own phone can be wrong while the linked patient file is right** —
a referral has been saved carrying the previous patient's mobile. Always match
against *both* the referral's phone and the linked patient's phone. This
recovers the booking without weakening anything, since the name still must agree.

# The date is the other half of correctness

Ticks are only meaningful against a specific day, and `scan_requests.request_date`
is the date the scan is *for* (referrals are routinely entered a day ahead), so
that column is the right key.

**Never assume "today".** If the day on screen cannot be established beyond
doubt — no date found, or two competing dates — draw nothing and say so. A
confidently wrong date is worse than no feature.

# Talking to the API from a third-party page

A content script on `clinictocloud.com.au` **cannot fetch reportingroom.net
directly**: that origin is not on the server's CORS allowlist. Route the call
through the **background service worker**, where `host_permissions` applies and
CORS does not. Do not widen the server allowlist to let a third-party medical
system's origin call the API.

# Injecting into someone else's clinical system

Do not append nodes into the host page's own rows, and do not mutate their
styles. The scheduler is a single-page app; foreign children inside its tree can
break its reconciliation. Draw into **one fixed overlay layer** positioned from
`getBoundingClientRect`.

Because the overlay is decoupled from the rows, stale positioning is the risk:
hide the ticks **immediately** on any host mutation rather than waiting out the
rescan debounce, and re-derive them from freshly collected rows (cached server
answers must never be redrawn against remembered row elements — virtualised rows
get recycled).
