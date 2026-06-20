// Shared SMS reminder text builder. Used by both the automated scheduler and the
// manual "Send SMS reminder" route so the wording stays identical.

export const DEFAULT_REMINDER_TEMPLATE =
  "Hi {patient}, this is a reminder of your {scan} appointment at {clinic} on {date} at {time}. Reply here if you need to reschedule.";

// Appointment times are stored in UTC; clinics operate in Australian local time, so
// always render reminders in the clinic timezone (matches the email reminder path).
const CLINIC_TZ = "Australia/Sydney";

export function formatReminderDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: CLINIC_TZ, day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")}-${get("month")}-${get("year")}`; // dd-MM-yyyy (AU)
}

export function formatReminderTime(d: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: CLINIC_TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d).replace(/\s/g, "").toLowerCase(); // e.g. "1:00pm"
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => vars[key] ?? "");
}

// Build the reminder SMS body from an appointment + clinic, honouring the clinic's
// custom template (falling back to the default).
export function buildReminderBody(
  appt: { patientName: string | null; scanType: string | null; appointmentDate: Date | string },
  clinic: { name: string; smsReminderTemplate?: string | null },
): string {
  const apptDate = new Date(appt.appointmentDate);
  const template = clinic.smsReminderTemplate?.trim() || DEFAULT_REMINDER_TEMPLATE;
  return fillTemplate(template, {
    patient: (appt.patientName || "").split(" ")[0] || appt.patientName || "there",
    scan: appt.scanType || "scan",
    clinic: clinic.name,
    date: formatReminderDate(apptDate),
    time: formatReminderTime(apptDate),
  });
}
