import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import type { Report, ReportTemplate, Physician, Sonographer } from "@shared/schema";
import { toTransmissionDataUrl, type WorksheetOrientation } from "@/lib/image-orientation";

// ──────────────────────────────────────────────────────────────────────────
// Pure formatting helpers (mirrors client/src/pages/reporting-room.tsx).
// Kept here so the patient-file distribute flow renders byte-for-byte the same
// report HTML/PDF as the reporting pane.
// ──────────────────────────────────────────────────────────────────────────

export function formatDobAU(dob: string | null | undefined): string {
  if (!dob) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) return dob;
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = dob.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  const slashDMY = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDMY) return `${slashDMY[1].padStart(2, "0")}/${slashDMY[2].padStart(2, "0")}/${slashDMY[3]}`;
  return dob;
}

export function cleanStudyType(studyType: string): string {
  return studyType
    .replace(/\bduplex\b/gi, "ultrasound")
    .replace(/\b(arm|arms|leg|legs)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatPhysicianName(name: string): string {
  if (name.includes(",")) {
    const [last, first] = name.split(",").map((s) => s.trim());
    return `${first} ${last}`;
  }
  return name;
}

export function formatFindings(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (/^(Right|Left|Bilateral|Right side|Left side)\s*:/i.test(line.trim())) {
        return `\n<strong style="display:block;margin-top:10px;margin-bottom:2px;font-size:14px;color:#1a1a1a;">${line.trim()}</strong>`;
      }
      return line;
    })
    .join("\n");
}

/** Scan a rendered canvas from the bottom upward to find the last row with
 *  non-white pixels. Returns the pixel Y coordinate of the content bottom. */
function findCanvasContentBottom(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.height;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const colStep = Math.max(1, Math.floor(width / 120));
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x += colStep) {
      const i = (y * width + x) * 4;
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
        return y + 2;
      }
    }
  }
  return 0;
}

// ──────────────────────────────────────────────────────────────────────────
// PDF generation
// ──────────────────────────────────────────────────────────────────────────

const A4_W_MM = 210;
const A4_H_MM = 297;

/** Render one report's HTML (and optional worksheet image) into an existing
 *  jsPDF document. When `isFirstOverall` is true the very first slice is drawn
 *  on the current page; otherwise a fresh page is added before each slice so
 *  multiple reports are separated by page breaks. Returns false (no longer
 *  the first page) so callers can chain reports. */
