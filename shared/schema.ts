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
import { relations } from "drizzle-orm";
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

// Clinics table - Each clinic can have multiple users
export const clinics = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zipCode: varchar("zip_code", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 255 }),
  logoUrl: varchar("logo_url", { length: 500 }),
  subscription: varchar("subscription", { length: 50 }).notNull().default('basic'), // 'basic', 'premium', 'enterprise'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  clinicId: integer("clinic_id").references(() => clinics.id),
  role: varchar("role", { length: 50 }).notNull().default('sonographer'), // 'admin', 'sonographer', 'clinic_owner'
  isActive: boolean("is_active").notNull().default(true),
  invitedBy: varchar("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at"),
  joinedAt: timestamp("joined_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User invitations table for email invitations
export const userInvitations = pgTable("user_invitations", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  role: varchar("role", { length: 50 }).notNull().default('sonographer'),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
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
  digitalWorksheetId: integer("digital_worksheet_id").references(() => digitalWorksheets.id),
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
  isDraft: boolean("is_draft").default(true),
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
  patientName: text("patient_name").notNull(),
  patientDob: text("patient_dob"),
  examDate: text("exam_date").notNull(),
  studyType: text("study_type"),
  drawingData: text("drawing_data").notNull(), // Base64 canvas data
  annotations: text("annotations"), // JSON string of text annotations
  drawingHistory: text("drawing_history"), // JSON array of canvas states for undo
  userId: text("user_id").notNull(),
  sonographerId: integer("sonographer_id").references(() => sonographers.id),
  isDraft: boolean("is_draft").default(true),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const clinicsRelations = relations(clinics, ({ many }) => ({
  users: many(users),
  invitations: many(userInvitations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  clinic: one(clinics, {
    fields: [users.clinicId],
    references: [clinics.id],
  }),
  invitedByUser: one(users, {
    fields: [users.invitedBy],
    references: [users.id],
  }),
  invitedUsers: many(users),
  sentInvitations: many(userInvitations),
}));

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  clinic: one(clinics, {
    fields: [userInvitations.clinicId],
    references: [clinics.id],
  }),
  invitedByUser: one(users, {
    fields: [userInvitations.invitedBy],
    references: [users.id],
  }),
}));

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Clinic = typeof clinics.$inferSelect;
export type InsertClinic = typeof clinics.$inferInsert;
export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = typeof userInvitations.$inferInsert;

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

// Legend entries for teaching AI about drawing meanings
export const legendEntries = pgTable("legend_entries", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  drawingPattern: text("drawing_pattern"), // Description of visual pattern
  medicalMeaning: text("medical_meaning").notNull(), // What it indicates medically
  category: varchar("category", { length: 100 }), // e.g., "vascular", "cardiac", "abdominal"
  keywords: text("keywords"), // Comma-separated keywords for AI matching
  exampleImage: varchar("example_image", { length: 500 }), // Uploaded example image path
  drawingData: text("drawing_data"), // Canvas drawing data as base64 string
  imageType: varchar("image_type", { length: 20 }).default('upload'), // 'upload' or 'drawing'
  createdBy: varchar("created_by", { length: 255 }), // Sonographer who created this
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DigitalWorksheet = typeof digitalWorksheets.$inferSelect;
export type InsertDigitalWorksheet = typeof digitalWorksheets.$inferInsert;

export type LegendEntry = typeof legendEntries.$inferSelect;
export type InsertLegendEntry = typeof legendEntries.$inferInsert;

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

export const insertLegendEntrySchema = createInsertSchema(legendEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClinicSchema = createInsertSchema(clinics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  createdAt: true,
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
export type InsertLegendEntryData = z.infer<typeof insertLegendEntrySchema>;
