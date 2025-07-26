import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { 
  insertPhysicianSchema, 
  insertTrainingPairSchema, 
  insertWorksheetSchema, 
  insertReportSchema, 
  insertReportTemplateSchema, 
  updateReportTemplateSchema, 
  insertSonographerSchema,
  insertClinicSchema,
  insertUserInvitationSchema
} from "@shared/schema";
import { extractPatientDataFromWorksheet, generateReportFromWorksheet } from "./services/openai";
import { convertPdfToImage, isPdfFile } from "./services/pdfConverter";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload images (JPEG, PNG, GIF, WebP) or PDF files.`));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Signature upload endpoint
  app.post("/api/upload-signature", isAuthenticated, upload.single('signature'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const signatureUrl = `/uploads/${req.file.filename}`;
      res.json({ url: signatureUrl });
    } catch (error) {
      console.error("Signature upload error:", error);
      res.status(500).json({ error: "Failed to upload signature" });
    }
  });

  // Physicians API
  app.get("/api/physicians", isAuthenticated, async (req, res) => {
    try {
      const physicians = await storage.getAllPhysicians();
      res.json(physicians);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch physicians" });
    }
  });

  app.post("/api/physicians", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPhysicianSchema.parse(req.body);
      const physician = await storage.createPhysician(validatedData);
      res.json(physician);
    } catch (error) {
      res.status(400).json({ error: "Invalid physician data" });
    }
  });

  app.patch("/api/physicians/:id", isAuthenticated, async (req, res) => {
    try {
      const physicianId = parseInt(req.params.id);
      if (isNaN(physicianId)) {
        return res.status(400).json({ error: "Invalid physician ID" });
      }

      const validatedData = insertPhysicianSchema.partial().parse(req.body);
      const physician = await storage.updatePhysician(physicianId, validatedData);
      
      if (!physician) {
        return res.status(404).json({ error: "Physician not found" });
      }
      
      res.json(physician);
    } catch (error) {
      console.error("Update physician error:", error);
      res.status(400).json({ error: "Invalid physician data" });
    }
  });

  app.delete("/api/physicians/:id", isAuthenticated, async (req, res) => {
    try {
      const physicianId = parseInt(req.params.id);
      if (isNaN(physicianId)) {
        return res.status(400).json({ error: "Invalid physician ID" });
      }

      await storage.deletePhysician(physicianId);
      res.json({ message: "Physician deleted successfully" });
    } catch (error) {
      console.error("Delete physician error:", error);
      res.status(500).json({ 
        error: "Failed to delete physician",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Sonographers API
  app.get("/api/sonographers", isAuthenticated, async (req, res) => {
    try {
      const sonographers = await storage.getAllSonographers();
      res.json(sonographers);
    } catch (error) {
      console.error("Error fetching sonographers:", error);
      res.status(500).json({ error: "Failed to fetch sonographers" });
    }
  });

  app.post("/api/sonographers", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertSonographerSchema.parse(req.body);
      const sonographer = await storage.createSonographer(validatedData);
      res.status(201).json(sonographer);
    } catch (error) {
      console.error("Error creating sonographer:", error);
      if (error instanceof Error && error.message.includes('validation')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create sonographer" });
      }
    }
  });

  app.put("/api/sonographers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertSonographerSchema.partial().parse(req.body);
      const sonographer = await storage.updateSonographer(id, validatedData);
      
      if (!sonographer) {
        return res.status(404).json({ error: "Sonographer not found" });
      }
      
      res.json(sonographer);
    } catch (error) {
      console.error("Error updating sonographer:", error);
      if (error instanceof Error && error.message.includes('validation')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update sonographer" });
      }
    }
  });

  app.delete("/api/sonographers/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSonographer(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sonographer:", error);
      res.status(500).json({ error: "Failed to delete sonographer" });
    }
  });

  // Worksheets API
  app.get("/api/worksheets", isAuthenticated, async (req, res) => {
    try {
      const worksheets = await storage.getAllWorksheets();
      res.json(worksheets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch worksheets" });
    }
  });

  app.post("/api/worksheets/upload", isAuthenticated, upload.single('worksheet'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      
      const worksheet = await storage.createWorksheet({
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileUrl,
        patientName: null,
        patientDob: null,
        examDate: null,
        ocrProcessed: false
      });

      res.json(worksheet);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload worksheet" });
    }
  });

  app.post("/api/worksheets/:id/ocr", isAuthenticated, async (req, res) => {
    try {
      console.log("OCR processing request for worksheet ID:", req.params.id);
      const worksheetId = parseInt(req.params.id);
      
      if (isNaN(worksheetId)) {
        return res.status(400).json({ error: "Invalid worksheet ID" });
      }
      
      const worksheet = await storage.getWorksheet(worksheetId);
      if (!worksheet) {
        console.error("Worksheet not found for ID:", worksheetId);
        return res.status(404).json({ error: "Worksheet not found" });
      }

      console.log("Found worksheet:", worksheet);

      // Read the uploaded file and convert to base64
      const filePath = path.join(uploadDir, worksheet.filename);
      console.log("Looking for file at:", filePath);
      
      if (!fs.existsSync(filePath)) {
        console.error("Worksheet file not found at path:", filePath);
        return res.status(404).json({ error: "File not found" });
      }

      let base64Image: string;
      let isFromPdf = false;
      
      // Handle PDF files by converting to image first
      console.log("Checking if file is PDF. Original name:", worksheet.originalName, "isPDF:", isPdfFile(worksheet.originalName));
      if (isPdfFile(worksheet.originalName)) {
        console.log("Converting PDF to image for OCR processing...");
        base64Image = await convertPdfToImage(filePath);
        console.log("PDF converted successfully, base64 length:", base64Image.length);
        isFromPdf = true;
      } else {
        // Handle regular image files
        const fileBuffer = fs.readFileSync(filePath);
        base64Image = fileBuffer.toString('base64');
        console.log("Image file read successfully, base64 length:", base64Image.length);
      }

      // Extract patient data using OCR
      console.log("Starting OCR processing...");
      const ocrResult = await extractPatientDataFromWorksheet(base64Image, isFromPdf);
      console.log("OCR result:", ocrResult);
      
      // Update worksheet with OCR results
      const updatedWorksheet = await storage.updateWorksheet(worksheetId, {
        patientName: ocrResult.patientName,
        patientDob: ocrResult.patientDob,
        examDate: ocrResult.examDate,
        ocrProcessed: true
      });

      console.log("Worksheet updated successfully");
      res.json({ 
        worksheet: updatedWorksheet, 
        ocrResult,
        confidence: ocrResult.confidence 
      });
    } catch (error) {
      console.error("OCR processing error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        error: "Failed to process OCR",
        details: errorMessage 
      });
    }
  });

  // Reports API
  app.get("/api/reports", isAuthenticated, async (req, res) => {
    try {
      const reports = await storage.getAllReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // Get recent reports (last 50)
  app.get("/api/reports/recent", isAuthenticated, async (req, res) => {
    try {
      const reports = await storage.getRecentReports(50);
      res.json(reports);
    } catch (error) {
      console.error("Get recent reports error:", error);
      res.status(500).json({ error: "Failed to fetch recent reports" });
    }
  });

  app.patch("/api/reports/:id", isAuthenticated, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ error: "Invalid report ID" });
      }

      const updates = req.body;
      const updatedReport = await storage.updateReport(reportId, updates);
      
      if (!updatedReport) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json(updatedReport);
    } catch (error) {
      console.error("Report update error:", error);
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  app.delete("/api/reports/:id", isAuthenticated, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ error: "Invalid report ID" });
      }

      // Check if report exists before deletion
      const existingReport = await storage.getReport(reportId);
      if (!existingReport) {
        return res.status(404).json({ error: "Report not found" });
      }

      await storage.deleteReport(reportId);
      res.json({ message: "Report deleted successfully" });
    } catch (error) {
      console.error("Report deletion error:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  app.post("/api/reports/generate", isAuthenticated, async (req, res) => {
    try {
      console.log("Report generation request:", req.body);
      const { worksheetId, physicianId, logoUrl } = req.body;
      
      if (!worksheetId) {
        return res.status(400).json({ error: "Worksheet ID is required" });
      }
      
      if (!physicianId) {
        return res.status(400).json({ error: "Physician ID is required" });
      }

      const worksheet = await storage.getWorksheet(worksheetId);
      if (!worksheet) {
        console.error("Worksheet not found for ID:", worksheetId);
        return res.status(404).json({ error: "Worksheet not found" });
      }

      console.log("Found worksheet:", worksheet);

      // Read the worksheet file
      const filePath = path.join(uploadDir, worksheet.filename);
      console.log("Looking for file at:", filePath);
      
      if (!fs.existsSync(filePath)) {
        console.error("Worksheet file not found at path:", filePath);
        return res.status(404).json({ error: "Worksheet file not found" });
      }

      let base64Image: string;
      let isFromPdf = false;
      
      // Handle PDF files by converting to image first
      console.log("Checking if file is PDF. Original name:", worksheet.originalName, "isPDF:", isPdfFile(worksheet.originalName));
      if (isPdfFile(worksheet.originalName)) {
        console.log("Converting PDF to image for report generation...");
        base64Image = await convertPdfToImage(filePath);
        console.log("PDF converted successfully, base64 length:", base64Image.length);
        isFromPdf = true;
      } else {
        // Handle regular image files
        const fileBuffer = fs.readFileSync(filePath);
        base64Image = fileBuffer.toString('base64');
        console.log("Image file read successfully, base64 length:", base64Image.length);
      }

      // Get training data for context
      const trainingData = await storage.getAllTrainingPairs();
      console.log("Training data count:", trainingData.length);

      // Generate report using AI
      const ocrData = {
        patientName: worksheet.patientName,
        patientDob: worksheet.patientDob,
        examDate: worksheet.examDate,
        confidence: 1.0
      };

      console.log("Generating report with OCR data:", ocrData);
      const reportData = await generateReportFromWorksheet(base64Image, ocrData, trainingData, isFromPdf);
      console.log("Report generated successfully:", reportData);
      
      // Create report in storage
      const report = await storage.createReport({
        worksheetId,
        patientName: reportData.patientName,
        patientDob: reportData.patientDob,
        examDate: reportData.examDate,
        studyType: reportData.studyType,
        indication: reportData.indication,
        findings: reportData.findings,
        impression: reportData.impression,
        physicianId,
        logoUrl
      });

      console.log("Report saved to storage:", report.id);
      res.json(report);
    } catch (error) {
      console.error("Report generation error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({ 
        error: "Failed to generate report",
        details: errorMessage 
      });
    }
  });

  // PDF Download endpoint
  app.get("/api/reports/:id/pdf", isAuthenticated, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      const report = await storage.getReport(reportId);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Get physician info if available
      let physician = null;
      let signatureDataUrl = null;
      
      console.log('PDF Generation - Report:', { id: report.id, physicianId: report.physicianId });
      
      if (report.physicianId) {
        physician = await storage.getPhysician(report.physicianId);
        console.log('PDF Generation - Physician found:', physician ? { id: physician.id, name: physician.name, hasSignature: !!physician.signatureUrl } : 'Not found');
        
        // Convert signature to base64 data URL for HTML embedding
        if (physician && physician.signatureUrl) {
          try {
            const fs = await import('fs');
            const path = await import('path');
            
            const signaturePath = path.join(process.cwd(), physician.signatureUrl.startsWith('/') ? physician.signatureUrl.slice(1) : physician.signatureUrl);
            
            console.log('PDF Generation - Loading signature:', {
              physicianId: physician.id,
              signatureUrl: physician.signatureUrl,
              signaturePath,
              exists: fs.existsSync(signaturePath)
            });
            
            if (fs.existsSync(signaturePath)) {
              const signatureBuffer = fs.readFileSync(signaturePath);
              
              // Detect image format from buffer header
              let mimeType = 'image/png'; // default
              if (signatureBuffer.length > 1) {
                if (signatureBuffer[0] === 0xFF && signatureBuffer[1] === 0xD8) {
                  mimeType = 'image/jpeg';
                } else if (signatureBuffer[0] === 0x89 && signatureBuffer[1] === 0x50) {
                  mimeType = 'image/png';
                } else if (signatureBuffer[0] === 0x47 && signatureBuffer[1] === 0x49) {
                  mimeType = 'image/gif';
                } else if (signatureBuffer.slice(0, 4).toString() === 'RIFF') {
                  mimeType = 'image/webp';
                }
              }
              
              signatureDataUrl = `data:${mimeType};base64,${signatureBuffer.toString('base64')}`;
              console.log('PDF Generation - Signature loaded successfully:', {
                mimeType,
                bufferSize: signatureBuffer.length,
                dataUrlLength: signatureDataUrl.length,
                firstBytesHex: Array.from(signatureBuffer.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')
              });
            } else {
              console.log('PDF Generation - Signature file not found at path:', signaturePath);
            }
          } catch (error) {
            console.error('PDF Generation - Error loading signature:', error);
          }
        } else {
          console.log('PDF Generation - No signature URL for physician');
        }
      } else {
        console.log('PDF Generation - No physician assigned to report');
      }

      // Generate PDF content using HTML template (will return HTML for browser PDF conversion)
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Medical Report - ${report.patientName}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            line-height: 1.6; 
            color: #333;
        }
        .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #0066cc;
            padding-bottom: 20px;
        }
        .clinic-name { 
            font-size: 24px; 
            font-weight: bold; 
            color: #0066cc; 
            margin-bottom: 5px;
        }
        .report-title { 
            font-size: 18px; 
            color: #666; 
        }
        .patient-info { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 20px; 
            margin-bottom: 30px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        .info-section h3 { 
            color: #0066cc; 
            margin-bottom: 10px; 
            font-size: 16px;
        }
        .info-item { 
            margin-bottom: 8px; 
            font-size: 14px;
        }
        .info-label { 
            font-weight: bold; 
            color: #333;
        }
        .section { 
            margin-bottom: 25px; 
        }
        .section-title { 
            font-size: 16px; 
            font-weight: bold; 
            color: #0066cc; 
            margin-bottom: 10px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }
        .section-content { 
            font-size: 14px; 
            line-height: 1.7;
            text-align: justify;
        }
        .footer { 
            margin-top: 50px; 
            padding-top: 20px; 
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
        }
        .signature-section {
            margin-top: 40px;
            text-align: right;
        }
        .signature-line {
            border-bottom: 1px solid #333;
            width: 200px;
            margin: 20px 0 5px auto;
        }
        .signature-section img {
            max-width: 200px;
            max-height: 80px;
            border: 1px solid #ddd;
            padding: 5px;
            background: white;
        }
        @media print {
            body { margin: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="clinic-name">Reporting Room Medical</div>
        <div class="report-title">Medical Examination Report</div>
    </div>

    <div class="patient-info">
        <div class="info-section">
            <h3>Patient Information</h3>
            <div class="info-item">
                <span class="info-label">Name:</span> ${report.patientName}
            </div>
            <div class="info-item">
                <span class="info-label">Date of Birth:</span> ${report.patientDob}
            </div>
            <div class="info-item">
                <span class="info-label">Exam Date:</span> ${report.examDate}
            </div>
        </div>
        <div class="info-section">
            <h3>Study Information</h3>
            <div class="info-item">
                <span class="info-label">Study Type:</span> ${report.studyType}
            </div>
            <div class="info-item">
                <span class="info-label">Indication:</span> ${report.indication}
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Findings</div>
        <div class="section-content">${report.findings}</div>
    </div>

    <div class="section">
        <div class="section-title">Impression</div>
        <div class="section-content">${report.impression}</div>
    </div>

    <div class="signature-section">
        ${signatureDataUrl ? 
          `<div style="margin-bottom: 10px;">
             <img src="${signatureDataUrl}" alt="Physician Signature" style="max-width: 200px; max-height: 80px; border: 1px solid #ddd; padding: 5px; background: white;">
           </div>` : 
          '<div class="signature-line"></div>'
        }
        <div style="margin-top: 10px; font-size: 14px;">
            <strong>${physician ? `${physician.name}, ${physician.title || "MD"}` : "Reporting Physician"}</strong><br>
            ${physician && physician.specialty ? `${physician.specialty}<br>` : ""}
            Date: ${new Date().toLocaleDateString()}
        </div>
    </div>

    <div class="footer">
        <p>This report was generated by Reporting Room AI-powered ultrasound reporting system.</p>
        <p>Report ID: ${report.id} | Generated: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>`;

      // Since Puppeteer has environment issues, return printable HTML that browsers can convert to PDF
      // Users can use Ctrl+P -> Print to PDF in any browser
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${report.patientName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_${report.examDate}.html"`);
      
      // Add print instructions to the HTML
      const printableHtml = htmlContent.replace(
        '<body>',
        `<body>
        <div id="print-instructions" class="no-print" style="background: #e3f2fd; padding: 15px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #1976d2;">
          <h3 style="margin: 0 0 10px 0; color: #1976d2;">📄 PDF Generation Instructions</h3>
          <p style="margin: 0; font-size: 14px; color: #333;">
            <strong>To save as PDF:</strong> Press <kbd>Ctrl+P</kbd> (or <kbd>Cmd+P</kbd> on Mac), then select "Save as PDF" as the destination.
            <br><strong>For best results:</strong> Use A4 paper size and include background graphics.
          </p>
          <button onclick="window.print()" style="margin-top: 10px; background: #1976d2; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            🖨️ Print/Save as PDF
          </button>
        </div>`
      );
      
      res.send(printableHtml);
      
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate PDF",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // DOCX generation endpoint
  app.get("/api/reports/:id/docx", isAuthenticated, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      const templateId = req.query.templateId ? parseInt(req.query.templateId as string) : 1;
      
      if (isNaN(reportId)) {
        return res.status(400).json({ error: "Invalid report ID" });
      }

      const report = await storage.getReport(reportId);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Get template for styling
      const template = await storage.getReportTemplate(templateId) || await storage.getReportTemplate(1);

      // Get physician info if available
      let physician = null;
      if (report.physicianId) {
        physician = await storage.getPhysician(report.physicianId);
      }

      // Create DOCX document
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType, ImageRun } = await import('docx');
      
      // Load signature image if available
      let signatureImageData = null;
      if (physician && physician.signatureUrl) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          
          // Convert relative URL to absolute file path
          const signaturePath = path.join(process.cwd(), physician.signatureUrl.startsWith('/') ? physician.signatureUrl.slice(1) : physician.signatureUrl);
          
          if (fs.existsSync(signaturePath)) {
            signatureImageData = fs.readFileSync(signaturePath);
          }
        } catch (error) {
          console.error('Error loading signature image:', error);
        }
      }

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: [
            // Header section
            ...(template?.showHeader !== false ? [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: template?.clinicName || "Reporting Room Medical",
                    bold: true,
                    size: 32,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: "Medical Examination Report",
                    size: 24,
                    color: "666666",
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              ...(template?.clinicAddress ? [
                new Paragraph({
                  children: [new TextRun({ text: template.clinicAddress, size: 20, color: "666666" })],
                  alignment: AlignmentType.CENTER,
                }),
              ] : []),
              ...(template?.clinicPhone ? [
                new Paragraph({
                  children: [new TextRun({ text: template.clinicPhone, size: 20, color: "666666" })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 400 },
                }),
              ] : []),
            ] : []),
            
            // Patient Information Section
            new Paragraph({
              children: [
                new TextRun({ 
                  text: "Patient Information", 
                  bold: true,
                  size: 28,
                  color: template?.primaryColor?.replace('#', '') || '0066cc',
                }),
              ],
              spacing: { before: 400, after: 200 },
              border: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size: 6,
                  color: template?.primaryColor?.replace('#', '') || '0066cc',
                },
              },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Patient Name: ", bold: true }),
                new TextRun({ text: report.patientName }),
              ],
              spacing: { after: 120 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Date of Birth: ", bold: true }),
                new TextRun({ text: report.patientDob }),
              ],
              spacing: { after: 120 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Exam Date: ", bold: true }),
                new TextRun({ text: report.examDate }),
              ],
              spacing: { after: 120 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Report ID: ", bold: true }),
                new TextRun({ text: report.id.toString() }),
              ],
              spacing: { after: 400 },
            }),
            
            // Study Type section
            ...(template?.showStudyType !== false && report.studyType ? [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: "Study Type", 
                    bold: true,
                    size: 24,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  }),
                ],
                spacing: { before: 200, after: 120 },
                border: {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 4,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  },
                },
              }),
              new Paragraph({
                text: report.studyType,
                spacing: { after: 400 },
              }),
            ] : []),
            
            // Clinical Indication section
            ...(template?.showIndication !== false ? [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: "Clinical Indication", 
                    bold: true,
                    size: 24,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  }),
                ],
                spacing: { before: 200, after: 120 },
                border: {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 4,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  },
                },
              }),
              new Paragraph({
                text: report.indication || 'Not specified',
                spacing: { after: 400 },
              }),
            ] : []),
            
            // Findings section
            ...(template?.showFindings !== false ? [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: "Findings", 
                    bold: true,
                    size: 24,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  }),
                ],
                spacing: { before: 200, after: 120 },
                border: {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 4,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  },
                },
              }),
              ...report.findings.split('\n').filter(line => line.trim()).map(line => 
                new Paragraph({
                  text: line.trim(),
                  spacing: { after: 120 },
                })
              ),
              new Paragraph({ text: "", spacing: { after: 200 } }),
            ] : []),
            
            // Impression section
            ...(template?.showImpression !== false ? [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: "Impression", 
                    bold: true,
                    size: 24,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  }),
                ],
                spacing: { before: 200, after: 120 },
                border: {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 4,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  },
                },
              }),
              ...report.impression.split('\n').filter(line => line.trim()).map(line => 
                new Paragraph({
                  text: line.trim(),
                  spacing: { after: 120 },
                })
              ),
              new Paragraph({ text: "", spacing: { after: 400 } }),
            ] : []),
            
            // Signature section
            ...(template?.showSignature !== false ? [
              new Paragraph({ text: "", spacing: { before: 400 } }),
              ...(signatureImageData ? [
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: signatureImageData,
                      transformation: {
                        width: 200,
                        height: 80,
                      },
                      type: "png",
                    }),
                  ],
                  alignment: template?.signaturePosition === 'center' ? AlignmentType.CENTER : 
                            template?.signaturePosition === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT,
                }),
              ] : [
                new Paragraph({
                  children: [
                    new TextRun({ text: "_".repeat(50) }),
                  ],
                  alignment: template?.signaturePosition === 'center' ? AlignmentType.CENTER : 
                            template?.signaturePosition === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT,
                }),
              ]),
              new Paragraph({
                children: [
                  new TextRun({ text: "Physician Signature & Date", size: 20 }),
                ],
                alignment: template?.signaturePosition === 'center' ? AlignmentType.CENTER : 
                          template?.signaturePosition === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT,
                spacing: { after: 200 },
              }),
              ...(physician ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${physician.name}, ${physician.title || "MD"}`, bold: true }),
                  ],
                  alignment: template?.signaturePosition === 'center' ? AlignmentType.CENTER : 
                            template?.signaturePosition === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT,
                }),
                ...(physician.specialty ? [
                  new Paragraph({
                    children: [
                      new TextRun({ text: physician.specialty, size: 18, color: "666666" }),
                    ],
                    alignment: template?.signaturePosition === 'center' ? AlignmentType.CENTER : 
                              template?.signaturePosition === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT,
                  }),
                ] : []),
              ] : []),
              new Paragraph({
                children: [
                  new TextRun({ text: `Date: ${new Date().toLocaleDateString()}`, size: 18 }),
                ],
                alignment: template?.signaturePosition === 'center' ? AlignmentType.CENTER : 
                          template?.signaturePosition === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT,
              }),
            ] : []),
            
            // Footer section
            ...(template?.showFooter !== false ? [
              new Paragraph({ text: "", spacing: { before: 600 } }),
              new Paragraph({
                children: [
                  new TextRun({ text: "─".repeat(50), color: "cccccc" }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              ...(template?.footerText ? [
                new Paragraph({
                  children: [new TextRun({ text: template.footerText, size: 18, color: "666666" })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 },
                }),
              ] : []),
              ...(template?.showGenerationDate !== false ? [
                new Paragraph({
                  children: [
                    new TextRun({ 
                      text: `Report Generated: ${new Date().toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}`, 
                      size: 18, 
                      color: "666666" 
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 },
                }),
              ] : []),
              new Paragraph({
                children: [
                  new TextRun({ text: "Reporting Room Medical System", size: 18, color: "666666" }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ] : []),
          ],
        }],
      });

      // Generate buffer
      const buffer = await Packer.toBuffer(doc);

      // Set headers for download
      const filename = `${report.patientName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_${report.examDate}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.send(buffer);
    } catch (error) {
      console.error("DOCX generation error:", error);
      res.status(500).json({ error: "Failed to generate DOCX" });
    }
  });

  // Training API
  app.get("/api/training", isAuthenticated, async (req, res) => {
    try {
      const trainingPairs = await storage.getAllTrainingPairs();
      res.json(trainingPairs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch training data" });
    }
  });

  app.post("/api/training", isAuthenticated, upload.fields([
    { name: 'worksheet', maxCount: 1 },
    { name: 'report', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files.worksheet || !files.report) {
        return res.status(400).json({ error: "Both worksheet and report files are required" });
      }

      const { category, complexityLevel } = req.body;
      
      if (!category || !complexityLevel) {
        return res.status(400).json({ error: "Category and complexity level are required" });
      }

      const worksheetFile = files.worksheet[0];
      const reportFile = files.report[0];

      const trainingPair = await storage.createTrainingPair({
        worksheetUrl: `/uploads/${worksheetFile.filename}`,
        reportUrl: `/uploads/${reportFile.filename}`,
        category,
        complexityLevel
      });

      res.json(trainingPair);
    } catch (error) {
      console.error("Training data upload error:", error);
      res.status(500).json({ error: "Failed to upload training data" });
    }
  });

  // Logo upload endpoint
  app.post("/api/upload-logo", isAuthenticated, upload.single('logo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No logo file uploaded" });
      }

      const logoUrl = `/uploads/${req.file.filename}`;
      
      // Update clinic with new logo URL
      const user = await storage.getUser((req as any).user.claims.sub);
      if (user?.clinicId) {
        await storage.updateClinicLogo(user.clinicId, logoUrl);
      }
      
      res.json({ url: logoUrl });
    } catch (error) {
      console.error("Logo upload error:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  // Get clinic info
  app.get("/api/clinic", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser((req as any).user.claims.sub);
      if (!user?.clinicId) {
        return res.status(400).json({ error: "No clinic associated" });
      }

      const clinic = await storage.getClinic(user.clinicId);
      if (!clinic) {
        return res.status(404).json({ error: "Clinic not found" });
      }

      res.json(clinic);
    } catch (error) {
      console.error("Get clinic error:", error);
      res.status(500).json({ error: "Failed to fetch clinic information" });
    }
  });

  // Report Templates API
  app.get("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getAllReportTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/default", isAuthenticated, async (req, res) => {
    try {
      const template = await storage.getDefaultTemplate();
      res.json(template);
    } catch (error) {
      console.error("Get default template error:", error);
      res.status(500).json({ error: "Failed to fetch default template" });
    }
  });

  app.post("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertReportTemplateSchema.parse(req.body);
      const template = await storage.createReportTemplate(validatedData);
      res.json(template);
    } catch (error) {
      console.error("Create template error:", error);
      res.status(400).json({ error: "Invalid template data" });
    }
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }

      console.log("Update template request:", { templateId, body: req.body });
      
      const validatedData = updateReportTemplateSchema.parse(req.body);
      console.log("Validated data:", validatedData);
      
      const template = await storage.updateReportTemplate(templateId, validatedData);
      console.log("Updated template result:", template);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Update template error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      res.status(400).json({ 
        error: "Invalid template data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }

      await storage.deleteReportTemplate(templateId);
      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Delete template error:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Test OpenAI connection endpoint
  app.get("/api/test-openai", isAuthenticated, async (req, res) => {
    try {
      console.log("Testing OpenAI connection...");
      const testResult = await extractPatientDataFromWorksheet("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
      console.log("OpenAI test successful:", testResult);
      res.json({ status: "OpenAI connection working", result: testResult });
    } catch (error) {
      console.error("OpenAI test failed:", error);
      res.status(500).json({ 
        error: "OpenAI connection failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Worksheet template routes
  app.get("/api/worksheet-templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getAllWorksheetTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching worksheet templates:", error);
      res.status(500).json({ message: "Failed to fetch worksheet templates" });
    }
  });

  app.post("/api/worksheet-templates", isAuthenticated, upload.single('worksheetFile'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No worksheet file uploaded" });
      }

      const { name, description, category } = req.body;
      
      const templateData = {
        name,
        description,
        category,
        imageUrl: `/uploads/${req.file.filename}`,
        originalFilename: req.file.originalname,
        userId: (req.user as any)?.claims?.sub,
      };

      const template = await storage.createWorksheetTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating worksheet template:", error);
      res.status(500).json({ message: "Failed to create worksheet template" });
    }
  });

  app.delete("/api/worksheet-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteWorksheetTemplate(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting worksheet template:", error);
      res.status(500).json({ message: "Failed to delete worksheet template" });
    }
  });

  // Digital worksheet routes
  app.post("/api/digital-worksheets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      const worksheetData = {
        ...req.body,
        userId,
        isDraft: true,
        drawingHistory: JSON.stringify([]), // Initialize empty history
      };

      const worksheet = await storage.createDigitalWorksheet(worksheetData);
      res.json(worksheet);
    } catch (error) {
      console.error("Error creating digital worksheet:", error);
      res.status(500).json({ message: "Failed to create digital worksheet" });
    }
  });

  app.put("/api/digital-worksheets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const worksheet = await storage.updateDigitalWorksheet(parseInt(id), req.body);
      res.json(worksheet);
    } catch (error) {
      console.error("Error updating digital worksheet:", error);
      res.status(500).json({ message: "Failed to update digital worksheet" });
    }
  });

  app.get("/api/digital-worksheets", isAuthenticated, async (req: any, res) => {
    try {
      const worksheets = await storage.getAllDigitalWorksheets();
      res.json(worksheets);
    } catch (error) {
      console.error("Error fetching digital worksheets:", error);
      res.status(500).json({ message: "Failed to fetch digital worksheets" });
    }
  });

  app.get("/api/digital-worksheets/drafts", isAuthenticated, async (req: any, res) => {
    try {
      const drafts = await storage.getDraftDigitalWorksheets();
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching draft worksheets:", error);
      res.status(500).json({ message: "Failed to fetch draft worksheets" });
    }
  });

  app.post("/api/digital-worksheets/:id/create-draft-report", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const worksheet = await storage.getDigitalWorksheet(parseInt(id));
      
      if (!worksheet) {
        return res.status(404).json({ message: "Worksheet not found" });
      }

      // Get sonographer details for better report context
      const sonographer = worksheet.sonographerId ? 
        await storage.getSonographer(worksheet.sonographerId) : null;

      const draftReport = await storage.createDraftReport({
        digitalWorksheetId: worksheet.id,
        patientName: worksheet.patientName,
        patientDob: worksheet.patientDob,
        examDate: worksheet.examDate,
        studyType: worksheet.studyType || 'Digital Drawing Study',
        indication: `Digital drawing session completed by ${sonographer?.name || 'sonographer'} on ${new Date(worksheet.examDate).toLocaleDateString()}`,
        findings: `Digital worksheet completed with drawings and annotations. Template: ${worksheet.templateId ? 'Template #' + worksheet.templateId : 'Custom'}. Study contains graphical annotations and measurements created using digital drawing interface. Canvas data available for review.`,
        impression: `Digital drawing study completed. Awaiting physician interpretation and final report. Study type: ${worksheet.studyType || 'General study'}. Patient: ${worksheet.patientName}.`,
        sonographerId: worksheet.sonographerId,
      });

      // Mark worksheet as completed
      await storage.updateDigitalWorksheet(parseInt(id), { 
        isDraft: false,
        completedAt: new Date(),
      });

      res.json(draftReport);
    } catch (error) {
      console.error("Error creating draft report:", error);
      res.status(500).json({ message: "Failed to create draft report" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', (req, res, next) => {
    const filePath = path.join(uploadDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Legend entries routes
  app.get("/api/legend-entries", isAuthenticated, async (req, res) => {
    try {
      const entries = await storage.getAllLegendEntries();
      res.json(entries);
    } catch (error) {
      console.error("Error fetching legend entries:", error);
      res.status(500).json({ error: "Failed to fetch legend entries" });
    }
  });

  app.get("/api/legend-entries/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entry = await storage.getLegendEntry(id);
      
      if (!entry) {
        return res.status(404).json({ error: "Legend entry not found" });
      }
      
      res.json(entry);
    } catch (error) {
      console.error("Error fetching legend entry:", error);
      res.status(500).json({ error: "Failed to fetch legend entry" });
    }
  });

  app.post("/api/legend-entries", isAuthenticated, upload.single('exampleImage'), async (req, res) => {
    try {
      const entryData = req.body;
      
      // Handle uploaded image file
      if (req.file) {
        entryData.exampleImage = `/uploads/${req.file.filename}`;
        entryData.imageType = 'upload';
      } else if (entryData.drawingData) {
        // Drawing data is already in the body
        entryData.imageType = 'drawing';
      }
      
      const entry = await storage.createLegendEntry(entryData);
      res.json(entry);
    } catch (error) {
      console.error("Error creating legend entry:", error);
      res.status(500).json({ error: "Failed to create legend entry" });
    }
  });

  app.patch("/api/legend-entries/:id", isAuthenticated, upload.single('exampleImage'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = req.body;
      
      // Handle uploaded image file for updates
      if (req.file) {
        updateData.exampleImage = `/uploads/${req.file.filename}`;
        updateData.imageType = 'upload';
      } else if (updateData.drawingData) {
        updateData.imageType = 'drawing';
      }
      
      const entry = await storage.updateLegendEntry(id, updateData);
      
      if (!entry) {
        return res.status(404).json({ error: "Legend entry not found" });
      }
      
      res.json(entry);
    } catch (error) {
      console.error("Error updating legend entry:", error);
      res.status(500).json({ error: "Failed to update legend entry" });
    }
  });

  app.delete("/api/legend-entries/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLegendEntry(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting legend entry:", error);
      res.status(500).json({ error: "Failed to delete legend entry" });
    }
  });

  app.get("/api/legend-entries/category/:category", isAuthenticated, async (req, res) => {
    try {
      const category = req.params.category;
      const entries = await storage.getLegendEntriesByCategory(category);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching legend entries by category:", error);
      res.status(500).json({ error: "Failed to fetch legend entries by category" });
    }
  });

  // Clinic registration routes (public)
  app.post("/api/clinics/register", async (req, res) => {
    try {
      const clinicData = insertClinicSchema.parse(req.body);
      
      // Check if clinic already exists
      const existingClinic = await storage.getClinicByEmail(clinicData.email);
      if (existingClinic) {
        return res.status(400).json({ message: "A clinic with this email already exists" });
      }

      const clinic = await storage.createClinic(clinicData);
      res.status(201).json(clinic);
    } catch (error) {
      console.error("Clinic registration error:", error);
      res.status(400).json({ message: "Failed to register clinic" });
    }
  });

  // User invitation routes
  app.post("/api/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.clinicId || !['admin', 'clinic_owner'].includes(user.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const invitationData = {
        ...insertUserInvitationSchema.parse(req.body),
        clinicId: user.clinicId,
        invitedBy: user.id,
        token: generateInvitationToken(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      const invitation = await storage.createUserInvitation(invitationData);
      
      // TODO: Send invitation email here
      console.log(`Invitation created for ${invitation.email} with token: ${invitation.token}`);
      
      res.status(201).json(invitation);
    } catch (error) {
      console.error("Invitation creation error:", error);
      res.status(400).json({ message: "Failed to create invitation" });
    }
  });

  app.get("/api/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.clinicId) {
        return res.status(403).json({ message: "No clinic associated" });
      }

      const invitations = await storage.getClinicInvitations(user.clinicId);
      res.json(invitations);
    } catch (error) {
      console.error("Fetch invitations error:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.post("/api/invitations/:token/accept", isAuthenticated, async (req: any, res) => {
    try {
      const { token } = req.params;
      const userId = req.user.claims.sub;

      await storage.acceptInvitation(token, userId);
      res.json({ message: "Invitation accepted successfully" });
    } catch (error) {
      console.error("Accept invitation error:", error);
      res.status(400).json({ message: "Failed to accept invitation" });
    }
  });

  // Clinic users route
  app.get("/api/clinic/users", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.clinicId) {
        return res.status(403).json({ message: "No clinic associated" });
      }

      const users = await storage.getUsersByClinic(user.clinicId);
      res.json(users);
    } catch (error) {
      console.error("Fetch clinic users error:", error);
      res.status(500).json({ message: "Failed to fetch clinic users" });
    }
  });

  // Staff and invitation management routes
  app.get('/api/staff', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }

      const staff = await storage.getClinicStaff(currentUser.clinicId);
      res.json(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.get('/api/invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }

      const invitations = await storage.getPendingInvitations(currentUser.clinicId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.post('/api/invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }

      const { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }

      const invitation = await storage.createInvitation({
        email,
        clinicId: currentUser.clinicId,
        role,
        invitedBy: userId,
        token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      res.json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  app.delete('/api/invitations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const invitationId = parseInt(req.params.id);
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }

      await storage.cancelInvitation(invitationId, currentUser.clinicId);
      res.json({ message: "Invitation cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  });

  app.patch('/api/staff/:id/deactivate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);
      const staffId = req.params.id;
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }

      await storage.deactivateStaffMember(staffId, currentUser.clinicId);
      res.json({ message: "Staff member deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating staff:", error);
      res.status(500).json({ message: "Failed to deactivate staff member" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Utility function to generate invitation tokens
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
