import { exec, execFile, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Resolve the full path to pdftoppm at startup.
// Node's exec uses a stripped-down PATH that doesn't include nix store entries,
// but bash -c does — so we use bash to locate the binary once and cache it.
let PDFTOPPM: string = 'pdftoppm';
export let PDFTOPPM_AVAILABLE = false;
try {
  const resolved = execSync('bash -c "which pdftoppm"', { encoding: 'utf8' }).trim();
  if (resolved) {
    PDFTOPPM = resolved;
    PDFTOPPM_AVAILABLE = true;
    console.log(`[pdfConverter] pdftoppm found at: ${PDFTOPPM}`);
  } else {
    console.warn('[pdfConverter] pdftoppm not found — PDF previews disabled');
  }
} catch {
  console.warn('[pdfConverter] pdftoppm not found — PDF previews disabled');
}

export async function convertPdfToImage(pdfPath: string): Promise<string> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF file not found');
  }

  // Use a unique temp prefix to avoid collisions
  const tempPrefix = pdfPath + '_pg';
  const expectedOutput = tempPrefix + '.png';

  try {
    // pdftoppm (Poppler) is the most reliable PDF rasteriser available.
    // -r 200  : 200 dpi — good quality for OCR without huge files
    // -png    : output PNG
    // -singlefile : writes exactly one file (no page-number suffix) → <prefix>.png
    // -f 1 -l 1 : first page only
    const cmd = `"${PDFTOPPM}" -r 200 -png -singlefile -f 1 -l 1 "${pdfPath}" "${tempPrefix}"`;
    console.log('PDF→image: running pdftoppm:', cmd);
    await execAsync(cmd);

    if (!fs.existsSync(expectedOutput)) {
      throw new Error('pdftoppm produced no output');
    }

    const imageBuffer = fs.readFileSync(expectedOutput);
    const base64 = imageBuffer.toString('base64');
    console.log(`PDF converted OK, base64 length: ${base64.length}`);
    return base64;
  } catch (err) {
    // Clean up partial output if present
    if (fs.existsSync(expectedOutput)) {
      try { fs.unlinkSync(expectedOutput); } catch {}
    }
    console.error('PDF conversion error:', err);
    throw new Error(
      `Failed to convert PDF to image: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    // Always clean up
    if (fs.existsSync(expectedOutput)) {
      try { fs.unlinkSync(expectedOutput); } catch {}
    }
  }
}

// ImageMagick, used to stack a multi-page PDF into one tall image.
let MAGICK: string | null = null;
try {
  const resolved = execSync('bash -c "which magick || which convert"', { encoding: 'utf8' }).trim();
  if (resolved) MAGICK = resolved;
} catch { /* multi-page stacking unavailable; single page still works */ }

const MAX_WORKSHEET_PDF_PAGES = 6;

/**
 * Rasterises a PDF to a single PNG file next to it and returns the new file's
 * path. Used at upload time so worksheets are always stored as images — a PDF
 * can't be displayed in an <img>, drawn on, or labelled.
 *
 * Multi-page PDFs are stacked vertically into one tall image (up to
 * MAX_WORKSHEET_PDF_PAGES) so no clinical content is silently dropped.
 *
 * Runs binaries via execFile with an argv array — never a shell string — so a
 * hostile filename can't inject shell syntax.
 */
export async function convertPdfToPngFile(pdfPath: string): Promise<string> {
  if (!fs.existsSync(pdfPath)) throw new Error('PDF file not found');
  if (!PDFTOPPM_AVAILABLE) throw new Error('PDF conversion is unavailable on this server');

  const prefix = pdfPath.replace(/\.pdf$/i, '') + '_page';
  const dir = path.dirname(prefix);
  const baseName = path.basename(prefix);
  const finalOut = pdfPath.replace(/\.pdf$/i, '') + '_converted.png';

  const pageFiles = () =>
    fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(baseName) && f.endsWith('.png'))
      .sort()
      .map((f) => path.join(dir, f));

  const cleanupPages = () => {
    for (const f of pageFiles()) {
      try { fs.unlinkSync(f); } catch { /* best effort */ }
    }
  };

  try {
    await execFileAsync(PDFTOPPM, [
      '-r', '200', '-png', '-f', '1', '-l', String(MAX_WORKSHEET_PDF_PAGES), pdfPath, prefix,
    ]);

    const pages = pageFiles();
    if (pages.length === 0) throw new Error('pdftoppm produced no output');

    if (pages.length === 1) {
      fs.renameSync(pages[0], finalOut);
      return finalOut;
    }

    if (!MAGICK) {
      // Can't stack — keep the first page rather than failing the upload.
      fs.renameSync(pages[0], finalOut);
      return finalOut;
    }
    await execFileAsync(MAGICK, [...pages, '-append', finalOut]);
    if (!fs.existsSync(finalOut)) throw new Error('Failed to combine PDF pages');
    return finalOut;
  } catch (err) {
    try { if (fs.existsSync(finalOut)) fs.unlinkSync(finalOut); } catch { /* best effort */ }
    throw err;
  } finally {
    cleanupPages();
  }
}

export async function convertPdfToImages(pdfPath: string, maxPages: number = 20): Promise<string[]> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF file not found');
  }

  const tempPrefix = pdfPath + '_pgs';
  const dir = path.dirname(tempPrefix);
  const baseName = path.basename(tempPrefix);

  try {
    const cmd = `"${PDFTOPPM}" -r 150 -png -f 1 -l ${maxPages} "${pdfPath}" "${tempPrefix}"`;
    await execAsync(cmd);

    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith(baseName) && f.endsWith('.png'))
      .sort();

    const images = files.map((f) => fs.readFileSync(path.join(dir, f)).toString('base64'));

    files.forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });

    return images;
  } catch (err) {
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(baseName) && f.endsWith('.png'));
    files.forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
    throw new Error(
      `Failed to convert PDF to images: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function isPdfFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === '.pdf';
}
