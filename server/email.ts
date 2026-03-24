import sgMail from "@sendgrid/mail";
import fs from "fs";
import path from "path";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM_EMAIL = "contact@samfarah.com";
const FROM_NAME = "Reporting Room";

export async function sendInvitationEmail(params: {
  toEmail: string;
  invitationUrl: string;
  clinicName: string;
  role: string;
  invitedByName: string;
}): Promise<void> {
  const roleLabel = params.role === "admin" ? "Admin" : "Sonographer";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; color: #1a1a2e; margin: 0;">Reporting Room</h1>
        <p style="color: #666; margin: 4px 0 0;">Medical Report Generation System</p>
      </div>

      <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
        <h2 style="font-size: 20px; margin: 0 0 12px;">You've been invited to join ${params.clinicName}</h2>
        <p style="margin: 0; color: #444;">
          ${params.invitedByName} has invited you to join <strong>${params.clinicName}</strong> on Reporting Room as a <strong>${roleLabel}</strong>.
        </p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${params.invitationUrl}"
           style="background: #1a1a2e; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
          Accept Invitation
        </a>
      </div>

      <p style="color: #888; font-size: 13px; text-align: center;">
        This invitation link expires in 7 days. If you weren't expecting this invitation, you can safely ignore this email.
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

      <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
        Reporting Room &mdash; <a href="https://reportingroom.net" style="color: #aaa;">reportingroom.net</a>
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: params.toEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `You've been invited to join ${params.clinicName} on Reporting Room`,
      html,
    });
  } catch (err: any) {
    console.error("SendGrid error details:", JSON.stringify(err?.response?.body?.errors ?? err?.message, null, 2));
    throw err;
  }
}

export async function sendPatientPortalInvitationEmail(params: {
  toEmail: string;
  token: string;
  patientFirstName: string;
  clinicName: string;
}): Promise<void> {
  const portalUrl = `https://reportingroom.net/patient-portal/invite/${params.token}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; color: #1a1a2e; margin: 0;">Reporting Room</h1>
        <p style="color: #666; margin: 4px 0 0;">Patient Portal</p>
      </div>

      <div style="background: #f0f9ff; border-radius: 8px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #0ea5e9;">
        <h2 style="font-size: 20px; margin: 0 0 12px; color: #0c4a6e;">Hi ${params.patientFirstName},</h2>
        <p style="margin: 0; color: #444; line-height: 1.6;">
          Your medical reports from <strong>${params.clinicName}</strong> are now available to view securely online through our Patient Portal.
        </p>
      </div>

      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
        You can access your worksheets and reports at any time — all in one secure place. Simply click the button below to set up your account and get started.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${portalUrl}"
           style="background: #0ea5e9; color: #ffffff; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
          Access Your Reports
        </a>
      </div>

      <p style="color: #888; font-size: 13px; text-align: center;">
        This link expires in 7 days. If you have any questions, please contact ${params.clinicName} directly.
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

      <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
        Reporting Room &mdash; <a href="https://reportingroom.net" style="color: #aaa;">reportingroom.net</a>
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: params.toEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Your medical reports are ready to view — ${params.clinicName}`,
      html,
    });
  } catch (err: any) {
    console.error("SendGrid error details:", JSON.stringify(err?.response?.body?.errors ?? err?.message, null, 2));
    throw err;
  }
}

