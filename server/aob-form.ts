import sharp from "sharp";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveClinicTimeZone } from "@shared/timezones";
import { saveFileToDB, getFileFromDB } from "./services/fileStorage";
import { storage } from "./storage";

// The two template images are real, blank Medicare Bulk Bill Webclaim
// "Assessment of Benefit" form copies supplied by the clinic. We overlay the
// confirmed billing/referral/patient data (and the patient's signature)
// directly onto these exact form images rather than drawing a document from
// scratch, so the output looks identical to the real paper form.
//
// Both templates are screenshots at slightly different pixel dimensions (the
// patient copy has extra footer/privacy text appended below the form itself).
// We normalise the patient copy to the same WIDTH as the practitioner copy so
// a single field coordinate map (in pixels, relative to REF_WIDTH) lines up
// on both.
const TEMPLATES_DIR = path.join(process.cwd(), "server", "assets", "aob-templates");
const PRACTITIONER_TEMPLATE = path.join(TEMPLATES_DIR, "practitioner-copy.png");
const PATIENT_TEMPLATE = path.join(TEMPLATES_DIR, "patient-copy.png");
const REF_WIDTH = 1754;

const escapeXml = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function digitsAndLetters(s: any): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Draws an "X" mark inside a checkbox at (x, y) top-left, given size.
function xMark(x: number, y: number, size: number): string {
  return `<line x1="${x + 2}" y1="${y + 2}" x2="${x + size - 2}" y2="${y + size - 2}" stroke="#1a1a6e" stroke-width="2"/>
    <line x1="${x + size - 2}" y1="${y + 2}" x2="${x + 2}" y2="${y + size - 2}" stroke="#1a1a6e" stroke-width="2"/>`;
}

// Wraps text into up to `maxLines` lines of at most `maxCharsPerLine` chars.
// If any words don't fit, the last kept line always gets an ellipsis so
// truncation is visibly indicated rather than silently dropping words
// (important here since dropped words could be clinically/billing significant,
// e.g. "bilateral").
function wrapToLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const allLines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxCharsPerLine && line) {
      allLines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) allLines.push(line);

  if (allLines.length <= maxLines) return allLines;

  const out = allLines.slice(0, maxLines);
  let last = out[maxLines - 1];
  if (last.length > maxCharsPerLine - 1) last = last.slice(0, maxCharsPerLine - 1);
  out[maxLines - 1] = last + "…";
  return out;
}

// Field coordinate map, in pixels, relative to REF_WIDTH (1754px). Measured
// against the supplied blank template images. Fixed compliance defaults
// (in-hospital referral = No, number of patients attended = 1, is assignor
// the patient = Yes, agreement type = Post-assignment) are marked directly;
// Equipment Number and SCP are intentionally left blank — the app doesn't
// track them, same as the prior custom-built document.
const F = {
  fullName: { x: 228, y: 130, fontSize: 18 },
  dob: { x: 260, y: 245, fontSize: 15 },
  medicareText: { x: 232, y: 312, fontSize: 16, letterSpacing: "3" },
  referralDateText: { x: 460, y: 355, fontSize: 14, letterSpacing: "5" },
  inHospitalNo: { x: 545, y: 390, size: 20 },
  providerNumberText: { x: 360, y: 455, fontSize: 14, letterSpacing: "4" },
  doctorAddress: { x: 70, y: 562, lineH: 22, fontSize: 15, maxChars: 44, maxLines: 3 },
  lspnText: { x: 307, y: 662, fontSize: 15, letterSpacing: "3" },
  numPatients: { x: 720, y: 780, fontSize: 16 },
  assignorYes: { x: 250, y: 955, size: 18 },
  agreementPostAssignment: { x: 492, y: 866, size: 18 },
  servicesTable: {
    rowYs: [255, 375, 495, 615, 735, 855, 975],
    descX: 815,
    descMaxCharsPerLine: 20,
    descMaxLines: 2,
    descLineH: 20,
    itemX: 1015,
    benefitX: 1430,
    fontSize: 16,
  },
  renderingPractitioner: { x: 805, y: 1075, lineH: 22, fontSize: 16, maxChars: 55, maxLines: 2 },
  signature: { x: 75, maxW: 300, maxH: 85, lineBottomY: 1122 },
  signDate: { x: 598, y: 1093, fontSize: 12 },
};

