import sharp from "sharp";
import pg from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const REPORT_ID = 99;
const WORKSHEET_ID = 145;
const CLINIC_ID = 1;
const PATIENT_NAME = "Pamela Bishop";
const PATIENT_DOB = "06/06/1973";
const PATIENT_UR = "100022";
const EXAM_DATE = "16/04/2026";
const { FieldEncryption } = await import("../server/encryption.ts");
const reportRow = (await pool.query("SELECT study_type FROM reports WHERE id=$1", [REPORT_ID])).rows[0];
const STUDY_TYPE = FieldEncryption.decryptFields({ studyType: reportRow.study_type }).studyType || "Vascular Study";
console.log("Decrypted study type:", STUDY_TYPE);

async function loadBlob(filename) {
  const r = await pool.query("SELECT data, mime_type FROM file_blobs WHERE filename=$1", [filename]);
  if (r.rows.length === 0) throw new Error("blob not found: " + filename);
  return { data: r.rows[0].data, mime: r.rows[0].mime_type };
}

const ws = await loadBlob("7fa0ac51da6d23bd12df1c966f4c34f8");
const logo = await loadBlob("b2d207fa2b08f4df6b9ec2a71aa388eb");

const wsMeta = await sharp(ws.data).metadata();
const W = wsMeta.width;
const HHEIGHT = Math.round(W * 0.1);
const HPAD = Math.round(W * 0.025);
const PRIMARY = "#0066cc";

const logoMaxH = HHEIGHT - HPAD * 2;
const logoMaxW = Math.round(W * 0.2);
const logoMeta = await sharp(logo.data).metadata();
const logoScale = Math.min(logoMaxW / logoMeta.width, logoMaxH / logoMeta.height, 1);
const logoW = Math.round(logoMeta.width * logoScale);
const logoH = Math.round(logoMeta.height * logoScale);
const logoY = Math.round((HHEIGHT - logoH) / 2);
const logoBuf = await sharp(logo.data).resize(logoW, logoH).png().toBuffer();

const textStartX = HPAD + logoW + Math.round(W * 0.015);
const infoFontSize = Math.round(W * 0.0135);
const infoLines = [
  `Patient: ${PATIENT_NAME}`,
  `DOB: ${PATIENT_DOB}`,
  `Exam Date: ${EXAM_DATE}`,
  `UR: ${PATIENT_UR}`,
  `Scan: Lower Limb Venous`,
];
const half = Math.ceil(infoLines.length / 2);
const leftLines = infoLines.slice(0, half);
const rightLines = infoLines.slice(half);
const lineH = infoFontSize + Math.round(infoFontSize * 0.45);
const textY = Math.round((HHEIGHT - half * lineH) / 2 + infoFontSize);
const colW = Math.round((W - textStartX - HPAD) / 2);

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const renderCol = (lines, x) =>
  lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${textY + i * lineH}" font-family="Arial, sans-serif" font-size="${infoFontSize}" fill="#333333">${escape(l)}</text>`,
    )
    .join("");

const lineThickness = Math.max(2, Math.round(W * 0.003));
const svg = `<svg width="${W}" height="${HHEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${HHEIGHT}" fill="#ffffff"/>
  ${renderCol(leftLines, textStartX)}
  ${renderCol(rightLines, textStartX + colW)}
  <line x1="0" y1="${HHEIGHT - Math.floor(lineThickness / 2)}" x2="${W}" y2="${HHEIGHT - Math.floor(lineThickness / 2)}" stroke="${PRIMARY}" stroke-width="${lineThickness}"/>
</svg>`;

const headerStrip = await sharp(Buffer.from(svg))
  .composite([{ input: logoBuf, left: HPAD, top: logoY }])
  .png()
  .toBuffer();

const finalCanvas = await sharp({
  create: { width: W, height: wsMeta.height + HHEIGHT, channels: 3, background: "#ffffff" },
})
  .composite([
    { input: headerStrip, left: 0, top: 0 },
    { input: ws.data, left: 0, top: HHEIGHT },
  ])
  .jpeg({ quality: 93 })
  .toBuffer();

const newFilename = crypto.randomBytes(16).toString("hex");
const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.writeFileSync(path.join(uploadsDir, newFilename), finalCanvas);

await pool.query(
  `INSERT INTO file_blobs (filename, mime_type, data) VALUES ($1, $2, $3)
   ON CONFLICT (filename) DO UPDATE SET data = EXCLUDED.data, mime_type = EXCLUDED.mime_type`,
  [newFilename, "image/jpeg", finalCanvas],
);

const insertWs = await pool.query(
  `INSERT INTO worksheets (uploaded_at, ocr_processed, patient_id, is_archived, filename, original_name, file_url, patient_name, exam_date)
   VALUES (NOW(), true, 22, false, $1, $2, $3, $4, $5) RETURNING id`,
  [
    newFilename,
    `labelled-report-${REPORT_ID}.jpg`,
    `/uploads/${newFilename}`,
    "Pamela Bishop",
    EXAM_DATE,
  ],
);
const newWorksheetId = insertWs.rows[0].id;
console.log("New labelled worksheet id:", newWorksheetId);

await pool.query("UPDATE reports SET labelled_worksheet_id=$1 WHERE id=$2", [newWorksheetId, REPORT_ID]);
console.log("Report", REPORT_ID, "updated with labelled_worksheet_id =", newWorksheetId);

await pool.end();
