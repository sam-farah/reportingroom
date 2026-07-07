import assert from "node:assert";
import { applyVascularAllocation, calculateVisitBilling, getMbsClaimForScanType, parseScanWithSide, formatCents } from "../shared/mbs";

// parseScanWithSide
{
  assert.deepStrictEqual(parseScanWithSide("Lower limb DVT (Left)"), { canonical: "Lower limb DVT", side: "unilateral" });
  assert.deepStrictEqual(parseScanWithSide("Carotid and vertebral"), { canonical: "Carotid and vertebral", side: null });
  assert.deepStrictEqual(parseScanWithSide("Upper limb arteries (Bilateral)"), { canonical: "Upper limb arteries", side: "bilateral" });
}

// Single unilateral scan
{
  const r = calculateVisitBilling(["Lower limb DVT (Left)"]);
  assert.strictEqual(r.lines.length, 1);
  assert.strictEqual(r.lines[0].item, "55244");
  assert.strictEqual(r.lines[0].allocatedFeeCents, 19970);
  assert.strictEqual(r.lines[0].ruleApplied, "100% (highest fee)");
}

// Bilateral doubling: same item claimed twice, ranked 100%/60%
{
  const r = calculateVisitBilling(["Lower limb DVT (Bilateral)"]);
  assert.strictEqual(r.lines.length, 2);
  assert.strictEqual(r.lines[0].allocatedFeeCents, 19970);
  assert.strictEqual(r.lines[1].allocatedFeeCents, Math.round(19970 * 0.6));
}

// Combo scan type: aortoiliac + lower limb arteries
{
  const r = calculateVisitBilling(["Lower limb arteries (including aorto iliac) (Left)"]);
  const items = r.lines.map(l => l.item).sort();
  assert.deepStrictEqual(items, ["55238", "55276"]);
}

// Multiple different vascular scans same day: 100/60/50 with tie-break by lowest item number
{
  const r = calculateVisitBilling(["Carotid and vertebral", "Lower limb DVT (Bilateral)"]);
  // items: 55274 x1, 55244 x2 -- all same fee ($199.70), tie-break lowest item number first
  assert.strictEqual(r.lines.length, 3);
  const byItem = Object.fromEntries(r.lines.map(l => [l.item + "_" + l.ruleApplied.slice(0, 3), l]));
  const pct100 = r.lines.filter(l => l.ruleApplied.startsWith("100%"));
  const pct60 = r.lines.filter(l => l.ruleApplied.startsWith("60%"));
  const pct50 = r.lines.filter(l => l.ruleApplied.startsWith("50%"));
  assert.strictEqual(pct100.length, 1);
  assert.strictEqual(pct60.length, 1);
  assert.strictEqual(pct50.length, 1);
  // Lowest item number (55244) should rank ahead of 55274 on a tie
  assert.strictEqual(pct100[0].item, "55244");
}

// Dedupe: overlapping scan type selections claiming the same item once
{
  const r = calculateVisitBilling(["Aortoiliac", "Lower limb arteries (including aorto iliac) (Left)"]);
  const count55276 = r.lines.filter(l => l.item === "55276").length;
  assert.strictEqual(count55276, 1);
  assert.ok(r.warnings.some(w => w.includes("55276") && w.includes("more than one")));
}

// Non-suggestable scan type produces no line and a note
{
  const r = calculateVisitBilling(["Thoracic outlet syndrome (Left)"]);
  assert.strictEqual(r.lines.length, 0);
  assert.deepStrictEqual(r.unmappedScanTypes, ["Thoracic outlet syndrome (Left)"]);
  assert.ok(r.warnings.some(w => w.includes("Thoracic outlet syndrome")));
}

// Category 2 items always full fee, unaffected by vascular rule
{
  const r = calculateVisitBilling(["Resting ABI", "Carotid and vertebral"]);
  const abi = r.lines.find(l => l.item === "11610")!;
  assert.strictEqual(abi.allocatedFeeCents, 7625);
  assert.strictEqual(abi.category, "CAT2");
}

// formatCents
{
  assert.strictEqual(formatCents(19970), "$199.70");
  assert.strictEqual(formatCents(7625), "$76.25");
}

// getMbsClaimForScanType unmapped
{
  const r = getMbsClaimForScanType("Something not in the list");
  assert.strictEqual(r.lines, null);
  assert.strictEqual(r.suggestable, false);
}

// applyVascularAllocation: single vascular item restored to 100% (stale 60% carried over)
{
  const items = applyVascularAllocation([
    { item: "55292", feeCents: 11982 }, // stale 60% from a deleted sibling
  ]);
  assert.strictEqual(items[0].feeCents, 19970);
}

// applyVascularAllocation: two vascular items → 100% + 60%
{
  const items = applyVascularAllocation([
    { item: "55292", feeCents: 19970 },
    { item: "55292", feeCents: 19970 },
  ]);
  const fees = items.map(i => i.feeCents).sort((a, b) => b - a);
  assert.deepStrictEqual(fees, [19970, Math.round(19970 * 0.6)]);
}

// applyVascularAllocation: Rule A -$5 on general item when vascular bundle is highest
{
  const items = applyVascularAllocation([
    { item: "55292", feeCents: 11982 },
    { item: "55054", feeCents: 12860 },
    { item: "11611", feeCents: 7625 },
  ]);
  const byItem = Object.fromEntries(items.map(i => [i.item, i.feeCents]));
  assert.strictEqual(byItem["55292"], 19970); // restored to 100%
  assert.strictEqual(byItem["55054"], 12860 - 500); // Rule A -$5
  assert.strictEqual(byItem["11611"], 7625); // CAT2 untouched
}

// applyVascularAllocation: general item alone (no vascular) keeps full fee
{
  const items = applyVascularAllocation([
    { item: "55054", feeCents: 12360 }, // stale -$5 from a deleted vascular sibling
  ]);
  assert.strictEqual(items[0].feeCents, 12860);
}

// applyVascularAllocation: multiple general items, no vascular → highest full fee, others -$5
{
  const items = applyVascularAllocation([
    { item: "55054", feeCents: 12860 },
    { item: "55054", feeCents: 12860 },
  ]);
  const fees = items.map(i => i.feeCents).sort((a, b) => b - a);
  assert.deepStrictEqual(fees, [12860, 12860 - 500]);
}

// applyVascularAllocation: vascular bundle + general → bundle highest keeps 100%, general -$5
// (with current MBS data every vascular fee > every general fee, so the bundle is always
// the highest service; the bundle-not-highest -$5 branch is future-proofing only)
{
  const items = applyVascularAllocation([
    { item: "55244", feeCents: 19970 },
    { item: "55054", feeCents: 12860 },
  ]);
  const byItem = Object.fromEntries(items.map(i => [i.item, i.feeCents]));
  assert.strictEqual(byItem["55244"], 19970);
  assert.strictEqual(byItem["55054"], 12360);
}

// applyVascularAllocation: unknown/manual entries left untouched
{
  const items = applyVascularAllocation([
    { item: "99999", feeCents: 5000 },
    { item: "", feeCents: 1234 },
  ]);
  assert.strictEqual(items[0].feeCents, 5000);
  assert.strictEqual(items[1].feeCents, 1234);
}

console.log("All shared/mbs.ts tests passed.");
