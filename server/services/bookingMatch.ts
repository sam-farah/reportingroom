/**
 * Matching a row on the practice scheduler (Clinic to Cloud) against a scan
 * request in ReportingRoom.
 *
 * The scheduler gives us a display name, a date of birth and a phone number per
 * booking — no UR number, nothing else. Those three have to carry the match.
 *
 * A FALSE match is the dangerous direction here. The result is drawn as a tick
 * next to a booking, and a tick on a booking that was never referred would lead
 * staff to skip real work. A missed match only makes them check by hand. So the
 * rule is deliberately strict: the NAME must agree, and then at least one
 * independent identifier — date of birth or phone — must agree as well.
 */

/**
 * Digits only, with Australian country codes folded back to the local form so
 * "+61 408 644 474", "0408 644 474" and "0408644474" all compare equal.
 */
export function normalisePhone(raw: string | null | undefined): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("0061")) digits = digits.slice(4);
  else if (digits.startsWith("61") && digits.length >= 11) digits = digits.slice(2);
  if (digits.length === 9 && !digits.startsWith("0")) digits = "0" + digits;
  return digits;
}

export function isUsablePhone(normalised: string): boolean {
  return normalised.length >= 9 && normalised.length <= 12;
}

const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "doctor", "prof", "professor",
  "sr", "snr", "jr", "jnr", "master", "rev", "sister", "matron",
]);

export interface NameParts {
  surname: string;
  given: string[];
}

/**
 * Splits a display name into a surname plus every given name we can see.
 *
 * A parenthesised nickname is kept as an additional given name rather than
 * discarded: the scheduler shows "Mr Luigino (Gino) Briganti" while the
 * referral may well have been entered as "Gino Briganti".
 */
export function parseName(raw: string | null | undefined): NameParts | null {
  let s = (raw ?? "").toLowerCase();

  const nicknames: string[] = [];
  s = s.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    nicknames.push(inner);
    return " ";
  });

  const clean = (t: string) =>
    t
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z'-]/g, ""))
      .filter(Boolean)
      .filter((w) => !TITLES.has(w));

  const tokens = clean(s);
  if (tokens.length === 0) return null;

  const surname = tokens[tokens.length - 1];
  const given = tokens.slice(0, -1).concat(nicknames.flatMap(clean));
  return { surname, given };
}

/**
 * Short forms treated as the same given name. This is a curated list on purpose.
 *
 * The obvious shortcut — "one name is a prefix of the other" — is unsafe here,
 * because families share a phone number and the phone is half the match.
 * "Dan" is a prefix of both Daniel and Daniela, so a prefix rule would tick a
 * booking for the wrong member of a household. Add entries as real cases turn
 * up rather than reaching for a general rule.
 */
const NICKNAMES = new Map<string, string>(Object.entries({
  bob: "robert", robbie: "robert", rob: "robert",
  bill: "william", billy: "william", will: "william",
  dave: "david", davey: "david",
  mike: "michael", mick: "michael", micky: "michael",
  chris: "christopher",
  matt: "matthew",
  dan: "daniel", danny: "daniel",
  tim: "timothy",
  tony: "anthony",
  steve: "stephen", steven: "stephen",
  jim: "james", jimmy: "james",
  joe: "joseph",
  tom: "thomas", tommy: "thomas",
  nick: "nicholas",
  pete: "peter",
  rick: "richard", ricky: "richard",
  ron: "ronald",
  ken: "kenneth",
  greg: "gregory",
  jeff: "jeffrey", geoff: "jeffrey", geoffrey: "jeffrey",
  ed: "edward", eddie: "edward", ted: "edward",
  alex: "alexander",
  ben: "benjamin",
  andy: "andrew",
  sue: "susan", susie: "susan",
  liz: "elizabeth", lizzie: "elizabeth", beth: "elizabeth", betty: "elizabeth",
  kate: "katherine", katie: "katherine", kathy: "katherine", catherine: "katherine",
  maggie: "margaret", peggy: "margaret",
  jenny: "jennifer",
  vicky: "victoria",
  angie: "angela",
  barb: "barbara",
  deb: "deborah", debbie: "deborah",
  terry: "terence",
  ray: "raymond",
  don: "donald",
  gerry: "gerald", jerry: "gerald",
  larry: "lawrence",
}));