export async function sendAppointmentReminder(params: {
  toEmail: string;
  patientName: string;
  appointmentDate: Date;
  duration: number;
  scanType: string | null;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  clinicLogoUrl: string | null;
  reminderInstructions: string | null;
}): Promise<void> {
  // Try to embed logo as base64 data URL
  let logoHtml = '';
  if (params.clinicLogoUrl) {
    try {
      const logoPath = path.join(process.cwd(), params.clinicLogoUrl.startsWith('/') ? params.clinicLogoUrl.slice(1) : params.clinicLogoUrl);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const ext = path.extname(params.clinicLogoUrl).toLowerCase();
        const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
        const mime = mimeMap[ext] || 'image/png';
        logoHtml = `<img src="data:${mime};base64,${logoBuffer.toString('base64')}" alt="${params.clinicName}" style="max-height:70px;max-width:200px;object-fit:contain;" />`;
      }
    } catch {}
  }

  const dateStr = params.appointmentDate.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = params.appointmentDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });

  const instructionsSection = params.reminderInstructions
    ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:20px;margin-top:20px;">
        <h3 style="margin:0 0 10px;color:#92400e;font-size:15px;">📋 Preparation Instructions</h3>
        <p style="margin:0;color:#78350f;font-size:14px;line-height:1.7;white-space:pre-line;">${params.reminderInstructions}</p>
       </div>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

      <!-- Header with clinic branding -->
      <div style="background:#1a1a2e;padding:28px 32px;text-align:center;">
        ${logoHtml || `<h1 style="color:#ffffff;font-size:22px;margin:0;">${params.clinicName}</h1>`}
        ${logoHtml ? `<p style="color:#94a3b8;font-size:13px;margin:10px 0 0;">${params.clinicName}</p>` : ''}
      </div>

      <!-- Body -->
      <div style="padding:32px;">
        <h2 style="color:#1a1a2e;font-size:20px;margin:0 0 8px;">Appointment Reminder</h2>
        <p style="color:#555;margin:0 0 24px;font-size:15px;">Hi ${params.patientName}, here are the details for your upcoming appointment.</p>

        <!-- Appointment summary card -->
        <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;padding:24px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;width:140px;vertical-align:top;">📅 Date</td>
              <td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${dateStr}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;vertical-align:top;">🕐 Time</td>
              <td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">${timeStr} &nbsp;<span style="color:#64748b;font-weight:400;font-size:13px;">(approx. ${params.duration} min)</span></td>
            </tr>
            ${params.scanType ? `
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;vertical-align:top;">🔬 Scan Type</td>
              <td style="padding:8px 0;color:#1e293b;font-size:14px;">${params.scanType}</td>
            </tr>` : ''}
            ${params.clinicAddress ? `
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;vertical-align:top;">📍 Location</td>
              <td style="padding:8px 0;color:#1e293b;font-size:14px;">${params.clinicAddress}</td>
            </tr>` : ''}
          </table>
        </div>

        ${instructionsSection}

        <!-- Contact info -->
        ${params.clinicPhone || params.clinicEmail ? `
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;">
          <p style="color:#64748b;font-size:13px;margin:0 0 6px;font-weight:600;">Questions? Contact us:</p>
          ${params.clinicPhone ? `<p style="margin:2px 0;color:#555;font-size:13px;">📞 ${params.clinicPhone}</p>` : ''}
          ${params.clinicEmail ? `<p style="margin:2px 0;color:#555;font-size:13px;">✉️ ${params.clinicEmail}</p>` : ''}
        </div>` : ''}
      </div>

      <!-- Footer -->
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">${params.clinicName} &mdash; Powered by <a href="https://reportingroom.net" style="color:#94a3b8;">Reporting Room</a></p>
      </div>
    </div>
  `;

  try {
    await sgMail.send({
      to: params.toEmail,
      from: { email: FROM_EMAIL, name: params.clinicName },
      subject: `Appointment Reminder — ${dateStr} at ${timeStr} | ${params.clinicName}`,
      html,
    });
  } catch (err: any) {
    console.error("SendGrid reminder error:", JSON.stringify(err?.response?.body?.errors ?? err?.message, null, 2));
    throw err;
  }
}

export async function sendReportEmail(params: {
  toEmail: string;
  toName: string;
  subject: string;
  reportHtml: string;
  clinicName: string;
  patientName: string;
}): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 780px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 24px; margin-bottom: 24px; border-left: 4px solid #0066cc;">
        <p style="margin: 0; font-size: 14px; color: #555;">
          The following medical report for <strong>${params.patientName}</strong> has been sent from <strong>${params.clinicName}</strong>.
        </p>
      </div>

      ${params.reportHtml}

      <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
      <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
        Sent via Reporting Room &mdash; <a href="https://reportingroom.net" style="color: #aaa;">reportingroom.net</a>
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: { email: params.toEmail, name: params.toName },
      from: { email: FROM_EMAIL, name: params.clinicName || FROM_NAME },
      subject: params.subject,
      html,
    });
  } catch (err: any) {
    console.error("SendGrid error details:", JSON.stringify(err?.response?.body?.errors ?? err?.message, null, 2));
    throw err;
  }
}
