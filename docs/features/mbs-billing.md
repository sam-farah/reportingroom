# MBS Billing Reference

Status: COMPLETE — suggestion aid, not a claiming system.

Medicare item number knowledge built from a direct MBS Online research pass (Category 5 Group I1 Subgroup 3 – Vascular, Category 2 Subgroup 5 – Vascular, and the "Multiple Services Rules" note IN.0.11).

## Data + calculator
Live in `shared/mbs.ts`:
- `MBS_ITEMS` — fee, category, verified flag per item.
- `SCAN_TYPE_MBS` — per-canonical-scan-type unilateral/bilateral item composition, matched against the clinic's own billing table.
- `calculateVisitBilling(scanTypeStrings[])` — applies the vascular ultrasound same-day formula (highest fee = 100%, second-highest = 60%, rest = 50%, ties broken by lowest item number), then Rule A (-$5 per additional Category 5 diagnostic-imaging service, with the vascular bundle treated as one service) against general items like 55054, while Category 2 items (ABI/FBI/Exercise ABI: 11610/11611/11612) are always billed at full fee since they're not diagnostic imaging.

Tested via `scripts/mbs.test.ts` (registered as the `mbs-test` validation check).

## UI
- Admin Panel → "MBS Billing" tab (`client/src/components/mbs-reference-tab.tsx`) shows the full reference table.
- `client/src/components/mbs-billing-summary.tsx` exports `MbsBillingSummary` (full line-by-line calculator with warnings, shown in the calendar appointment detail dialog next to "Mark as Invoiced") and `MbsItemBadges` (compact suggested-item badges shown on the referral/scan-request form and report cards in Reporting Room).

## Known limitations (surfaced as on-screen warnings, not hidden)
- Item 55258 (used on the clinic's list for Thoracic Outlet Syndrome and Palmar/Digital Arteries) could not be confirmed as a current MBS item number — Thoracic Outlet Syndrome is intentionally non-suggestable and requires manual item selection.
- Rules B/C (same-day consultation interactions) aren't modelled since the app has no consultation-billing data.
- The vascular Multiple Services rule applies per patient per DAY not per appointment; the calendar summary warns (but doesn't auto-merge) when a patient has other same-day appointments.
- "Exercise ABI" (11612) and "Ultrasound guidance of procedure" (55054) are on the clinic's billing list but are not separate scan types in the app — they appear on the admin reference page only, to be billed manually when performed.
