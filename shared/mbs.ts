// MBS (Medicare Benefits Schedule) reference data and same-day billing calculator
// for vascular ultrasound. This is a SUGGESTION AID for staff, not a claiming
// system — it does not submit claims and must not be treated as authoritative.
//
// Sources: MBS Online (health.gov.au) — verified directly against Note IN.0.11
// "Multiple Services Rules" and individual item pages. Schedule fees shown are
// current as at 1 July 2026 and are indexed periodically (typically each
// 1 July) — always confirm current fees on MBS Online before billing.

export type MbsRuleCategory = "DI_VASCULAR" | "DI_GENERAL" | "CAT2";

export interface MbsItemInfo {
  description: string;
  scheduleFeeCents: number;
  category: MbsRuleCategory;
  /** false = we could not confirm this item number is current on MBS Online — verify before use */
  verified: boolean;
}

export const MBS_ITEMS: Record<string, MbsItemInfo> = {
  "55238": {
    description: "Duplex ultrasound — lower limb arteries/bypass grafts, unilateral (below inguinal ligament)",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55244": {
    description: "Duplex ultrasound — lower limb veins, unilateral, acute DVT (below inguinal ligament)",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55246": {
    description: "Duplex ultrasound — lower limb veins, unilateral, chronic venous disease / varicose veins (below inguinal ligament)",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55248": {
    description: "Duplex ultrasound — upper limb arteries/bypass grafts, unilateral",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55252": {
    description: "Duplex ultrasound — upper limb veins, unilateral",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55258": {
    description: "Duplex ultrasound — used on the clinic's list for thoracic outlet syndrome / palmar & digital arteries. Could not be confirmed as a current item number on MBS Online — verify before billing.",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: false,
  },
  "55274": {
    description: "Duplex ultrasound — extracranial carotid and vertebral vessels, bilateral (± subclavian/innominate/oculoplethysmography)",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55276": {
    description: "Duplex ultrasound — intra-abdominal aorta/iliac arteries and/or IVC/iliac veins",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55278": {
    description: "Duplex ultrasound — renal and/or visceral vessels (± aorta/IVC/iliac as required)",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55292": {
    description: "Duplex ultrasound — surgically created AV fistula or AV access graft, unilateral",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55294": {
    description: "Duplex ultrasound — mapping of bypass conduit (arteries and/or veins) before vascular surgery",
    scheduleFeeCents: 19970,
    category: "DI_VASCULAR",
    verified: true,
  },
  "55054": {
    description: "Ultrasonic guidance in conjunction with a surgical/interventional procedure (not tied to a scan type — add manually when performed)",
    scheduleFeeCents: 12860,
    category: "DI_GENERAL",
    verified: true,
  },
  "11610": {
    description: "Resting ankle-brachial indices & arterial waveform analysis, bilateral (Category 2 — not diagnostic imaging)",
    scheduleFeeCents: 7625,
    category: "CAT2",
    verified: true,
  },
  "11611": {
    description: "Wrist/finger-brachial indices & arterial waveform analysis, bilateral (Category 2 — not diagnostic imaging)",
    scheduleFeeCents: 7625,
    category: "CAT2",
    verified: true,
  },
  "11612": {
    description: "Exercise study for lower extremity arterial disease — pre/post-exercise ABI (Category 2 — not diagnostic imaging; not tied to a scan type — add manually when performed)",
    scheduleFeeCents: 13450,
    category: "CAT2",
    verified: true,
  },
};

/** Items on the clinic's list that aren't tied to a specific reportable scan type. Shown on the reference page only. */
export const MBS_REFERENCE_ONLY_ITEMS = ["55054", "11612"];

export interface MbsClaimLine {
  item: string;
  qty: 1 | 2;
}

export interface ScanTypeMbsMapping {
  /** Composition when billed unilaterally. Absent if there's no unilateral option. */
  unilateral?: MbsClaimLine[];
  /** Composition when billed bilaterally, or the single composition for scan types with no laterality. */
  bilateral?: MbsClaimLine[];
  /** false = do not auto-suggest — the correct item depends on clinical judgement staff must apply */
  suggestable: boolean;
  note?: string;
}

