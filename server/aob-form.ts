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
  // "Patient's full name" spans TWO separate dotted lines on the real form —
  // the first for surname, the second for first name — not one combined
  // "Surname, First" string on a single line. Y differs per copy (the two
  // template photos have slightly different vertical layouts); X is shared.
  fullNameSurname: { x: 270, fontSize: 22, y: { practitioner: 114, patient: 79 } },
  fullNameFirstName: { x: 270, fontSize: 22, y: { practitioner: 166, patient: 133 } },
  // Date of birth is a plain dotted line (not individual digit boxes like the
  // Medicare/date-of-service fields), so it's rendered as free text, but must
  // be formatted "DD MM YYYY" rather than the raw ISO string from the DB.
  dob: { x: 270, fontSize: 20, y: { practitioner: 219, patient: 186 } },
  // "Expiry date checked" — per updated clinic instruction this ALWAYS gets an
  // X (not a checkmark — this reverses an earlier decision). Shared X (both
  // copies line up here); Y differs per copy like the other header fields
  // (patient copy's row sits ~25px higher).
  expiryDateChecked: { x: 745, size: 26, y: { practitioner: 220, patient: 195 } },
  // "Patient ref number" — small dashed box directly left of "Date of service"
  // on the header row; we print the patient's Medicare number here too. Same
  // baseline Y as dateOfServiceBoxes (same printed row on both copies) since
  // they're calibrated together. Box is narrow (~45px) so text is small and
  // center-anchored, allowed to overflow slightly rather than truncate.
  patientRefNumber: { x: 1187, fontSize: 13, y: { practitioner: 174, patient: 142 } },
  // Boxed digit fields — one glyph is centred inside each printed box (rather
  // than a single string with letter-spacing, which drifts out of the boxes).
  // The X geometry (first-box centre + pitch) is shared by both copies; only
  // the Y baseline differs, because the two template photos have slightly
  // different vertical layouts (same reason the services table needs per-copy
  // row centres).
  medicareBoxes: { startX: 283, pitch: 53, fontSize: 25, y: { practitioner: 280, patient: 241 } },
  referralDateBoxes: { startX: 473, pitch: 57, fontSize: 20, y: { practitioner: 354, patient: 333 } },
  // "Date of service, imaging procedure or first specimen collection" — top-right
  // of the form near "Patient ref number". Six boxes in DD/MM/YY groups; the box
  // pitch is NOT perfectly uniform (there's a larger gap where the printed slash
  // sits, between box2/3 and box4/5), so this uses explicit per-box X centres
  // rather than a single startX+pitch like the other boxed fields. Calibrated by
  // measuring the actual box edges (hand-marked in red by the user) directly in
  // pixel space and mapping back to this file's 1754px coordinate space.
  dateOfServiceBoxes: { xPositions: [1379, 1431, 1498, 1550, 1612, 1664], fontSize: 26, y: { practitioner: 174, patient: 142 } },
  inHospitalNo: { x: 545, size: 20, y: { practitioner: 393, patient: 361 } },
  providerBoxes: { startX: 405, pitch: 51, fontSize: 20, y: { practitioner: 482, patient: 465 } },
  doctorAddress: { x: 95, y: 562, lineH: 24, fontSize: 19, maxChars: 40, maxLines: 3 },
  lspnBoxes: { startX: 281, pitch: 53, fontSize: 21, y: { practitioner: 664, patient: 649 } },
  numPatients: { x: 720, y: 782, fontSize: 21 },
  assignorYes: { x: { practitioner: 262, patient: 242 }, y: { practitioner: 923, patient: 939 }, size: 24 },
  // NOTE: "Post-assignment" under Agreement Type used to always get an X here
  // (F.agreementPostAssignment) — removed per updated clinic instruction; the
  // field is intentionally left unmarked now.
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
    baselineOffset: 5,
    descX: 815,
    descMaxCharsPerLine: 17,
    descMaxLines: 2,
    descLineH: 21,
    fontSize: 20,
    // "Item number" is itself a boxed field on the real form: 5 boxes, one digit
    // each (MBS item numbers are always 5 digits). Same per-glyph centred
    // rendering as the other boxed fields — a left-aligned free-text string
    // (the old approach) overflowed out of box 1 since it ignored the boxes
    // entirely. Calibrated the same way as the date-of-service field: from a
    // user screenshot with the real box edges hand-marked in red, mapped back
    // to this file's 1754px space via linear regression against two already-
    // known template X positions (descX and the old itemX) visible in the
    // same screenshot.
    itemBoxes: { startX: 1047, pitch: 53.25, boxes: 5, fontSize: 22 },
    // "Benefit assigned" is itself a boxed field on the real form: 3 boxes for
    // dollars, a printed decimal dot between box 3 and box 4, then 2 boxes for
    // cents — 5 boxes total (measured directly from the template pixels, not
    // eyeballed). No "$" or "." should be drawn; the template already prints
    // the dot. The two copies are different photos with slightly different
    // pitch, so X is per-copy like the other boxed fields.
    benefitBoxes: {
      startX: { practitioner: 1433, patient: 1439 },
      pitch: { practitioner: 53, patient: 55 },
      dollarBoxes: 3,
      centsBoxes: 2,
    },
  },
  renderingPractitioner: { x: 805, y: 1075, lineH: 24, fontSize: 20, maxChars: 48, maxLines: 2 },
  // Signature is deliberately drawn LARGER than the dotted line's own height
  // and positioned to sit inside the "Assignor's signature" box (per clinic
  // instruction — overlapping some printed words there is fine). lineBottomY
  // is the bottom edge of the signature image; x/lineBottomY recalibrated
  // against a hand-marked user screenshot showing the exact target box.
  // Size (maxW/maxH) intentionally left unchanged — only position moved.
  signature: { x: 210, maxW: 450, maxH: 95, lineBottomY: { practitioner: 1128, patient: 1137 } },
  // "Date (DD MM YYYY)" — the template already prints the two "/" separators;
  // we only draw the DD / MM / YYYY digit groups into the gaps between them
  // (no slashes in our own text, or they'd double up with the printed ones).
  signDate: {
    groupX: { dd: 648, mm: 698, yyyy: 761 },
    fontSize: 16,
    y: { practitioner: 1093, patient: 1080 },
  },
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

  // DOB is a plain dotted-line field (not boxed digits), but must be
  // formatted "DD MM YYYY" rather than the raw ISO string stored in the DB
  // (e.g. "1980-05-15") or an ambiguous 8-digit string.
  const formatDobDisplay = (raw: unknown): string => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]} ${iso[2]} ${iso[1]}`;
    const digitsOnly = s.replace(/[^0-9]/g, "");
    if (digitsOnly.length === 8) {
      const lead = parseInt(digitsOnly.slice(0, 4), 10);
      if (lead >= 1900 && lead <= 2100) return `${digitsOnly.slice(6, 8)} ${digitsOnly.slice(4, 6)} ${digitsOnly.slice(0, 4)}`; // YYYYMMDD
      return `${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 4)} ${digitsOnly.slice(4, 8)}`; // DDMMYYYY
    }
    return s;
  };
  const dobDisplay = formatDobDisplay(aobForm.patientDateOfBirth);
  // The "Patient's full name" field is two separate dotted lines on the real
  // form (surname, then first name) — patientName is stored as "First Last",
  // so split on the first space rather than assuming a "Surname, First"
  // convention that isn't actually used anywhere else in the app.
  const fullNameStr = String(aobForm.patientName ?? "").trim();
  const firstSpaceIdx = fullNameStr.indexOf(" ");
  const patientFirstName = firstSpaceIdx === -1 ? fullNameStr : fullNameStr.slice(0, firstSpaceIdx);
  const patientSurname = firstSpaceIdx === -1 ? "" : fullNameStr.slice(firstSpaceIdx + 1).trim();
  const medicareDigits = digitsAndLetters(aobForm.medicareNumber) + digitsAndLetters(aobForm.medicareIrn);
  // The app stores dates as ISO (yyyy-MM-dd, from a native <input type="date">)
  // or occasionally a bare 8-digit string, so parse first and reorder to DD MM YY
  // for the form's six boxes. Without this, "2026-07-04" was read as DDMMYYYY and
  // printed as 20/26/04 — a wrong date on a government billing document.
  const toDdMmYyDigits = (raw: unknown): string => {
    const s = String(raw ?? "");
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + iso[2] + iso[1].slice(2); // yyyy-MM-dd -> DDMMYY
    const digitsOnly = s.replace(/[^0-9]/g, "");
    if (digitsOnly.length === 8) {
      const lead = parseInt(digitsOnly.slice(0, 4), 10);
      // Disambiguate a bare 8-digit value: a plausible leading year => YYYYMMDD.
      if (lead >= 1900 && lead <= 2100) return digitsOnly.slice(6, 8) + digitsOnly.slice(4, 6) + digitsOnly.slice(2, 4); // YYYYMMDD -> DDMMYY
      return digitsOnly.slice(0, 4) + digitsOnly.slice(6, 8); // DDMMYYYY -> DDMMYY
    }
    return digitsOnly.slice(0, 6);
  };
  const referralDateDigits = toDdMmYyDigits(aobForm.referralDate);
  const dateOfServiceDigits = toDdMmYyDigits(aobForm.dateOfService);
  const providerNumber = digitsAndLetters(aobForm.referringDoctorProviderNumber);
  const lspn = digitsAndLetters(clinic?.locationSpecificPracticeNumber);

  // Medicare requires the services table to list items in descending order of
  // benefit assigned (highest benefit first) — this is also the order the
  // "highest fee = 100%, second-highest = 60%, rest = 50%" Multiple Services
  // Rule is applied in, so the form should visibly match that same ordering
  // rather than whatever order the items happened to be entered/edited in.
  const items: { item: string; description: string; feeCents: number }[] = (
    Array.isArray(aobForm.items) ? [...aobForm.items] : []
  ).sort((a, b) => (b.feeCents || 0) - (a.feeCents || 0));

  // "Full name and provider number or address of practitioner who rendered or
  // will render the above service(s)" is the physician who actually performed/
  // signed off the scan — NOT the referring doctor (that's the separate
  // "requesting or referring practitioner" box above). Falls back to the
  // referring doctor's details only if no physician was recorded on the report,
  // so the field is never left blank.
  const renderingPractitionerText = [
    aobForm.physicianName || aobForm.referringDoctorName || "",
    aobForm.physicianProviderNumber
      ? `(Provider No: ${aobForm.physicianProviderNumber})`
      : (!aobForm.physicianName && aobForm.referringDoctorProviderNumber
          ? `(Provider No: ${aobForm.referringDoctorProviderNumber})`
          : ""),
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

  // The template already prints the "/" separators between DD/MM/YYYY, so we
  // draw the digit groups only (no slashes of our own, which would double up).
  const signedDateStr = now.toLocaleDateString("en-AU", { timeZone: CLINIC_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const [signedDd, signedMm, signedYyyy] = signedDateStr.split("/");
  const signedDateParts = { dd: signedDd, mm: signedMm, yyyy: signedYyyy };

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

    // Same as boxedText, but for fields whose boxes are NOT evenly spaced
    // (e.g. the date-of-service field, whose last box pair is squeezed
    // narrower against the table's right divider on the real template).
    const boxedTextAtPositions = (
      f: { xPositions: number[]; fontSize: number; y: Record<"practitioner" | "patient", number> },
      value: string,
    ) =>
      String(value ?? "")
        .split("")
        .slice(0, f.xPositions.length)
        .map(
          (ch, i) =>
            `<text x="${f.xPositions[i]}" y="${f.y[copy]}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${f.fontSize}" fill="#1a1a6e">${escapeXml(ch)}</text>`,
        )
        .join("");

    parts.push(`<text x="${F.fullNameSurname.x}" y="${F.fullNameSurname.y[copy]}" font-family="Arial, sans-serif" font-size="${F.fullNameSurname.fontSize}" fill="#1a1a6e">${escapeXml(patientSurname)}</text>`);
    parts.push(`<text x="${F.fullNameFirstName.x}" y="${F.fullNameFirstName.y[copy]}" font-family="Arial, sans-serif" font-size="${F.fullNameFirstName.fontSize}" fill="#1a1a6e">${escapeXml(patientFirstName)}</text>`);
    parts.push(`<text x="${F.dob.x}" y="${F.dob.y[copy]}" font-family="Arial, sans-serif" font-size="${F.dob.fontSize}" fill="#1a1a6e">${escapeXml(dobDisplay)}</text>`);
    parts.push(boxedText(F.medicareBoxes, medicareDigits));

    if (referralDateDigits) {
      parts.push(boxedText(F.referralDateBoxes, referralDateDigits));
    }
    if (dateOfServiceDigits) {
      parts.push(boxedTextAtPositions(F.dateOfServiceBoxes, dateOfServiceDigits));
    }
    parts.push(xMark(F.inHospitalNo.x, F.inHospitalNo.y[copy], F.inHospitalNo.size));
    parts.push(xMark(F.expiryDateChecked.x, F.expiryDateChecked.y[copy], F.expiryDateChecked.size));

    // "Patient ref number" is the Medicare card's Individual Reference Number
    // (IRN) — the single digit printed next to the patient's name on the card
    // identifying them within their family group — NOT the 10-digit Medicare
    // card number itself (that already has its own boxed field above).
    const patientRefNumber = digitsAndLetters(aobForm.medicareIrn);
    if (patientRefNumber) {
      parts.push(
        `<text x="${F.patientRefNumber.x}" y="${F.patientRefNumber.y[copy]}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${F.patientRefNumber.fontSize}" fill="#1a1a6e">${escapeXml(patientRefNumber)}</text>`,
      );
    }

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

    parts.push(xMark(F.assignorYes.x[copy], F.assignorYes.y[copy], F.assignorYes.size));

    const { rowCentersByCopy, baselineOffset, descX, descMaxCharsPerLine, descMaxLines, descLineH, itemBoxes, fontSize, benefitBoxes } = F.servicesTable;
    const rowCenters = rowCentersByCopy[copy];
    const benefitStartX = benefitBoxes.startX[copy];
    const benefitPitch = benefitBoxes.pitch[copy];

    // Item number is right-aligned into its 5 boxes (MBS item numbers are
    // normally exactly 5 digits, but this is robust to shorter codes too —
    // same right-align/pad convention as the benefit-dollars boxes). If a
    // code somehow exceeds 5 digits it overflows left of box 1 rather than
    // silently dropping digits.
    const renderItemBoxes = (item: string, y: number) => {
      const digits = digitsAndLetters(item);
      const padded = digits.padStart(itemBoxes.boxes, " ");
      const offset = padded.length - itemBoxes.boxes;
      padded.split("").forEach((ch, i) => {
        if (ch === " ") return;
        const boxIndex = i - offset;
        parts.push(
          `<text x="${itemBoxes.startX + boxIndex * itemBoxes.pitch}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${itemBoxes.fontSize}" fill="#1a1a6e">${escapeXml(ch)}</text>`,
        );
      });
    };

    // "Benefit assigned" is itself a boxed field on the real form (see F.servicesTable.benefitBoxes):
    // dollarBoxes boxes for dollars, a printed decimal dot, then centsBoxes boxes for cents. We only
    // draw the digits — never a "$" or "." — the template already prints the dot.
    const renderBenefitBoxes = (feeCents: number, y: number) => {
      const safeCents = Math.max(0, Math.round(feeCents));
      const dollars = Math.floor(safeCents / 100);
      const cents = String(safeCents % 100).padStart(benefitBoxes.centsBoxes, "0");
      // Fee exceeds the printed boxes (e.g. >$999) — extremely unlikely for a single MBS
      // item, but rather than silently truncate digits we let it overflow to the left of
      // box 1 so nothing is lost, at the cost of drifting outside the box.
      const dollarsStr = String(dollars).padStart(benefitBoxes.dollarBoxes, " ");
      const dollarOffset = dollarsStr.length - benefitBoxes.dollarBoxes;
      dollarsStr.split("").forEach((ch, i) => {
        if (ch === " ") return;
        const boxIndex = i - dollarOffset;
        parts.push(
          `<text x="${benefitStartX + boxIndex * benefitPitch}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#1a1a6e">${ch}</text>`,
        );
      });
      cents.split("").forEach((ch, i) => {
        const boxIndex = benefitBoxes.dollarBoxes + i;
        parts.push(
          `<text x="${benefitStartX + boxIndex * benefitPitch}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#1a1a6e">${escapeXml(ch)}</text>`,
        );
      });
    };

    items.slice(0, rowCenters.length).forEach((it, i) => {
      const y = rowCenters[i] + baselineOffset;
      const descLines = wrapToLines(it.description || "", descMaxCharsPerLine, descMaxLines);
      descLines.forEach((line, li) => {
        parts.push(`<text x="${descX}" y="${y + li * descLineH}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#1a1a6e">${escapeXml(line)}</text>`);
      });
      renderItemBoxes(it.item || "", y);
      renderBenefitBoxes(it.feeCents, y);
    });

    const rpLines = wrapToLines(renderingPractitionerText, F.renderingPractitioner.maxChars, F.renderingPractitioner.maxLines);
    rpLines.forEach((line, i) => {
      parts.push(`<text x="${F.renderingPractitioner.x}" y="${F.renderingPractitioner.y + i * F.renderingPractitioner.lineH}" font-family="Arial, sans-serif" font-size="${F.renderingPractitioner.fontSize}" fill="#1a1a6e">${escapeXml(line)}</text>`);
    });

    const signDateY = F.signDate.y[copy];
    parts.push(`<text x="${F.signDate.groupX.dd}" y="${signDateY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${F.signDate.fontSize}" fill="#1a1a6e">${escapeXml(signedDateParts.dd)}</text>`);
    parts.push(`<text x="${F.signDate.groupX.mm}" y="${signDateY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${F.signDate.fontSize}" fill="#1a1a6e">${escapeXml(signedDateParts.mm)}</text>`);
    parts.push(`<text x="${F.signDate.groupX.yyyy}" y="${signDateY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${F.signDate.fontSize}" fill="#1a1a6e">${escapeXml(signedDateParts.yyyy)}</text>`);

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("\n")}</svg>`;
  };

  const templatePath = copy === "practitioner" ? PRACTITIONER_TEMPLATE : PATIENT_TEMPLATE;
  const { buffer, width, height } = await loadTemplate(templatePath);
  const overlaySvg = buildOverlaySvg(width, height);
  const sigTop = F.signature.lineBottomY[copy] - sigH;
  return sharp(buffer)
    .composite([
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
      // Signature PNG keeps its alpha channel (transparent background) —
      // composited directly over the template rather than flattened onto an
      // opaque white rect, so only the pen strokes appear.
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
