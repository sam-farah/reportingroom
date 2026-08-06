/**
 * Checks the shared "which booking does this visit belong to?" logic.
 *
 * Run: npx tsx scripts/visit-appointment.test.ts   (dev database only)
 *
 * Creates its own throwaway clinic/patients/appointments and removes them
 * again in a finally block.
 */
import assert from "node:assert";
import { db } from "../server/db";
import { clinics, patients, appointments, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  findVisitAppointment,
  completeVisitAppointment,
  listVisitAppointments,
  resolveClinicPatientId,
} from "../server/visit-appointment";

const HOME_CLINIC = 1; // Nexus Vascular Imaging (Australia/Sydney) in dev
const stamp = Date.now();

let otherClinicId: number | null = null;
const patientIds: number[] = [];
const apptIds: number[] = [];
let pass = 0;
const fail: string[] = [];

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
      console.log(`PASS  ${name}`);
    })
    .catch((e) => {
      fail.push(name);
      console.log(`FAIL  ${name}\n      ${e?.message ?? e}`);
    });
}

async function makePatient(clinicId: number, label: string) {
  const [p] = await db
    .insert(patients)
    .values({
      firstName: "ZZTest",
      lastName: `${label}${stamp}`,
      dateOfBirth: "1980-01-01",
      clinicId,
    })
    .returning();
  patientIds.push(p.id);
  return p.id;
}

async function makeAppt(patientId: number, when: Date, status: string, clinicId = HOME_CLINIC) {
  const [a] = await db
    .insert(appointments)
    .values({
      patientName: "ZZTest Patient",
      appointmentDate: when,
      status,
      clinicId,
      patientId,
    })
    .returning();
  apptIds.push(a.id);
  return a.id;
}

async function statusOf(id: number) {
  const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
  return row?.status;
}

