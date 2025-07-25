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
  showHeader: boolean("show_header").default(true),
  clinicName: text("clinic_name"),
  clinicAddress: text("clinic_address"),
  clinicPhone: text("clinic_phone"),
  showLogo: boolean("show_logo").default(true),
  
  // Patient info configuration
  patientInfoLayout: text("patient_info_layout").default('grid'), // 'grid', 'list', 'compact'
  showPatientId: boolean("show_patient_id").default(false),
  
  // Content sections
  showStudyType: boolean("show_study_type").default(true),
  showIndication: boolean("show_indication").default(true),
  showFindings: boolean("show_findings").default(true),
  showImpression: boolean("show_impression").default(true),
  
  // Footer configuration
  showFooter: boolean("show_footer").default(true),
  footerText: text("footer_text"),
  showReportId: boolean("show_report_id").default(true),
  showGenerationDate: boolean("show_generation_date").default(true),
  
  // Physician signature
  showSignature: boolean("show_signature").default(true),
  signaturePosition: text("signature_position").default('right'), // 'left', 'right', 'center'
  
  // Styling options
  primaryColor: text("primary_color").default('#0066cc'),
  fontFamily: text("font_family").default('Arial'),
  fontSize: text("font_size").default('12px'),
  
  isDefault: boolean("is_default").default(false),
  userId: text("user_id"), // Optional: for user-specific templates
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const insertPhysicianSchema = createInsertSchema(physicians).omit({
  id: true,
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
