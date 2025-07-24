import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertPhysicianSchema, insertTrainingPairSchema, insertWorksheetSchema, insertReportSchema } from "@shared/schema";
import { extractPatientDataFromWorksheet, generateReportFromWorksheet } from "./services/openai";
// PDF conversion not supported in this environment

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

    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload images only (JPEG, PNG, GIF, WebP). For PDF files, please convert them to image format first.`));
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

      // Check if it's a PDF file
      if (path.extname(worksheet.filename).toLowerCase() === '.pdf') {
        return res.status(400).json({ 
          error: "PDF files require conversion", 
          details: "Please convert your PDF to an image format (JPEG, PNG, GIF, WebP) before uploading. You can use online tools or export your PDF as an image." 
        });
      }

      // Handle regular image files
      const fileBuffer = fs.readFileSync(filePath);
      const base64Image = fileBuffer.toString('base64');
      console.log("Image file read successfully, base64 length:", base64Image.length);

      // Extract patient data using OCR
      console.log("Starting OCR processing...");
      const ocrResult = await extractPatientDataFromWorksheet(base64Image);
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

      // Check if it's a PDF file
      if (path.extname(worksheet.filename).toLowerCase() === '.pdf') {
        return res.status(400).json({ 
          error: "PDF files require conversion", 
          details: "Please convert your PDF to an image format (JPEG, PNG, GIF, WebP) before uploading. You can use online tools or export your PDF as an image." 
        });
      }

      // Handle regular image files
      const fileBuffer = fs.readFileSync(filePath);
      const base64Image = fileBuffer.toString('base64');
      console.log("Image file read successfully, base64 length:", base64Image.length);

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
      const reportData = await generateReportFromWorksheet(base64Image, ocrData, trainingData);
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
      res.json({ url: logoUrl });
    } catch (error) {
      console.error("Logo upload error:", error);
      res.status(500).json({ error: "Failed to upload logo" });
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

  // Serve uploaded files
  app.use('/uploads', (req, res, next) => {
    const filePath = path.join(uploadDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
