import sgMail from "@sendgrid/mail";

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

  await sgMail.send({
    to: params.toEmail,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `You've been invited to join ${params.clinicName} on Reporting Room`,
    html,
  });
}