// Keys MUST exactly match CANONICAL_SCAN_TYPES names in shared/schema.ts.
export const SCAN_TYPE_MBS: Record<string, ScanTypeMbsMapping> = {
  "Carotid and vertebral": {
    bilateral: [{ item: "55274", qty: 1 }],
    suggestable: true,
  },
  "Upper limb arteries": {
    unilateral: [{ item: "55248", qty: 1 }],
    bilateral: [{ item: "55248", qty: 2 }],
    suggestable: true,
  },
  "Aortoiliac": {
    bilateral: [{ item: "55276", qty: 1 }],
    suggestable: true,
  },
  "Mesenteric (visceral) arteries": {
    bilateral: [{ item: "55278", qty: 1 }],
    suggestable: true,
  },
  "Renal arteries": {
    bilateral: [{ item: "55278", qty: 1 }],
    suggestable: true,
  },
  "Lower limb arteries (including aorto iliac)": {
    unilateral: [{ item: "55276", qty: 1 }, { item: "55238", qty: 1 }],
    bilateral: [{ item: "55276", qty: 1 }, { item: "55238", qty: 2 }],
    suggestable: true,
  },
  "Lower limb DVT": {
    unilateral: [{ item: "55244", qty: 1 }],
    bilateral: [{ item: "55244", qty: 2 }],
    suggestable: true,
  },
  "Upper limb DVT": {
    unilateral: [{ item: "55252", qty: 1 }],
    bilateral: [{ item: "55252", qty: 2 }],
    suggestable: true,
  },
  "Ovarian/pelvic veins": {
    bilateral: [{ item: "55276", qty: 1 }],
    suggestable: true,
  },
  "IVC/Iliac veins": {
    bilateral: [{ item: "55276", qty: 1 }],
    suggestable: true,
  },
  "Varicose veins/chronic venous insufficiency": {
    unilateral: [{ item: "55246", qty: 1 }],
    bilateral: [{ item: "55246", qty: 2 }],
    suggestable: true,
  },
  "AV Fistula": {
    unilateral: [{ item: "55292", qty: 1 }],
    bilateral: [{ item: "55292", qty: 2 }],
    suggestable: true,
    note: "Bilateral AV fistula studies are uncommon — confirm clinically before billing both sides.",
  },
  "Pre-AV Fistula Mapping": {
    unilateral: [{ item: "55294", qty: 1 }],
    bilateral: [{ item: "55294", qty: 1 }],
    suggestable: true,
  },
  "Bypass conduit mapping (leg veins)": {
    unilateral: [{ item: "55294", qty: 1 }],
    bilateral: [{ item: "55294", qty: 1 }],
    suggestable: true,
  },
  "Bypass conduit mapping (arm veins)": {
    unilateral: [{ item: "55294", qty: 1 }],
    bilateral: [{ item: "55294", qty: 1 }],
    suggestable: true,
  },
  "Thoracic outlet syndrome": {
    suggestable: false,
    note: "Either 55258 or 55252 depending on whether venous or arterial compression is demonstrated — item 55258 could also not be confirmed on MBS Online. Staff must select the correct item manually.",
  },
  "Palmar and digital arteries": {
    unilateral: [{ item: "55258", qty: 1 }],
    bilateral: [{ item: "55258", qty: 2 }],
    suggestable: false,
    note: "Item 55258 could not be confirmed as current on MBS Online — verify before billing.",
  },
  "Pedal Acceleration Time": {
    unilateral: [{ item: "55238", qty: 1 }],
    bilateral: [{ item: "55238", qty: 2 }],
    suggestable: true,
  },
  "Temporal arteries": {
    bilateral: [{ item: "55274", qty: 1 }],
    suggestable: true,
  },
  "Resting ABI": {
    bilateral: [{ item: "11610", qty: 1 }],
    suggestable: true,
  },
  "Finger brachial indices": {
    bilateral: [{ item: "11611", qty: 1 }],
    suggestable: true,
  },
};

/** Splits a stored scan type string like "Lower limb DVT (Left)" into its canonical name and side. */
export function parseScanWithSide(raw: string): { canonical: string; side: "unilateral" | "bilateral" | null } {
  const m = raw.match(/^(.*?)\s*\((Left|Right|Bilateral)\)\s*$/i);
  if (!m) return { canonical: raw, side: null };
  const tag = m[2].toLowerCase();
  return { canonical: m[1].trim(), side: tag === "bilateral" ? "bilateral" : "unilateral" };
}

export interface ResolvedScanClaim {
  scanTypeRaw: string;
  canonical: string;
  /** null = no suggestion available for this scan type */
  lines: MbsClaimLine[] | null;
  suggestable: boolean;
  note?: string;
}