async function addReportToPdf(
  pdf: jsPDF,
  html: string,
  worksheetDataUrl: string | null | undefined,
  isFirstOverall: boolean,
  extraWorksheetDataUrls: string[] = [],
): Promise<boolean> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);
  let first = isFirstOverall;
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });
    await new Promise((r) => setTimeout(r, 800));
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error("iframe body unavailable");

    const allEls = body.querySelectorAll("*");
    let maxBottom = 0;
    allEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    });
    const contentHeightPx = Math.min(Math.ceil(maxBottom) + 8, body.scrollHeight);

    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      width: 794,
      height: contentHeightPx,
      windowWidth: 794,
      scrollY: 0,
    });

    const contentBottomPx = findCanvasContentBottom(canvas);
    const totalHeightMm = (contentBottomPx * A4_W_MM) / canvas.width;
    let yMm = 0;
    while (yMm < totalHeightMm) {
      let pageHeightMm = Math.min(A4_H_MM, totalHeightMm - yMm);
      // Avoid orphaning a short trailing block (e.g. the signature block) onto
      // its own near-empty page: if less than 35mm would remain after this
      // page, absorb it here. The whole page is then drawn slightly smaller at
      // a UNIFORM scale (centred, max ~11% reduction) so nothing is distorted.
      const remainingAfter = totalHeightMm - yMm - pageHeightMm;
      if (remainingAfter > 0 && remainingAfter < 35) pageHeightMm = totalHeightMm - yMm;
      const srcY = Math.round((yMm / totalHeightMm) * contentBottomPx);
      const srcH = Math.round((pageHeightMm / totalHeightMm) * contentBottomPx);
      if (!first) pdf.addPage();
      first = false;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.max(srcH, 1);
      slice.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      const fitScale = Math.min(1, A4_H_MM / pageHeightMm);
      const drawWmm = A4_W_MM * fitScale;
      const drawHmm = pageHeightMm * fitScale;
      pdf.addImage(slice.toDataURL("image/jpeg", 0.88), "JPEG", (A4_W_MM - drawWmm) / 2, 0, drawWmm, drawHmm);
      yMm += pageHeightMm;
    }

    // Append worksheet(s) — the primary worksheet first, then any extra pages
    // (e.g. Left / Right), each on its own A4 page. Wide (landscape) images
    // get a true LANDSCAPE A4 page so PDF viewers display them upright;
    // portrait images get a portrait page.
    const appendImagePage = async (dataUrl: string) => {
      const wsImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });
      const isWide = wsImg.width > wsImg.height;
      const pageW = isWide ? A4_H_MM : A4_W_MM;
      const pageH = isWide ? A4_W_MM : A4_H_MM;
      if (!first) pdf.addPage([A4_W_MM, A4_H_MM], isWide ? "landscape" : "portrait");
      first = false;
      const scale = Math.min(pageW / wsImg.width, pageH / wsImg.height);
      const drawW = wsImg.width * scale;
      const drawH = wsImg.height * scale;
      const xOff = (pageW - drawW) / 2;
      const yOff = (pageH - drawH) / 2;
      const fmt = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      pdf.addImage(dataUrl, fmt, xOff, yOff, drawW, drawH);
    };

    if (worksheetDataUrl) await appendImagePage(worksheetDataUrl);
    for (const extra of extraWorksheetDataUrls) {
      if (extra) await appendImagePage(extra);
    }
    return false;
  } finally {
    document.body.removeChild(iframe);
  }
}

/** Single-report PDF — identical output to the reporting-room implementation. */
export async function generateReportPdfBase64(
  html: string,
  worksheetDataUrl?: string | null,
  extraWorksheetDataUrls: string[] = [],
): Promise<string> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await addReportToPdf(pdf, html, worksheetDataUrl ?? null, true, extraWorksheetDataUrls);
  return pdf.output("datauristring").split(",")[1];
}

/** Combined PDF — each report's pages (and optional worksheet) are appended in
 *  order, separated by page breaks, into a single document. */
export async function generateCombinedReportPdfBase64(
  items: { html: string; worksheetDataUrl?: string | null; extraWorksheetDataUrls?: string[] }[],
): Promise<string> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let first = true;
  for (const item of items) {
    first = await addReportToPdf(pdf, item.html, item.worksheetDataUrl ?? null, first, item.extraWorksheetDataUrls ?? []);
  }
  return pdf.output("datauristring").split(",")[1];
}

// ──────────────────────────────────────────────────────────────────────────
// HTML builder
// ──────────────────────────────────────────────────────────────────────────

export interface ReportHtmlDeps {
  physicians: Physician[];
  sonographers: Sonographer[];
  templates: ReportTemplate[];
  clinicData?:
    | {
        name?: string;
        address?: string;
        phone?: string;
        fax?: string;
        email?: string;
        logoUrl?: string;
      }
    | null;
  /** API URL of the clinic logo (e.g. "/api/clinic/logo") when one is set. */
  clinicLogoApiUrl?: string | null;
}

/** Look up the most recent referring doctor recorded against a patient's
 *  appointments, for display in the report's patient-info box. Returns null
 *  when the patient has no appointment with a referring doctor on file. */
