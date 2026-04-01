import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { setupAuth, isAuthenticated } from "./auth";
import { sendInvitationEmail, sendReportEmail, sendAppointmentReminder, sendPatientRegistrationEmail, sendExternalReferralNotification, sendPatientBookingConfirmation } from "./email";
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
import { saveFileToDB, getFileFromDB, detectMimeType, backfillFilesToDB } from "./services/fileStorage";
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
  // Backfill any existing on-disk files to DB so they survive future resets
  backfillFilesToDB(uploadDir).catch(() => {});

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
      saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname).catch(console.error);
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
      const userId = (req as any).user?.id ?? null;
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

      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const clinic = await storage.getClinic(user.clinicId);
      if (!clinic) return res.status(404).json({ error: "Clinic not found" });

      const { randomUUID } = await import("crypto");
      const trackingToken = randomUUID();

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
        reminderInstructions: await (async () => {
          if (appointment.scanType) {
            const specific = await storage.getScanPrepInstruction(user.clinicId!, appointment.scanType);
            if (specific?.instructions) return specific.instructions;
          }
          return clinic.reminderInstructions || null;
        })(),
        trackingToken,
      });

      await storage.createReminderLog({
        appointmentId: id,
        clinicId: user.clinicId,
        patientId: appointment.patientId ?? null,
        recipientEmail: appointment.patientEmail,
        trackingToken,
      });

      console.log(`Appointment reminder sent to ${appointment.patientEmail} for appointment ${id}`);
      res.json({ success: true, sentTo: appointment.patientEmail });
    } catch (error: any) {
      console.error("Send reminder error:", error);
      res.status(500).json({ error: error?.message || "Failed to send reminder" });
    }
  });

  // Email open tracking pixel
  app.get("/api/reminders/:token/pixel.gif", async (req, res) => {
    try {
      await storage.markReminderOpened(req.params.token);
    } catch {}
    // 1×1 transparent GIF
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store", "Pragma": "no-cache" });
    res.end(gif);
  });

  // Get reminder logs for an appointment
  app.get("/api/appointments/:id/reminder-logs", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getReminderLogsByAppointment(parseInt(req.params.id));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reminder logs" });
    }
  });

  // Get reminder logs for a patient
  app.get("/api/patients/:id/reminder-logs", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getReminderLogsByPatient(parseInt(req.params.id));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reminder logs" });
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
      const clinicId = (req as any).user?.clinicId ?? null;
      const eventData = {
        ...req.body,
        clinicId,
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

      saveFileToDB(file.filename, file.path, file.mimetype, file.originalname).catch(console.error);

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
      const user = await storage.getUser(req.session.userId!);
      const patient = await storage.createPatient({
        ...req.body,
        clinicId: user?.clinicId ?? null,
      });
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

  // Patient self-registration: send registration form link
  app.post("/api/patients/:id/send-registration", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!patient.email) return res.status(400).json({ error: "No email address on file for this patient" });

      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const clinic = await storage.getClinic(user.clinicId);
      if (!clinic) return res.status(404).json({ error: "Clinic not found" });

      // Generate a secure token
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await storage.createPatientRegistrationToken(id, user.clinicId, token, expiresAt);

      // Build the registration URL
      const host = req.headers.origin || `${req.protocol}://${req.headers.host}`;
      const registrationUrl = `${host}/patient-registration/${token}`;

      await sendPatientRegistrationEmail({
        toEmail: patient.email,
        patientName: `${patient.firstName} ${patient.lastName}`,
        registrationUrl,
        clinicName: clinic.name,
        clinicLogoUrl: clinic.logoUrl || null,
        clinicPhone: clinic.phone || null,
      });

      res.json({ success: true, sentTo: patient.email });
    } catch (error: any) {
      console.error("Send registration error:", error);
      res.status(500).json({ error: error?.message || "Failed to send registration form" });
    }
  });

  // Public: load patient registration form data from token
  app.get("/api/patient-registration/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const record = await storage.getPatientRegistrationToken(token);
      if (!record) return res.status(404).json({ error: "Registration link not found" });
      if (record.status === "completed") return res.status(410).json({ error: "This registration link has already been used" });
      if (new Date() > record.expiresAt) return res.status(410).json({ error: "This registration link has expired" });

      const patient = await storage.getPatient(record.patientId);
      const clinic = await storage.getClinic(record.clinicId);
      if (!patient || !clinic) return res.status(404).json({ error: "Record not found" });

      res.json({
        clinicName: clinic.name,
        clinicLogoUrl: clinic.logoUrl || null,
        clinicPhone: clinic.phone || null,
        patient: {
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          phone: patient.phone,
          email: patient.email,
          medicareNumber: patient.medicareNumber,
          medicareIrn: patient.medicareIrn,
          medicareExpiry: patient.medicareExpiry,
          emergencyContactName: patient.emergencyContactName,
          emergencyContactPhone: patient.emergencyContactPhone,
        },
      });
    } catch (error) {
      console.error("Get registration form error:", error);
      res.status(500).json({ error: "Failed to load registration form" });
    }
  });

  // Public: submit patient registration form
  app.post("/api/patient-registration/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const record = await storage.getPatientRegistrationToken(token);
      if (!record) return res.status(404).json({ error: "Registration link not found" });
      if (record.status === "completed") return res.status(410).json({ error: "This registration link has already been used" });
      if (new Date() > record.expiresAt) return res.status(410).json({ error: "This registration link has expired" });

      const { firstName, lastName, dateOfBirth, phone, email, medicareNumber, medicareIrn, medicareExpiry, emergencyContactName, emergencyContactPhone } = req.body;

      await storage.updatePatient(record.patientId, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        dateOfBirth: dateOfBirth || undefined,
        phone: phone || undefined,
        email: email || undefined,
        medicareNumber: medicareNumber || undefined,
        medicareIrn: medicareIrn || undefined,
        medicareExpiry: medicareExpiry || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
      });

      await storage.completePatientRegistrationToken(token);
      res.json({ success: true });
    } catch (error) {
      console.error("Submit registration error:", error);
      res.status(500).json({ error: "Failed to submit registration" });
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
      // Await DB backup before responding — prevents file loss on server restart
      await saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname);

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
      let imageMimeType: string;
      
      // Handle PDF files by converting to image first
      console.log("Checking if file is PDF. Original name:", worksheet.originalName, "isPDF:", isPdfFile(worksheet.originalName));
      if (isPdfFile(worksheet.originalName)) {
        console.log("Converting PDF to image for OCR processing...");
        base64Image = await convertPdfToImage(filePath);
        console.log("PDF converted successfully, base64 length:", base64Image.length);
        imageMimeType = 'image/png'; // pdftoppm always outputs PNG
      } else {
        // Handle regular image files — detect actual MIME type from file content
        const fileBuffer = fs.readFileSync(filePath);
        base64Image = fileBuffer.toString('base64');
        imageMimeType = detectMimeType(fileBuffer);
        console.log("Image file read successfully, base64 length:", base64Image.length, "mime:", imageMimeType);
      }

      // Extract patient data using OCR
      console.log("Starting OCR processing...");
      const ocrResult = await extractPatientDataFromWorksheet(base64Image, imageMimeType);
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
      const userId = req.session.userId!;
      
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

  // Sonographer marks report as complete (before doctor finalises)
  app.post("/api/reports/:id/sonographer-complete", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report ID" });
      const user = await storage.getUser(req.session.userId!);
      const completedBy = user?.name || user?.email || req.session.userId!;
      const report = await storage.sonographerCompleteReport(id, completedBy);
      if (!report) return res.status(404).json({ error: "Report not found" });
      res.json(report);
    } catch (error) {
      console.error("Error marking sonographer complete:", error);
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  // Archive a distributed report workflow
  app.post("/api/reports/:id/archive", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report ID" });
      const report = await storage.archiveReport(id);
      if (!report) return res.status(404).json({ error: "Report not found" });
      res.json(report);
    } catch (error) {
      console.error("Error archiving report:", error);
      res.status(500).json({ error: "Failed to archive report" });
    }
  });

  // Amendment endpoint
  app.post("/api/reports/:id/amend", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid report ID" });
      }

      const userId = req.session.userId!;
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

      const { toEmail, toName, ccEmails, subject, reportHtml, pdfBase64, worksheetPdfBase64, patientName: bodyPatientName } = req.body;
      if (!toEmail || !reportHtml) {
        return res.status(400).json({ error: "toEmail and reportHtml are required" });
      }

      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const user = await storage.getUser(req.session.userId!);
      const clinic = user?.clinicId ? await storage.getClinic(user.clinicId) : null;
      const clinicName = clinic?.name || "Nexus Vascular Imaging";
      const resolvedPatientName = report.patientName || bodyPatientName || "Patient";

      await sendReportEmail({
        toEmail,
        toName: toName || toEmail,
        ccEmails: Array.isArray(ccEmails) ? ccEmails : [],
        subject: subject || `Medical Report — ${resolvedPatientName}`,
        reportHtml,
        clinicName,
        patientName: resolvedPatientName,
        pdfBase64: pdfBase64 || undefined,
        worksheetPdfBase64: worksheetPdfBase64 || undefined,
      });

      // Auto-log the distribution (with worksheet flag)
      await storage.createReportDistribution({
        reportId: id,
        clinicId: user?.clinicId ?? null,
        method: "email",
        recipientName: toName || null,
        recipientEmail: toEmail,
        notes: null,
        worksheetIncluded: !!worksheetPdfBase64,
        confirmedAt: new Date(),
        confirmedBy: user?.email || null,
      });

      res.json({ success: true, message: `Report sent to ${toEmail}` });
    } catch (error: any) {
      console.error("Send report email error:", error);
      res.status(500).json({ error: "Failed to send email", details: error?.message });
    }
  });

  // ── Send Report via Fax (SIPCity fax-to-email gateway) ──
  app.post("/api/reports/:id/send-fax", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid report ID" });

      const { faxNumber, pdfBase64, patientName: bodyPatientName } = req.body;
      if (!faxNumber) return res.status(400).json({ error: "faxNumber is required" });

      // Sanitise: digits only, strip leading 0 if present (we prepend 61)
      const digitsOnly = String(faxNumber).replace(/\D/g, "").replace(/^0/, "");
      if (!digitsOnly) return res.status(400).json({ error: "Invalid fax number" });

      const faxEmail = `613${digitsOnly}@fax.sipcity.com.au`;

      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const user = await storage.getUser(req.session.userId!);
      const clinic = user?.clinicId ? await storage.getClinic(user.clinicId) : null;
      const clinicName = clinic?.name || "Nexus Vascular Imaging";
      const resolvedPatientName = report.patientName || bodyPatientName || "Patient";

      const sgMail = (await import("@sendgrid/mail")).default;
      sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

      const message: any = {
        to: faxEmail,
        from: { email: "admin@nexusvascularimaging.com", name: clinicName },
        subject: `Medical Report — ${resolvedPatientName}`,
        text: `Please find attached the medical report for ${resolvedPatientName} from ${clinicName}.`,
        html: `<p>Please find attached the medical report for <strong>${resolvedPatientName}</strong> from ${clinicName}.</p>`,
        attachments: [] as any[],
      };

      if (pdfBase64) {
        message.attachments.push({
          content: pdfBase64,
          filename: `Report_${resolvedPatientName.replace(/\s+/g, "_")}.pdf`,
          type: "application/pdf",
          disposition: "attachment",
        });
      }

      await sgMail.send(message);

      await storage.createReportDistribution({
        reportId: id,
        clinicId: user?.clinicId ?? null,
        method: "fax",
        recipientName: `Fax: ${faxNumber}`,
        recipientEmail: faxEmail,
        notes: null,
        worksheetIncluded: false,
        confirmedAt: new Date(),
        confirmedBy: user?.email || null,
      });

      res.json({ success: true, faxEmail });
    } catch (error: any) {
      console.error("Send fax error:", error?.response?.body || error);
      res.status(500).json({ error: "Failed to send fax", details: error?.message });
    }
  });

  // ── Scan Type Content Templates ──
  app.get("/api/content-templates", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.json([]);
      const templates = await storage.getScanTypeContentTemplates(user.clinicId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content templates" });
    }
  });

  app.put("/api/content-templates/:scanType", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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

      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      let imageMimeType: string;
      
      // Handle PDF files by converting to image first
      console.log("Checking if file is PDF. Original name:", worksheet.originalName, "isPDF:", isPdfFile(worksheet.originalName));
      if (isPdfFile(worksheet.originalName)) {
        console.log("Converting PDF to image for report generation...");
        base64Image = await convertPdfToImage(filePath);
        console.log("PDF converted successfully, base64 length:", base64Image.length);
        imageMimeType = 'image/png'; // pdftoppm always outputs PNG
      } else {
        // Handle regular image files — detect actual MIME type from file content
        const fileBuffer = fs.readFileSync(filePath);
        base64Image = fileBuffer.toString('base64');
        imageMimeType = detectMimeType(fileBuffer);
        console.log("Image file read successfully, base64 length:", base64Image.length, "mime:", imageMimeType);
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
              const reportMimeType = detectMimeType(reportBuffer);
              
              // Use OCR to extract text from the training report image
              const ocrResult = await extractTextFromImage(base64Report, reportMimeType);
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
      const effectiveScanType = contentTemplateScanType || (worksheet as any).studyType;
      if (user?.clinicId && effectiveScanType) {
        contentTemplate = await storage.getScanTypeContentTemplate(user.clinicId, effectiveScanType);
        if (contentTemplateScanType) {
          console.log(`Using client-selected content template for scan type: ${contentTemplateScanType}`);
        }
      }

      const reportData = await generateReportFromWorksheet(base64Image, ocrData, trainingData, imageMimeType, contentTemplate);
      console.log("Report generated successfully with training context:", reportData.studyType);
      
      // Create report in storage — inherit patientId from the worksheet if already linked
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
        logoUrl: clinic?.logoUrl || logoUrl,
        patientId: worksheet.patientId ?? null,
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
      const userId = req.session.userId!;
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
      const user = await storage.getUser(req.session.userId!);
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
                      type: 'png',
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

      saveFileToDB(worksheetFile.filename, worksheetFile.path, worksheetFile.mimetype, worksheetFile.originalname).catch(console.error);
      saveFileToDB(reportFile.filename, reportFile.path, reportFile.mimetype, reportFile.originalname).catch(console.error);

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
      const user = await storage.getUser(req.session.userId!);
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
      saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname).catch(console.error);
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname).catch(console.error);

      // Update clinic with new logo URL
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const settings = await storage.getScanDurationSettings(user.clinicId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scan duration settings" });
    }
  });

  app.put("/api/scan-durations", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const { settings } = req.body;
      if (!Array.isArray(settings)) return res.status(400).json({ error: "Invalid settings" });
      const result = await storage.upsertScanDurationSettings(user.clinicId, settings);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to save scan duration settings" });
    }
  });

  // Scan prep instructions (per scan type, per clinic)
  app.get("/api/scan-prep-instructions", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const rows = await storage.getScanPrepInstructions(user.clinicId);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scan prep instructions" });
    }
  });

  app.put("/api/scan-prep-instructions", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const { scanType, instructions } = req.body;
      if (!scanType || typeof scanType !== "string") return res.status(400).json({ error: "scanType required" });
      if (instructions === "" || instructions == null) {
        await storage.deleteScanPrepInstruction(user.clinicId, scanType);
        return res.json({ deleted: true });
      }
      const row = await storage.upsertScanPrepInstruction(user.clinicId, scanType, instructions);
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: "Failed to save scan prep instruction" });
    }
  });

  // Update clinic info
  app.put("/api/clinic/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
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
      
      saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname).catch(console.error);
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
          
          const analysisResult = await analyzeVascularDrawing(base64Image, templateName, (worksheet as any).studyType || '', legendEntries);
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

      // Determine content type from extension (used for both paths)
      const ext = path.extname(worksheet.filename).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.pdf') contentType = 'application/pdf';

      // Fast path: file on disk
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.sendFile(filePath);
      }

      // Fallback: restore from database blob
      const blob = await getFileFromDB(worksheet.filename);
      if (!blob) {
        return res.status(404).json({ error: "File not found" });
      }

      // Restore to disk for future requests
      try { fs.writeFileSync(filePath, blob.data); } catch {}

      const resolvedType = blob.mimeType ?? detectMimeType(blob.data) ?? contentType;
      res.setHeader('Content-Type', resolvedType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.send(blob.data);
    } catch (error) {
      console.error("Error serving worksheet image:", error);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  // Serve uploaded files — try local disk first, fall back to database
  app.use('/uploads', async (req, res, _next) => {
    const filename = req.path.replace(/^\//, "");
    const filePath = path.join(uploadDir, filename);

    // Fast path: file exists on disk
    if (fs.existsSync(filePath)) {
      try {
        const fd = fs.openSync(filePath, 'r');
        const magic = Buffer.alloc(8);
        fs.readSync(fd, magic, 0, 8, 0);
        fs.closeSync(fd);
        res.setHeader('Content-Type', detectMimeType(magic));
        return res.sendFile(filePath);
      } catch {
        return res.sendFile(filePath);
      }
    }

    // Fallback: retrieve from database
    const blob = await getFileFromDB(filename);
    if (!blob) {
      return res.status(404).json({ error: "File not found" });
    }

    // Restore file to disk for next request (cache)
    try { fs.writeFileSync(filePath, blob.data); } catch {}

    const mimeType = blob.mimeType ?? detectMimeType(blob.data);
    res.setHeader('Content-Type', mimeType);
    return res.send(blob.data);
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
        saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname).catch(console.error);
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
        saveFileToDB(req.file.filename, req.file.path, req.file.mimetype, req.file.originalname).catch(console.error);
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
      const userId = req.session.userId!;
      
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
      const user = await storage.getUser(req.session.userId!);
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
      const user = await storage.getUser(req.session.userId!);
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
      const userId = req.session.userId!;

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
      const user = await storage.getUser(req.session.userId!);
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
      const userId = req.session.userId!;
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
      const userId = req.session.userId!;
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
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      const staffId = req.params.id;
      
      if (!currentUser?.clinicId) {
        return res.status(400).json({ message: "User not associated with a clinic" });
      }
      if (!["clinic_owner", "admin"].includes(currentUser.role || "")) {
        return res.status(403).json({ message: "Only clinic owners and admins can remove staff" });
      }
      if (staffId === userId) {
        return res.status(400).json({ message: "You cannot remove yourself" });
      }

      await storage.deactivateStaffMember(staffId, currentUser.clinicId);
      res.json({ message: "Staff member removed successfully" });
    } catch (error) {
      console.error("Error removing staff:", error);
      res.status(500).json({ message: "Failed to remove staff member" });
    }
  });

  // Webmaster-only admin endpoints
  const isWebmaster = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(403).json({ message: 'Webmaster access required' });
    }
    const user = await storage.getUser(req.session.userId!);
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
        const lastActivity = clinic.updatedAt ? new Date(clinic.updatedAt).getTime() : new Date(clinic.createdAt ?? Date.now()).getTime();
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
        duration: (transcription as any).duration || 0
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

  // Save scan request HTML to patient file
  app.post("/api/scan-requests/:id/save-to-patient", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const id = parseInt(req.params.id);
      const { patientId, htmlContent } = req.body;

      if (!patientId || !htmlContent) {
        return res.status(400).json({ error: "patientId and htmlContent are required" });
      }

      const existing = await storage.getScanRequest(id);
      if (!existing || existing.clinicId !== clinicId) {
        return res.status(404).json({ error: "Scan request not found" });
      }

      const filename = crypto.randomBytes(16).toString("hex");
      const originalName = `Scan_Request_REQ-${String(id).padStart(5, "0")}.html`;
      const filePath = path.join(uploadDir, filename);

      fs.writeFileSync(filePath, Buffer.from(htmlContent, "utf8"));
      await saveFileToDB(filename, filePath, "text/html", originalName);

      const today = new Date().toISOString().split("T")[0];
      const document = await storage.createPatientDocument({
        patientId,
        title: `Scan Request REQ-${String(id).padStart(5, "0")}`,
        filename,
        originalName,
        fileUrl: `/uploads/${filename}`,
        documentDate: today,
        notes: `Scan request for: ${(existing.scanTypes ?? []).join(", ")}`,
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error saving scan request to patient file:", error);
      res.status(500).json({ error: "Failed to save to patient file" });
    }
  });

  // ─── REFERRAL SYSTEM ────────────────────────────────────────────────────────

  // Referrer role middleware
  const isReferrer = async (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role !== "referrer") return res.status(403).json({ message: "Referrer access required" });
    req.user = user;
    return next();
  };

  // Public: get clinic info for the referral form header
  app.get("/api/public/clinic/:clinicId/info", async (req, res) => {
    try {
      const clinicId = parseInt(req.params.clinicId);
      const clinic = await storage.getClinic(clinicId);
      if (!clinic || !clinic.isActive) return res.status(404).json({ error: "Clinic not found" });
      res.json({ name: clinic.name, logoUrl: clinic.logoUrl, phone: clinic.phone, address: clinic.address });
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // Public: submit a referral from the web form (no auth)
  app.post("/api/public/referral/:clinicId", async (req, res) => {
    try {
      const clinicId = parseInt(req.params.clinicId);
      const clinic = await storage.getClinic(clinicId);
      if (!clinic || !clinic.isActive) return res.status(404).json({ error: "Clinic not found" });

      const {
        patientName, patientDob, patientPhone, patientEmail,
        referringDoctorName, referringDoctorPhone, referringDoctorProviderNumber, referringDoctorPractice,
        scanTypes, urgency, clinicalIndication, notes, resultMethod, resultMethodOther,
      } = req.body;

      if (!patientName || !scanTypes?.length) {
        return res.status(400).json({ error: "Patient name and at least one scan type are required" });
      }

      // Simple honeypot check
      if (req.body._hp) return res.status(400).json({ error: "Invalid submission" });

      const today = new Date().toISOString().split("T")[0];
      await storage.createScanRequest({
        clinicId,
        patientName,
        patientDob: patientDob || null,
        patientPhone: patientPhone || null,
        patientEmail: patientEmail || null,
        referringDoctorName: referringDoctorName || null,
        referringDoctorProviderNumber: referringDoctorProviderNumber || null,
        scanTypes: Array.isArray(scanTypes) ? scanTypes : [scanTypes],
        urgency: urgency || "routine",
        clinicalIndication: clinicalIndication || null,
        notes: (() => {
          const parts: string[] = [];
          if (referringDoctorPractice) parts.push(`Referring practice: ${referringDoctorPractice}`);
          if (referringDoctorPhone) parts.push(`Referring doctor phone: ${referringDoctorPhone}`);
          if (resultMethod) {
            const method = resultMethod === "Other" && resultMethodOther ? `Other – ${resultMethodOther}` : resultMethod;
            parts.push(`Results delivery: ${method}`);
          }
          if (notes) parts.push(notes);
          return parts.length > 0 ? parts.join(". ") : null;
        })(),
        status: "pending",
        requestDate: today,
        source: "web_form",
        submittedByReferrerId: null,
        referrerName: referringDoctorName || "Web Form",
        patientUrNumber: null,
        patientId: null,
        referringDoctorId: null,
        scheduledAppointmentId: null,
        clinicalHistory: null,
      });

      // Email notification to clinic
      if (clinic.email) {
        await sendExternalReferralNotification({
          clinicEmail: clinic.email,
          clinicName: clinic.name,
          patientName,
          scanTypes: Array.isArray(scanTypes) ? scanTypes : [scanTypes],
          urgency: urgency || "routine",
          referringDoctorName: referringDoctorName || "Not specified",
          source: "web_form",
        }).catch(console.error);
      }

      res.json({ success: true, message: "Referral submitted successfully" });
    } catch (e) {
      console.error("Public referral error:", e);
      res.status(500).json({ error: "Failed to submit referral" });
    }
  });

  // Referrer: get own info + clinic info
  app.get("/api/referrer/me", isReferrer, async (req: any, res) => {
    try {
      const user = req.user;
      const clinic = user.clinicId ? await storage.getClinic(user.clinicId) : null;
      const { passwordHash: _, ...safeUser } = user;
      res.json({ user: safeUser, clinic: clinic ? { name: clinic.name, logoUrl: clinic.logoUrl, phone: clinic.phone } : null });
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // Referrer: get limited calendar (busy slots, no patient names)
  app.get("/api/referrer/calendar", isReferrer, async (req: any, res) => {
    try {
      const clinicId = req.user.clinicId;
      if (!clinicId) return res.status(403).json({ error: "No clinic associated" });
      // Fetch 3 months of appointments
      const now = new Date();
      const future = new Date(now.getFullYear(), now.getMonth() + 3, 1);
      const past = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const [allAppts, allEvents] = await Promise.all([
        storage.getAppointmentsByDateRange(past, future),
        storage.getCalendarEventsByDateRange(past, future),
      ]);
      const sanitized = allAppts
        .filter((a: any) => a.clinicId === clinicId && a.status !== "cancelled")
        .map((a: any) => {
          const start = new Date(a.appointmentDate);
          const end = new Date(start.getTime() + (a.duration || 30) * 60 * 1000);
          return {
            id: a.id,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            scanType: a.scanType,
            status: "booked",
          };
        });
      const filteredEvents = allEvents.filter((e: any) => e.clinicId === clinicId);
      res.json({ appointments: sanitized, events: filteredEvents });
    } catch { res.status(500).json({ error: "Failed to load calendar" }); }
  });

  // Referrer: book an appointment (creates scan request + appointment)
  app.post("/api/referrer/appointments", isReferrer, async (req: any, res) => {
    try {
      const clinicId = req.user.clinicId;
      if (!clinicId) return res.status(403).json({ error: "No clinic associated" });
      const {
        patientName, patientDob, patientPhone, patientEmail,
        scanType, startTime, endTime, notes, clinicalIndication,
      } = req.body;
      if (!patientName || !scanType || !startTime || !endTime) {
        return res.status(400).json({ error: "Patient name, scan type, and time are required" });
      }
      const clinic = await storage.getClinic(clinicId);

      // Create appointment
      const apptStart = new Date(startTime);
      const apptEnd = new Date(endTime);
      const durationMins = Math.max(30, Math.round((apptEnd.getTime() - apptStart.getTime()) / 60000));
      const referrerFullName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "External Referrer";
      const referralPrefix = `[Referral from: ${referrerFullName}]`;
      const combinedNotes = notes ? `${referralPrefix}\n${notes}` : referralPrefix;

      // Try to match existing patient record
      const matchedPatient = await storage.findMatchingPatient(clinicId, patientName, patientDob || null, patientPhone || null);

      const patientEmailVal = patientEmail || null;
      const appointment = await storage.createAppointment({
        clinicId,
        patientName,
        patientPhone: patientPhone || null,
        patientEmail: patientEmailVal,
        patientDob: patientDob || null,
        scanType,
        appointmentDate: apptStart,
        duration: durationMins,
        notes: combinedNotes,
        status: "scheduled",
        sonographerId: null,
        patientId: matchedPatient?.id ?? null,
        createdBy: req.user.id,
      });

      // Create corresponding scan request
      const today = new Date().toISOString().split("T")[0];
      await storage.createScanRequest({
        clinicId,
        patientName,
        patientDob: patientDob || null,
        patientPhone: patientPhone || null,
        patientEmail: patientEmailVal,
        referringDoctorName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
        referringDoctorProviderNumber: null,
        scanTypes: [scanType],
        urgency: "routine",
        clinicalIndication: clinicalIndication || null,
        notes: notes || null,
        status: "scheduled",
        requestDate: today,
        source: "referrer_portal",
        submittedByReferrerId: req.user.id,
        referrerName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
        scheduledAppointmentId: appointment.id,
        patientUrNumber: matchedPatient?.urNumber ?? null,
        patientId: matchedPatient?.id ?? null,
        referringDoctorId: null,
        clinicalHistory: null,
      });

      const referrerFullNameForEmail = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim();

      // Notify clinic
      if (clinic?.email) {
        sendExternalReferralNotification({
          clinicEmail: clinic.email,
          clinicName: clinic.name,
          patientName,
          scanTypes: [scanType],
          urgency: "routine",
          referringDoctorName: referrerFullNameForEmail,
          source: "referrer_portal",
          referrerName: referrerFullNameForEmail,
        }).catch(console.error);
      }

      // Send patient confirmation email
      if (patientEmailVal) {
        sendPatientBookingConfirmation({
          patientEmail: patientEmailVal,
          patientName,
          clinicName: clinic?.name || "The clinic",
          clinicAddress: (clinic as any)?.address || null,
          clinicPhone: (clinic as any)?.phone || null,
          scanType,
          appointmentDate: apptStart,
          duration: durationMins,
          referringDoctorName: referrerFullNameForEmail || undefined,
        }).catch(console.error);
      }

      res.json({ success: true, appointment, patientMatched: !!matchedPatient });
    } catch (e) {
      console.error("Referrer booking error:", e);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Referrer: get own submitted requests
  app.get("/api/referrer/requests", isReferrer, async (req: any, res) => {
    try {
      const all = await storage.getScanRequests(req.user.clinicId);
      const mine = all.filter((r: any) => r.submittedByReferrerId === req.user.id || r.source === "referrer_portal");
      res.json(mine);
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // Admin: list referrer accounts for this clinic
  app.get("/api/admin/referrers", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) return res.status(403).json({ error: "No clinic" });
      const allUsers = await storage.getUsersByClinic(clinicId);
      const referrers = allUsers.filter((u: any) => u.role === "referrer");
      res.json(referrers.map(({ passwordHash: _, ...u }: any) => u));
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // Admin: create a referrer account
  app.post("/api/admin/referrers", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const actingUser = await storage.getUser(req.session.userId!);
      if (!clinicId || !["clinic_owner", "admin"].includes(actingUser?.role || "")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const bcrypt = await import("bcryptjs");
      const crypto = await import("crypto");
      const { firstName, lastName, email, password, practiceName } = req.body;
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: "First name, last name, email, and password are required" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ error: "Email already in use" });
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.upsertUser({
        id: crypto.randomUUID(),
        email,
        firstName,
        lastName,
        passwordHash,
        role: "referrer",
        clinicId,
        isActive: true,
      });
      const { passwordHash: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (e) {
      console.error("Create referrer error:", e);
      res.status(500).json({ error: "Failed to create referrer account" });
    }
  });

  // Admin: toggle referrer account active status
  app.patch("/api/admin/referrers/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const actingUser = await storage.getUser(req.session.userId!);
      if (!clinicId || !["clinic_owner", "admin"].includes(actingUser?.role || "")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target || target.clinicId !== clinicId || target.role !== "referrer") {
        return res.status(404).json({ error: "Referrer not found" });
      }
      await storage.upsertUser({ ...target, isActive: !target.isActive });
      res.json({ success: true, isActive: !target.isActive });
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // Admin: delete referrer account
  app.delete("/api/admin/referrers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const clinicId = req.user?.clinicId;
      const actingUser = await storage.getUser(req.session.userId!);
      if (!clinicId || !["clinic_owner", "admin"].includes(actingUser?.role || "")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target || target.clinicId !== clinicId || target.role !== "referrer") {
        return res.status(404).json({ error: "Referrer not found" });
      }
      await db.delete(users).where(eq(users.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // Admin: get embed config (base URL for iframe snippets)
  app.get("/api/admin/embed-config", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const clinicId = user.clinicId;
      // Prefer APP_URL env var (set in production), then fall back to request headers
      let baseUrl: string;
      if (process.env.APP_URL) {
        baseUrl = process.env.APP_URL.replace(/\/$/, "");
      } else {
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        baseUrl = `${proto}://${host}`;
      }
      res.json({ baseUrl, clinicId });
    } catch { res.status(500).json({ error: "Failed" }); }
  });

  // ── DICOM Modality Worklist ───────────────────────────────────────────────

  // Public endpoint — authenticated by X-API-Key header (used by local bridge)
  app.get("/api/worklist/today", async (req, res) => {
    try {
      const apiKey = (req.headers["x-api-key"] || req.query.apiKey) as string;
      if (!apiKey) return res.status(401).json({ error: "Missing API key" });

      // Find clinic by DICOM API key
      const allClinics = await storage.getAllClinics();
      const clinic = allClinics.find(c => c.dicomApiKey === apiKey);
      if (!clinic) return res.status(401).json({ error: "Invalid API key" });

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const appts = await storage.getAppointmentsByDateRange(startOfDay, endOfDay);
      const clinicAppts = appts.filter(a => a.clinicId === clinic.id && a.status !== "cancelled");

      // Build DICOM-friendly worklist items
      const items = await Promise.all(clinicAppts.map(async appt => {
        let physicianName = "";
        if (appt.physicianId) {
          const ph = await storage.getPhysician(appt.physicianId);
          if (ph) physicianName = ph.name;
        }

        const dt = new Date(appt.appointmentDate);
        const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
        const timeStr = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
        const dateCompact = dateStr.replace(/-/g, "");
        const accessionNumber = `RR${dateCompact}-${String(appt.id).padStart(4,"0")}`;
        const uidBase = `1.2.826.0.1.3680043.10.${clinic.id}.${appt.id}`;

        return {
          appointmentId: appt.id,
          patientName:  appt.patientName,
          patientId:    appt.patientId ? String(appt.patientId) : String(appt.id),
          dob:          appt.patientDob || "",
          sex:          "",
          accessionNumber,
          scanType:     appt.scanType || "",
          scheduledDate: dateStr,
          scheduledTime: timeStr,
          physicianName,
          studyInstanceUid: uidBase,
          sopInstanceUid:   `${uidBase}.0`,
        };
      }));

      res.json(items);
    } catch (err) {
      console.error("Worklist error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve the standalone DICOM bridge script
  app.get("/dicom-bridge.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Content-Disposition", 'attachment; filename="dicom-bridge.js"');
    res.send(getDicomBridgeScript());
  });

  // Regenerate the DICOM API key for the authenticated clinic
  app.post("/api/admin/dicom/regenerate-key", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });

      const newKey = require("crypto").randomBytes(24).toString("hex");
      await storage.updateClinic(user.clinicId, { dicomApiKey: newKey } as any);
      res.json({ dicomApiKey: newKey });
    } catch (err) {
      console.error("Regenerate DICOM key error:", err);
      res.status(500).json({ error: "Failed to regenerate key" });
    }
  });

  // Download bridge config pre-filled with this clinic's API key and server URL
  app.get("/api/admin/dicom/bridge-config", isAuthenticated, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });

      const clinic = await storage.getClinic(user.clinicId);
      if (!clinic) return res.status(404).json({ error: "Clinic not found" });

      const serverUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const config = {
        serverUrl,
        apiKey: clinic.dicomApiKey || "",
        aeTitle: "REPORTING_ROOM",
        port: 11112,
        refreshIntervalMinutes: 5,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", 'attachment; filename="dicom-bridge-config.json"');
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // Bug Reports
  app.get("/api/bug-reports", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const reports = await storage.getBugReports(user.clinicId);
      res.json(reports);
    } catch { res.status(500).json({ error: "Failed to fetch bug reports" }); }
  });

  app.post("/api/bug-reports", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user?.clinicId) return res.status(400).json({ error: "No clinic" });
      const { title, description, priority, category } = req.body;
      if (!title?.trim() || !description?.trim()) {
        return res.status(400).json({ error: "Title and description are required" });
      }
      const report = await storage.createBugReport({
        clinicId: user.clinicId,
        reportedByUserId: user.id,
        reportedByName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email || "Unknown",
        title: title.trim(),
        description: description.trim(),
        priority: priority || "medium",
        status: "open",
        category: category || null,
      });
      res.json(report);
    } catch { res.status(500).json({ error: "Failed to create bug report" }); }
  });

  app.patch("/api/bug-reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateBugReport(id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Failed to update bug report" }); }
  });

  app.delete("/api/bug-reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteBugReport(parseInt(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "Failed to delete bug report" }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Utility function to generate invitation tokens
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ── DICOM Bridge script template ─────────────────────────────────────────────
function getDicomBridgeScript(): string {
  return `#!/usr/bin/env node
/**
 * Reporting Room — DICOM Modality Worklist Bridge  v1.0
 * =====================================================
 * Run this on any PC on the same LAN as your GE LOGIQ e.
 * It implements a DICOM C-FIND SCP (Modality Worklist) using
 * only Node.js built-in modules — no extra packages needed.
 *
 * Setup:
 *   1. Place this file and dicom-bridge-config.json in the same folder
 *   2. Run:  node dicom-bridge.js
 *   3. On the GE LOGIQ e → Utility → Connectivity → Service:
 *        IP: this PC's local IP address
 *        Port: 11112 (or as configured)
 *        AE Title: REPORTING_ROOM
 *        Modality: US    Scheduled Date: Today
 *   4. Press Verify — a "smiley face" means success.
 */

const net  = require('net');
const https = require('https');
const http  = require('http');
const fs   = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'dicom-bridge-config.json');
const config = Object.assign(
  { serverUrl: 'https://reportingroom.net', apiKey: '', aeTitle: 'REPORTING_ROOM', port: 11112, refreshIntervalMinutes: 5 },
  fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}
);

// ── Data cache ───────────────────────────────────────────────────────────────
let worklist = [];
let lastFetched = null;

function fetchWorklist() {
  return new Promise((resolve, reject) => {
    const url = new URL(config.serverUrl + '/api/worklist/today');
    const lib = url.protocol === 'https:' ? https : http;
    const opts = { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, headers: { 'x-api-key': config.apiKey } };
    const req = lib.get(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error('HTTP ' + res.statusCode + ': ' + d)));
    });
    req.on('error', reject);
  });
}

async function refreshWorklist() {
  try {
    worklist = await fetchWorklist();
    lastFetched = new Date();
    console.log('[' + lastFetched.toISOString() + '] Worklist refreshed: ' + worklist.length + ' appointment(s)');
  } catch (err) {
    console.error('Worklist refresh failed:', err.message);
  }
}

// ── DICOM encoding helpers (Implicit VR Little Endian) ───────────────────────
function tag(g, e) { const b = Buffer.alloc(4); b.writeUInt16LE(g,0); b.writeUInt16LE(e,2); return b; }

function de(g, e, vr, value) {
  let v;
  if (vr === 'US') { v = Buffer.alloc(2); v.writeUInt16LE(value||0,0); }
  else if (vr === 'UL') { v = Buffer.alloc(4); v.writeUInt32LE(value||0,0); }
  else if (vr === 'SQ') { v = value || Buffer.alloc(0); }
  else {
    let s = String(value||'');
    if (s.length % 2 !== 0) s += (vr === 'UI' ? '\\0' : ' ');
    v = Buffer.from(s, 'binary');
  }
  const h = Buffer.alloc(8); h.writeUInt16LE(g,0); h.writeUInt16LE(e,2); h.writeUInt32LE(v.length,4);
  return Buffer.concat([h, v]);
}

function encodeSeq(g, e, items) {
  const encoded = items.map(item => {
    const hdr = Buffer.alloc(8); hdr.writeUInt16LE(0xFFFE,0); hdr.writeUInt16LE(0xE000,2); hdr.writeUInt32LE(item.length,4);
    return Buffer.concat([hdr, item]);
  });
  const seqDelim = Buffer.alloc(8); seqDelim.writeUInt16LE(0xFFFE,0); seqDelim.writeUInt16LE(0xE0DD,2); seqDelim.writeUInt32LE(0,4);
  const seqContent = Buffer.concat([...encoded, seqDelim]);
  const seqTag = Buffer.alloc(8); seqTag.writeUInt16LE(g,0); seqTag.writeUInt16LE(e,2); seqTag.writeUInt32LE(0xFFFFFFFF,4);
  return Buffer.concat([seqTag, seqContent]);
}

function buildWorklistDataset(item) {
  const parts = (item.patientName || '').split(' ');
  const pnDicom = parts.length >= 2 ? parts.slice(-1)[0] + '^' + parts.slice(0,-1).join(' ') : (item.patientName || '');
  const dobFmt  = (item.dob || '').replace(/-/g,'');
  const dateFmt = (item.scheduledDate || '').replace(/-/g,'');
  const timeFmt = (item.scheduledTime || '').replace(':','');

  const spss = Buffer.concat([
    de(0x0008,0x0060,'CS','US'),
    de(0x0040,0x0001,'AE', config.aeTitle),
    de(0x0040,0x0002,'DA', dateFmt),
    de(0x0040,0x0003,'TM', timeFmt),
    de(0x0040,0x0006,'PN', item.physicianName || ''),
    de(0x0040,0x0007,'LO', item.scanType || ''),
    de(0x0040,0x0009,'SH', String(item.appointmentId || 0)),
  ]);

  return Buffer.concat([
    de(0x0008,0x0050,'SH', item.accessionNumber || ''),
    de(0x0008,0x0060,'CS','US'),
    de(0x0010,0x0010,'PN', pnDicom),
    de(0x0010,0x0020,'LO', item.patientId || ''),
    de(0x0010,0x0030,'DA', dobFmt),
    de(0x0010,0x0040,'CS', item.sex || ''),
    de(0x0020,0x000D,'UI', item.studyInstanceUid || '1.2.3.' + item.appointmentId),
    de(0x0032,0x1060,'LO', item.scanType || ''),
    de(0x0040,0x1001,'SH', String(item.appointmentId || 0)),
    encodeSeq(0x0040,0x0100,[spss]),
  ]);
}

// Build C-FIND-RSP command (Implicit VR LE)
function buildCFindRspCmd(msgId, sopClassUid, status, hasDataset) {
  const body = Buffer.concat([
    de(0x0000,0x0002,'UI', sopClassUid),
    de(0x0000,0x0100,'US', 0x8020),
    de(0x0000,0x0120,'US', msgId),
    de(0x0000,0x0800,'US', hasDataset ? 0x0001 : 0x0101),
    de(0x0000,0x0900,'US', status),
  ]);
  return Buffer.concat([de(0x0000,0x0000,'UL', body.length), body]);
}

// Wrap in P-DATA-TF PDU
function buildPDataTF(pcid, cmd, dataset) {
  const mkPdv = (data, isCmd) => {
    const h = Buffer.alloc(6); h.writeUInt32BE(data.length + 2, 0); h[4] = pcid; h[5] = isCmd ? 0x03 : 0x02;
    return Buffer.concat([h, data]);
  };
  const pdvs = dataset && dataset.length > 0
    ? Buffer.concat([mkPdv(cmd, true), mkPdv(dataset, false)])
    : mkPdv(cmd, true);
  const hdr = Buffer.alloc(6); hdr[0] = 0x04; hdr.writeUInt32BE(pdvs.length, 2);
  return Buffer.concat([hdr, pdvs]);
}

// Build A-ASSOCIATE-AC PDU
function buildAssocAC(calledAE, callingAE, pcIds) {
  const appCtxUid = Buffer.from('1.2.840.10008.3.1.1.1');
  if (appCtxUid.length % 2 !== 0) appCtxUid.writeUInt8(0, appCtxUid.length - 1);
  const appCtxItem = (() => { const b = Buffer.alloc(4 + appCtxUid.length); b[0]=0x10; b.writeUInt16BE(appCtxUid.length,2); appCtxUid.copy(b,4); return b; })();

  const tsUid = Buffer.from('1.2.840.10008.1.2');  // Implicit VR LE
  const tsUidPadded = tsUid.length % 2 !== 0 ? Buffer.concat([tsUid, Buffer.from([0])]) : tsUid;
  const tsItem = (() => { const b = Buffer.alloc(4 + tsUidPadded.length); b[0]=0x40; b.writeUInt16BE(tsUidPadded.length,2); tsUidPadded.copy(b,4); return b; })();

  const pcItems = pcIds.map(id => {
    const b = Buffer.alloc(4 + 4 + tsItem.length); b[0]=0x21; b.writeUInt16BE(4+tsItem.length,2); b[4]=id; b[6]=0x00; tsItem.copy(b,8); return b;
  });

  const maxPduSub = Buffer.alloc(8); maxPduSub[0]=0x51; maxPduSub.writeUInt16BE(4,2); maxPduSub.writeUInt32BE(32768,4);
  const userItem = (() => { const b = Buffer.alloc(4+8); b[0]=0x50; b.writeUInt16BE(8,2); maxPduSub.copy(b,4); return b; })();

  const body = Buffer.alloc(68);
  body.writeUInt16BE(0x0001,0);
  Buffer.from(calledAE.padEnd(16).slice(0,16)).copy(body,4);
  Buffer.from(callingAE.padEnd(16).slice(0,16)).copy(body,20);

  const items = Buffer.concat([appCtxItem, ...pcItems, userItem]);
  const pdu = Buffer.alloc(6 + body.length + items.length);
  pdu[0]=0x02; pdu.writeUInt32BE(body.length + items.length, 2);
  body.copy(pdu, 6); items.copy(pdu, 6 + body.length);
  return pdu;
}

function buildReleaseRP() { const b = Buffer.alloc(10); b[0]=0x06; b.writeUInt32BE(4,2); return b; }

// ── DICOM connection handler ──────────────────────────────────────────────────
function handleConn(socket) {
  const remote = socket.remoteAddress + ':' + socket.remotePort;
  console.log('Connection: ' + remote);
  let buf = Buffer.alloc(0);
  let pcId = 1;
  let msgId = 1;
  let cmdBuf = Buffer.alloc(0);
  let dataBuf = Buffer.alloc(0);
  const SOP_CLASS = '1.2.840.10008.5.1.4.31';

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 6) {
      const pduType = buf[0];
      const pduLen  = buf.readUInt32BE(2);
      if (buf.length < 6 + pduLen) break;
      const pduData = buf.slice(6, 6 + pduLen);
      buf = buf.slice(6 + pduLen);

      if (pduType === 0x01) {
        // A-ASSOCIATE-RQ → parse presentation contexts and accept them
        let off = 74; // skip fixed fields (protocol ver 2 + rsvd 2 + called 16 + calling 16 + rsvd 32 = 68, + PDU hdr already stripped = 68 - 0 = 68... no, after fixed 68 bytes)
        const pcIds = [];
        while (off + 4 <= pduData.length) {
          const itype = pduData[off]; const ilen = pduData.readUInt16BE(off+2);
          if (itype === 0x20) { pcIds.push(pduData[off+4]); pcId = pduData[off+4]; }
          off += 4 + ilen;
        }
        if (pcIds.length === 0) pcIds.push(1);
        const calledAE  = pduData.slice(4, 20).toString().trim() || config.aeTitle;
        const callingAE = pduData.slice(20, 36).toString().trim() || 'LOGIQ_E';
        socket.write(buildAssocAC(calledAE, callingAE, pcIds));
        console.log('Associated: ' + callingAE + ' → ' + calledAE);

      } else if (pduType === 0x04) {
        // P-DATA-TF — process PDV items
        let off2 = 0;
        while (off2 + 6 <= pduData.length) {
          const pvLen = pduData.readUInt32BE(off2); off2 += 4;
          const thisPcId = pduData[off2]; const mch = pduData[off2+1]; off2 += 2;
          const pvData = pduData.slice(off2, off2 + pvLen - 2); off2 += pvLen - 2;
          const isCmd  = (mch & 0x01) !== 0;
          const isLast = (mch & 0x02) !== 0;
          pcId = thisPcId || pcId;

          if (isCmd) {
            cmdBuf = Buffer.concat([cmdBuf, pvData]);
            if (isLast) {
              // Extract message ID from command dataset
              let co = 0;
              while (co + 8 <= cmdBuf.length) {
                const g = cmdBuf.readUInt16LE(co); const e = cmdBuf.readUInt16LE(co+2); const l = cmdBuf.readUInt32LE(co+4);
                if (g === 0x0000 && e === 0x0110 && l === 2) msgId = cmdBuf.readUInt16LE(co+8);
                co += 8 + l;
              }
              cmdBuf = Buffer.alloc(0);
            }
          } else {
            dataBuf = Buffer.concat([dataBuf, pvData]);
            if (isLast) {
              // C-FIND identifier received — send responses
              const matches = worklist.slice();
              console.log('C-FIND from ' + remote + ': returning ' + matches.length + ' item(s)');
              for (const item of matches) {
                try {
                  const ds  = buildWorklistDataset(item);
                  const cmd = buildCFindRspCmd(msgId, SOP_CLASS, 0xFF00, true);
                  socket.write(buildPDataTF(pcId, cmd, ds));
                } catch (err) { console.error('Item error:', err.message); }
              }
              // Final success response
              socket.write(buildPDataTF(pcId, buildCFindRspCmd(msgId, SOP_CLASS, 0x0000, false), null));
              dataBuf = Buffer.alloc(0);
            }
          }
        }
      } else if (pduType === 0x05) {
        socket.write(buildReleaseRP()); socket.end();
        console.log('Released: ' + remote);
      } else if (pduType === 0x07) {
        socket.destroy();
      }
    }
  });

  socket.on('error', err => console.error('Socket error ' + remote + ':', err.message));
  socket.on('close', () => console.log('Closed: ' + remote));
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('');
  console.log('Reporting Room — DICOM Modality Worklist Bridge');
  console.log('================================================');
  console.log('Server URL : ' + config.serverUrl);
  console.log('AE Title   : ' + config.aeTitle);
  console.log('Port       : ' + config.port);
  if (!config.apiKey) { console.error('\\nERROR: apiKey is empty. Download dicom-bridge-config.json from Admin → Clinic Settings → DICOM Worklist.\\n'); process.exit(1); }
  console.log('');

  await refreshWorklist();
  setInterval(refreshWorklist, config.refreshIntervalMinutes * 60 * 1000);

  const server = net.createServer(handleConn);
  server.listen(config.port, '0.0.0.0', () => {
    console.log('DICOM MWL server listening on port ' + config.port);
    console.log('Configure GE LOGIQ e: IP = <this PC>, Port = ' + config.port + ', AE = ' + config.aeTitle);
    console.log('Worklist refreshes every ' + config.refreshIntervalMinutes + ' min. Press Ctrl+C to stop.');
    console.log('');
  });
  server.on('error', err => {
    if (err.code === 'EACCES') console.error('Port ' + config.port + ' needs admin rights. Try: sudo node dicom-bridge.js');
    else console.error('Server error:', err.message);
    process.exit(1);
  });
})();
`;
}
