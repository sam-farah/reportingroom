import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

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
    const cmd = `pdftoppm -r 200 -png -singlefile -f 1 -l 1 "${pdfPath}" "${tempPrefix}"`;
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

export function isPdfFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === '.pdf';
}
