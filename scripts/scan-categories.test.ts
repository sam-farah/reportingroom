import assert from "node:assert";
import { canonicalScanCategory, normaliseScanLabel, selectTrainingExamples } from "../server/services/scanCategories";

// These are real category labels from the training_pairs table. A regression
// here silently feeds the AI the wrong clinic's house style for a scan type,
// which is invisible until report quality drifts — hence the test.

// Laterality and modality wording must never split a category
{
  const lowerLimbVenous = [
    "Bilateral Lower Limb Venous Ultrasound",
    "Lower Limb Venous Duplex",
    "Lower Limb Venous",
    "Right Lower Limb Venous Ultrasound",
    "Left Lower Limb Venous Ultrasound",
    "Lower Limb Venous Duplex Ultrasound",
    "Lower Limb Venous Ultrasound",
    "Lower Limb Venous Duplex - Right Leg",
    "Right Lower Limb Venous Thrombosis Ultrasound",
    "Bilateral Lower Limb Venous Thrombosis Ultrasound",
    "Lower limb DVT (Left)", // side-suffix form used by the booking form
  ];
  for (const label of lowerLimbVenous) {
    assert.strictEqual(canonicalScanCategory(label), "Lower Limb Venous", label);
  }
}

{
  const lowerLimbArterial = [
    "Lower Limb Arterial Duplex",
    "Lower Limb Arterial",
    "Bilateral Lower Limb Arterial Ultrasound",
    "Right Lower Limb Arterial Ultrasound",
    "Lower Limb Arterial Duplex Ultrasound",
  ];
  for (const label of lowerLimbArterial) {
    assert.strictEqual(canonicalScanCategory(label), "Lower Limb Arterial", label);
  }
}

// Combined aorto-iliac + runoff studies are their own category, not folded into
// either half — they are reported differently from both.
{
  for (const label of [
    "Aorto-Iliac and Bilateral Lower Limb Arterial Ultrasound",
    "Aorto-Iliac and Right Lower Limb Arterial Ultrasound",
    "Ao-iliac and Lilateral Lower Limb Arterial Duplex", // typo in real data
    "Abdominal Aortic and Lower Limb Arterial Duplex",
  ]) {
    assert.strictEqual(canonicalScanCategory(label), "Aorto-Iliac and Lower Limb Arterial", label);
  }
  assert.strictEqual(canonicalScanCategory("Aorto-Iliac Arterial Ultrasound"), "Aorto-Iliac Arterial");
  assert.strictEqual(canonicalScanCategory("Aortoiliac"), "Aorto-Iliac Arterial");
  assert.strictEqual(canonicalScanCategory("Aortic Duplex Ultrasound"), "Aortic");
}

// Ordering traps: labels that mention a more specific study than their keywords suggest
{
  // Mentions "fistula" but is a mapping study
  assert.strictEqual(canonicalScanCategory("Bilateral Pre-AV Fistula Mapping Ultrasound"), "Pre-AV Fistula Mapping");
  assert.strictEqual(canonicalScanCategory("Bilateral Pre AVF Mapping"), "Pre-AV Fistula Mapping");
  // Mentions "fistula" but is a pressure-index study
  assert.strictEqual(canonicalScanCategory("Brachial Finger Index With Left Fistula Compression"), "Pressure Indices");
  // Mentions "iliac" but is a pelvic venous study — must not be read as aorto-iliac
  assert.strictEqual(canonicalScanCategory("Ovarian and Iliac Venous Ultrasound"), "Pelvic and Ovarian Venous");
  // Genuine dialysis access
  assert.strictEqual(canonicalScanCategory("Left AV Fistula Ultrasound"), "AV Access (Fistula/Graft)");
  assert.strictEqual(canonicalScanCategory("Right arm AVF"), "AV Access (Fistula/Graft)");
  assert.strictEqual(canonicalScanCategory("Left Lower Limb Arteriovenous Graft Ultrasound"), "AV Access (Fistula/Graft)");
}

{
  assert.strictEqual(canonicalScanCategory("Carotid Duplex Ultrasound"), "Carotid and Vertebral");
  assert.strictEqual(canonicalScanCategory("Carotid and Vertebral Arterial Ultrasound"), "Carotid and Vertebral");
  assert.strictEqual(canonicalScanCategory("Renal Arterial Ultrasound"), "Renal Arterial");
  assert.strictEqual(canonicalScanCategory("Mesenteric Arterial Ultrasound"), "Mesenteric Arterial");
  assert.strictEqual(canonicalScanCategory("Ilio-Caval Venous Ultrasound"), "Ilio-Caval Venous");
  assert.strictEqual(canonicalScanCategory("Iliocaval Ultrasound Assessment"), "Ilio-Caval Venous");
  assert.strictEqual(canonicalScanCategory("Left Upper Limb Venous Ultrasound"), "Upper Limb Venous");
  assert.strictEqual(canonicalScanCategory("Right Upper Limb Arterial Ultrasound"), "Upper Limb Arterial");
  assert.strictEqual(canonicalScanCategory("Bilateral Upper Limb Venous Mapping Ultrasound"), "Upper Limb Venous Mapping");
  assert.strictEqual(canonicalScanCategory("Bilateral Lower Limb Venous Mapping Ultrasound"), "Lower Limb Venous Mapping");
  assert.strictEqual(canonicalScanCategory("Left Ultrasound Guided Venaseal and Sclerotherapy"), "Venous Intervention");
  assert.strictEqual(canonicalScanCategory("Post Endovenous Intervention"), "Venous Intervention");
  // Treatment reports read nothing like a diagnostic scan, so an intervention
  // label must beat the generic limb rules even when it names the limb.
  assert.strictEqual(canonicalScanCategory("Left Lower Limb Venous Ablation"), "Venous Intervention");
  assert.strictEqual(canonicalScanCategory("Bilateral Lower Limb Venous Sclerotherapy"), "Venous Intervention");
}

