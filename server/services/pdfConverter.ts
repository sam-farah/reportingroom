import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Resolve the full path to pdftoppm at startup.
// Node's exec uses a stripped-down PATH that doesn't include nix store entries,
// but bash -c does — so we use bash to locate the binary once and cache it.
let PDFTOPPM: string = 'pdftoppm';
try {
  PDFTOPPM = execSync('bash -c "which pdftoppm"', { encoding: 'utf8' }).trim();
  console.log(`[pdfConverter] pdftoppm found at: ${PDFTOPPM}`);
} catch {
  console.warn('[pdfConverter] pdftoppm not found via bash; will try bare name and likely fail');
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
