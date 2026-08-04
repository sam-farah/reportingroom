// Smoke test: PDF worksheet upload path (rasterise → PNG → OCR readable).
import fs from "fs";
import path from "path";
import { convertPdfToPngFile } from "../server/services/pdfConverter";
import { detectMimeType } from "../server/services/fileStorage";

(async () => {
  const src = process.argv[2] || "uploads/mqiv7be4-0001-db950331a715a62d.pdf";
  const tmp = "/tmp/wsupload.pdf";
  fs.copyFileSync(src, tmp);
  const png = await convertPdfToPngFile(tmp);
  const buf = fs.readFileSync(png);
  console.log("png:", path.basename(png), "bytes:", buf.length, "mime:", detectMimeType(buf));
  fs.unlinkSync(png); fs.unlinkSync(tmp);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
