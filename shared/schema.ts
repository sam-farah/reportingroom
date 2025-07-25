import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const physicians = pgTable("physicians", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  specialty: text("specialty").notNull(),
  signatureUrl: text("signature_url"),
});

export const worksheets = pgTable("worksheets", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  patientName: text("patient_name"),
  patientDob: text("patient_dob"),
  examDate: text("exam_date"),
  ocrProcessed: boolean("ocr_processed").default(false),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  worksheetId: integer("worksheet_id").references(() => worksheets.id),
  patientName: text("patient_name").notNull(),
  patientDob: text("patient_dob").notNull(),
  examDate: text("exam_date").notNull(),
  studyType: text("study_type").notNull(),
  indication: text("indication").notNull(),
  findings: text("findings").notNull(),
  impression: text("impression").notNull(),
  physicianId: integer("physician_id").references(() => physicians.id),
  sonographerId: integer("sonographer_id").references(() => sonographers.id),
  logoUrl: text("logo_url"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const trainingPairs = pgTable("training_pairs", {
  id: serial("id").primaryKey(),
  worksheetUrl: text("worksheet_url").notNull(),
  reportUrl: text("report_url").notNull(),
  category: text("category").notNull(),
  complexityLevel: text("complexity_level").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  templateType: text("template_type").notNull(), // 'pdf' or 'docx' or 'both'
  
  // Header configuration
  showHeader: boolean("show_header").notNull().default(true),
  clinicName: text("clinic_name"),
  clinicAddress: text("clinic_address"),
  clinicPhone: text("clinic_phone"),
  showLogo: boolean("show_logo").notNull().default(true),
  
  // Patient info configuration
  patientInfoLayout: text("patient_info_layout").notNull().default('grid'), // 'grid', 'list', 'compact'
  showPatientId: boolean("show_patient_id").notNull().default(false),
  
  // Content sections
  showStudyType: boolean("show_study_type").notNull().default(true),
  showIndication: boolean("show_indication").notNull().default(true),
  showFindings: boolean("show_findings").notNull().default(true),
  showImpression: boolean("show_impression").notNull().default(true),
  
  // Footer configuration
  showFooter: boolean("show_footer").notNull().default(true),
  footerText: text("footer_text"),
  showReportId: boolean("show_report_id").notNull().default(true),
  showGenerationDate: boolean("show_generation_date").notNull().default(true),
  
  // Physician signature
  showSignature: boolean("show_signature").notNull().default(true),
  signaturePosition: text("signature_position").notNull().default('right'), // 'left', 'right', 'center'
  
  // Styling options
  primaryColor: text("primary_color").notNull().default('#0066cc'),
  fontFamily: text("font_family").notNull().default('Arial'),
  fontSize: text("font_size").notNull().default('12px'),
  
  isDefault: boolean("is_default").notNull().default(false),
  userId: text("user_id"), // Optional: for user-specific templates
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Worksheet templates table for blank worksheet uploads
export const worksheetTemplates = pgTable("worksheet_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // 'vascular', 'cardiac', 'abdominal', etc.
  imageUrl: text("image_url").notNull(), // Path to the blank worksheet image
  originalFilename: text("original_filename").notNull(),
  userId: text("user_id"), // Optional: for user-specific templates
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Digital worksheets table for drawn/annotated worksheets
export const digitalWorksheets = pgTable("digital_worksheets", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => worksheetTemplates.id),
  patientName: text("patient_name"),
  patientDob: text("patient_dob"),
  examDate: text("exam_date"),
  studyType: text("study_type"),
  drawingData: text("drawing_data"), // JSON string of canvas drawing data
  annotations: text("annotations"), // JSON string of text annotations
  completedAt: timestamp("completed_at"),
  userId: text("user_id"),
  sonographerId: integer("sonographer_id").references(() => sonographers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Sonographers table
export const sonographers = pgTable("sonographers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  initials: varchar("initials", { length: 10 }).notNull(),
  title: varchar("title", { length: 100 }),
  department: varchar("department", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Sonographer = typeof sonographers.$inferSelect;
export type InsertSonographer = typeof sonographers.$inferInsert;

export type WorksheetTemplate = typeof worksheetTemplates.$inferSelect;
export type InsertWorksheetTemplate = typeof worksheetTemplates.$inferInsert;

export type DigitalWorksheet = typeof digitalWorksheets.$inferSelect;
export type InsertDigitalWorksheet = typeof digitalWorksheets.$inferInsert;

export const insertPhysicianSchema = createInsertSchema(physicians).omit({
  id: true,
});

export const insertSonographerSchema = createInsertSchema(sonographers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorksheetSchema = createInsertSchema(worksheets).omit({
  id: true,
  uploadedAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  generatedAt: true,
});

export const insertTrainingPairSchema = createInsertSchema(trainingPairs).omit({
  id: true,
  uploadedAt: true,
});

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorksheetTemplateSchema = createInsertSchema(worksheetTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDigitalWorksheetSchema = createInsertSchema(digitalWorksheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateReportTemplateSchema = insertReportTemplateSchema.partial();

export type Physician = typeof physicians.$inferSelect;
export type InsertPhysician = z.infer<typeof insertPhysicianSchema>;
export type Worksheet = typeof worksheets.$inferSelect;
export type InsertWorksheet = z.infer<typeof insertWorksheetSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type TrainingPair = typeof trainingPairs.$inferSelect;
export type InsertTrainingPair = z.infer<typeof insertTrainingPairSchema>;
export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type InsertSonographerData = z.infer<typeof insertSonographerSchema>;