/** Resolves the MBS item composition suggested for a single (already side-qualified) scan type string. */
export function getMbsClaimForScanType(raw: string): ResolvedScanClaim {
  const { canonical, side } = parseScanWithSide(raw);
  const mapping = SCAN_TYPE_MBS[canonical];
  if (!mapping) {
    return { scanTypeRaw: raw, canonical, lines: null, suggestable: false };
  }
  if (!mapping.suggestable) {
    return { scanTypeRaw: raw, canonical, lines: null, suggestable: false, note: mapping.note };
  }
  const lat = side ?? "bilateral"; // matches the app-wide default (no suffix = bilateral)
  const lines = (lat === "unilateral" ? mapping.unilateral : mapping.bilateral) ?? mapping.bilateral ?? mapping.unilateral ?? null;
  return { scanTypeRaw: raw, canonical, lines, suggestable: true, note: mapping.note };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface BillingLineResult {
  item: string;
  description: string;
  scheduleFeeCents: number;
  allocatedFeeCents: number;
  category: MbsRuleCategory;
  ruleApplied: string;
  fromScanTypes: string[];
}

export interface VisitBillingResult {
  lines: BillingLineResult[];
  totalScheduleFeeCents: number;
  totalAllocatedFeeCents: number;
  ruleAAdjustmentCents: number;
  warnings: string[];
  unmappedScanTypes: string[];
}

const STANDARD_WARNINGS = [
  "Suggested item numbers only — not a submitted claim. Confirm clinically before billing.",
  "Schedule fees shown are current as at 1 Jul 2026 and are indexed periodically (usually each 1 July) — verify current fees on MBS Online before billing.",
  "Rules B and C (deductions for a same-day consultation or other non-imaging medical service) are not modelled here — check for any other same-day service.",
];

/**
 * Calculates suggested MBS item numbers and same-day allocated fees for a visit,
 * given the scan type strings as stored on an appointment/report (e.g. "Lower limb DVT (Left)").
 *
 * Applies the MBS vascular ultrasound Multiple Services formula (100% / 60% / 50%,
 * Note IN.0.11) across all Subgroup 3 vascular items, then Rule A (-$5 per additional
 * diagnostic imaging "service", treating the vascular bundle as one service) against
 * any Category 5 general item (e.g. 55054). Category 2 items (ABI/FBI) are always
 * billed at full fee since the diagnostic imaging Multiple Services Rules don't apply to them.
 *
 * options.otherSameDayAppointmentCount: if the caller knows the patient has other
 * appointments the same day, pass the count so a warning can be surfaced — the MBS
 * vascular rule applies per patient per DAY, not per appointment.
 */
export function calculateVisitBilling(
  scanTypeStrings: string[],
  options: { otherSameDayAppointmentCount?: number } = {}
): VisitBillingResult {
  const warnings: string[] = [...STANDARD_WARNINGS];
  const unmappedScanTypes: string[] = [];

  // Expand each scan type into individual claimable units, tracking origin for dedupe.
  type Unit = { item: string; canonical: string };
  const units: Unit[] = [];

  for (const raw of scanTypeStrings) {
    const claim = getMbsClaimForScanType(raw);
    if (!claim.suggestable || !claim.lines) {
      unmappedScanTypes.push(raw);
      if (claim.note) warnings.push(`${claim.canonical}: ${claim.note}`);
      continue;
    }
    for (const line of claim.lines) {
      for (let i = 0; i < line.qty; i++) {
        units.push({ item: line.item, canonical: claim.canonical });
      }
    }
  }

  // Dedupe: if the same item number is claimed by more than one distinct scan-type
  // selection (e.g. both "Aortoiliac" and "Lower limb arteries (including aorto iliac)"
  // both emit 55276), only claim it the number of times its single biggest source needs —
  // MBS would not pay the same item twice for the same structure in one visit.
  const byItem = new Map<string, Map<string, number>>();
  for (const u of units) {
    const perCanonical = byItem.get(u.item) ?? new Map<string, number>();
    perCanonical.set(u.canonical, (perCanonical.get(u.canonical) ?? 0) + 1);
    byItem.set(u.item, perCanonical);
  }

  interface FinalUnit { item: string; sources: string[] }
  const finalUnits: FinalUnit[] = [];
  Array.from(byItem.entries()).forEach(([item, perCanonical]) => {
    const sources = Array.from(perCanonical.keys());
    const qtyValues = Array.from(perCanonical.values());
    const maxQty = Math.max(...qtyValues);
    const totalQty = qtyValues.reduce((a, b) => a + b, 0);
    if (sources.length > 1 && totalQty > maxQty) {
      warnings.push(`Item ${item} was suggested by more than one selected scan type (${sources.join(", ")}) — counted once to avoid double-billing. Please confirm.`);
    }
    for (let i = 0; i < maxQty; i++) finalUnits.push({ item, sources });
  });

  const lines: BillingLineResult[] = [];

  // --- Vascular ultrasound Multiple Services formula (100% / 60% / 50%) ---
  const vascularUnits = finalUnits.filter(u => MBS_ITEMS[u.item]?.category === "DI_VASCULAR");
  const sortedVascular = [...vascularUnits].sort((a, b) => {
    const feeA = MBS_ITEMS[a.item].scheduleFeeCents;
    const feeB = MBS_ITEMS[b.item].scheduleFeeCents;
    if (feeA !== feeB) return feeB - feeA;
    return Number(a.item) - Number(b.item); // tie-break: lowest item number ranks higher
  });
  let vascularBundleCents = 0;
  sortedVascular.forEach((u, idx) => {
    const info = MBS_ITEMS[u.item];
    const pct = idx === 0 ? 1 : idx === 1 ? 0.6 : 0.5;
    const allocated = Math.round(info.scheduleFeeCents * pct);
    vascularBundleCents += allocated;
    lines.push({
      item: u.item,
      description: info.description,
      scheduleFeeCents: info.scheduleFeeCents,
      allocatedFeeCents: allocated,
      category: "DI_VASCULAR",
      ruleApplied: idx === 0 ? "100% (highest fee)" : idx === 1 ? "60% (second highest)" : "50%",
      fromScanTypes: u.sources,
    });
    if (!info.verified) warnings.push(`Item ${u.item} could not be confirmed as current on MBS Online — verify before billing.`);
  });

  // --- Rule A vs any Category 5 general item (e.g. 55054), vascular bundle = one service ---
  const generalUnits = finalUnits.filter(u => MBS_ITEMS[u.item]?.category === "DI_GENERAL");
  let ruleAAdjustmentCents = 0;
  if (generalUnits.length > 0) {
    const services = [
      ...(vascularBundleCents > 0 ? [{ key: "__vascular_bundle__", feeCents: vascularBundleCents }] : []),
      ...generalUnits.map(u => ({ key: u.item, feeCents: MBS_ITEMS[u.item].scheduleFeeCents })),
    ].sort((a, b) => b.feeCents - a.feeCents);

    services.forEach((svc, idx) => {
      if (svc.key === "__vascular_bundle__") return; // shown separately below
      const info = MBS_ITEMS[svc.key];
      const reduction = idx === 0 ? 0 : 500; // Rule A: -$5 for each additional DI service
      if (reduction > 0) ruleAAdjustmentCents += reduction;
      lines.push({
        item: svc.key,
        description: info.description,
        scheduleFeeCents: info.scheduleFeeCents,
        allocatedFeeCents: Math.max(0, info.scheduleFeeCents - reduction),
        category: "DI_GENERAL",
        ruleApplied: reduction > 0 ? "-$5.00 (Rule A, additional DI service)" : "full fee (highest same-day DI service)",
        fromScanTypes: [svc.key],
      });
    });

    // If the vascular bundle itself was the one reduced (i.e. it wasn't the highest-fee
    // "service" that day), apply the $5 as a visible adjustment rather than mutating
    // individual line allocations.
    const vascularIsHighest = services[0]?.key === "__vascular_bundle__";
    if (!vascularIsHighest && vascularBundleCents > 0) {
      ruleAAdjustmentCents += 500;
      warnings.push("Rule A: the vascular ultrasound bundle was not the highest-fee diagnostic imaging service today, so it is reduced by a further $5 — shown as an adjustment below.");
    }
  } else {
    lines.forEach(l => {
      if (l.category === "DI_GENERAL") return;
    });
  }

  // --- Category 2 items — always full fee, unaffected by DI Multiple Services Rules ---
  const cat2Units = finalUnits.filter(u => MBS_ITEMS[u.item]?.category === "CAT2");
  for (const u of cat2Units) {
    const info = MBS_ITEMS[u.item];
    lines.push({
      item: u.item,
      description: info.description,
      scheduleFeeCents: info.scheduleFeeCents,
      allocatedFeeCents: info.scheduleFeeCents,
      category: "CAT2",
      ruleApplied: "full fee (Category 2 — not subject to DI Multiple Services Rules)",
      fromScanTypes: u.sources,
    });
  }

  const totalScheduleFeeCents = lines.reduce((sum, l) => sum + l.scheduleFeeCents, 0);
  const totalAllocatedFeeCents = lines.reduce((sum, l) => sum + l.allocatedFeeCents, 0) - ruleAAdjustmentCents;

  if (options.otherSameDayAppointmentCount && options.otherSameDayAppointmentCount > 0) {
    warnings.push(`This patient has ${options.otherSameDayAppointmentCount} other appointment(s) today. The vascular Multiple Services rule applies per patient per DAY, not per appointment — combine all of today's scans before billing.`);
  }

  return {
    lines,
    totalScheduleFeeCents,
    totalAllocatedFeeCents: Math.max(0, totalAllocatedFeeCents),
    ruleAAdjustmentCents,
    warnings,
    unmappedScanTypes,
  };
}

/**
 * Re-applies the same-day Medicare fee rules to a free-edited line-item list —
 * e.g. after staff pick/add/remove an item in the Assignment of Benefit
 * confirmation dialog:
 *
 * 1. Vascular ultrasound Multiple Services formula (100% / 60% / 50%, highest
 *    schedule fee first, ties broken by lowest item number) across DI_VASCULAR
 *    items. A single remaining vascular item is restored to 100% of its schedule
 *    fee — important when a discounted (60%/50%) line was carried over from a
 *    previous form and its sibling item was then deleted.
 * 2. Rule A (-$5) on DI_GENERAL items that are not the highest-fee diagnostic
 *    imaging "service" of the day, treating the vascular bundle as one service.
 *    If the bundle itself is not the highest service, the bundle's -$5 is taken
 *    off its top-ranked line (matching calculateVisitBilling's total).
 *
 * Policy: fees for recognised DI_VASCULAR and DI_GENERAL items are always
 * recomputed from the schedule fee — manual fee edits on those items are
 * intentionally overwritten whenever the rules re-run (item pick/delete/dialog
 * open) so the displayed fees always follow the Medicare same-day rules.
 * Category 2 items and unknown/manual entries are left exactly as-is.
 */
export function applyVascularAllocation<T extends { item: string; feeCents: number }>(
  items: T[],
): T[] {
  const result = [...items];

  // --- Vascular Multiple Services formula (100% / 60% / 50%) ---
  const vascularIdx = result
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => MBS_ITEMS[line.item]?.category === "DI_VASCULAR");

  const sorted = [...vascularIdx].sort((a, b) => {
    const feeA = MBS_ITEMS[a.line.item].scheduleFeeCents;
    const feeB = MBS_ITEMS[b.line.item].scheduleFeeCents;
    if (feeA !== feeB) return feeB - feeA;
    return Number(a.line.item) - Number(b.line.item);
  });

  let vascularBundleCents = 0;
  sorted.forEach(({ idx }, rank) => {
    const info = MBS_ITEMS[result[idx].item];
    const pct = rank === 0 ? 1 : rank === 1 ? 0.6 : 0.5;
    const allocated = Math.round(info.scheduleFeeCents * pct);
    vascularBundleCents += allocated;
    result[idx] = { ...result[idx], feeCents: allocated };
  });

  // --- Rule A (-$5 per additional DI service) on general DI items ---
  const generalIdx = result
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => MBS_ITEMS[line.item]?.category === "DI_GENERAL");

  if (generalIdx.length > 0) {
    const services = [
      ...(vascularBundleCents > 0 ? [{ key: "__vascular_bundle__", feeCents: vascularBundleCents, idx: -1 }] : []),
      ...generalIdx.map(({ line, idx }) => ({
        key: line.item,
        feeCents: MBS_ITEMS[line.item].scheduleFeeCents,
        idx,
      })),
    ].sort((a, b) => b.feeCents - a.feeCents);

    services.forEach((svc, rank) => {
      if (svc.idx === -1) return; // vascular bundle handled above
      const info = MBS_ITEMS[result[svc.idx].item];
      const reduction = rank === 0 ? 0 : 500;
      result[svc.idx] = {
        ...result[svc.idx],
        feeCents: Math.max(0, info.scheduleFeeCents - reduction),
      };
    });

    // If the vascular bundle is not the highest-fee service of the day it also
    // loses $5 under Rule A — take it off the bundle's top-ranked line so the
    // total matches calculateVisitBilling's ruleAAdjustmentCents.
    const vascularIsHighest = services[0]?.idx === -1;
    if (vascularBundleCents > 0 && !vascularIsHighest) {
      const topIdx = sorted[0].idx;
      result[topIdx] = {
        ...result[topIdx],
        feeCents: Math.max(0, result[topIdx].feeCents - 500),
      };
    }
  }

  return result;
}
