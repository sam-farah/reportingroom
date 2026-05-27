---
name: AI training pipeline gaps
description: Why the "global training" feature underperforms despite the UI showing it as active, and the parked fix list the owner deferred.
---

# What's wrong

The training pipeline is wired end-to-end (training_pairs table populated, auto-import after distribution, audit sweep every 60s) but the prompt-building step in `server/services/openai.ts` (`generateReportFromWorksheet`) silently throws most of it away:

1. `trainingData.slice(0, 3)` — only 3 examples sent regardless of how many exist.
2. No scan-type / category filtering — the 3 are whichever 3 the route happened to return first (effectively "most recent"), so a Carotid generation can be shown 3 Lower Limb Venous excerpts.
3. Each example truncated to `substring(0, 400)` — covers indication + start of findings only, the impression/follow-up style is never seen.
4. Categories are free-text from `studyType` so the same scan appears under 4+ labels (e.g. "Lower Limb Venous" vs "...Duplex" vs "...Duplex Ultrasound" vs "...Ultrasound"). Even adding a filter would miss most relevant pairs without normalisation.
5. Manual (non-auto-imported) training pairs can have NULL `report_text` and silently provide nothing when chosen.
6. No edit-distance / "AI accuracy" metric is stored, so degradation is invisible until users notice.

**Why:** The original implementation (commit `5988e62`, Jul 2025) worked at ~5 pairs of a single scan type, so "top 3 most recent" happened to be relevant. As the pool grew and diversified, the slice + lack of filter became dilution. A later prompt refactor (Mar 2026) shortened example excerpts to 400 chars, compounding the issue. UI status badge says "✅ ACTIVE (N examples)" which only confirms loading, not effective injection.

**How to apply:** Before touching report-generation behaviour, remember the owner is risk-averse about regressions here — get explicit go-ahead before changing the prompt. Don't assume the training UI's "active" status reflects quality.

# Parked fix list (in priority order)

1. **Filter by scan type before slicing.** Match worksheet's detected scan type to pair category (after normalisation in step 3); fall back to "any" only if no matches. Biggest single win.
2. **Send more, longer examples.** 3 → 8 examples, 400 → ~1500 chars per excerpt so the AI sees impression phrasing and follow-up language, not just indication openings.
3. **Normalise category names.** Either a canonical-label lookup applied on read, or a one-off migration collapsing the variants (case-insensitive substring match against a canonical list like "Lower Limb Venous Duplex", "Carotid Duplex", etc.).
4. **Backfill or delete broken pairs.** The handful of manual pairs with NULL report_text either need OCR re-run or removal.
5. **Add edit-tracking.** Snapshot the AI's original `{findings, impression}` at generation time onto the report row (e.g. `aiOriginalFindings`, `aiOriginalImpression`), compare to finalised text, surface a per-scan-type "% retained" metric. This is the only way to measure whether fixes 1-4 actually moved the needle.

# Quick diagnostic queries

```sql
-- Pairs per category (look for fragmentation)
SELECT category, COUNT(*) FROM training_pairs GROUP BY category ORDER BY 2 DESC;

-- Pairs missing report text
SELECT id, category FROM training_pairs WHERE report_text IS NULL OR LENGTH(report_text) < 100;

-- Auto-import vs manual
SELECT COUNT(*) FILTER (WHERE source_distribution_id IS NOT NULL) AS auto, COUNT(*) FILTER (WHERE source_distribution_id IS NULL) AS manual FROM training_pairs;
```
