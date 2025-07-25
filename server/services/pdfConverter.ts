import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export async function convertPdfToImage(pdfPath: string): Promise<string> {
  try {
    console.log('Converting PDF to image using ImageMagick:', pdfPath);
    
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF file not found');
    }

    // Create output path for the converted image
    const outputPath = pdfPath + '_converted.png';
    
    // Use ImageMagick to convert first page of PDF to PNG
    // -density 300: High quality for OCR
    // -quality 100: Maximum quality
    // [0]: Only convert first page
    const command = `convert -density 300 -quality 100 "${pdfPath}[0]" "${outputPath}"`;
    
    console.log('Running ImageMagick command:', command);
    await execAsync(command);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('PDF conversion failed - no output image generated');
    }

    console.log('PDF converted successfully to:', outputPath);
    
    // Read the converted image and return as base64
    const imageBuffer = fs.readFileSync(outputPath);
    const base64Image = imageBuffer.toString('base64');
    
    // Clean up the temporary image file
    try {
      fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temporary image file:', cleanupError);
    }
    
    return base64Image;
  } catch (error) {
    console.error('PDF conversion error:', error);
    
    if (error instanceof Error && error.message.includes('convert: not authorized')) {
      throw new Error('PDF conversion is restricted by security policy. Please convert your PDF to an image format manually.');
    }
    
    if (error instanceof Error && error.message.includes('command not found')) {
      throw new Error('PDF conversion tools not available. Please convert your PDF to an image format manually.');
    }
    
    throw new Error(`Failed to convert PDF to image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isPdfFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === '.pdf';
}