---
name: Scheduler referral ticks (Chrome extension overlay)
description: Rules for the extension that marks Clinic to Cloud bookings whose referral already exists in ReportingRoom — matching safety, the scheduler's markup, CORS routing, and host-page etiquette.
---

# What the scheduler actually is

Clinic to Cloud's practice scheduler is a **Kendo UI** scheduler inside an
ASP.NET page. Bookings are loaded by AJAX, so **view-source shows none of them**
— but it does contain the Kendo config, including the `eventTemplate`, which is
where the row structure can be read from.

Structure worth knowing (re-check against a fresh page source before trusting):
each patient booking renders as `div.appt-tmpl` whose `data-title` tooltip holds
`Full Name:`, `Birthday:` and `Phone:` in `<strong>` tags. Non-patient and group
bookings have no `Full Name`, which is the clean way to skip them. Cancelled
bookings render a sibling `div.cancelled-appt`. The selected day appears on
`#location-current-date[data-location-date]` (dd/mm/yyyy) and in a
`?date=yyyymmdd` link. Kendo marks the active view with `k-scheduler-<name>view`
on the widget root.

**Ask for the page source before writing scrapers for it.** The first attempt
used phone-number regexes and ancestor walking; the real markup made all of that
unnecessary and replaced guesswork with exact selectors and a stronger identifier.

# Matching bookings to referrals

**Rule: a false tick is dangerous, a missing tick is merely annoying.**
A tick tells staff a referral is already done, so a wrong one causes real work to
be skipped. Every ambiguity resolves to "no tick".

The match is: **the name must agree, AND at least one of date of birth or phone
must agree.** A single identifier is never enough on its own — families share
surnames and households share phone numbers.

**Why prefix matching on given names is banned:** the phone is only half the
match and households share numbers. Production data contains two different
patients on one number. A "one name is a prefix of the other" rule would match
Dan → Daniela. Given names must match exactly or through a **curated** nickname
table; add entries as real cases turn up. Surname-only records fail closed.

**A referral's own phone or DOB can be wrong while the linked patient file is
right** — a referral has been seen carrying the previous patient's mobile. Always
gather both the referral's values and the linked patient's, and accept either.

# The date is the other half of correctness

Ticks are only meaningful against a specific day, and `scan_requests.request_date`
is the date the scan is *for* (referrals are routinely entered a day ahead), so
that column is the right key.

**Never assume "today".** Read the date from every source the page offers and
require them to agree. Two competing dates, or a Kendo range caption naming two
dates, means we do not know — draw nothing and say so. A confidently wrong date
is worse than no feature. Ticks are day-view only.

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

# Testing browser code with no DOM available

`chrome-extension/content.js` is a plain IIFE, so its pure helpers can be pulled
**out of the shipped file by regex and evaluated** in a node test rather than
copied. That keeps the test honest without adding jsdom. Selector correctness
against the live page still can't be proven this way — only the parsing can.
