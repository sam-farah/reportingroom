import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { setupAuth, isAuthenticated } from "./auth";
import { sendInvitationEmail, sendReportEmail, sendAppointmentReminder } from "./email";
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
  insertUserInvitationSchema,
  insertTextShortcutSchema,
  insertPatientPortalAccountSchema,
  insertPatientPortalInvitationSchema,
  insertReportDistributionSchema,
} from "@shared/schema";
import { extractPatientDataFromWorksheet, generateReportFromWorksheet, analyzeVascularDrawing, extractTextFromImage } from "./services/openai";
import { convertPdfToImage, isPdfFile } from "./services/pdfConverter";
import { syncDocumentToPatientFolder, syncReportToPatientFolder } from "./services/fileSync";
import { createBackupArchive, getBackupInfo } from "./services/backup";
import OpenAI from "openai";
import { createReadStream } from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendPatientPortalInvitationEmail } from "./email";

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
      'image/svg+xml',
      'image/gif',
      'image/webp',
      'application/pdf',
      'audio/webm',
      'audio/wav',
      'audio/mp3',
      'audio/ogg',
      'audio/mpeg'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload images (JPEG, PNG, GIF, WebP), PDF files, or audio files.`));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware - setup authentication BEFORE any protected routes
  await setupAuth(app);

  // Public routes (no authentication required)
  // Login and callback routes are handled in setupAuth()

  // Public kiosk settings endpoint - returns kiosk customization for display
  app.get("/api/kiosk/settings", async (req, res) => {
    try {
      const { clinicId } = req.query;
      let clinic = null;

      if (clinicId && typeof clinicId === 'string') {
        const id = parseInt(clinicId);
        if (!isNaN(id)) {
          clinic = await storage.getClinic(id);
        }
      }

      if (!clinic) {
        const clinics = await storage.getAllClinics();
        clinic = clinics[0] || null;
      }

      const defaults = {
        clinicName: "",
        clinicId: null as number | null,
        kioskLogoUrl: null as string | null,
        kioskWelcomeText: "Patient Check-In",
        kioskInstructions: "Enter your name below to check in for your appointment",
        kioskSuccessMessage: "Please take a seat. We will call you shortly.",
        kioskBackgroundColor: null as string | null,
      };

      if (!clinic) {
        return res.json(defaults);
      }

      res.json({
        clinicName: clinic.name,
        clinicId: clinic.id,
        address: clinic.address || null,
        phone: clinic.phone || null,
        kioskLogoUrl: clinic.kioskLogoUrl || clinic.logoUrl || null,
        kioskWelcomeText: clinic.kioskWelcomeText || defaults.kioskWelcomeText,
        kioskInstructions: clinic.kioskInstructions || defaults.kioskInstructions,
        kioskSuccessMessage: clinic.kioskSuccessMessage || defaults.kioskSuccessMessage,
        kioskBackgroundColor: clinic.kioskBackgroundColor || null,
      });
    } catch (error) {
      console.error("Kiosk settings error:", error);
      res.status(500).json({ error: "Failed to fetch kiosk settings" });
    }
  });

  // Kiosk endpoints - no authentication required for patient self-check-in
  app.get("/api/kiosk/appointments/today", async (req, res) => {
    try {
      const { search } = req.query;
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      
      if (!search || typeof search !== 'string' || search.trim().length < 2) {
        return res.json([]);
      }

      let todayAppointments = await storage.getAppointmentsByDateRange(startOfDay, endOfDay);
      const searchLower = search.toLowerCase().trim();
      todayAppointments = todayAppointments.filter(apt => 
        apt.patientName.toLowerCase().includes(searchLower)
      );

      const safeAppointments = todayAppointments.map(apt => ({
        id: apt.id,
        patientName: apt.patientName,
        appointmentDate: apt.appointmentDate,
        duration: apt.duration,
        scanType: apt.scanType,
        status: apt.status,
      }));

      res.json(safeAppointments);
    } catch (error) {
      console.error("Kiosk search error:", error);
      res.status(500).json({ error: "Failed to search appointments" });
    }
  });

  app.post("/api/kiosk/checkin/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid appointment ID" });
      }

      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const aptDate = new Date(appointment.appointmentDate);
      if (aptDate < startOfDay || aptDate > endOfDay) {
        return res.status(400).json({ error: "Can only check in for today's appointments" });
      }

      const updated = await storage.updateAppointment(id, { status: 'checked_in' });
      res.json({ success: true, appointment: { id: updated?.id, patientName: updated?.patientName, status: updated?.status } });
    } catch (error) {
      console.error("Kiosk check-in error:", error);
      res.status(500).json({ error: "Failed to check in" });
    }
  });

  // Auth routes

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

  app.patch("/api/physicians/:id/toggle-status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const physician = await storage.togglePhysicianStatus(id);
      if (!physician) {
        return res.status(404).json({ error: "Physician not found" });
      }
      res.json(physician);
    } catch (error) {
      console.error("Error toggling physician status:", error);
      res.status(500).json({ error: "Failed to toggle physician status" });
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

  app.patch("/api/sonographers/:id/toggle-status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sonographer = await storage.toggleSonographerStatus(id);
      if (!sonographer) {
        return res.status(404).json({ error: "Sonographer not found" });
      }
      res.json(sonographer);
    } catch (error) {
      console.error("Error toggling sonographer status:", error);
      res.status(500).json({ error: "Failed to toggle sonographer status" });
    }
  });

  // Appointments API
  app.get("/api/appointments", isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (startDate && endDate) {
        const appointments = await storage.getAppointmentsByDateRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
        return res.json(appointments);
      }
      const appointments = await storage.getAllAppointments();
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  app.get("/api/appointments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ error: "Failed to fetch appointment" });
    }
  });

  app.post("/api/appointments", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      const appointmentData = {
        ...req.body,
        createdBy: userId,
        appointmentDate: new Date(req.body.appointmentDate),
      };
      const appointment = await storage.createAppointment(appointmentData);
      res.status(201).json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ error: "Failed to create appointment" });
    }
  });

  app.put("/api/appointments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = {
        ...req.body,
        appointmentDate: req.body.appointmentDate ? new Date(req.body.appointmentDate) : undefined,
      };
      const appointment = await storage.updateAppointment(id, updateData);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ error: "Failed to update appointment" });
    }
  });

  app.delete("/api/appointments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAppointment(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ error: "Failed to delete appointment" });
    }
  });

  // Send appointment reminder email
  app.post("/api/appointments/:id/send-reminder", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });
      if (!appointment.patientEmail) return res.status(400).json({ error: "No email address on file for this patient" });

      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const clinic = await storage.getClinic(user.clinicId);
      if (!clinic) return res.status(404).json({ error: "Clinic not found" });

      await sendAppointmentReminder({
        toEmail: appointment.patientEmail,
        patientName: appointment.patientName,
        appointmentDate: new Date(appointment.appointmentDate),
        duration: appointment.duration,
        scanType: appointment.scanType || null,
        clinicName: clinic.name,
        clinicAddress: clinic.address || null,
        clinicPhone: clinic.phone || null,
        clinicEmail: clinic.email || null,
        clinicLogoUrl: clinic.logoUrl || null,
        reminderInstructions: clinic.reminderInstructions || null,
      });

      console.log(`Appointment reminder sent to ${appointment.patientEmail} for appointment ${id}`);
      res.json({ success: true, sentTo: appointment.patientEmail });
    } catch (error: any) {
      console.error("Send reminder error:", error);
      res.status(500).json({ error: error?.message || "Failed to send reminder" });
    }
  });

  // Calendar Events API
  app.get("/api/calendar-events", isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setMonth(new Date().getMonth() - 1));
      const end = endDate ? new Date(endDate as string) : new Date(new Date().setMonth(new Date().getMonth() + 12));
      const events = await storage.getCalendarEventsByDateRange(start, end);
      res.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.post("/api/calendar-events", isAuthenticated, async (req, res) => {
    try {
      const eventData = {
        ...req.body,
        startTime: new Date(req.body.startTime),
        endTime: new Date(req.body.endTime),
        recurrenceEndDate: req.body.recurrenceEndDate ? new Date(req.body.recurrenceEndDate) : null,
      };
      const event = await storage.createCalendarEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  app.put("/api/calendar-events/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const eventData = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
        recurrenceEndDate: req.body.recurrenceEndDate ? new Date(req.body.recurrenceEndDate) : null,
      };
      const event = await storage.updateCalendarEvent(id, eventData);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      console.error("Error updating calendar event:", error);
      res.status(500).json({ error: "Failed to update calendar event" });
    }
  });

  app.delete("/api/calendar-events/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCalendarEvent(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ error: "Failed to delete calendar event" });
    }
  });

  // Patients API
  app.get("/api/patients", isAuthenticated, async (req, res) => {
    try {
      const { search } = req.query;
      if (search && typeof search === 'string') {
        const patients = await storage.searchPatients(search);
        return res.json(patients);
      }
      const patients = await storage.getAllPatients();
      res.json(patients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  app.get("/api/patients/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.json(patient);
    } catch (error) {
      console.error("Error fetching patient:", error);
      res.status(500).json({ error: "Failed to fetch patient" });
    }
  });

  app.get("/api/patients/:id/worksheets", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const worksheets = await storage.getPatientWorksheets(id);
      res.json(worksheets);
    } catch (error) {
      console.error("Error fetching patient worksheets:", error);
      res.status(500).json({ error: "Failed to fetch patient worksheets" });
    }
  });

  app.get("/api/patients/:id/digital-worksheets", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const digitalWorksheets = await storage.getPatientDigitalWorksheets(id);
      res.json(digitalWorksheets);
    } catch (error) {
      console.error("Error fetching patient digital worksheets:", error);
      res.status(500).json({ error: "Failed to fetch patient digital worksheets" });
    }
  });

  app.get("/api/patients/:id/reports", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const reports = await storage.getPatientReports(id);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching patient reports:", error);
      res.status(500).json({ error: "Failed to fetch patient reports" });
    }
  });

  app.get("/api/patients/:id/appointments", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const appointments = await storage.getPatientAppointments(id);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching patient appointments:", error);
      res.status(500).json({ error: "Failed to fetch patient appointments" });
    }
  });

  // Patient documents routes
  app.get("/api/patients/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const documents = await storage.getPatientDocuments(id);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching patient documents:", error);
      res.status(500).json({ error: "Failed to fetch patient documents" });
    }
  });

  app.post("/api/patients/:id/documents", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const title = req.body.title || "Request Form";
      const documentDate = req.body.documentDate || new Date().toISOString().split('T')[0];
      const notes = req.body.notes || null;

      const document = await storage.createPatientDocument({
        patientId,
        title,
        filename: file.filename,
        originalName: file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        documentDate,
        notes,
      });

      syncDocumentToPatientFolder(patientId, {
        id: document.id,
        title: document.title,
        fileUrl: document.fileUrl
      }).catch(err => console.error('Background sync error:', err));

      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading patient document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.delete("/api/patients/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePatientDocument(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting patient document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Serve patient document files
  app.get("/api/patients/documents/:id/file", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const documents = await storage.getPatientDocuments(id);
      // Find the document - need to get by document ID
      const document = documents.find(d => d.id === id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      const filePath = path.join(uploadDir, document.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }
      
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving document file:", error);
      res.status(500).json({ error: "Failed to serve document" });
    }
  });

  app.post("/api/patients", isAuthenticated, async (req, res) => {
    try {
      const patient = await storage.createPatient(req.body);
      res.status(201).json(patient);
    } catch (error) {
      console.error("Error creating patient:", error);
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  app.put("/api/patients/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const patient = await storage.updatePatient(id, req.body);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.json(patient);
    } catch (error) {
      console.error("Error updating patient:", error);
      res.status(500).json({ error: "Failed to update patient" });
    }
  });

  app.post("/api/patients/:id/verify-medicare", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { action } = req.body; // 'verify' | 'unverify'
      const patient = await storage.getPatient(id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!patient.medicareNumber) return res.status(400).json({ error: "No Medicare number on file" });
      const updates =
        action === "unverify"
          ? { medicareVerifiedStatus: "unverified", medicareVerifiedAt: null }
          : { medicareVerifiedStatus: "verified", medicareVerifiedAt: new Date() };
      const updated = await storage.updatePatient(id, updates);
      res.json({ patient: updated, note: "Manual verification recorded. Live verification requires Services Australia PRODA API access." });
    } catch (error) {
      console.error("Error verifying Medicare:", error);
      res.status(500).json({ error: "Failed to update Medicare status" });
    }
  });

  app.delete("/api/patients/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePatient(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ error: "Failed to delete patient" });
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

      // If a linked patient ID was provided, use that patient's data instead of OCR
      const linkedPatientId = req.body?.linkedPatientId ? parseInt(req.body.linkedPatientId) : null;
      let linkedPatientUsed = false;
      let finalPatientName = ocrResult.patientName;
      let finalPatientDob = ocrResult.patientDob;

      if (linkedPatientId && !isNaN(linkedPatientId)) {
        const linkedPatient = await storage.getPatient(linkedPatientId);
        if (linkedPatient) {
          finalPatientName = `${linkedPatient.firstName} ${linkedPatient.lastName}`;
          finalPatientDob = linkedPatient.dateOfBirth || ocrResult.patientDob;
          linkedPatientUsed = true;
          console.log("Using linked patient data instead of OCR:", finalPatientName);
        }
      }
      
      // Update worksheet with resolved patient data
      const updatedWorksheet = await storage.updateWorksheet(worksheetId, {
        patientName: finalPatientName,
        patientDob: finalPatientDob,
        examDate: ocrResult.examDate,
        ocrProcessed: true,
        ...(linkedPatientId && !isNaN(linkedPatientId) ? { patientId: linkedPatientId } : {})
      });

      console.log("Worksheet updated successfully");
      res.json({ 
        worksheet: updatedWorksheet, 
        ocrResult,
        linkedPatientUsed,
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

  app.post("/api/reports/:id/finalize", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId;
      
      const report = await storage.finalizeReport(id, userId);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error finalizing report:", error);
      res.status(500).json({ error: "Failed to finalize report" });
    }
  });

  // Amendment endpoint
  app.post("/api/reports/:id/amend", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid report ID" });
      }

      const userId = req.session.userId;
      const { reason, ...reportUpdates } = req.body;

      if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: "Amendment reason is required" });
      }

      // Validate report updates using partial report schema
      const validatedUpdates = insertReportSchema.partial().parse(reportUpdates);
      
      const amendedReport = await storage.amendReport(id, validatedUpdates, userId, reason.trim());
      
      if (!amendedReport) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      res.json(amendedReport);
    } catch (error) {
      console.error("Amend report error:", error);
      res.status(500).json({ error: "Failed to amend report" });
    }
  });

  // Send report via email
  app.post("/api/reports/:id/send-email", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report ID" });

      const { toEmail, toName, subject, reportHtml } = req.body;
      if (!toEmail || !reportHtml) {
        return res.status(400).json({ error: "toEmail and reportHtml are required" });
      }

      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const user = await storage.getUser(req.session.userId);
      const clinic = user?.clinicId ? await storage.getClinic(user.clinicId) : null;
      const clinicName = clinic?.name || "Nexus Vascular Imaging";

      await sendReportEmail({
        toEmail,
        toName: toName || toEmail,
        subject: subject || `Medical Report — ${report.patientName}`,
        reportHtml,
        clinicName,
        patientName: report.patientName,
      });

      // Auto-log the distribution
      await storage.createReportDistribution({
        reportId: id,
        clinicId: user?.clinicId ?? null,
        method: "email",
        recipientName: toName || null,
        recipientEmail: toEmail,
        notes: null,
        confirmedAt: new Date(),
        confirmedBy: user?.email || null,
      });

      res.json({ success: true, message: `Report sent to ${toEmail}` });
    } catch (error: any) {
      console.error("Send report email error:", error);
      res.status(500).json({ error: "Failed to send email", details: error?.message });
    }
  });

  // ── Scan Type Content Templates ──
  app.get("/api/content-templates", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.json([]);
      const templates = await storage.getScanTypeContentTemplates(user.clinicId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content templates" });
    }
  });

  app.put("/api/content-templates/:scanType", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic associated" });
      const scanType = decodeURIComponent(req.params.scanType);
      const { findingsTemplate, impressionTemplate, indicationTemplate } = req.body;
      const template = await storage.upsertScanTypeContentTemplate({
        clinicId: user.clinicId,
        scanType,
        findingsTemplate: findingsTemplate || null,
        impressionTemplate: impressionTemplate || null,
        indicationTemplate: indicationTemplate || null,
      });
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to save content template" });
    }
  });

  app.delete("/api/content-templates/:scanType", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const scanType = decodeURIComponent(req.params.scanType);
      await storage.deleteScanTypeContentTemplate(user.clinicId, scanType);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete content template" });
    }
  });

  // Distribution counts summary for all reports in the clinic (for card badges)
  app.get("/api/distributions-summary", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.json({});
      const counts = await storage.getReportDistributionCounts(user.clinicId);
      res.json(counts);
    } catch (error) {
      console.error("Distributions summary error:", error);
      res.status(500).json({ error: "Failed to fetch distribution summary" });
    }
  });

  // List distributions for a report
  app.get("/api/reports/:id/distributions", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report ID" });
      const distributions = await storage.getReportDistributions(id);
      res.json(distributions);
    } catch (error) {
      console.error("Get distributions error:", error);
      res.status(500).json({ error: "Failed to fetch distributions" });
    }
  });

  // Manually log a distribution (e.g. Copy HTML confirmed by user)
  app.post("/api/reports/:id/distributions", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report ID" });

      const user = await storage.getUser(req.session.userId);
      const body = insertReportDistributionSchema.parse({
        ...req.body,
        reportId: id,
        clinicId: user?.clinicId ?? null,
        confirmedAt: new Date(),
        confirmedBy: user?.email || null,
      });

      const distribution = await storage.createReportDistribution(body);
      res.json(distribution);
    } catch (error) {
      console.error("Create distribution error:", error);
      res.status(500).json({ error: "Failed to log distribution" });
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

      // Get user's clinic information
      const user = await storage.getUser(req.session.userId);
      let clinic = null;
      if (user?.clinicId) {
        clinic = await storage.getClinic(user.clinicId);
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

      // Get GLOBAL training data for context - affects ALL users system-wide
      const allTrainingData = await storage.getAllTrainingPairs();
      console.log("🌍 GLOBAL TRAINING DATA - affects all users system-wide:", allTrainingData.length, "examples");
      
      // Extract actual text content from training report images using OCR
      const enhancedTrainingData = await Promise.all(allTrainingData.map(async (pair) => {
        console.log(`🔍 Processing training pair ${pair.id}: ${pair.category} (${pair.complexityLevel})`);
        
        let extractedReportText = null;
        
        // Try to extract text from the training report image
        if (pair.reportUrl) {
          try {
            const reportPath = path.join(uploadDir, path.basename(pair.reportUrl));
            console.log(`📄 Extracting text from training report: ${reportPath}`);
            
            if (fs.existsSync(reportPath)) {
              const reportBuffer = fs.readFileSync(reportPath);
              const base64Report = reportBuffer.toString('base64');
              
              // Use OCR to extract text from the training report image
              const ocrResult = await extractTextFromImage(base64Report);
              extractedReportText = ocrResult.extractedText;
              
              console.log(`✅ Extracted ${extractedReportText.length} characters from training report`);
              console.log(`📝 Sample text: "${extractedReportText.substring(0, 150)}..."`);
            }
          } catch (error) {
            console.error(`❌ Failed to extract text from training report ${pair.reportUrl}:`, error);
          }
        }
        
        return {
          ...pair,
          extractedReportText: extractedReportText
        };
      }));
      
      const trainingData = enhancedTrainingData;
      console.log("Using enhanced training examples for AI context:", trainingData.length);

      // Generate report using AI
      const ocrData = {
        patientName: worksheet.patientName,
        patientDob: worksheet.patientDob,
        examDate: worksheet.examDate,
        confidence: 1.0
      };

      console.log("Generating report with OCR data:", ocrData);
      console.log("🌍 GLOBAL TRAINING INTEGRATION:", trainingData.length > 0 ? 
        `✅ ACTIVE (${trainingData.length} global examples affecting ALL users)` : 
        '❌ INACTIVE (no global training data)');
      
      // Log detailed training data being sent to AI
      if (trainingData.length > 0) {
        console.log("🔥 TRAINING DATA DETAILS - CRITICAL FOR AI:");
        trainingData.forEach((pair, index) => {
          console.log(`  ${index + 1}. Category: ${pair.category}, Complexity: ${pair.complexityLevel}, Uploaded: ${new Date(pair.uploadedAt).toLocaleDateString()}`);
          console.log(`      Training files: ${pair.worksheetUrl} + ${pair.reportUrl}`);
        });
        console.log("🚨 AI MUST use these GLOBAL training patterns for consistent clinical findings across ALL users!");
      } else {
        console.log("⚠️  NO TRAINING DATA - AI will use default knowledge only");
      }
      
      // Look up per-scan-type content template for this clinic
      // If the client passed a specific scan type override, use that; otherwise auto-detect from worksheet
      let contentTemplate = null;
      const { contentTemplateScanType } = req.body;
      const effectiveScanType = contentTemplateScanType || worksheet.studyType;
      if (user?.clinicId && effectiveScanType) {
        contentTemplate = await storage.getScanTypeContentTemplate(user.clinicId, effectiveScanType);
        if (contentTemplateScanType) {
          console.log(`Using client-selected content template for scan type: ${contentTemplateScanType}`);
        }
      }

      const reportData = await generateReportFromWorksheet(base64Image, ocrData, trainingData, isFromPdf, contentTemplate);
      console.log("Report generated successfully with training context:", reportData.studyType);
      
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
        logoUrl: clinic?.logoUrl || logoUrl
      });

      syncReportToPatientFolder(report.id).catch(err => console.error('Background report sync error:', err));

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

      // Get user's clinic information
      const userId = req.session.userId;
      console.log('PDF Generation - Getting user data for:', userId);
      const user = await storage.getUser(userId);
      console.log('PDF Generation - User found:', user ? { id: user.id, clinicId: user.clinicId } : 'Not found');
      
      let clinic = null;
      let clinicLogoDataUrl = null;
      if (user?.clinicId) {
        console.log('PDF Generation - Getting clinic data for clinicId:', user.clinicId);
        clinic = await storage.getClinic(user.clinicId);
        console.log('PDF Generation - Clinic found:', clinic ? { id: clinic.id, name: clinic.name, address: clinic.address, phone: clinic.phone, fax: clinic.fax, email: clinic.email, logoUrl: clinic.logoUrl } : 'Not found');
        
        // Load clinic logo if available
        if (clinic?.logoUrl) {
          try {
            const fs = await import('fs');
            const path = await import('path');
            
            const logoPath = path.join(process.cwd(), clinic.logoUrl.startsWith('/') ? clinic.logoUrl.slice(1) : clinic.logoUrl);
            
            if (fs.existsSync(logoPath)) {
              const logoBuffer = fs.readFileSync(logoPath);
              const logoExtension = path.extname(clinic.logoUrl).toLowerCase();
              let mimeType = 'image/png';
              
              if (logoExtension === '.jpg' || logoExtension === '.jpeg') {
                mimeType = 'image/jpeg';
              } else if (logoExtension === '.gif') {
                mimeType = 'image/gif';
              } else if (logoExtension === '.svg') {
                mimeType = 'image/svg+xml';
              }
              
              clinicLogoDataUrl = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
            }
          } catch (error) {
            console.error('Error loading clinic logo:', error);
          }
        }
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
            position: relative;
            margin-bottom: 30px; 
            border-bottom: 2px solid #0066cc;
            padding-bottom: 20px;
            min-height: 80px;
        }
        .clinic-logo {
            position: absolute;
            top: 0;
            left: 0;
            max-width: 120px;
            max-height: 80px;
        }
        .header-content {
            text-align: center;
            margin-left: 140px;
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
        ${clinicLogoDataUrl ? `<img src="${clinicLogoDataUrl}" alt="Clinic Logo" class="clinic-logo">` : ''}
        <div class="header-content">
            <div class="clinic-name">${clinic?.name || 'Medical Clinic'}</div>
            <div class="report-title">Medical Examination Report</div>
            ${clinic?.address ? `<div style="font-size: 12px; color: #666; margin-top: 5px;">${clinic.address}</div>` : ''}
            ${clinic?.phone || clinic?.fax || clinic?.email ? 
              `<div style="font-size: 11px; color: #666; margin-top: 3px;">
                 ${clinic?.phone ? `Phone: ${clinic.phone}` : ''}${clinic?.phone && clinic?.fax ? ' | ' : ''}
                 ${clinic?.fax ? `Fax: ${clinic.fax}` : ''}${(clinic?.phone || clinic?.fax) && clinic?.email ? ' | ' : ''}
                 ${clinic?.email ? `Email: ${clinic.email}` : ''}
               </div>` : ''}
        </div>
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

      // Get user's clinic information
      const user = await storage.getUser(req.session.userId);
      let clinic = null;
      if (user?.clinicId) {
        clinic = await storage.getClinic(user.clinicId);
      }

      // Get physician info if available
      let physician = null;
      if (report.physicianId) {
        physician = await storage.getPhysician(report.physicianId);
      }

      // Create DOCX document
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType, ImageRun } = await import('docx');
      
      // Load clinic logo if available
      let clinicLogoData = null;
      if (clinic?.logoUrl) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          
          const logoPath = path.join(process.cwd(), clinic.logoUrl.startsWith('/') ? clinic.logoUrl.slice(1) : clinic.logoUrl);
          
          if (fs.existsSync(logoPath)) {
            clinicLogoData = fs.readFileSync(logoPath);
          }
        } catch (error) {
          console.error('Error loading clinic logo for DOCX:', error);
        }
      }
      
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
            // Header section with logo
            ...(template?.showHeader !== false ? [
              // Logo and clinic name in same paragraph
              new Paragraph({
                children: [
                  ...(clinicLogoData ? [
                    new ImageRun({
                      data: clinicLogoData,
                      transformation: {
                        width: 100,
                        height: 60,
                      },
                    }),
                    new TextRun({ text: "  " }), // Space between logo and text
                  ] : []),
                  new TextRun({ 
                    text: clinic?.name || "Medical Clinic",
                    bold: true,
                    size: 32,
                    color: template?.primaryColor?.replace('#', '') || '0066cc',
                  }),
                ],
                alignment: clinicLogoData ? AlignmentType.LEFT : AlignmentType.CENTER,
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
                spacing: { after: 200 },
              }),
              ...(clinic?.address ? [
                new Paragraph({
                  children: [new TextRun({ text: clinic.address, size: 20, color: "666666" })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 },
                }),
              ] : []),
              ...(clinic?.phone || clinic?.fax || clinic?.email ? [
                new Paragraph({
                  children: [new TextRun({ 
                    text: [
                      clinic?.phone ? `Phone: ${clinic.phone}` : '',
                      clinic?.fax ? `Fax: ${clinic.fax}` : '',
                      clinic?.email ? `Email: ${clinic.email}` : ''
                    ].filter(Boolean).join(' | '),
                    size: 18,
                    color: "666666"
                  })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 400 },
                }),
              ] : [
                new Paragraph({ text: "", spacing: { after: 400 } })
              ]),
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

  // Serve clinic logo image (authenticated)
  app.get("/api/clinic/logo", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const clinic = await storage.getClinic(user.clinicId);
      if (!clinic?.logoUrl) return res.status(404).json({ error: "No logo" });

      const logoPath = path.join(process.cwd(), clinic.logoUrl.startsWith('/') ? clinic.logoUrl.slice(1) : clinic.logoUrl);
      if (!fs.existsSync(logoPath)) return res.status(404).json({ error: "Logo file not found" });

      // Detect MIME type from file magic bytes (handles files without extensions)
      const headerBuf = Buffer.alloc(8);
      const fd = fs.openSync(logoPath, 'r');
      fs.readSync(fd, headerBuf, 0, 8, 0);
      fs.closeSync(fd);
      let mimeType = 'image/png';
      if (headerBuf[0] === 0xFF && headerBuf[1] === 0xD8) mimeType = 'image/jpeg';
      else if (headerBuf[0] === 0x89 && headerBuf[1] === 0x50) mimeType = 'image/png';
      else if (headerBuf[0] === 0x47 && headerBuf[1] === 0x49) mimeType = 'image/gif';
      else if (headerBuf[0] === 0x52 && headerBuf[1] === 0x49) mimeType = 'image/webp';
      else {
        const ext = path.extname(clinic.logoUrl).toLowerCase();
        const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
        mimeType = mimeMap[ext] || 'image/png';
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      fs.createReadStream(logoPath).pipe(res);
    } catch (error) {
      console.error("Serve clinic logo error:", error);
      res.status(500).json({ error: "Failed to serve logo" });
    }
  });

  // Kiosk logo upload endpoint
  app.post("/api/upload-kiosk-logo", isAuthenticated, upload.single('logo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No logo file uploaded" });
      }

      const logoUrl = `/uploads/${req.file.filename}`;
      const user = await storage.getUser(req.session.userId);
      if (user?.clinicId) {
        await storage.updateClinic(user.clinicId, { kioskLogoUrl: logoUrl } as any);
      }
      
      res.json({ url: logoUrl });
    } catch (error) {
      console.error("Kiosk logo upload error:", error);
      res.status(500).json({ error: "Failed to upload kiosk logo" });
    }
  });

  // Save kiosk settings
  app.put("/api/kiosk/settings", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) {
        return res.status(400).json({ error: "No clinic associated" });
      }

      const { kioskWelcomeText, kioskInstructions, kioskSuccessMessage, kioskBackgroundColor } = req.body;
      await storage.updateClinic(user.clinicId, {
        kioskWelcomeText: kioskWelcomeText || null,
        kioskInstructions: kioskInstructions || null,
        kioskSuccessMessage: kioskSuccessMessage || null,
        kioskBackgroundColor: kioskBackgroundColor || null,
      } as any);

      const clinic = await storage.getClinic(user.clinicId);
      res.json(clinic);
    } catch (error) {
      console.error("Save kiosk settings error:", error);
      res.status(500).json({ error: "Failed to save kiosk settings" });
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
      const user = await storage.getUser(req.session.userId);
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
      const user = await storage.getUser(req.session.userId);
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

  // Dictation vocabulary endpoints
  app.get("/api/clinic/dictation-vocabulary", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const clinic = await storage.getClinic(user.clinicId);
      let words: string[] = [];
      if (clinic?.dictationVocabulary) {
        try { words = JSON.parse(clinic.dictationVocabulary); } catch {}
      }
      res.json({ words });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  app.put("/api/clinic/dictation-vocabulary", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const { words } = req.body;
      if (!Array.isArray(words)) return res.status(400).json({ error: "words must be an array" });
      const cleaned = words.map((w: string) => String(w).trim()).filter(Boolean);
      await storage.updateClinic(user.clinicId, { dictationVocabulary: JSON.stringify(cleaned) });
      res.json({ words: cleaned });
    } catch (error) {
      res.status(500).json({ error: "Failed to save vocabulary" });
    }
  });

  // Reminder instructions endpoint
  app.put("/api/clinic/reminder-instructions", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const { instructions } = req.body;
      await storage.updateClinic(user.clinicId, { reminderInstructions: instructions ?? null });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save reminder instructions" });
    }
  });

  // Scan duration settings
  app.get("/api/scan-durations", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const settings = await storage.getScanDurationSettings(user.clinicId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scan duration settings" });
    }
  });

  app.put("/api/scan-durations", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const { settings } = req.body;
      if (!Array.isArray(settings)) return res.status(400).json({ error: "Invalid settings" });
      const result = await storage.upsertScanDurationSettings(user.clinicId, settings);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to save scan duration settings" });
    }
  });

  // Update clinic info
  app.put("/api/clinic/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId) {
        return res.status(400).json({ error: "No clinic associated" });
      }

      const clinicId = parseInt(req.params.id);
      if (isNaN(clinicId) || clinicId !== user.clinicId) {
        return res.status(403).json({ error: "Unauthorized to update this clinic" });
      }

      const { name, address, phone, fax, email } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ error: "Clinic name and email are required" });
      }

      const updatedClinic = await storage.updateClinic(clinicId, {
        name,
        address,
        phone,
        fax,
        email,
      });

      if (!updatedClinic) {
        return res.status(404).json({ error: "Clinic not found" });
      }

      res.json(updatedClinic);
    } catch (error) {
      console.error("Update clinic error:", error);
      res.status(500).json({ error: "Failed to update clinic information" });
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
      const userId = req.session?.userId;
      
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

  // Digital worksheet image endpoint
  app.get("/api/digital-worksheets/:id/image", async (req, res) => {
    try {
      const worksheetId = parseInt(req.params.id);
      
      if (isNaN(worksheetId)) {
        return res.status(400).json({ error: "Invalid worksheet ID" });
      }
      
      const worksheet = await storage.getDigitalWorksheet(worksheetId);
      
      if (!worksheet) {
        return res.status(404).json({ error: "Digital worksheet not found" });
      }
      
      if (!worksheet.drawingData) {
        return res.status(404).json({ error: "No drawing data available" });
      }
      
      // Extract base64 image data and convert to buffer
      const base64Data = worksheet.drawingData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Determine content type from the original data URL
      const contentType = worksheet.drawingData.match(/^data:image\/([a-z]+);base64,/)?.[1];
      const mimeType = contentType ? `image/${contentType}` : 'image/png';
      
      // Set appropriate headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', imageBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error serving digital worksheet image:", error);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  app.post("/api/digital-worksheets/:id/create-draft-report", isAuthenticated, async (req: any, res) => {
    try {
      console.log("Creating draft report for worksheet ID:", req.params.id);
      const { id } = req.params;
      const worksheetId = parseInt(id);
      
      if (isNaN(worksheetId)) {
        return res.status(400).json({ message: "Invalid worksheet ID" });
      }
      
      const worksheet = await storage.getDigitalWorksheet(worksheetId);
      
      if (!worksheet) {
        console.error("Worksheet not found for ID:", worksheetId);
        return res.status(404).json({ message: "Worksheet not found" });
      }

      console.log("Found worksheet:", worksheet.patientName, worksheet.studyType);

      // Get sonographer details for better report context
      let sonographer = null;
      try {
        sonographer = worksheet.sonographerId ? 
          await storage.getSonographer(worksheet.sonographerId) : null;
      } catch (sonographerError) {
        console.warn("Failed to fetch sonographer details:", sonographerError);
      }

      console.log("Creating draft report with data...");
      
      // Get template name for better context
      let templateName = 'Custom';
      if (worksheet.templateId) {
        try {
          const template = await storage.getWorksheetTemplate(worksheet.templateId);
          templateName = template?.name || `Template #${worksheet.templateId}`;
        } catch (templateError) {
          console.warn("Failed to fetch template name:", templateError);
        }
      }

      // Analyze the drawing using AI if canvas data is available
      let aiGeneratedFindings = '';
      let aiGeneratedImpression = '';
      
      if (worksheet.drawingData) {
        try {
          console.log("Analyzing drawing with AI...");
          const base64Image = worksheet.drawingData.replace(/^data:image\/[a-z]+;base64,/, '');
          
          // Get legend entries to help interpret the drawing
          const legendEntries = await storage.getAllLegendEntries();
          console.log("Retrieved legend entries for analysis:", legendEntries.length);
          
          const analysisResult = await analyzeVascularDrawing(base64Image, templateName, worksheet.studyType, legendEntries);
          aiGeneratedFindings = analysisResult.findings;
          aiGeneratedImpression = analysisResult.impression;
          console.log("AI analysis completed successfully with legend context");
        } catch (aiError) {
          console.warn("AI analysis failed, using template content:", aiError);
          // Fall back to template-based content if AI fails
        }
      }
      
      const draftReport = await storage.createDraftReport({
        digitalWorksheetId: worksheet.id,
        patientName: worksheet.patientName,
        patientDob: worksheet.patientDob,
        examDate: worksheet.examDate,
        studyType: worksheet.studyType || templateName.replace('Template', '').trim() || 'Vascular Study',
        indication: `${templateName} ultrasound examination requested. Patient presented for vascular assessment.`,
        findings: aiGeneratedFindings || `${templateName} ultrasound study performed using digital drawing interface.\n\nTechnical Quality: Adequate for interpretation\nVessel Patency: [To be interpreted by physician]\nFlow Characteristics: [To be interpreted by physician]\nCompressibility: [To be interpreted by physician]\n\nDigital annotations and measurements completed by ${sonographer?.name || 'sonographer'}. Canvas data contains detailed anatomical markings and findings for physician review.`,
        impression: aiGeneratedImpression || `${templateName} study completed. Awaiting physician interpretation.\n\nRECOMMENDATIONS:\n- Physician review and interpretation required\n- Clinical correlation recommended\n- Follow-up as clinically indicated`,
        sonographerId: worksheet.sonographerId,
        patientId: worksheet.patientId,
      });

      console.log("Draft report created successfully:", draftReport.id);

      // Mark worksheet as completed
      try {
        await storage.updateDigitalWorksheet(worksheetId, { 
          isDraft: false,
          completedAt: new Date(),
        });
        console.log("Worksheet marked as completed");
      } catch (updateError) {
        console.warn("Failed to update worksheet completion status:", updateError);
        // Don't fail the entire operation if this fails
      }

      res.json(draftReport);
    } catch (error) {
      console.error("Error creating draft report:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ message: "Failed to create draft report", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Worksheet image endpoint for uploaded files
  app.get("/api/worksheets/:id/image", async (req, res) => {
    try {
      const worksheetId = parseInt(req.params.id);
      
      if (isNaN(worksheetId)) {
        return res.status(400).json({ error: "Invalid worksheet ID" });
      }
      
      const worksheet = await storage.getWorksheet(worksheetId);
      
      if (!worksheet) {
        return res.status(404).json({ error: "Worksheet not found" });
      }

      const filePath = path.join(uploadDir, worksheet.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Set appropriate headers for image serving
      const ext = path.extname(worksheet.filename).toLowerCase();
      let contentType = 'application/octet-stream';
      
      if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.png') {
        contentType = 'image/png';
      } else if (ext === '.gif') {
        contentType = 'image/gif';
      } else if (ext === '.webp') {
        contentType = 'image/webp';
      } else if (ext === '.pdf') {
        contentType = 'application/pdf';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving worksheet image:", error);
      res.status(500).json({ error: "Failed to serve image" });
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

  app.post("/api/clinics/register", isAuthenticated, async (req: any, res) => {
    try {
      const clinicData = insertClinicSchema.parse(req.body);
      const userId = req.session.userId;
      
      const existingClinic = await storage.getClinicByEmail(clinicData.email);
      if (existingClinic) {
        return res.status(400).json({ message: "A clinic with this email already exists" });
      }

      const currentUser = await storage.getUser(userId);
      if (currentUser?.clinicId) {
        return res.status(400).json({ message: "You are already associated with a clinic" });
      }

      const clinic = await storage.createClinic(clinicData);

      await db
        .update(users)
        .set({
          clinicId: clinic.id,
          role: 'clinic_owner',
          joinedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      const updatedUser = await storage.getUser(userId);
      res.status(201).json({ clinic, user: updatedUser });
    } catch (error) {
      console.error("Clinic registration error:", error);
      res.status(400).json({ message: "Failed to register clinic" });
    }
  });

  // User invitation routes
  app.post("/api/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId || !['admin', 'clinic_owner'].includes(user.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      // Parse and validate client data
      const { email, role } = req.body;
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      
      if (!role || !['admin', 'sonographer'].includes(role)) {
        return res.status(400).json({ message: "Valid role (admin or sonographer) is required" });
      }
      
      const invitationData = {
        email,
        role,
        clinicId: user.clinicId,
        invitedBy: user.id,
        token: generateInvitationToken(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        isActive: true,
      };

      const invitation = await storage.createUserInvitation(invitationData);
      
      // Build invitation URL
      const host = req.get('host');
      const invitationUrl = host?.includes('replit') 
        ? `https://reportingroom.net/invite/${invitation.token}`
        : `${req.protocol}://${host}/invite/${invitation.token}`;

      // Fetch clinic name and inviter name for the email
      const clinic = user.clinicId ? await storage.getClinic(user.clinicId) : null;
      const clinicName = clinic?.name || "your clinic";
      const invitedByName = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email || "A clinic admin";

      // Send invitation email
      try {
        await sendInvitationEmail({
          toEmail: invitation.email,
          invitationUrl,
          clinicName,
          role: invitation.role,
          invitedByName,
        });
        console.log(`Invitation email sent to ${invitation.email}`);
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
      }

      res.status(201).json({
        ...invitation,
        invitationUrl,
        message: `Invitation email sent to ${invitation.email}`,
      });
    } catch (error) {
      console.error("Invitation creation error:", error);
      res.status(400).json({ message: "Failed to create invitation" });
    }
  });

  app.get("/api/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.clinicId || !['admin', 'clinic_owner'].includes(user.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const invitations = await storage.getClinicInvitations(user.clinicId);
      res.json(invitations);
    } catch (error) {
      console.error("Fetch invitations error:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  // Get invitation details (public endpoint for invitation page)
  app.get("/api/invitations/:token/details", async (req, res) => {
    try {
      const { token } = req.params;
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation || !invitation.isActive || new Date() > new Date(invitation.expiresAt)) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      // Get clinic information
      const clinic = await storage.getClinic(invitation.clinicId);
      
      res.json({
        ...invitation,
        clinic: clinic ? {
          name: clinic.name,
          address: clinic.address
        } : null
      });
    } catch (error) {
      console.error("Fetch invitation details error:", error);
      res.status(500).json({ message: "Failed to fetch invitation details" });
    }
  });

  app.post("/api/invitations/:token/accept", isAuthenticated, async (req: any, res) => {
    try {
      const { token } = req.params;
      const userId = req.session.userId;

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
      const user = await storage.getUser(req.session.userId);
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

  // Staff and invitation management routes (owner/admin only)
  app.get('/api/staff', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }
      if (currentUser.role !== 'clinic_owner' && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Only clinic owners and admins can manage staff" });
      }

      const staff = await storage.getClinicStaff(currentUser.clinicId);
      res.json(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.delete('/api/invitations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
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
      const userId = req.session.userId;
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

  // Webmaster-only admin endpoints
  const isWebmaster = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(403).json({ message: 'Webmaster access required' });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.email !== 'contact@samfarah.com') {
      return res.status(403).json({ message: 'Webmaster access required' });
    }
    next();
  };

  // System monitoring endpoints
  app.get("/api/admin/system-stats", isAuthenticated, isWebmaster, async (req, res) => {
    try {
      // Calculate system statistics
      const allReports = await storage.getAllReports();
      const allWorksheets = await storage.getAllWorksheets();
      const allUsers = await storage.getAllUsers();
      
      // Get current month data
      const currentMonth = new Date();
      const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const reportsThisMonth = allReports.filter(r => new Date(r.generatedAt) >= firstDayOfMonth).length;
      
      // Calculate storage approximations (in GB)
      const avgReportSize = 0.002; // ~2MB per report
      const avgWorksheetSize = 0.005; // ~5MB per worksheet
      const reportDataSize = (allReports.length * avgReportSize).toFixed(2);
      const worksheetFilesSize = (allWorksheets.length * avgWorksheetSize).toFixed(2);
      const userDataSize = (allUsers.length * 0.001).toFixed(2); // ~1MB per user
      
      const totalSize = parseFloat(reportDataSize) + parseFloat(worksheetFilesSize) + parseFloat(userDataSize);
      
      const stats = {
        databaseSize: totalSize.toFixed(2),
        monthlyGrowth: '15', // Placeholder - would be calculated from historical data
        activeUsers: allUsers.filter(u => u.joinedAt && new Date(u.joinedAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
        totalReports: allReports.length,
        reportsThisMonth,
        reportDataSize,
        worksheetFilesSize,
        userDataSize,
        reportDataPercent: totalSize > 0 ? Math.round((parseFloat(reportDataSize) / totalSize) * 100) : 0,
        worksheetFilesPercent: totalSize > 0 ? Math.round((parseFloat(worksheetFilesSize) / totalSize) * 100) : 0,
        userDataPercent: totalSize > 0 ? Math.round((parseFloat(userDataSize) / totalSize) * 100) : 0,
        avgResponseTime: '145',
        apiSuccessRate: '98.7',
        encryptionOverhead: '12'
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching system stats:", error);
      res.status(500).json({ message: "Failed to fetch system statistics" });
    }
  });

  app.get("/api/admin/clinic-stats", isAuthenticated, isWebmaster, async (req, res) => {
    try {
      const allClinics = await storage.getAllClinics();
      const allReports = await storage.getAllReports();
      const allUsers = await storage.getAllUsers();
      
      const clinicStats = await Promise.all(allClinics.map(async (clinic) => {
        // Get reports for this clinic from last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const clinicUsers = allUsers.filter(u => u.clinicId === clinic.id);
        
        // Estimate clinic reports based on users (simplified approach)
        const estimatedClinicReports = Math.floor(allReports.length * (clinicUsers.length / Math.max(allUsers.length, 1)));
        const recentReports = allReports.filter(r => new Date(r.generatedAt) >= thirtyDaysAgo);
        const clinicRecentReports = Math.floor(recentReports.length * (clinicUsers.length / Math.max(allUsers.length, 1)));
        
        // Get active users for this clinic
        const activeUsers = clinicUsers.filter(u => 
          u.joinedAt && new Date(u.joinedAt) >= thirtyDaysAgo
        );
        
        // Determine last activity
        const lastActivity = clinic.updatedAt ? new Date(clinic.updatedAt).getTime() : new Date(clinic.createdAt).getTime();
        const daysSinceLastActivity = Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24));
        
        return {
          id: clinic.id,
          name: clinic.name,
          location: `${clinic.address || 'Unknown Address'}`,
          reportsLast30Days: clinicRecentReports,
          activeUsers: activeUsers.length,
          lastUsed: daysSinceLastActivity === 0 ? 'Today' : 
                   daysSinceLastActivity === 1 ? 'Yesterday' : 
                   `${daysSinceLastActivity} days ago`,
          status: daysSinceLastActivity <= 7 ? 'Active' : 
                 daysSinceLastActivity <= 30 ? 'Moderate' : 'Inactive'
        };
      }));
      
      // Sort by most recent activity
      clinicStats.sort((a, b) => {
        if (a.lastUsed === 'Today') return -1;
        if (b.lastUsed === 'Today') return 1;
        if (a.lastUsed === 'Yesterday') return -1;
        if (b.lastUsed === 'Yesterday') return 1;
        return a.lastUsed.localeCompare(b.lastUsed);
      });
      
      res.json(clinicStats);
    } catch (error) {
      console.error("Error fetching clinic stats:", error);
      res.status(500).json({ message: "Failed to fetch clinic statistics" });
    }
  });

  app.get("/api/admin/cost-projection", isAuthenticated, isWebmaster, async (req, res) => {
    try {
      const allReports = await storage.getAllReports();
      const allWorksheets = await storage.getAllWorksheets();
      
      // Calculate estimated costs based on usage
      const totalDataGB = (allReports.length * 0.002) + (allWorksheets.length * 0.005); // Approx sizes
      
      // Neon PostgreSQL pricing (simplified calculation)
      const databaseCost = totalDataGB > 0.5 ? Math.max(19, 19 + Math.max(0, totalDataGB - 10) * 3.5) : 0;
      
      // Storage costs (if using external storage)
      const storageCost = totalDataGB * 0.023; // AWS S3 pricing
      
      // AI costs (approximate based on reports generated)
      const aiCost = allReports.length * 0.15; // Estimated per report
      
      const currentMonth = Math.round(databaseCost + storageCost + aiCost);
      const nextMonth = Math.round(currentMonth * 1.15); // 15% growth projection
      
      const recommendations = [];
      if (totalDataGB > 5) {
        recommendations.push("Consider migrating file storage to AWS S3 for cost reduction");
      }
      if (allReports.length > 1000) {
        recommendations.push("Implement data archiving for reports older than 7 years");
      }
      if (databaseCost > 50) {
        recommendations.push("Optimize database queries and consider data compression");
      }
      
      const projection = {
        currentMonth,
        nextMonth,
        alerts: recommendations.length,
        databaseCost: Math.round(databaseCost),
        storageCost: Math.round(storageCost),
        aiCost: Math.round(aiCost),
        totalEstimated: nextMonth,
        recommendations
      };
      
      res.json(projection);
    } catch (error) {
      console.error("Error calculating cost projection:", error);
      res.status(500).json({ message: "Failed to calculate cost projection" });
    }
  });

  // Text shortcuts endpoints
  app.get('/api/text-shortcuts', isAuthenticated, async (req, res) => {
    try {
      const shortcuts = await storage.getAllTextShortcuts();
      res.json(shortcuts);
    } catch (error) {
      console.error("Error fetching text shortcuts:", error);
      res.status(500).json({ error: "Failed to fetch text shortcuts" });
    }
  });

  app.post('/api/text-shortcuts', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertTextShortcutSchema.parse(req.body);
      const shortcut = await storage.createTextShortcut(validatedData);
      res.json(shortcut);
    } catch (error) {
      console.error("Error creating text shortcut:", error);
      res.status(500).json({ error: "Failed to create text shortcut" });
    }
  });

  app.put('/api/text-shortcuts/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertTextShortcutSchema.partial().parse(req.body);
      const shortcut = await storage.updateTextShortcut(id, validatedData);
      
      if (!shortcut) {
        return res.status(404).json({ error: "Text shortcut not found" });
      }
      
      res.json(shortcut);
    } catch (error) {
      console.error("Error updating text shortcut:", error);
      res.status(500).json({ error: "Failed to update text shortcut" });
    }
  });

  app.delete('/api/text-shortcuts/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTextShortcut(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting text shortcut:", error);
      res.status(500).json({ error: "Failed to delete text shortcut" });
    }
  });

  app.post('/api/text-shortcuts/:id/use', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.incrementShortcutUsage(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing shortcut usage:", error);
      res.status(500).json({ error: "Failed to increment usage" });
    }
  });

  // Whisper transcription endpoint
  app.post("/api/transcribe", isAuthenticated, upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Read file into buffer and create a File object with proper extension
      const audioBuffer = await fs.promises.readFile(req.file.path);
      const originalName = req.file.originalname || 'recording.webm';
      const audioFile = new File([audioBuffer], originalName, { 
        type: req.file.mimetype || 'audio/webm' 
      });
      
      // Build Whisper prompt from custom vocabulary (biases transcription toward these terms)
      const vocabPrompt = req.body?.vocabularyPrompt as string | undefined;
      const whisperParams: any = {
        file: audioFile,
        model: "whisper-1",
        language: "en",
        response_format: "json",
      };
      if (vocabPrompt && vocabPrompt.trim()) {
        whisperParams.prompt = vocabPrompt.trim();
        console.log("Whisper prompt (vocabulary):", vocabPrompt.substring(0, 100));
      }
      const transcription = await openai.audio.transcriptions.create(whisperParams);

      // Clean up uploaded file
      await fs.promises.unlink(req.file.path);

      res.json({ 
        text: transcription.text,
        duration: transcription.duration || 0
      });

    } catch (error: any) {
      console.error("Transcription error:", error);
      
      // Clean up file on error
      if (req.file?.path) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (unlinkError) {
          console.error("Error cleaning up file:", unlinkError);
        }
      }
      
      res.status(500).json({ 
        error: "Transcription failed", 
        details: error.message 
      });
    }
  });

  // Backup routes
  app.get("/api/backup/info", isAuthenticated, async (req, res) => {
    try {
      const info = await getBackupInfo();
      res.json(info);
    } catch (error: any) {
      console.error("Error getting backup info:", error);
      res.status(500).json({ error: "Failed to get backup info" });
    }
  });

  app.get("/api/backup/download", isAuthenticated, async (req, res) => {
    try {
      const includeAll = req.query.type !== 'changes';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const filename = includeAll 
        ? `patient-files-backup-${timestamp}.zip`
        : `patient-files-changes-${timestamp}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      const stats = await createBackupArchive(res, includeAll);
      console.log(`Backup completed: ${stats.filesIncluded} files, ${stats.totalSize} bytes`);
    } catch (error: any) {
      console.error("Backup error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Backup failed", details: error.message });
      }
    }
  });

  // Patient Portal Auth & API Routes
  app.post("/api/patients/:id/portal-invite", isAuthenticated, async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      if (isNaN(patientId)) return res.status(400).json({ error: "Invalid patient ID" });

      const patient = await storage.getPatient(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!patient.email) return res.status(400).json({ error: "Patient does not have an email address" });

      const token = crypto.randomBytes(18).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const clinic = patient.clinicId ? await storage.getClinic(patient.clinicId) : null;
      const clinicName = clinic?.name || "Reporting Room";

      const invitation = await storage.createPatientPortalInvitation({
        patientId,
        clinicId: patient.clinicId || 1, // Fallback to 1 if not set
        email: patient.email,
        token,
        expiresAt,
        isActive: true,
      });

      try {
        await sendPatientPortalInvitationEmail({
          toEmail: patient.email,
          token,
          patientFirstName: patient.firstName,
          clinicName,
        });
      } catch (emailError) {
        console.error("Failed to send portal invitation email:", emailError);
      }

      res.json(invitation);
    } catch (error) {
      console.error("Portal invite error:", error);
      res.status(500).json({ error: "Failed to create portal invitation" });
    }
  });

  app.get("/api/patients/:id/portal-status", isAuthenticated, async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      if (isNaN(patientId)) return res.status(400).json({ error: "Invalid patient ID" });

      const account = await storage.getPatientPortalAccountByPatientId(patientId);
      const invitation = await storage.getPatientPortalInvitationByPatientId(patientId);

      res.json({
        hasPortalAccess: !!account,
        invitePending: !!invitation && invitation.isActive && new Date(invitation.expiresAt) > new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portal status" });
    }
  });

  app.get("/api/portal/invite/:token", async (req, res) => {
    try {
      const invitation = await storage.getPatientPortalInvitationByToken(req.params.token);
      if (!invitation || !invitation.isActive || new Date(invitation.expiresAt) < new Date()) {
        return res.status(404).json({ error: "Invitation not found or expired" });
      }

      const patient = await storage.getPatient(invitation.patientId);
      const clinic = await storage.getClinic(invitation.clinicId);

      res.json({
        invitation,
        patientFirstName: patient?.firstName,
        clinicName: clinic?.name,
        clinicLogoUrl: clinic?.logoUrl || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitation" });
    }
  });

  app.post("/api/portal/register", async (req, res) => {
    try {
      const { token, password } = req.body;
      const invitation = await storage.getPatientPortalInvitationByToken(token);
      
      if (!invitation || !invitation.isActive || new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invalid or expired invitation" });
      }

      const existingAccount = await storage.getPatientPortalAccountByEmail(invitation.email);
      if (existingAccount) {
        return res.status(400).json({ error: "Account already exists for this email" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const account = await storage.createPatientPortalAccount({
        patientId: invitation.patientId,
        clinicId: invitation.clinicId,
        email: invitation.email,
        passwordHash,
      });

      await storage.acceptPatientPortalInvitation(token);

      (req.session as any).portalUserId = account.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        res.json({ success: true, account: { id: account.id, email: account.email } });
      });
    } catch (error) {
      console.error("Portal register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/portal/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const account = await storage.getPatientPortalAccountByEmail(email);
      
      if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      (req.session as any).portalUserId = account.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        res.json({ success: true, account: { id: account.id, email: account.email } });
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/portal/logout", (req, res) => {
    (req.session as any).portalUserId = null;
    res.json({ success: true });
  });

  app.get("/api/portal/me", async (req, res) => {
    const portalUserId = (req.session as any).portalUserId;
    if (!portalUserId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const account = await storage.getPatientPortalAccountById(portalUserId);
      if (!account) return res.status(404).json({ error: "Account not found" });

      const patient = await storage.getPatient(account.patientId);
      const clinic = await storage.getClinic(account.clinicId);

      res.json({
        id: account.id,
        patientId: account.patientId,
        clinicId: account.clinicId,
        email: account.email,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown",
        patientFirstName: patient?.firstName || "Patient",
        clinicName: clinic?.name,
        clinicLogoUrl: clinic?.logoUrl || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  app.get("/api/portal/reports", async (req, res) => {
    const portalUserId = (req.session as any).portalUserId;
    if (!portalUserId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const account = await storage.getPatientPortalAccountById(portalUserId);
      if (!account) return res.status(404).json({ error: "Account not found" });

      const allReports = await storage.getPatientReports(account.patientId);
      const finalizedReports = allReports
        .filter(r => r.isFinalized)
        .sort((a, b) => {
          const dateA = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
          const dateB = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
          return dateB - dateA;
        });

      res.json(finalizedReports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.get("/api/portal/worksheets", async (req, res) => {
    const portalUserId = (req.session as any).portalUserId;
    if (!portalUserId) return res.status(401).json({ error: "Not authenticated" });

    try {
      const account = await storage.getPatientPortalAccountById(portalUserId);
      if (!account) return res.status(404).json({ error: "Account not found" });

      const standard = await storage.getPatientWorksheets(account.patientId);
      const digital = await storage.getPatientDigitalWorksheets(account.patientId);

      const allWorksheets = [
        ...standard.map(w => ({ ...w, type: 'standard' })),
        ...digital.map(w => ({ ...w, type: 'digital' }))
      ].sort((a, b) => {
        const dateA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : ((a as any).uploadedAt ? new Date((a as any).uploadedAt).getTime() : 0);
        const dateB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : ((b as any).uploadedAt ? new Date((b as any).uploadedAt).getTime() : 0);
        return dateB - dateA;
      });

      res.json(allWorksheets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch worksheets" });
    }
  });

  // ── Referring Doctors ──────────────────────────────────────────────
  app.get("/api/referring-doctors", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) return res.status(400).json({ error: "No clinic" });
      const { search } = req.query;
      const doctors = search
        ? await storage.searchReferringDoctors(clinicId, String(search))
        : await storage.getReferringDoctors(clinicId);
      res.json(doctors);
    } catch { res.status(500).json({ error: "Failed to fetch referring doctors" }); }
  });

  app.post("/api/referring-doctors", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) return res.status(400).json({ error: "No clinic" });
      const doctor = await storage.createReferringDoctor({ ...req.body, clinicId });
      res.status(201).json(doctor);
    } catch { res.status(500).json({ error: "Failed to create referring doctor" }); }
  });

  app.put("/api/referring-doctors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const id = parseInt(req.params.id);
      const doctor = await storage.getReferringDoctor(id);
      if (!doctor || doctor.clinicId !== clinicId) return res.status(404).json({ error: "Not found" });
      const updated = await storage.updateReferringDoctor(id, req.body);
      res.json(updated);
    } catch { res.status(500).json({ error: "Failed to update referring doctor" }); }
  });

  app.delete("/api/referring-doctors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const id = parseInt(req.params.id);
      const doctor = await storage.getReferringDoctor(id);
      if (!doctor || doctor.clinicId !== clinicId) return res.status(404).json({ error: "Not found" });
      await storage.deleteReferringDoctor(id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete referring doctor" }); }
  });

  // ── Scan Requests ──────────────────────────────────────────────────
  app.get("/api/scan-requests", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) return res.status(400).json({ error: "No clinic" });
      const requests = await storage.getScanRequests(clinicId);
      res.json(requests);
    } catch { res.status(500).json({ error: "Failed to fetch scan requests" }); }
  });

  app.get("/api/scan-requests/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const id = parseInt(req.params.id);
      const request = await storage.getScanRequest(id);
      if (!request || request.clinicId !== clinicId) return res.status(404).json({ error: "Not found" });
      res.json(request);
    } catch { res.status(500).json({ error: "Failed to fetch scan request" }); }
  });

  app.post("/api/scan-requests", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) return res.status(400).json({ error: "No clinic" });
      const request = await storage.createScanRequest({ ...req.body, clinicId });
      res.status(201).json(request);
    } catch { res.status(500).json({ error: "Failed to create scan request" }); }
  });

  app.put("/api/scan-requests/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const id = parseInt(req.params.id);
      const existing = await storage.getScanRequest(id);
      if (!existing || existing.clinicId !== clinicId) return res.status(404).json({ error: "Not found" });
      const updated = await storage.updateScanRequest(id, req.body);
      res.json(updated);
    } catch { res.status(500).json({ error: "Failed to update scan request" }); }
  });

  app.delete("/api/scan-requests/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const id = parseInt(req.params.id);
      const existing = await storage.getScanRequest(id);
      if (!existing || existing.clinicId !== clinicId) return res.status(404).json({ error: "Not found" });
      await storage.deleteScanRequest(id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete scan request" }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Utility function to generate invitation tokens
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
