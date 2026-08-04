/**
 * Scan-type canonicalisation for AI training examples.
 *
 * Training pair categories are free text copied from whatever `studyType` the
 * report happened to carry, so the same study is filed under many spellings —
 * "Bilateral Lower Limb Venous Ultrasound", "Lower Limb Venous Duplex",
 * "Lower Limb Venous", "Right Lower Limb Venous Ultrasound" and so on are all
 * the same scan. Matching examples to the scan being reported is worthless
 * without collapsing those variants first.
 *
 * This maps a free-text scan name onto a small set of canonical keys. It is
 * deliberately a readable ordered rule list rather than anything clever: a
 * miscategorised example silently feeds the AI the wrong house style, so it
 * needs to be auditable by a human reading it top to bottom.
 */

/** Words that describe the modality or the report, not the study itself. */
const NOISE = [
  'ultrasound', 'ultrasonography', 'us', 'u s', 'duplex', 'doppler', 'sonography',
  'scan', 'study', 'studies', 'assessment', 'examination', 'exam', 'imaging',
  'report', 'resting', 'and', 'with', 'the', 'of', 'for',
];

/** Side words. Laterality never changes which style the report should follow. */
const LATERALITY = ['left', 'right', 'bilateral', 'unilateral', 'bil', 'lt', 'rt', 'both'];

/**
 * Lowercases and strips punctuation, laterality and modality noise so that
 * cosmetic differences between labels disappear.
 */
export function normaliseScanLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  let t = raw.toLowerCase();
  t = t.replace(/\([^)]*\)/g, ' '); // "(Left)" / "(Bilateral)" side tags
  t = t.replace(/[^a-z0-9]+/g, ' ');
  const drop = new Set([...NOISE, ...LATERALITY]);
  return t
    .split(' ')
    .filter((w) => w && !drop.has(w))
    .join(' ')
    .trim();
}

const AORTO_ILIAC = /\b(aorto\s?iliac|aortoiliac|ao\s?iliac)\b/;
const LOWER_LIMB = /\b(lower limb|lower extremity|leg|legs|calf)\b/;
const UPPER_LIMB = /\b(upper limb|upper extremity|arm|arms)\b/;
const ARTERIAL = /\b(arterial|artery|arteries)\b/;
const VENOUS = /\b(venous|vein|veins|dvt|thrombosis|thrombus)\b/;

/**
 * Ordered rules — FIRST MATCH WINS, so the most specific patterns come first.
 * Combined studies (e.g. aorto-iliac *and* lower limb arterial) are their own
 * category rather than being forced into one of their halves, because they are
 * reported differently from either.
 */
const RULES: Array<{ key: string; test: (t: string) => boolean }> = [
  // Vein mapping ahead of dialysis access: "Pre-AV Fistula Mapping" mentions
  // fistula but is a mapping study and reads nothing like a fistula surveillance report.
  { key: 'Pre-AV Fistula Mapping', test: (t) => /\bpre\s?(av|avf)\b/.test(t) || (/\b(fistula|avf)\b/.test(t) && /\bmapping\b/.test(t)) },

  // Pressure/index studies ahead of dialysis access: "Brachial Finger Index
  // With Fistula Compression" is an index study that happens to name a fistula.
  {
    key: 'Pressure Indices',
    test: (t) =>
      /\b(ankle brachial|toe brachial|brachial finger|finger brachial|abi|tbi)\b/.test(t) ||
      (/\b(toe|finger|brachial|ankle)\b/.test(t) && /\b(pressure|pressures|index|indices)\b/.test(t)),
  },

  { key: 'AV Access (Fistula/Graft)', test: (t) => /\b(av fistula|avf|arteriovenous|fistula|graft)\b/.test(t) },

  // Combined aorto-iliac + runoff. Also catches "Abdominal Aortic and Lower
  // Limb Arterial", which is the same study under another name.
  {
    key: 'Aorto-Iliac and Lower Limb Arterial',
    test: (t) => (AORTO_ILIAC.test(t) || /\b(aortic|aorta)\b/.test(t)) && LOWER_LIMB.test(t) && ARTERIAL.test(t),
  },
  { key: 'Aorto-Iliac Arterial', test: (t) => AORTO_ILIAC.test(t) },

  { key: 'Carotid and Vertebral', test: (t) => /\b(carotid|vertebral)\b/.test(t) },
  { key: 'Renal Arterial', test: (t) => /\brenal\b/.test(t) },
  { key: 'Mesenteric Arterial', test: (t) => /\b(mesenteric|coeliac|celiac)\b/.test(t) },
  { key: 'Aortic', test: (t) => /\b(aortic|aorta|aneurysm|aaa)\b/.test(t) },

  // "iliac" on its own is deliberately NOT an aorto-iliac signal — pelvic and
  // ovarian venous studies mention it too.
  { key: 'Ilio-Caval Venous', test: (t) => /\b(ilio\s?caval|iliocaval|ivc|vena cava)\b/.test(t) },
  { key: 'Pelvic and Ovarian Venous', test: (t) => /\b(ovarian|pelvic|uterine)\b/.test(t) },

  // Interventions ahead of the plain limb studies: "Lower Limb Venous
  // Ablation" is a treatment report and reads nothing like a diagnostic scan,
  // but it would otherwise match the generic lower limb venous rule first.
  { key: 'Venous Intervention', test: (t) => /\b(venaseal|sclerotherapy|endovenous|ablation|evla|rfa|glue|foam)\b/.test(t) },

  { key: 'Upper Limb Venous Mapping', test: (t) => UPPER_LIMB.test(t) && /\bmapping\b/.test(t) },
  { key: 'Lower Limb Venous Mapping', test: (t) => /\bmapping\b/.test(t) && VENOUS.test(t) },

  { key: 'Upper Limb Arterial', test: (t) => UPPER_LIMB.test(t) && ARTERIAL.test(t) },
  { key: 'Upper Limb Venous', test: (t) => UPPER_LIMB.test(t) && VENOUS.test(t) },
  { key: 'Lower Limb Arterial', test: (t) => LOWER_LIMB.test(t) && ARTERIAL.test(t) },
  { key: 'Lower Limb Venous', test: (t) => LOWER_LIMB.test(t) && VENOUS.test(t) },
];

