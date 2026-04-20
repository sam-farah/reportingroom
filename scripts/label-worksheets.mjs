import sharp from "sharp";
import pg from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { FieldEncryption } = await import("../server/encryption.ts");

const CLINIC_LOGO_FILENAME = "b2d207fa2b08f4df6b9ec2a71aa388eb";
const PRIMARY = "#0066cc";

const TARGETS = [
  { reportId: 99,  worksheetFilename: "7fa0ac51da6d23bd12df1c966f4c34f8" },
  { reportId: 101, worksheetFilename: "4b25c21e1ae251848e4c1563c45e4846" },
  { reportId: 102, worksheetFilename: "4a8170665e2c519500ade75ec115b569" },
];

async function loadBlob(filename) {
  const r = await pool.query("SELECT data FROM file_blobs WHERE filename=$1", [filename]);
  if (!r.rows.length) throw new Error("blob not found: " + filename);
  return r.rows[0].data;
}

const fmtDate = (d) => {
  if (!d) return "";
  if (typeof d === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
};

const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function labelOne({ reportId, worksheetFilename }) {
  const repRow = (await pool.query(
    `SELECT r.id, r.study_type, r.exam_date, r.patient_id
     FROM reports r WHERE r.id=$1`,
    [reportId],
  )).rows[0];
  if (!repRow) throw new Error("report not found: " + reportId);

  const dec = FieldEncryption.decryptFields({ studyType: repRow.study_type });
  const studyType = dec.studyType || "Vascular Study";

  const pat = (await pool.query(
    `SELECT first_name, last_name, ur_number, date_of_birth, medicare_number, phone
     FROM patients WHERE id=$1`,
    [repRow.patient_id],
  )).rows[0];
  if (!pat) throw new Error("patient not found for report " + reportId);

  const patientName = `${pat.first_name ?? ""} ${pat.last_name ?? ""}`.trim();
  const lines = [
    `Patient: ${patientName}`,
    pat.date_of_birth ? `DOB: ${fmtDate(pat.date_of_birth)}` : null,
    `Exam Date: ${fmtDate(repRow.exam_date)}`,
    pat.ur_number ? `UR: ${pat.ur_number}` : null,
    pat.medicare_number ? `Medicare: ${pat.medicare_number}` : null,
    pat.phone ? `Phone: ${String(pat.phone).trim()}` : null,
    `Scan: ${studyType}`,
  ].filter(Boolean);

  const wsBuf = await loadBlob(worksheetFilename);
  const logoBuf = await loadBlob(CLINIC_LOGO_FILENAME);
  const wsMeta = await sharp(wsBuf).metadata();
  const W = wsMeta.width;
  const HHEIGHT = Math.round(W * 0.12);
  const HPAD = Math.round(W * 0.025);

  const logoMaxH = HHEIGHT - HPAD * 2;
  const logoMaxW = Math.round(W * 0.2);
  const logoMeta = await sharp(logoBuf).metadata();
  const scale = Math.min(logoMaxW / logoMeta.width, logoMaxH / logoMeta.height, 1);
  const logoW = Math.round(logoMeta.width * scale);
  const logoH = Math.round(logoMeta.height * scale);
  const logoY = Math.round((HHEIGHT - logoH) / 2);
  const logoResized = await sharp(logoBuf).resize(logoW, logoH).png().toBuffer();

  const textStartX = HPAD + logoW + Math.round(W * 0.015);
  const infoFontSize = Math.round(W * 0.0135);
  const half = Math.ceil(lines.length / 2);
  const leftLines = lines.slice(0, half);
  const rightLines = lines.slice(half);
  const lineH = infoFontSize + Math.round(infoFontSize * 0.45);
  const textY = Math.round((HHEIGHT - half * lineH) / 2 + infoFontSize);
  const colW = Math.round((W - textStartX - HPAD) / 2);

  const renderCol = (ls, x) =>
    ls
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
    .composite([{ input: logoResized, left: HPAD, top: logoY }])
    .png()
    .toBuffer();

  const finalImg = await sharp({
    create: { width: W, height: wsMeta.height + HHEIGHT, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: headerStrip, left: 0, top: 0 },
      { input: wsBuf, left: 0, top: HHEIGHT },
    ])
    .jpeg({ quality: 93 })
    .toBuffer();

  const newFilename = crypto.randomBytes(16).toString("hex");
  const uploadsDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, newFilename), finalImg);

  await pool.query(
    `INSERT INTO file_blobs (filename, mime_type, data) VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET data = EXCLUDED.data, mime_type = EXCLUDED.mime_type`,
    [newFilename, "image/jpeg", finalImg],
  );

  const ins = await pool.query(
    `INSERT INTO worksheets (uploaded_at, ocr_processed, patient_id, is_archived, filename, original_name, file_url, patient_name, exam_date)
     VALUES (NOW(), true, $1, false, $2, $3, $4, $5, $6) RETURNING id`,
    [
      repRow.patient_id,
      newFilename,
      `labelled-report-${reportId}.jpg`,
      `/uploads/${newFilename}`,
      patientName,
      fmtDate(repRow.exam_date),
    ],
  );
  const newWsId = ins.rows[0].id;
  await pool.query("UPDATE reports SET labelled_worksheet_id=$1 WHERE id=$2", [newWsId, reportId]);
  console.log(`Report ${reportId} (${patientName}) → labelled_worksheet_id = ${newWsId}`);
}

for (const t of TARGETS) {
  try { await labelOne(t); }
  catch (e) { console.error("Failed for report", t.reportId, e.message); }
}

await pool.end();