export async function fetchReferringDoctorName(patientId?: number | null): Promise<string> {
  if (!patientId) return "";
  try {
    const { resolveUrl } = await import("@/lib/api");
    const res = await fetch(resolveUrl(`/api/patients/${patientId}/appointments`), { credentials: "include" });
    if (!res.ok) return "";
    const appointments: any[] = await res.json();
    const sorted = [...appointments].sort(
      (a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime(),
    );
    const latest = sorted.find((a) => a.referringDoctorName);
    return latest?.referringDoctorName || "";
  } catch {
    return "";
  }
}

async function toBase64(url: string): Promise<string | null> {
  try {
    const { resolveUrl } = await import("@/lib/api");
    const res = await fetch(resolveUrl(url), { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Build the distribute HTML for a single report. Mirrors the reporting-room
 *  `buildDistributeHtml` output, but does NOT force a worksheet re-label — the
 *  patient file uses the existing labelled worksheet image as-is. */
export async function buildReportHtml(
  report: Report,
  deps: ReportHtmlDeps,
): Promise<{ htmlNoWs: string; htmlWithWs: string; worksheetDataUrl: string | null; extraWorksheetDataUrls: string[] }> {
  const { physicians, sonographers, templates, clinicData, clinicLogoApiUrl } = deps;

  let physicianName = "";
  let physicianTitle = "";
  let physicianSpecialty = "";
  let signatureDataUrl: string | null = null;

  if (report.physicianId) {
    const physician = physicians.find((p) => p.id === report.physicianId);
    if (physician) {
      physicianName = formatPhysicianName(physician.name || "");
      physicianTitle = physician.title || "";
      physicianSpecialty = physician.specialty || "";
      if (physician.signatureUrl) {
        signatureDataUrl = await toBase64(physician.signatureUrl);
      }
    }
  }

  let sonographerName = "";
  let sonographerAms = "";
  if (report.sonographerId) {
    const sono = sonographers.find((s) => s.id === report.sonographerId);
    if (sono) {
      sonographerName = (sono.title ? sono.title + " " : "") + sono.name;
      sonographerAms = sono.amsNumber || "";
    }
  }

  const referringDoctorName = await fetchReferringDoctorName((report as any).patientId);

  // Worksheet image — prefer the labelled copy, then the raw upload, then the
  // digital worksheet. No re-labelling here (the patient file uses what exists).
  let worksheetDataUrl: string | null = null;
  const labelledId = (report as any).labelledWorksheetId as number | undefined;
  if (labelledId) {
    worksheetDataUrl = await toBase64(`/api/worksheets/${labelledId}/image`);
  } else if (report.worksheetId) {
    worksheetDataUrl = await toBase64(`/api/worksheets/${report.worksheetId}/image`);
  } else if (report.digitalWorksheetId) {
    worksheetDataUrl = await toBase64(`/api/digital-worksheets/${report.digitalWorksheetId}/image`);
  }

  // Landscape handling. The orientation flag lives on the raw worksheet
  // (report.worksheetId); the labelled copy inherits it. Digital worksheets are
  // always portrait.
  //   - PDF: the raw (un-rotated) image is used — the PDF generator puts wide
  //     images on a true LANDSCAPE A4 page so viewers show them upright.
  //   - HTML (email body / Copy HTML): the rotation is baked into the image
  //     bytes so the portrait document flow survives email clients and fax.
  let primaryOrientation: WorksheetOrientation = "portrait";
  if (report.worksheetId && worksheetDataUrl) {
    try {
      const { resolveUrl } = await import("@/lib/api");
      const metaRes = await fetch(resolveUrl(`/api/worksheets/${report.worksheetId}/meta`), { credentials: "include" });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta?.orientation === "landscape") primaryOrientation = "landscape";
      }
    } catch { /* default portrait */ }
  }
  const worksheetHtmlDataUrl = worksheetDataUrl
    ? await toTransmissionDataUrl(worksheetDataUrl, primaryOrientation)
    : null;

  // Extra worksheet pages (e.g. Left / Right) attached to this report.
  const extraWorksheetDataUrls: string[] = [];
  const extraWorksheetHtmlDataUrls: string[] = [];
  try {
    const { resolveUrl } = await import("@/lib/api");
    const pagesRes = await fetch(resolveUrl(`/api/reports/${report.id}/worksheet-pages`), { credentials: "include" });
    if (pagesRes.ok) {
      const pages: { id: number; worksheetId: number; orientation?: WorksheetOrientation }[] = await pagesRes.json();
      for (const p of pages) {
        const url = await toBase64(`/api/reports/${report.id}/worksheet-pages/${p.id}/image`);
        if (!url) continue;
        extraWorksheetDataUrls.push(url);
        extraWorksheetHtmlDataUrls.push((await toTransmissionDataUrl(url, p.orientation)) || url);
      }
    }
  } catch {
    // best-effort: extra pages simply won't appear if the fetch fails
  }

  const template =
    templates.find((t) => t.id === (report as any).templateId) ||
    templates.find((t) => t.isDefault) ||
    templates[0];
  const pc = template?.primaryColor || "#0066cc";
  const ac = template?.accentColor || "#e8f4fd";
  const ff = template?.fontFamily || "Arial";
  const fs = template?.fontSize || "13px";
  const sigPos = template?.signaturePosition || "right";
  const hdrStyle = (template?.headerStyle as string) || "left-logo";
  const secStyle = (template?.sectionTitleStyle as string) || "underline";
  const boxStyle = (template?.patientBoxStyle as string) || "card";
  const todayAU = format(new Date(), "dd/MM/yyyy");

  const sectionTitleCSS =
    secStyle === "filled"
      ? `color:#fff;background:${pc};padding:6px 14px;margin-bottom:12px;font-size:14px;font-weight:700;letter-spacing:0.03em;`
      : secStyle === "sidebar"
        ? `color:#1a1a1a;border-left:4px solid ${pc};padding-left:10px;margin-bottom:10px;font-size:15px;font-weight:700;`
        : secStyle === "pill"
          ? `color:#fff;background:${pc};border-radius:30px;padding:3px 14px;display:inline-block;margin-bottom:10px;font-size:13px;font-weight:700;`
          : secStyle === "minimal"
            ? `color:#1a1a1a;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;font-size:11px;margin-bottom:8px;`
            : `color:${pc};border-bottom:2px solid ${pc};padding-bottom:5px;margin-bottom:10px;font-size:15px;font-weight:700;`;

  const patientBoxCSS =
    boxStyle === "banner"
      ? `background:${pc};color:#fff;padding:14px 18px;border-radius:0;margin-bottom:22px;`
      : boxStyle === "table"
        ? `border:1px solid #ccc;border-radius:4px;padding:0;margin-bottom:22px;overflow:hidden;`
        : boxStyle === "minimal"
          ? `border-bottom:2px solid ${pc};padding-bottom:14px;background:none;margin-bottom:22px;`
          : `background:${ac};border:1px solid ${ac};border-radius:6px;padding:14px 18px;margin-bottom:22px;`;

  const patientBoxH3CSS =
    boxStyle === "banner"
      ? `color:#fff;border-bottom:1px solid rgba(255,255,255,0.4);padding-bottom:6px;margin-bottom:8px;font-size:13px;`
      : `color:${pc};border-bottom:1px solid ${ac};padding-bottom:6px;margin-bottom:8px;font-size:13px;`;

  const headerCSS =
    hdrStyle === "centered"
      ? `text-align:center;border-bottom:3px solid ${pc};padding-bottom:16px;margin-bottom:22px;`
      : hdrStyle === "compact"
        ? `display:flex;align-items:center;gap:12px;border-bottom:2px solid ${pc};padding-bottom:10px;margin-bottom:18px;`
        : `display:flex;align-items:flex-start;gap:18px;border-bottom:3px solid ${pc};padding-bottom:16px;margin-bottom:22px;`;

  const logoImgCSS =
    hdrStyle === "compact" ? `max-height:44px;max-width:110px;` : `max-height:70px;max-width:180px;`;
  const h1Size = hdrStyle === "compact" ? "16px" : "20px";

  let clinicLogoDataUrl: string | null = null;
  if (clinicLogoApiUrl) {
    clinicLogoDataUrl = await toBase64(clinicLogoApiUrl);
  }

  const clinicName = clinicData?.name || "Medical Clinic";
  const clinicAddress = clinicData?.address || "";
  const clinicPhone = clinicData?.phone || "";
  const clinicFax = clinicData?.fax || "";
  const clinicEmail = clinicData?.email || "";

  const accessionId = report.worksheetId
    ? `WS-${report.worksheetId}`
    : report.digitalWorksheetId
      ? `DW-${report.digitalWorksheetId}`
      : "";
  const displayStudyType = cleanStudyType(report.studyType);
  const displayExamDate = formatDobAU(report.examDate);

  const makeHtml = (wsUrl: string | null, extraUrls: string[] = []) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medical Report – ${report.patientName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:${ff},Arial,sans-serif;font-size:${fs};color:#222;background:#fff;padding:30px 38px;max-width:780px;margin:0 auto;}
    .header{${headerCSS}}
    .header-logo{flex-shrink:0;}
    .header-logo img{object-fit:contain;display:block;${logoImgCSS}}
    .header-info{flex:1;}
    .header-info h1{font-size:${h1Size};font-weight:700;color:${pc};margin-bottom:3px;}
    .header-info .sub{font-size:13px;color:#555;}
    .header-info .clinic-info{font-size:12px;color:#777;margin-top:2px;}
    .patient-box{${patientBoxCSS}display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;}
    .patient-box h3{grid-column:span 2;${patientBoxH3CSS}font-weight:700;}
    .pi{font-size:12px;}
    .pi .label{font-weight:bold;color:#444;}
    .pi-full{grid-column:span 2;font-size:12px;}
    .pi-full .label{font-weight:bold;color:#444;}
    .ur{color:#1d4ed8;font-family:monospace;font-weight:bold;}
    .section{margin-bottom:12px;page-break-inside:avoid;}
    .section-title{${sectionTitleCSS}}
    .section-content{font-size:13px;line-height:1.55;white-space:pre-wrap;}
    .worksheet-page{page-break-before:always;break-before:page;padding-top:30px;}
    .worksheet-page-header{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;color:#555;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;page-break-after:avoid;break-after:avoid;}
    .worksheet-page-header .label{font-weight:bold;color:#444;}
    .worksheet-img{max-width:100%;max-height:255mm;object-fit:contain;border:1px solid #ddd;border-radius:4px;display:block;}
    .sig-area{margin-top:28px;padding-top:12px;border-top:1px solid #ddd;text-align:${sigPos};}
    .sig-img{max-height:68px;margin-bottom:4px;}
    .sig-name{font-weight:bold;font-size:13px;}
    .sig-creds{font-size:12px;color:#555;}
    .copies-to{font-size:12px;color:#555;margin-top:6px;}
    .finalized{margin-top:5px;font-size:11px;color:#16a34a;font-weight:600;}
    .amended-note{background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:8px 12px;margin-bottom:14px;font-size:12px;color:#92400e;}
  </style>
</head>
<body>
  ${template?.showHeader !== false ? `<div class="header">
    ${clinicLogoDataUrl ? `<div class="header-logo"><img src="${clinicLogoDataUrl}" alt="Clinic Logo" /></div>` : ""}
    <div class="header-info">
      <h1>${clinicName}</h1>
      <div class="sub">Vascular Ultrasound Report</div>
      ${clinicAddress ? `<div class="clinic-info">${clinicAddress}</div>` : ""}
      ${[clinicPhone ? `Ph: ${clinicPhone}` : "", clinicFax ? `Fax: ${clinicFax}` : ""].filter(Boolean).join("  &nbsp;|&nbsp;  ")}
      ${clinicEmail ? `<div class="clinic-info">${clinicEmail}</div>` : ""}
    </div>
  </div>` : ""}

  ${report.isAmended ? `<div class="amended-note">&#9888; This report has been amended. Original findings may have changed.</div>` : ""}

  <div class="patient-box">
    <div class="pi"><span class="label">Patient Name:</span> ${report.patientName}</div>
    <div class="pi"><span class="label">UR Number:</span> ${report.patientUrNumber ? `<span class="ur">UR ${report.patientUrNumber}</span>` : "—"}</div>
    <div class="pi"><span class="label">Date of Birth:</span> ${formatDobAU(report.patientDob)}</div>
    <div class="pi"><span class="label">Exam Date:</span> ${displayExamDate}</div>
    <div class="pi"><span class="label">Report Date:</span> ${todayAU}</div>
    <div></div>
    <div class="pi-full"><span class="label">Study:</span> ${displayStudyType}</div>
    <div class="pi">${accessionId ? `<span class="label">Accession:</span> ${accessionId}` : ""}</div>
    <div class="pi">${sonographerName ? `<span class="label">Sonographer:</span> ${sonographerName}${sonographerAms ? ` <span class="label">AMS</span> ${sonographerAms}` : ""}` : ""}</div>
    ${referringDoctorName ? `<div class="pi-full"><span class="label">Referring Doctor:</span> ${referringDoctorName}</div>` : ""}
  </div>

  ${template?.showIndication !== false ? `<div class="section"><div class="section-title">Clinical Indication</div><div class="section-content">${report.indication}</div></div>` : ""}
  ${template?.showFindings !== false ? `<div class="section"><div class="section-title">Findings</div><div class="section-content">${formatFindings(report.findings)}</div></div>` : ""}
  ${template?.showImpression !== false ? `<div class="section"><div class="section-title">Impression</div><div class="section-content">${report.impression}</div></div>` : ""}

  ${template?.showSignature !== false ? `<div class="sig-area">
    ${signatureDataUrl ? `<img class="sig-img" src="${signatureDataUrl}" alt="Physician Signature" />` : ""}
    ${physicianName ? `<div class="sig-name">${physicianName}${physicianTitle ? " " + physicianTitle : ""}</div>` : ""}
    ${physicianSpecialty ? `<div class="sig-creds">${physicianSpecialty}</div>` : ""}
    <!--COPIES_TO_PLACEHOLDER-->
    ${report.isFinalized && report.finalizedAt ? `<div class="finalized">Electronically signed ${new Date(report.finalizedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}</div>` : ""}
  </div>` : ""}


  ${wsUrl ? `<div class="worksheet-page">
    <div class="worksheet-page-header">
      <div><span class="label">${report.patientName}</span>${report.patientUrNumber ? ` &nbsp;·&nbsp; <span class="ur">UR ${report.patientUrNumber}</span>` : ""}</div>
      <div>
        ${accessionId ? `<span class="label">Accession:</span> ${accessionId}` : ""}
        ${accessionId && sonographerName ? " &nbsp;·&nbsp; " : ""}
        ${sonographerName ? `<span class="label">Sonographer:</span> ${sonographerName}${sonographerAms ? ` &nbsp; <span class="label">AMS</span> ${sonographerAms}` : ""}` : ""}
      </div>
    </div>
    <img class="worksheet-img" src="${wsUrl}" alt="Labelled Worksheet" />
  </div>` : ""}

  ${extraUrls.map((u) => `<div class="worksheet-page">
    <div class="worksheet-page-header">
      <div><span class="label">${report.patientName}</span>${report.patientUrNumber ? ` &nbsp;·&nbsp; <span class="ur">UR ${report.patientUrNumber}</span>` : ""}</div>
      <div>
        ${accessionId ? `<span class="label">Accession:</span> ${accessionId}` : ""}
        ${accessionId && sonographerName ? " &nbsp;·&nbsp; " : ""}
        ${sonographerName ? `<span class="label">Sonographer:</span> ${sonographerName}${sonographerAms ? ` &nbsp; <span class="label">AMS</span> ${sonographerAms}` : ""}` : ""}
      </div>
    </div>
    <img class="worksheet-img" src="${u}" alt="Worksheet Page" />
  </div>`).join("")}
</body>
</html>`;

  const htmlWithWs = makeHtml(worksheetHtmlDataUrl, extraWorksheetHtmlDataUrls);
  const htmlNoWs = makeHtml(null, []);
  return { htmlNoWs, htmlWithWs, worksheetDataUrl, extraWorksheetDataUrls };
}
