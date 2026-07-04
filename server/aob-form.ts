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
  // Boxed digit fields — one glyph is centred inside each printed box (rather
  // than a single string with letter-spacing, which drifts out of the boxes).
  // The X geometry (first-box centre + pitch) is shared by both copies; only
  // the Y baseline differs, because the two template photos have slightly
  // different vertical layouts (same reason the services table needs per-copy
  // row centres).
  medicareBoxes: { startX: 283, pitch: 53, fontSize: 15, y: { practitioner: 284, patient: 276 } },
  referralDateBoxes: { startX: 473, pitch: 57, fontSize: 14, y: { practitioner: 352, patient: 331 } },
  inHospitalNo: { x: 545, size: 20, y: { practitioner: 393, patient: 361 } },
  providerBoxes: { startX: 405, pitch: 51, fontSize: 14, y: { practitioner: 480, patient: 463 } },
  doctorAddress: { x: 70, y: 562, lineH: 22, fontSize: 15, maxChars: 44, maxLines: 3 },
  lspnBoxes: { startX: 281, pitch: 53, fontSize: 15, y: { practitioner: 662, patient: 647 } },
  numPatients: { x: 720, y: 780, fontSize: 16 },
  assignorYes: { x: 250, y: 955, size: 18 },
  agreementPostAssignment: { x: 492, y: 866, size: 18 },
  // The services table has 12 physical rows (~62px pitch). The two template
  // scans have slightly different vertical layouts, so each copy needs its own
  // set of row CENTRES (pixel-calibrated against the real digit boxes). The
  // text baseline is drawn `baselineOffset` px below the row centre so a single
  // line sits vertically centred inside its box.
  servicesTable: {
    rowCentersByCopy: {
      practitioner: [280, 342, 404, 466, 528, 590, 652, 714, 776, 838, 900, 962],
      patient: [253, 315, 378, 440, 503, 565, 627, 689, 752, 814, 877, 942],
    } as Record<"practitioner" | "patient", number[]>,
    baselineOffset: 4,
    descX: 815,
    descMaxCharsPerLine: 20,
    descMaxLines: 2,
    descLineH: 18,
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

export interface AobRenderOpts {
  aobForm: any;
  clinic: any;
  signatureDataUrl: string;
}

// Renders a single copy ("practitioner" | "patient") of the Assessment of
// Benefit form to a JPEG buffer, with no persistence side effects. Exported so
// calibration/preview scripts can render without writing to disk or the DB.
export async function renderAobCopy(opts: AobRenderOpts, copy: "practitioner" | "patient"): Promise<Buffer> {
  const { aobForm, clinic, signatureDataUrl } = opts;

  const CLINIC_TZ = resolveClinicTimeZone(clinic);
  const now = new Date();

  const dobDisplay = aobForm.patientDateOfBirth || "";
  const medicareDigits = digitsAndLetters(aobForm.medicareNumber) + digitsAndLetters(aobForm.medicareIrn);
  const referralDateDigits = (() => {
    const s = String(aobForm.referralDate || "");
    // The app stores referral/request dates as ISO (yyyy-MM-dd, from a native
    // <input type="date">), so parse that first and reorder to DD MM YY for the
    // form's six boxes. Without this, "2026-07-04" was read as DDMMYYYY and
    // printed as 20/26/04 — a wrong date on a government billing document.
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + iso[2] + iso[1].slice(2); // yyyy-MM-dd -> DDMMYY
    const raw = s.replace(/[^0-9]/g, "");
    if (raw.length === 8) {
      const lead = parseInt(raw.slice(0, 4), 10);
      // Disambiguate a bare 8-digit value: a plausible leading year => YYYYMMDD.
      if (lead >= 1900 && lead <= 2100) return raw.slice(6, 8) + raw.slice(4, 6) + raw.slice(2, 4); // YYYYMMDD -> DDMMYY
      return raw.slice(0, 4) + raw.slice(6, 8); // DDMMYYYY -> DDMMYY
    }
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

    // Renders a boxed digit string: one glyph centred inside each printed box.
    // `startX` is the centre of the first box, `pitch` the box-to-box spacing,
    // and the baseline `y` is chosen per copy.
    const boxedText = (
      f: { startX: number; pitch: number; fontSize: number; y: Record<"practitioner" | "patient", number> },
      value: string,
    ) =>
      String(value ?? "")
        .split("")
        .map(
          (ch, i) =>
            `<text x="${f.startX + i * f.pitch}" y="${f.y[copy]}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${f.fontSize}" fill="#1a1a6e">${escapeXml(ch)}</text>`,
        )
        .join("");

    parts.push(`<text x="${F.fullName.x}" y="${F.fullName.y}" font-family="Arial, sans-serif" font-size="${F.fullName.fontSize}" fill="#1a1a6e">${escapeXml(aobForm.patientName)}</text>`);
    parts.push(`<text x="${F.dob.x}" y="${F.dob.y}" font-family="Arial, sans-serif" font-size="${F.dob.fontSize}" fill="#1a1a6e">${escapeXml(dobDisplay)}</text>`);
    parts.push(boxedText(F.medicareBoxes, medicareDigits));

    if (referralDateDigits) {
      parts.push(boxedText(F.referralDateBoxes, referralDateDigits));
    }
    parts.push(xMark(F.inHospitalNo.x, F.inHospitalNo.y[copy], F.inHospitalNo.size));

    if (providerNumber) {
      parts.push(boxedText(F.providerBoxes, providerNumber));
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
      parts.push(boxedText(F.lspnBoxes, lspn));
    }

    parts.push(`<text x="${F.numPatients.x}" y="${F.numPatients.y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${F.numPatients.fontSize}" fill="#1a1a6e">1</text>`);

    parts.push(xMark(F.assignorYes.x, F.assignorYes.y, F.assignorYes.size));
    parts.push(xMark(F.agreementPostAssignment.x, F.agreementPostAssignment.y, F.agreementPostAssignment.size));

    const { rowCentersByCopy, baselineOffset, descX, descMaxCharsPerLine, descMaxLines, descLineH, itemX, benefitX, fontSize } = F.servicesTable;
    const rowCenters = rowCentersByCopy[copy];
    items.slice(0, rowCenters.length).forEach((it, i) => {
      const y = rowCenters[i] + baselineOffset;
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

  const templatePath = copy === "practitioner" ? PRACTITIONER_TEMPLATE : PATIENT_TEMPLATE;
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
}

export async function generateAssessmentOfBenefitDocument(
  opts: AobRenderOpts,
): Promise<{ fileUrl: string; filename: string; patientFileUrl: string; patientFilename: string }> {
  const { aobForm, clinic } = opts;
  const CLINIC_TZ = resolveClinicTimeZone(clinic);
  const now = new Date();

  const practitionerImg = await renderAobCopy(opts, "practitioner");
  const patientImg = await renderAobCopy(opts, "patient");

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
