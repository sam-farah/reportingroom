// Per-clinic timezone support.
//
// Appointment timestamps are stored in UTC and the server runs in UTC, so any
// patient-facing date/time (SMS reminders, email reminders, consent documents,
// attendance certificates) MUST be rendered in the clinic's own local timezone.
// Clinics are mostly Australian/NZ and several states do not observe daylight
// saving (QLD, WA, NT), so a single hard-coded zone renders the wrong date/time.
//
// This module is intentionally dependency-free so both the server and the client
// can import it and stay consistent.

export const DEFAULT_CLINIC_TIMEZONE = "Australia/Sydney";

// Curated list shown in the clinic create + settings UI. Any other valid IANA
// zone is still accepted by `isValidClinicTimeZone` (we're not locked to this list).
export const AU_NZ_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Australia/Sydney", label: "Sydney (NSW / ACT)" },
  { value: "Australia/Melbourne", label: "Melbourne (VIC)" },
  { value: "Australia/Brisbane", label: "Brisbane (QLD — no daylight saving)" },
  { value: "Australia/Adelaide", label: "Adelaide (SA)" },
  { value: "Australia/Perth", label: "Perth (WA — no daylight saving)" },
  { value: "Australia/Darwin", label: "Darwin (NT — no daylight saving)" },
  { value: "Australia/Hobart", label: "Hobart (TAS)" },
  { value: "Australia/Broken_Hill", label: "Broken Hill (far-west NSW)" },
  { value: "Australia/Lord_Howe", label: "Lord Howe Island" },
  { value: "Pacific/Auckland", label: "Auckland (New Zealand)" },
  { value: "Pacific/Chatham", label: "Chatham Islands (New Zealand)" },
];

const KNOWN_OPTION_VALUES = new Set(AU_NZ_TIMEZONE_OPTIONS.map((o) => o.value));

// True for any timezone the runtime recognises (curated option or other IANA zone).
export function isValidClinicTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  if (KNOWN_OPTION_VALUES.has(value)) return true;
  try {
    // Throws a RangeError for an unrecognised IANA timezone identifier.
    new Intl.DateTimeFormat("en-AU", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Resolve a clinic's timezone, always falling back to the default so a missing or
// invalid value never produces a broken date render.
export function resolveClinicTimeZone(
  clinicLike: { timezone?: string | null } | null | undefined,
): string {
  const tz = clinicLike?.timezone;
  return isValidClinicTimeZone(tz) ? (tz as string) : DEFAULT_CLINIC_TIMEZONE;
}

// yyyy-mm-dd calendar date in the clinic's timezone. Use this for the once-per-day
// consent rule and any filed documentDate so they roll over at the clinic's local
// midnight (never the server's UTC midnight) and always agree with each other.
export function clinicIsoDate(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}
