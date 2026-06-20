// Shared SMS reminder text builder. Used by both the automated scheduler and the
// manual "Send SMS reminder" route so the wording stays identical.

export const DEFAULT_REMINDER_TEMPLATE =
  "Hi {patient}, this is a reminder of your {scan} appointment at {clinic} on {date} at {time}. Reply here if you need to reschedule.";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatReminderDate(d: Date): string {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`; // dd-MM-yyyy (AU)
}

export function formatReminderTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)}${ampm}`;
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