// Unknown / empty input must not be forced into a category
{
  assert.strictEqual(canonicalScanCategory(""), null);
  assert.strictEqual(canonicalScanCategory(null), null);
  assert.strictEqual(canonicalScanCategory("Thyroid Ultrasound"), null);
  assert.strictEqual(normaliseScanLabel("Bilateral Lower Limb Venous Ultrasound"), "lower limb venous");
}

// --- selectTrainingExamples ---

const pair = (id: number, category: string, daysAgo: number, hasText = true) => ({
  id,
  category,
  reportText: hasText ? `report ${id}` : null,
  uploadedAt: new Date(Date.UTC(2026, 0, 1) - daysAgo * 86400000),
});

// A scan-type match is never diluted with unrelated examples
{
  const pool = [
    pair(1, "Carotid Duplex Ultrasound", 300),
    pair(2, "Bilateral Lower Limb Venous Ultrasound", 10),
    pair(3, "Lower Limb Venous Duplex", 5),
    pair(4, "Left AV Fistula Ultrasound", 1),
  ];
  const sel = selectTrainingExamples(pool, "Right Lower Limb Venous Ultrasound", 8);
  assert.strictEqual(sel.matchedScanType, true);
  assert.strictEqual(sel.category, "Lower Limb Venous");
  assert.deepStrictEqual(sel.examples.map(p => p.id), [3, 2], "only same-type examples, newest first");
}

// Respects the limit, newest first
{
  const pool = [pair(1, "Carotid Duplex Ultrasound", 30), pair(2, "Carotid Duplex Ultrasound", 20), pair(3, "Carotid Duplex Ultrasound", 10)];
  const sel = selectTrainingExamples(pool, "Carotid and Vertebral Arterial Ultrasound", 2);
  assert.deepStrictEqual(sel.examples.map(p => p.id), [3, 2]);
}

// Pairs with stored text win over ones needing an OCR pass, even if older
{
  const pool = [pair(1, "Carotid Duplex Ultrasound", 100, true), pair(2, "Carotid Duplex Ultrasound", 1, false)];
  const sel = selectTrainingExamples(pool, "Carotid Duplex Ultrasound", 1);
  assert.deepStrictEqual(sel.examples.map(p => p.id), [1]);
}

// No same-type examples: send NOTHING rather than another specialty's report
{
  const pool = [pair(1, "Carotid Duplex Ultrasound", 30), pair(2, "Left AV Fistula Ultrasound", 10)];
  const sel = selectTrainingExamples(pool, "Renal Arterial Ultrasound", 8);
  assert.strictEqual(sel.matchedScanType, false);
  assert.deepStrictEqual(sel.examples, []);
}

// An unknown scan type must not sweep up everything either
{
  const pool = [pair(1, "Carotid Duplex Ultrasound", 30), pair(2, "Left AV Fistula Ultrasound", 10)];
  const sel = selectTrainingExamples(pool, "Thyroid Ultrasound", 8);
  assert.strictEqual(sel.matchedScanType, false);
  assert.deepStrictEqual(sel.examples, []);
}

// An unrecognised scan type still groups with its own kind via the tidied label
{
  const pool = [pair(1, "Thyroid Ultrasound", 30), pair(2, "Carotid Duplex Ultrasound", 10)];
  const sel = selectTrainingExamples(pool, "Thyroid Duplex", 8);
  assert.strictEqual(sel.matchedScanType, true);
  assert.deepStrictEqual(sel.examples.map(p => p.id), [1]);
}

// Interventions must not be fed diagnostic examples of the same limb
{
  const pool = [pair(1, "Bilateral Lower Limb Venous Ultrasound", 5), pair(2, "Left Ultrasound Guided Venaseal and Sclerotherapy", 50)];
  const sel = selectTrainingExamples(pool, "Left Lower Limb Venous Ablation", 8);
  assert.deepStrictEqual(sel.examples.map(p => p.id), [2]);
}

// Empty pool must not throw
{
  const sel = selectTrainingExamples([], "Carotid Duplex Ultrasound", 8);
  assert.deepStrictEqual(sel.examples, []);
  assert.strictEqual(sel.matchedScanType, false);
}

console.log("All server/services/scanCategories.ts tests passed.");
