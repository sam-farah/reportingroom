// Automated SMS appointment reminder scheduler.
// Runs on an interval; for each SMS-enabled clinic it finds upcoming appointments inside the
// clinic's lead window that have not yet had a reminder sent, sends an SMS, and marks them so
// they are never sent twice. Safe to run when Twilio is not configured — it simply does nothing.

import { storage } from "./storage";
import { isSmsConfigured, sendSms, normalisePhone, getSmsFromNumber } from "./twilio";
import { buildReminderBody } from "./sms-templates";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

async function runOnce(host: string | null): Promise<void> {
  if (!isSmsConfigured()) return;

  const clinics = await storage.getSmsEnabledClinics();
  for (const clinic of clinics) {
    const leadHours = clinic.smsReminderLeadHours ?? 24;
    let appointments;
    try {
      appointments = await storage.getAppointmentsNeedingSmsReminder(clinic.id, leadHours);
    } catch (err) {
      console.error(`[sms-scheduler] failed to load appointments for clinic ${clinic.id}:`, err);
      continue;
    }

    for (const appt of appointments) {
      // Atomically claim this appointment BEFORE sending. If another concurrent tick already
      // claimed it, skip — this guarantees a reminder is never sent twice.
      const won = await storage.claimAppointmentSmsReminder(appt.id).catch(() => false);
      if (!won) continue;

      const to = normalisePhone(appt.patientPhone);
      if (!to) {
        // No usable phone — leave it claimed so we don't retry endlessly.
        continue;
      }

      const body = buildReminderBody(appt, clinic);

      // The SEND is the only thing we roll the claim back for. Once Twilio has accepted the
      // message the patient has (or will) receive it, so we must NOT retry even if the
      // follow-up DB logging fails — otherwise the patient gets a duplicate SMS.
      const statusCallback = host ? `${host}/api/sms/webhook/status` : undefined;
      let result;
      try {
        result = await sendSms({ to, body, statusCallback });
      } catch (err: any) {
        console.error(`[sms-scheduler] failed to send reminder for appointment ${appt.id}:`, err?.message || err);
        // Send failed — release the claim so a later cycle can retry.
        await storage.clearAppointmentSmsReminder(appt.id).catch(() => {});
        await storage.createSmsMessage({
          clinicId: clinic.id,
          patientId: appt.patientId ?? null,
          appointmentId: appt.id,
          direction: "outbound",
          body,
          fromNumber: getSmsFromNumber() || "",
          toNumber: to,
          status: "failed",
          errorMessage: err?.message || "Send failed",
          isReminder: true,
        }).catch(() => {});
        continue;
      }

      // Send succeeded — the claim stays. Persist the record; if this fails, just log it
      // (the reminder still went out and must not be re-sent).
      try {
        await storage.createSmsMessage({
          clinicId: clinic.id,
          patientId: appt.patientId ?? null,
          appointmentId: appt.id,
          direction: "outbound",
          body,
          fromNumber: getSmsFromNumber()!,
          toNumber: to,
          status: result.status,
          twilioSid: result.sid,
          isReminder: true,
        });
      } catch (persistErr: any) {
        console.error(`[sms-scheduler] reminder SENT for appointment ${appt.id} but failed to log it:`, persistErr?.message || persistErr);
      }
      console.log(`[sms-scheduler] reminder sent for appointment ${appt.id} (clinic ${clinic.id})`);
    }
  }
}

let started = false;

/** Start the recurring reminder scheduler. `publicHost` is used for delivery status callbacks. */
export function startSmsReminderScheduler(publicHost: string | null): void {
  if (started) return;
  started = true;

  const tick = () => {
    runOnce(publicHost).catch(err => console.error("[sms-scheduler] tick error:", err));
  };

  // First run shortly after boot, then on the interval.
  setTimeout(tick, 30 * 1000);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[sms-scheduler] started");
}