/**
 * Collapses a free-text scan name onto a canonical category key, or null when
 * nothing matches. Callers should fall back to comparing normalised labels
 * rather than treating null as "no category".
 */
export function canonicalScanCategory(raw: string | null | undefined): string | null {
  const t = normaliseScanLabel(raw);
  if (!t) return null;
  for (const rule of RULES) {
    if (rule.test(t)) return rule.key;
  }
  return null;
}

export interface TrainingCandidate {
  category?: string | null;
  reportText?: string | null;
  uploadedAt?: Date | string | null;
}

export interface TrainingSelection<T> {
  examples: T[];
  /** The canonical category the examples were matched on, if any. */
  category: string | null;
  /** False when no same-scan examples existed — in which case `examples` is empty. */
  matchedScanType: boolean;
}

const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0);

/**
 * Picks the training examples to show the AI for a given scan type.
 *
 * Only examples of the SAME scan are ever returned. A carotid report learns
 * nothing useful from a lower limb venous example, and in a clinical setting a
 * mismatched example is worse than none: it invites the model to reach for
 * anatomy and phrasing that does not belong to the study in front of it. When
 * there is no same-type example the result is empty and the caller falls back
 * to the scan-type content template and general reporting conventions.
 *
 * Within a category, pairs that already carry stored report text are preferred:
 * the alternative needs an OCR pass over a scanned image, which is slower and
 * produces messier text.
 */
export function selectTrainingExamples<T extends TrainingCandidate>(
  pairs: T[],
  scanType: string | null | undefined,
  limit: number,
): TrainingSelection<T> {
  const rank = (a: T, b: T) => {
    const byText = Number(!!b.reportText) - Number(!!a.reportText);
    return byText !== 0 ? byText : time(b.uploadedAt) - time(a.uploadedAt);
  };

  const canonical = canonicalScanCategory(scanType);
  const normalised = normaliseScanLabel(scanType);

  let matches: T[] = [];
  if (canonical) {
    matches = pairs.filter((p) => canonicalScanCategory(p.category) === canonical);
  } else if (normalised) {
    // Unrecognised scan name — fall back to an exact match on the tidied label
    // so novel scan types still group with their own kind.
    matches = pairs.filter((p) => normaliseScanLabel(p.category) === normalised);
  }

  if (matches.length > 0) {
    return {
      examples: matches.sort(rank).slice(0, limit),
      category: canonical ?? normalised,
      matchedScanType: true,
    };
  }

  // Deliberately empty rather than "something is better than nothing".
  return {
    examples: [],
    category: canonical ?? (normalised || null),
    matchedScanType: false,
  };
}