async function main() {
  // Sydney is UTC+10 in August (no daylight saving).
  const nineAmSydney = new Date("2026-08-05T23:00:00Z"); // 9am Thu 6 Aug, Sydney
  const elevenAmSydney = new Date("2026-08-06T01:00:00Z"); // 11am Thu 6 Aug, Sydney

  // 1. The core request: an open booking gets completed.
  const p1 = await makePatient(HOME_CLINIC, "open");
  const a1 = await makeAppt(p1, elevenAmSydney, "checked_in");
  await check("open booking on the day is marked completed", async () => {
    const r = await completeVisitAppointment(p1, elevenAmSydney);
    assert.ok(r, "expected a match");
    assert.strictEqual(r!.appointment.id, a1);
    assert.strictEqual(r!.justCompleted, true);
    assert.strictEqual(await statusOf(a1), "completed");
  });

  // 2. Regression guard for the Assignment of Benefit form: once the upload has
  //    completed the booking, the report/AoB step must STILL find it.
  await check("an already-completed booking is still found (AoB linkage)", async () => {
    const r = await completeVisitAppointment(p1, elevenAmSydney);
    assert.ok(r, "expected the completed booking to still be found");
    assert.strictEqual(r!.appointment.id, a1);
    assert.strictEqual(r!.justCompleted, false, "must not claim to have completed it twice");
    const f = await findVisitAppointment(p1, elevenAmSydney);
    assert.strictEqual(f!.appointment.id, a1);
    assert.strictEqual(f!.isOpen, false);
  });

  // 3. The timezone trap: a 9am Sydney booking is stored as 11pm UTC the day
  //    before. Matching on UTC days silently missed every morning appointment.
  const p2 = await makePatient(HOME_CLINIC, "morning");
  const a2 = await makeAppt(p2, nineAmSydney, "scheduled");
  await check("9am Sydney booking matches an 11am Sydney upload (crosses UTC midnight)", async () => {
    const r = await completeVisitAppointment(p2, elevenAmSydney);
    assert.ok(r, "morning booking was not found — UTC day bounds again?");
    assert.strictEqual(r!.appointment.id, a2);
    assert.strictEqual(await statusOf(a2), "completed");
  });

  // 4. An exam date string (yyyy-mm-dd) resolves to the same clinic day.
  const p3 = await makePatient(HOME_CLINIC, "datestr");
  const a3 = await makeAppt(p3, nineAmSydney, "scheduled");
  await check("yyyy-mm-dd exam date matches the clinic's calendar day", async () => {
    const r = await completeVisitAppointment(p3, "2026-08-06");
    assert.ok(r, "expected the 6 Aug booking to match");
    assert.strictEqual(r!.appointment.id, a3);
  });

  // 5. Cancelled and no-show bookings are never touched, and are never handed
  //    back as "the visit's booking" — a signed AoB form or a referring doctor
  //    hung off a cancelled visit would be filed against a visit that never
  //    happened.
  for (const status of ["cancelled", "no_show"]) {
    const p = await makePatient(HOME_CLINIC, status);
    const a = await makeAppt(p, elevenAmSydney, status);
    await check(`a ${status} booking is left alone and never matched`, async () => {
      assert.strictEqual(await findVisitAppointment(p, elevenAmSydney), null);
      assert.strictEqual(await completeVisitAppointment(p, elevenAmSydney), null);
      assert.strictEqual(await statusOf(a), status, "status must not change");
    });
  }

  // 5b. An open booking still wins even when a cancelled one shares the day.
  const p5b = await makePatient(HOME_CLINIC, "cancelledplus");
  await makeAppt(p5b, nineAmSydney, "cancelled");
  const openLater = await makeAppt(p5b, elevenAmSydney, "scheduled");
  await check("a cancelled booking doesn't shadow the real one", async () => {
    const r = await completeVisitAppointment(p5b, elevenAmSydney);
    assert.strictEqual(r!.appointment.id, openLater);
    assert.strictEqual(r!.justCompleted, true);
  });

  // 5c. Two completed bookings and nothing open is ambiguous — there's no way
  //     to tell which study a later report belongs to, so match nothing rather
  //     than bill against the wrong booking.
  const p5c = await makePatient(HOME_CLINIC, "ambiguous");
  await makeAppt(p5c, nineAmSydney, "completed");
  await makeAppt(p5c, elevenAmSydney, "completed");
  await check("two completed bookings on one day are not guessed between", async () => {
    assert.strictEqual(await findVisitAppointment(p5c, elevenAmSydney), null);
  });

  // 6. Two studies in one day: the second upload must take the still-open
  //    booking, not re-touch the finished morning one.
  const p4 = await makePatient(HOME_CLINIC, "twice");
  const early = await makeAppt(p4, nineAmSydney, "completed");
  const late = await makeAppt(p4, elevenAmSydney, "checked_in");
  await check("second study of the day picks the still-open booking", async () => {
    const r = await completeVisitAppointment(p4, elevenAmSydney);
    assert.strictEqual(r!.appointment.id, late);
    assert.strictEqual(r!.justCompleted, true);
    assert.strictEqual(await statusOf(early), "completed");
    assert.strictEqual(await statusOf(late), "completed");
  });

  // 7. A booking on a different day is not touched.
  const p5 = await makePatient(HOME_CLINIC, "otherday");
  const a5 = await makeAppt(p5, new Date("2026-08-11T01:00:00Z"), "scheduled");
  await check("a booking on another day is not completed", async () => {
    const r = await completeVisitAppointment(p5, elevenAmSydney);
    assert.strictEqual(r, null);
    assert.strictEqual(await statusOf(a5), "scheduled");
  });

  // 8. Clinic scoping on the client-supplied patient id.
  const [other] = await db
    .insert(clinics)
    .values({ name: `ZZTest Clinic ${stamp}`, email: `zztest-${stamp}@example.invalid` })
    .returning();
  otherClinicId = other.id;
  const foreign = await makePatient(other.id, "foreign");

  const [homeStaff] = await db.select().from(users).where(eq(users.clinicId, HOME_CLINIC)).limit(1);
  assert.ok(homeStaff, "dev database needs a user in clinic 1 for the scoping test");
  const homeStaffId = homeStaff.id;

  await check("a patient from another clinic is rejected", async () => {
    assert.strictEqual(await resolveClinicPatientId(foreign, homeStaffId), null);
  });
  await check("the caller's own patient is accepted", async () => {
    assert.strictEqual(await resolveClinicPatientId(p1, homeStaffId), p1);
  });
  await check("a numeric string patient id is accepted", async () => {
    assert.strictEqual(await resolveClinicPatientId(String(p1), homeStaffId), p1);
  });
  for (const bad of [undefined, null, "", "abc", 0, -3, 99999999]) {
    await check(`rubbish patient id ${JSON.stringify(bad)} is rejected`, async () => {
      assert.strictEqual(await resolveClinicPatientId(bad, homeStaffId), null);
    });
  }

  // 8b. A booking stamped with another clinic is not ours to touch.
  const pForeignAppt = await makePatient(HOME_CLINIC, "foreignappt");
  const foreignAppt = await makeAppt(pForeignAppt, elevenAmSydney, "scheduled", other.id);
  await check("a booking belonging to another clinic is ignored", async () => {
    assert.strictEqual(await findVisitAppointment(pForeignAppt, elevenAmSydney), null);
    assert.strictEqual(await statusOf(foreignAppt), "scheduled");
  });

  // 8c. Ordering contract: callers inherit details (reporting doctor, consent)
  //     from this list, so the order is part of the interface.
  const pOrder = await makePatient(HOME_CLINIC, "ordering");
  const first = await makeAppt(pOrder, nineAmSydney, "cancelled");
  const second = await makeAppt(pOrder, elevenAmSydney, "scheduled");
  await check("same-day bookings come back earliest-first", async () => {
    const list = await listVisitAppointments(pOrder, elevenAmSydney);
    assert.deepStrictEqual(list.map((a) => a.id), [first, second]);
  });

  // 9. A patient with no bookings at all.
  const p6 = await makePatient(HOME_CLINIC, "nobookings");
  await check("a patient with no bookings returns nothing", async () => {
    assert.strictEqual(await completeVisitAppointment(p6, elevenAmSydney), null);
  });

  // 10. An unparseable date does nothing rather than throwing.
  await check("an unusable date is ignored", async () => {
    assert.strictEqual(await completeVisitAppointment(p1, "not-a-date"), null);
  });
}

main()
  .catch((e) => {
    fail.push(`harness: ${e?.message ?? e}`);
  })
  .finally(async () => {
    try {
      if (apptIds.length) await db.delete(appointments).where(inArray(appointments.id, apptIds));
      if (patientIds.length) await db.delete(patients).where(inArray(patients.id, patientIds));
      if (otherClinicId != null) await db.delete(clinics).where(eq(clinics.id, otherClinicId));
    } catch (e) {
      console.log("cleanup problem:", e);
    }
    console.log(`\n${pass} passed, ${fail.length} failed`);
    if (fail.length) {
      console.log("failed:", fail.join(" | "));
      process.exit(1);
    }
    process.exit(0);
  });