async function loadTemplate(templatePath: string): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(templatePath).metadata();
  const width = meta.width || REF_WIDTH;
  if (width === REF_WIDTH) {
    return { buffer: fs.readFileSync(templatePath), width, height: meta.height || 0 };
  }
  const scale = REF_WIDTH / width;
  const targetHeight = Math.round((meta.height || 0) * scale);
  const buffer = await sharp(templatePath).resize(REF_WIDTH, targetHeight).png().toBuffer();
  return { buffer, width: REF_WIDTH, height: targetHeight };
}

export async function generateAssessmentOfBenefitDocument(opts: {
  aobForm: any;
  clinic: any;
  signatureDataUrl: string;
}): Promise<{ fileUrl: string; filename: string; patientFileUrl: string; patientFilename: string }> {
  const { aobForm, clinic, signatureDataUrl } = opts;

  const CLINIC_TZ = resolveClinicTimeZone(clinic);
  const now = new Date();

  const dobDisplay = aobForm.patientDateOfBirth || "";
  const medicareDigits = digitsAndLetters(aobForm.medicareNumber) + digitsAndLetters(aobForm.medicareIrn);
  const referralDateDigits = (() => {
    const raw = String(aobForm.referralDate || "").replace(/[^0-9]/g, "");
    if (raw.length === 8) return raw.slice(0, 4) + raw.slice(6, 8); // DDMMYYYY -> DDMMYY
    return raw.slice(0, 6);
  })();
  const providerNumber = digitsAndLetters(aobForm.referringDoctorProviderNumber);
  const lspn = digitsAndLetters(clinic?.locationSpecificPracticeNumber);

  const items: { item: string; description: string; feeCents: number }[] = Array.isArray(aobForm.items) ? aobForm.items : [];

  const renderingPractitionerText = [
    aobForm.referringDoctorName || "",
    aobForm.referringDoctorProviderNumber ? `(Provider No: ${aobForm.referringDoctorProviderNumber})` : "",
    aobForm.referringDoctorAddress || "",
  ].filter(Boolean).join("  ");

  // Signature is shared between both copies — decode/resize it once.
  const sigB64 = signatureDataUrl.split(",")[1];
  const sigBuffer = Buffer.from(sigB64, "base64");
  const sigMeta = await sharp(sigBuffer).metadata();
  const sigScale = Math.min(F.signature.maxW / (sigMeta.width || 1), F.signature.maxH / (sigMeta.height || 1), 1);
  const sigW = Math.round((sigMeta.width || 0) * sigScale);
  const sigH = Math.round((sigMeta.height || 0) * sigScale);
  const sigResized = await sharp(sigBuffer)
    .resize(sigW, sigH, { fit: "inside" })
    .png()
    .toBuffer();

  const signedDateStr = now.toLocaleDateString("en-AU", { timeZone: CLINIC_TZ, day: "2-digit", month: "2-digit", year: "numeric" });

  const buildOverlaySvg = (width: number, height: number): string => {
    const parts: string[] = [];

    const spacedText = (
      f: { x: number; y: number; fontSize: number; letterSpacing: string },
      value: string,
    ) =>
      `<text x="${f.x}" y="${f.y}" font-family="Arial, sans-serif" font-size="${f.fontSize}" letter-spacing="${f.letterSpacing}" fill="#1a1a6e">${escapeXml(value)}</text>`;

    parts.push(`<text x="${F.fullName.x}" y="${F.fullName.y}" font-family="Arial, sans-serif" font-size="${F.fullName.fontSize}" fill="#1a1a6e">${escapeXml(aobForm.patientName)}</text>`);
    parts.push(`<text x="${F.dob.x}" y="${F.dob.y}" font-family="Arial, sans-serif" font-size="${F.dob.fontSize}" fill="#1a1a6e">${escapeXml(dobDisplay)}</text>`);
    parts.push(spacedText(F.medicareText, medicareDigits));

    if (referralDateDigits) {
      parts.push(spacedText(F.referralDateText, referralDateDigits));
    }
    parts.push(xMark(F.inHospitalNo.x, F.inHospitalNo.y, F.inHospitalNo.size));

    if (providerNumber) {
      parts.push(spacedText(F.providerNumberText, providerNumber));
    }

    const addressLines = wrapToLines(
      [aobForm.referringDoctorName, aobForm.referringDoctorAddress].filter(Boolean).join(" — "),
      F.doctorAddress.maxChars,
      F.doctorAddress.maxLines,
    );
    addressLines.forEach((line, i) => {
      parts.push(`<text x="${F.doctorAddress.x}" y="${F.doctorAddress.y + i * F.doctorAddress.lineH}" font-family="Arial, sans-serif" font-size="${F.doctorAddress.fontSize}" fill="#1a1a6e">${escapeXml(line)}</text>`);
    });

    if (lspn) {
      parts.push(spacedText(F.lspnText, lspn));
    }

    parts.push(`<text x="${F.numPatients.x}" y="${F.numPatients.y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${F.numPatients.fontSize}" fill="#1a1a6e">1</text>`);

    parts.push(xMark(F.assignorYes.x, F.assignorYes.y, F.assignorYes.size));
    parts.push(xMark(F.agreementPostAssignment.x, F.agreementPostAssignment.y, F.agreementPostAssignment.size));

    const { rowYs, descX, descMaxCharsPerLine, descMaxLines, descLineH, itemX, benefitX, fontSize } = F.servicesTable;
    items.slice(0, rowYs.length).forEach((it, i) => {
      const y = rowYs[i];
      const descLines = wrapToLines(it.description || "", descMaxCharsPerLine, descMaxLines);
      descLines.forEach((line, li) => {
        parts.push(`<text x="${descX}" y="${y + li * descLineH}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#1a1a6e">${escapeXml(line)}</text>`);
      });
      parts.push(`<text x="${itemX}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#1a1a6e">${escapeXml(it.item)}</text>`);
      parts.push(`<text x="${benefitX}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#1a1a6e">$${(it.feeCents / 100).toFixed(2)}</text>`);
    });

    const rpLines = wrapToLines(renderingPractitionerText, F.renderingPractitioner.maxChars, F.renderingPractitioner.maxLines);
    rpLines.forEach((line, i) => {
      parts.push(`<text x="${F.renderingPractitioner.x}" y="${F.renderingPractitioner.y + i * F.renderingPractitioner.lineH}" font-family="Arial, sans-serif" font-size="${F.renderingPractitioner.fontSize}" fill="#1a1a6e">${escapeXml(line)}</text>`);
    });

    parts.push(`<text x="${F.signDate.x}" y="${F.signDate.y}" font-family="Arial, sans-serif" font-size="${F.signDate.fontSize}" fill="#1a1a6e">${escapeXml(signedDateStr)}</text>`);

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;
  };

  const renderCopy = async (templatePath: string): Promise<Buffer> => {
    const { buffer, width, height } = await loadTemplate(templatePath);
    const overlaySvg = buildOverlaySvg(width, height);
    const sigTop = F.signature.lineBottomY - sigH;
    return sharp(buffer)
      .composite([
        { input: Buffer.from(overlaySvg), top: 0, left: 0 },
        { input: sigResized, top: sigTop, left: F.signature.x },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();
  };

  const practitionerImg = await renderCopy(PRACTITIONER_TEMPLATE);
  const patientImg = await renderCopy(PATIENT_TEMPLATE);

  const uploadsDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const practitionerFilename = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(path.join(uploadsDir, practitionerFilename), practitionerImg);
  saveFileToDB(practitionerFilename, path.join(uploadsDir, practitionerFilename), "image/jpeg", `assessment-of-benefit-practitioner-${aobForm.id}.jpg`).catch(console.error);

  const patientFilename = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(path.join(uploadsDir, patientFilename), patientImg);
  saveFileToDB(patientFilename, path.join(uploadsDir, patientFilename), "image/jpeg", `assessment-of-benefit-patient-${aobForm.id}.jpg`).catch(console.error);

  if (aobForm.patientId) {
    const isoDate = now.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
    const namePart = String(aobForm.patientName || "patient").replace(/\s+/g, "-");
    await storage.createPatientDocument({
      patientId: aobForm.patientId,
      title: "Assessment of Benefit (Clinic Copy)",
      documentDate: isoDate,
      fileUrl: `/uploads/${practitionerFilename}`,
      filename: practitionerFilename,
      originalName: `assessment-of-benefit-clinic-${namePart}-${isoDate}.jpg`,
      notes: null,
    } as any);
    await storage.createPatientDocument({
      patientId: aobForm.patientId,
      title: "Assessment of Benefit (Patient Copy)",
      documentDate: isoDate,
      fileUrl: `/uploads/${patientFilename}`,
      filename: patientFilename,
      originalName: `assessment-of-benefit-patient-${namePart}-${isoDate}.jpg`,
      notes: null,
    } as any);
  }

  return {
    fileUrl: `/uploads/${practitionerFilename}`,
    filename: practitionerFilename,
    patientFileUrl: `/uploads/${patientFilename}`,
    patientFilename,
  };
}