const canonicalGiven = (n: string): string => NICKNAMES.get(n) ?? n;

/** True only on an exact given name, or a known short form of the same name. */
function givenNameEqual(a: string, b: string): boolean {
  return a === b || canonicalGiven(a) === canonicalGiven(b);
}

export function namesMatch(a: NameParts, b: NameParts): boolean {
  if (a.surname !== b.surname) return false;
  // Fail closed on a surname-only record. With a shared household phone, the
  // surname alone is not evidence of who the booking belongs to.
  if (a.given.length === 0 || b.given.length === 0) return false;
  return a.given.some((x) => b.given.some((y) => givenNameEqual(x, y)));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function buildDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1900 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Dates of birth to ISO. Handles what the database stores (`1975-08-04`) and
 * what the scheduler renders (`04 August, 1975`), plus Australian day-first
 * numeric dates. Anything else returns "" and simply won't match.
 */
export function normaliseDob(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return buildDate(+m[1], +m[2], +m[3]) ?? "";

  // 04 August, 1975
  m = s.match(/^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
    return month ? buildDate(+m[3], month, +m[1]) ?? "" : "";
  }

  // August 4, 1975
  m = s.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
    return month ? buildDate(+m[3], month, +m[2]) ?? "" : "";
  }

  // 04/08/1975 — day first, as everywhere else in this app
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return buildDate(+m[3], +m[2], +m[1]) ?? "";

  return "";
}

export interface BookingRow {
  name: string;
  phone?: string | null;
  dob?: string | null;
}

export interface ReferralRecord {
  patientName: string | null;
  /**
   * Every phone number and date of birth this referral could legitimately carry:
   * the values typed onto the referral itself, and those on the patient's file.
   *
   * Both sources are needed because they drift apart in practice — a referral
   * has been seen holding the previous patient's mobile while the linked patient
   * file held the right one.
   */
  phones: Array<string | null | undefined>;
  dobs: Array<string | null | undefined>;
}

/**
 * Returns the indexes of `rows` that have a matching referral in `referrals`.
 * `referrals` should already be narrowed to the clinic and the date in question.
 *
 * The rule is: the NAME must agree, and then at least one independent
 * identifier — date of birth or phone number — must agree too. Requiring a
 * second identifier is what stops a household sharing a phone, or two patients
 * sharing a surname, from ticking each other's bookings.
 */
export function matchBookings(rows: BookingRow[], referrals: ReferralRecord[]): number[] {
  const prepared = referrals
    .map((r) => ({
      name: parseName(r.patientName),
      phones: new Set(r.phones.map(normalisePhone).filter(isUsablePhone)),
      dobs: new Set(r.dobs.map(normaliseDob).filter(Boolean)),
    }))
    .filter((r) => r.name !== null && (r.phones.size > 0 || r.dobs.size > 0));

  const matched: number[] = [];
  rows.forEach((row, index) => {
    const name = parseName(row.name);
    if (!name) return;

    const phone = normalisePhone(row.phone);
    const usablePhone = isUsablePhone(phone) ? phone : null;
    const dob = normaliseDob(row.dob) || null;
    if (!usablePhone && !dob) return; // nothing to corroborate the name with

    const hit = prepared.some((r) => {
      if (!namesMatch(name, r.name as NameParts)) return false;
      if (dob && r.dobs.has(dob)) return true;
      if (usablePhone && r.phones.has(usablePhone)) return true;
      return false;
    });
    if (hit) matched.push(index);
  });

  return matched;
}
