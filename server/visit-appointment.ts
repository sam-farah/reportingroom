import type { Appointment } from "@shared/schema";
import { storage } from "./storage";
import { resolveClinicTimeZone, clinicIsoDate, DEFAULT_CLINIC_TIMEZONE } from "@shared/timezones";

/**
 * Working out which booking a piece of clinical work belongs to.
 *
 * Several things happening during a visit need to find "the appointment this
 * belongs to": uploading the worksheet, completing the report, signing the
 * Assignment of Benefit form. They used to each carry their own copy of the
 * matching rules, which drifted apart. This module is the single version.
 */

/** Statuses that mean the booking is finished with — never auto-change these. */
const CLOSED_STATUSES = new Set(["completed", "cancelled", "no_show"]);

export type VisitAppointmentMatch = {
  appointment: Appointment;
  /** True when the booking is still open, i.e. safe to move to "completed". */
  isOpen: boolean;
};

export type VisitAppointmentCompletion = {
  appointment: Appointment;
  /** True only when this call was the one that moved it to "completed". */
  justCompleted: boolean;
};

/**
 * The clinic's local timezone, used to decide which calendar day an
 * appointment falls on.
 *
 * Appointment times are stored as UTC instants and the server runs on UTC, so
 * comparing against a UTC calendar day silently loses every morning booking:
 * 9am in Sydney is 11pm UTC the *previous* day. Day boundaries have to be the
 * clinic's own midnight.
 */
async function resolveTimeZoneForClinic(clinicId: number | null | undefined): Promise<string> {
  if (clinicId == null) return DEFAULT_CLINIC_TIMEZONE;
  try {
    return resolveClinicTimeZone(await storage.getClinic(clinicId));
  } catch {
    return DEFAULT_CLINIC_TIMEZONE;
  }
}

/**
 * Every one of the patient's bookings on the given calendar day, earliest
 * first. Used both to pick the visit's booking and to inherit details from it
 * (reporting physician, verbal consent).
 */
export async function listVisitAppointments(
  patientId: number,
  when: Date | string,
): Promise<Appointment[]> {
  const day = when instanceof Date ? when : new Date(when);
  if (isNaN(day.getTime())) return [];

  const patient = await storage.getPatient(patientId);
  if (!patient) return [];
  const timeZone = await resolveTimeZoneForClinic(patient.clinicId);
  const targetDay = clinicIsoDate(day, timeZone);

  return (await storage.getPatientAppointments(patientId))
    .filter((a) => {
      // Bookings predate clinic scoping in places, so a null clinic is treated
      // as "this patient's clinic". A booking belonging to a *different*
      // clinic is never ours to read or change.
      if (a.clinicId != null && patient.clinicId != null && a.clinicId !== patient.clinicId) return false;
      const at = new Date(a.appointmentDate);
      return !isNaN(at.getTime()) && clinicIsoDate(at, timeZone) === targetDay;
    })
    .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
}

/**
 * Find the booking a piece of work belongs to: same patient, same calendar day
 * in the clinic's timezone.
 *
 * This deliberately returns bookings that are already completed. Callers need
 * the appointment for far more than its status — the Assignment of Benefit
 * form is looked up through it, and the referring doctor's details are copied
 * off it. Filtering completed bookings out of the *search* (rather than only
 * out of the *update*) meant that as soon as anything marked a booking
 * complete, everything downstream lost track of which visit it was.
 */
export async function findVisitAppointment(
  patientId: number,
  when: Date | string,
): Promise<VisitAppointmentMatch | null> {
  const sameDay = await listVisitAppointments(patientId, when);
  if (sameDay.length === 0) return null;

  // Prefer the earliest booking that's still open — that's the one being
  // worked through. A second study on the same day then attaches to its own
  // booking rather than to the finished first one.
  const open = sameDay.find((a) => !CLOSED_STATUSES.has(a.status));
  if (open) return { appointment: open, isOpen: true };

  // Nothing open. The usual reason is that this visit's booking was completed
  // earlier by the worksheet upload, and the report step is now looking for it
  // — so we do want to hand it back. But only when it is unambiguous:
  //
  //  - cancelled and no-show bookings are never a visit's booking, so anything
  //    hung off them (an Assignment of Benefit form, a referring doctor) would
  //    be attached to a visit that didn't happen;
  //  - with two completed bookings on one day there is no way to tell which
  //    study this is, and guessing would file billing against the wrong one.
  //
  // In both cases we report no match, exactly as the code did before.
  const completed = sameDay.filter((a) => a.status === "completed");
  if (completed.length !== 1) return null;
  return { appointment: completed[0], isOpen: false };
}

/**
 * Find the visit's booking and, if it's still open, mark it completed.
 * Returns the booking either way so the caller can still link things to it.
 */
export async function completeVisitAppointment(
  patientId: number,
  when: Date | string,
): Promise<VisitAppointmentCompletion | null> {
  const match = await findVisitAppointment(patientId, when);
  if (!match) return null;
  if (!match.isOpen) return { appointment: match.appointment, justCompleted: false };

  const updated = await storage.updateAppointment(match.appointment.id, { status: "completed" });
  return {
    appointment: updated ?? { ...match.appointment, status: "completed" },
    justCompleted: updated != null,
  };
}

/**
 * Turn a client-supplied patient id into one we're willing to act on.
 *
 * The worksheet upload screen tells us which patient the worksheet is for, and
 * that id arrives from the browser — so it has to be checked against the
 * caller's own clinic before it can move anything on a calendar. Returns null
 * for anything unusable rather than throwing; the caller treats "no patient"
 * as "don't touch the calendar".
 */
export async function resolveClinicPatientId(
  rawPatientId: unknown,
  userId: string,
): Promise<number | null> {
  const patientId =
    typeof rawPatientId === "number" ? rawPatientId : parseInt(String(rawPatientId ?? ""), 10);
  if (!Number.isInteger(patientId) || patientId <= 0) return null;

  const [user, patient] = await Promise.all([storage.getUser(userId), storage.getPatient(patientId)]);
  if (!user || !patient) return null;
  if (user.isSuperAdmin) return patientId;
  if (user.clinicId == null || patient.clinicId !== user.clinicId) return null;
  return patientId;
}
