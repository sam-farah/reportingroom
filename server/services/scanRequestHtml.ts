import type { ScanRequest, Clinic } from "@shared/schema";

const URGENCY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  routine: { label: "Routine", color: "#4b5563", bg: "#f8fafc" },
  urgent: { label: "Urgent", color: "#b45309", bg: "#fffbeb" },
  asap: { label: "ASAP", color: "#c2410c", bg: "#fff7ed" },
  stat: { label: "STAT", color: "#dc2626", bg: "#fef2f2" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

function urgencyNote(urgency: string): string {
  switch (urgency) {
    case "stat": return "IMMEDIATE attention required — perform today";
    case "asap": return "Perform as soon as possible — within 24 hours";
    case "urgent": return "Schedule within 48–72 hours";
    default: return "Standard scheduling applies";
  }
}

function esc(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNow(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function buildScanRequestHtml(r: ScanRequest, clinic: Clinic | null): string {
  const clinicName = clinic?.name || "Clinic";
  const clinicAddress = clinic?.address || "";
  const clinicPhone = clinic?.phone || "";
  const clinicFax = (clinic as any)?.fax || "";
  const clinicEmail = clinic?.email || "";
  const logoUrl = clinic?.logoUrl || "";
  const urg = URGENCY_CFG[r.urgency] ?? URGENCY_CFG.routine;
  const statusLabel = STATUS_LABEL[r.status] ?? r.status;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Scan Request – ${esc(r.patientName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; padding: 30px 40px; max-width: 820px; margin: 0 auto; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid #0f4c75; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .clinic-logo { height: 52px; object-fit: contain; }
    .clinic-title { font-size: 20px; font-weight: 800; color: #0f4c75; letter-spacing: -0.3px; }
    .clinic-tagline { font-size: 10px; color: #1b6ca8; margin-top: 2px; letter-spacing: 0.5px; text-transform: uppercase; }
    .clinic-contact { font-size: 10px; color: #555; margin-top: 4px; line-height: 1.6; }
    .header-right { text-align: right; }
    .doc-title { font-size: 15px; font-weight: 700; color: #0f4c75; text-transform: uppercase; letter-spacing: 1px; }
    .doc-meta { margin-top: 6px; font-size: 10px; color: #555; line-height: 1.8; }
    .req-id { font-family: monospace; font-weight: 700; color: #0f4c75; }
    .urgency-banner { background: ${urg.bg}; border-left: 5px solid ${urg.color}; padding: 8px 14px; margin-bottom: 20px; border-radius: 0 6px 6px 0; display: flex; align-items: center; gap: 10px; }
    .urgency-label { font-weight: 800; font-size: 13px; color: ${urg.color}; text-transform: uppercase; letter-spacing: 0.5px; }
    .urgency-note { font-size: 10px; color: #555; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .full-col { margin-bottom: 16px; }
    .section-box { border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; }
    .section-head { background: #0f4c75; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 6px 12px; }
    .section-body { padding: 10px 12px; line-height: 1.8; }
    .field-row { display: flex; gap: 4px; margin-bottom: 3px; }
    .field-label { font-weight: 600; color: #374151; min-width: 110px; font-size: 10.5px; }
    .field-value { color: #111; font-size: 10.5px; }
    .scan-grid { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
    .scan-tag { background: #e0f0ff; color: #0f4c75; border: 1px solid #b3d4f5; border-radius: 4px; padding: 3px 9px; font-size: 10px; font-weight: 600; }
    .clinical-text { padding: 10px 12px; font-size: 10.5px; line-height: 1.7; color: #222; min-height: 50px; }
    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; padding-top: 16px; border-top: 2px solid #0f4c75; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #333; width: 80%; margin: 32px auto 6px auto; }
    .sig-caption { font-size: 9.5px; color: #555; }
    .source-pill { display: inline-block; background: #f0f7ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 99px; padding: 2px 10px; font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 6px; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #dde3ee; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }
    @media print { body { padding: 15px 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoUrl ? `<img src="${esc(logoUrl)}" class="clinic-logo" alt="logo" />` : ""}
      <div>
        <div class="clinic-title">${esc(clinicName)}</div>
        <div class="clinic-tagline">Vascular Ultrasound Specialists</div>
        <div class="clinic-contact">
          ${clinicAddress ? `${esc(clinicAddress)}<br>` : ""}
          ${clinicPhone ? `Phone: ${esc(clinicPhone)}` : ""}${clinicPhone && clinicFax ? "&ensp;|&ensp;" : ""}${clinicFax ? `Fax: ${esc(clinicFax)}` : ""}<br>
          ${esc(clinicEmail)}
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title">Scan Request${r.source === "web_form" ? `<span class="source-pill">Web Form</span>` : r.source === "referrer_portal" ? `<span class="source-pill">Referrer Portal</span>` : ""}</div>
      <div class="doc-meta">
        <span class="req-id">REQ-${String(r.id).padStart(5, "0")}</span><br>
        Date: ${esc(r.requestDate)}<br>
        Saved: ${fmtNow()}<br>
        Status: <strong>${esc(statusLabel)}</strong>
      </div>
    </div>
  </div>

  <div class="urgency-banner">
    <div class="urgency-label">⚡ ${urg.label}</div>
    <div class="urgency-note">${urgencyNote(r.urgency)}</div>
  </div>

  <div class="two-col">
    <div class="section-box">
      <div class="section-head">Patient Information</div>
      <div class="section-body">
        <div class="field-row"><span class="field-label">Name:</span><span class="field-value"><strong>${esc(r.patientName)}</strong></span></div>
        ${r.patientUrNumber ? `<div class="field-row"><span class="field-label">UR Number:</span><span class="field-value"><strong style="color:#1d4ed8;font-family:monospace">${esc(r.patientUrNumber)}</strong></span></div>` : ""}
        ${r.patientDob ? `<div class="field-row"><span class="field-label">Date of Birth:</span><span class="field-value">${esc(r.patientDob)}</span></div>` : ""}
        ${r.patientPhone ? `<div class="field-row"><span class="field-label">Phone:</span><span class="field-value">${esc(r.patientPhone)}</span></div>` : ""}
        ${r.patientEmail ? `<div class="field-row"><span class="field-label">Email:</span><span class="field-value">${esc(r.patientEmail)}</span></div>` : ""}
      </div>
    </div>
    <div class="section-box">
      <div class="section-head">Referring Doctor</div>
      <div class="section-body">
        ${r.referringDoctorName ? `
          <div class="field-row"><span class="field-label">Name:</span><span class="field-value"><strong>${esc(r.referringDoctorName)}</strong></span></div>
          ${r.referringDoctorProviderNumber ? `<div class="field-row"><span class="field-label">Provider No.:</span><span class="field-value">${esc(r.referringDoctorProviderNumber)}</span></div>` : ""}
        ` : `<div style="color:#9ca3af;font-style:italic;padding-top:4px;">Not specified</div>`}
      </div>
    </div>
  </div>

  ${(r.scanTypes ?? []).length > 0 ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Requested Scan Type(s)</div>
      <div class="scan-grid">
        ${(r.scanTypes ?? []).map(t => `<span class="scan-tag">${esc(t)}</span>`).join("")}
      </div>
    </div>
  </div>` : ""}

  ${r.clinicalIndication ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Clinical Indication</div>
      <div class="clinical-text">${esc(r.clinicalIndication).replace(/\n/g, "<br>")}</div>
    </div>
  </div>` : ""}

  ${r.clinicalHistory ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Relevant Clinical History</div>
      <div class="clinical-text">${esc(r.clinicalHistory).replace(/\n/g, "<br>")}</div>
    </div>
  </div>` : ""}

  ${r.notes ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Additional Notes</div>
      <div class="clinical-text">${esc(r.notes).replace(/\n/g, "<br>")}</div>
    </div>
  </div>` : ""}

  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-caption">Referring Doctor Signature &amp; Date</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-caption">${esc(clinicName)} — Received by &amp; Date</div>
    </div>
  </div>

  <div class="footer">
    <span>${esc(clinicName)} · Scan Request REQ-${String(r.id).padStart(5, "0")}</span>
    <span>Auto-saved ${fmtNow()} · Reporting Room</span>
  </div>
</body>
</html>`;
}
