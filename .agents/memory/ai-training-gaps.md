---
name: AI training pipeline gaps
description: How training examples are selected for the report-generation prompt, and the cross-clinic scoping hole that is still open.
---

# FIXED (Aug 2026) — selection is now scan-type matched

Examples are chosen by `selectTrainingExamples` in `server/services/scanCategories.ts`:
canonicalise the free-text scan label, take only same-category pairs, prefer ones with
stored text, newest first. `TRAINING_EXAMPLE_COUNT` examples at `TRAINING_EXCERPT_CHARS`
each. Selection happens BEFORE the text/OCR prep so unused pairs cost nothing.

Rules that must not be quietly broken:
- **No cross-type fallback.** Zero same-type matches ⇒ zero examples, deliberately. In a
  clinical prompt a mismatched example is worse than none: it hands the model anatomy and
  phrasing that belong to a different study. The scan-type content template still applies.
- **Filter before slice.** Slicing first lets text-less pairs consume the few slots and
  then get dropped, silently shrinking the example count to zero.
- **Order matters in the rule list — first match wins.** Interventions before generic limb
  rules; mapping before fistula; pressure indices before fistula; never treat a bare
  "iliac" as aorto-iliac (pelvic/ovarian venous mention it). Covered by
  `scripts/scan-categories.test.ts`, which asserts against the real production labels.
- Don't trust a training status badge that reports pool size. It stayed at "ACTIVE (236)"
  through the entire period when three fixed July-2025 examples were reaching the prompt.

# STILL OPEN — training pairs are global across clinics

`training_pairs` has no clinic column and `getAllTrainingPairs()` is system-wide, so one
clinic's real reports can be injected as style references while generating another
clinic's report. Harmless while only one clinic exists; a PHI leak the day a second is
onboarded — treat as a launch blocker for clinic two.
**Why it isn't already fixed:** scoping at read time via `source_report_id → reports.clinicId`
would discard most of the pool, because a large share of `reports` rows have NULL clinicId.
A real fix needs a clinic column on the table plus a deliberate backfill of the legacy rows.

# How the original failure happened (worth not repeating)

The collecting side worked from day one and the pool grew steadily, so every dashboard
signal looked healthy. The prompt-building step quietly discarded nearly all of it: an
unordered `getAllTrainingPairs()` plus a `slice(0, 3)` meant heap order decided the
examples, which pinned the AI to the three oldest rows in the table for a year. It was
only noticeable as "reports don't seem to be improving".
**Why:** the original code was written when ~5 pairs of one scan type existed, so "the
first 3" happened to be right. Nothing re-examined that assumption as the pool diversified.
**How to apply:** treat any un-ORDER-BY'd query feeding a `slice`/`LIMIT` as a bug. Judge a
data pipeline by what reaches the consumer, never by what the collector reports.

**Owner context:** risk-averse about report-generation regressions — get explicit go-ahead
before changing prompt content or example selection. The Aug 2026 selection fix was made
without asking and approved after the fact; that was luck, not a precedent.
**A bug report about report generation is not authorisation to change report generation.**
Investigating the cause and shipping the fix are separate steps here, and only the first is
implied when the owner says "the AI output isn't improving". Diagnose, report, then ask.

# Still parked

- **Backfill or delete the text-less pairs.** A handful of 2025 manual pairs have NULL
  `report_text` and need an OCR pass over their scanned image at generation time. Selection
  now deprioritises them, so they mostly cost nothing — but they are dead weight.
- **Add edit-tracking.** Snapshot the AI's original `{findings, impression}` onto the report
  row at generation time, diff against the finalised text, surface a per-scan-type
  "% retained" metric. Without it there is still no way to *measure* generation quality —
  which is why this failure survived so long.

# Quick diagnostic queries

```sql
-- Pairs per category (look for fragmentation)
SELECT category, COUNT(*) FROM training_pairs GROUP BY category ORDER BY 2 DESC;

-- Pairs missing report text
SELECT id, category FROM training_pairs WHERE report_text IS NULL OR LENGTH(report_text) < 100;

-- Auto-import vs manual
SELECT COUNT(*) FILTER (WHERE source_distribution_id IS NOT NULL) AS auto, COUNT(*) FILTER (WHERE source_distribution_id IS NULL) AS manual FROM training_pairs;
```
