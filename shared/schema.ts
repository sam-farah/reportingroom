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
  fax: varchar("fax", { length: 50 }),
  website: varchar("website", { length: 255 }),
  logoUrl: varchar("logo_url", { length: 500 }),
  kioskLogoUrl: varchar("kiosk_logo_url", { length: 500 }),
  kioskWelcomeText: text("kiosk_welcome_text"),
  kioskInstructions: text("kiosk_instructions"),
  kioskSuccessMessage: text("kiosk_success_message"),
  kioskBackgroundColor: varchar("kiosk_background_color", { length: 50 }),
  subscription: varchar("subscription", { length: 50 }).notNull().default('basic'), // 'basic', 'premium', 'enterprise'
  isActive: boolean("is_active").notNull().default(true),
  dictationVocabulary: text("dictation_vocabulary"), // JSON-encoded string[] of custom words/phrases for Whisper
  reminderInstructions: text("reminder_instructions"), // Custom preparation instructions sent with appointment reminders
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  passwordHash: varchar("password_hash"),
  profileImageUrl: varchar("profile_image_url"),
  clinicId: integer("clinic_id").references(() => clinics.id),
  role: varchar("role", { length: 50 }).notNull().default('sonographer'),
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
  isActive: boolean("is_active").notNull().default(true),
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
  patientId: integer("patient_id").references(() => patients.id),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  worksheetId: integer("worksheet_id").references(() => worksheets.id),
  digitalWorksheetId: integer("digital_worksheet_id").references(() => digitalWorksheets.id),
  patientName: text("patient_name").notNull(),
  patientUrNumber: varchar("patient_ur_number", { length: 20 }),
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
  isFinalized: boolean("is_finalized").default(false),
  finalizedAt: timestamp("finalized_at"),
  finalizedBy: varchar("finalized_by").references(() => users.id),
  isAmended: boolean("is_amended").default(false),
  amendedAt: timestamp("amended_at"),
  amendedBy: varchar("amended_by").references(() => users.id),
  amendmentReason: text("amendment_reason"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  patientId: integer("patient_id").references(() => patients.id),
});

export const trainingPairs = pgTable("training_pairs", {
  id: serial("id").primaryKey(),
  worksheetUrl: text("worksheet_url").notNull(),
  reportUrl: text("report_url").notNull(),
  category: text("category").notNull(), // e.g., "Lower Limb Venous", "Carotid Duplex", "Abdominal Aorta"
  complexityLevel: text("complexity_level").notNull(), // e.g., "normal", "abnormal", "complex"
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
  accentColor: text("accent_color").default('#e8f4fd'),
  fontFamily: text("font_family").notNull().default('Arial'),
  fontSize: text("font_size").notNull().default('12px'),
  headerStyle: text("header_style").default('left-logo'), // 'left-logo' | 'centered' | 'compact'
  sectionTitleStyle: text("section_title_style").default('underline'), // 'underline' | 'filled' | 'sidebar' | 'pill' | 'minimal'
  patientBoxStyle: text("patient_box_style").default('card'), // 'card' | 'table' | 'minimal' | 'banner'
  showWorksheetInReport: boolean("show_worksheet_in_report").default(false),
  
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
  patientId: integer("patient_id").references(() => patients.id),
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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Sonographer = typeof sonographers.$inferSelect;
export type InsertSonographer = typeof sonographers.$inferInsert;

// Patients table - Central patient records
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  urNumber: varchar("ur_number", { length: 20 }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: varchar("date_of_birth", { length: 20 }).notNull(),
  gender: varchar("gender", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zipCode: varchar("zip_code", { length: 20 }),
  insuranceProvider: varchar("insurance_provider", { length: 255 }),
  insuranceId: varchar("insurance_id", { length: 100 }),
  medicareNumber: varchar("medicare_number", { length: 15 }),
  medicareIrn: varchar("medicare_irn", { length: 2 }),
  medicareExpiry: varchar("medicare_expiry", { length: 7 }),
  medicareVerifiedStatus: varchar("medicare_verified_status", { length: 20 }).default("unverified"),
  medicareVerifiedAt: timestamp("medicare_verified_at"),
  emergencyContactName: varchar("emergency_contact_name", { length: 100 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 50 }),
  referringPhysician: varchar("referring_physician", { length: 255 }),
  medicalHistory: text("medical_history"),
  allergies: text("allergies"),
  notes: text("notes"),
  clinicId: integer("clinic_id").references(() => clinics.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

// Patient documents table for custom uploads (request forms, etc.)
export const patientDocuments = pgTable("patient_documents", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  title: varchar("title", { length: 255 }).notNull().default('Request Form'),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  fileUrl: text("file_url").notNull(),
  documentDate: varchar("document_date", { length: 20 }).notNull(),
  notes: text("notes"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = typeof patientDocuments.$inferInsert;

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

// Text shortcuts table for frequently used text snippets
export const textShortcuts = pgTable("text_shortcuts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  shortText: text("short_text").notNull(), // The actual text snippet
  category: varchar("category", { length: 100 }).default('general'), // 'findings', 'impressions', 'recommendations', 'general'
  tags: text("tags"), // Comma-separated keywords for searching
  isGlobal: boolean("is_global").notNull().default(true), // Available to all users
  userId: text("user_id"), // Optional: for user-specific shortcuts
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type TextShortcut = typeof textShortcuts.$inferSelect;
export type InsertTextShortcut = typeof textShortcuts.$inferInsert;

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

export const insertTextShortcutSchema = createInsertSchema(textShortcuts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTextShortcut = z.infer<typeof insertTextShortcutSchema>;

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

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPatientData = z.infer<typeof insertPatientSchema>;

// Patient self-registration tokens
export const patientRegistrationTokens = pgTable("patient_registration_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | completed
  expiresAt: timestamp("expires_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PatientRegistrationToken = typeof patientRegistrationTokens.$inferSelect;

// Appointments/Bookings table
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientDob: varchar("patient_dob", { length: 20 }),
  patientPhone: varchar("patient_phone", { length: 50 }),
  patientEmail: varchar("patient_email", { length: 255 }),
  appointmentDate: timestamp("appointment_date").notNull(),
  duration: integer("duration").notNull().default(30), // in minutes
  scanType: varchar("scan_type", { length: 100 }),
  physicianId: integer("physician_id").references(() => physicians.id),
  sonographerId: integer("sonographer_id").references(() => sonographers.id),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).notNull().default('scheduled'), // 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
  isInvoiced: boolean("is_invoiced").notNull().default(false),
  clinicId: integer("clinic_id").references(() => clinics.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  patientId: integer("patient_id").references(() => patients.id),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

// Patient Portal Invitations
export const patientPortalInvitations = pgTable("patient_portal_invitations", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPatientPortalInvitationSchema = createInsertSchema(patientPortalInvitations).omit({
  id: true,
  createdAt: true,
});

export type PatientPortalInvitation = typeof patientPortalInvitations.$inferSelect;
export type InsertPatientPortalInvitation = z.infer<typeof insertPatientPortalInvitationSchema>;

// Patient Portal Accounts
export const patientPortalAccounts = pgTable("patient_portal_accounts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().unique().references(() => patients.id),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPatientPortalAccountSchema = createInsertSchema(patientPortalAccounts).omit({
  id: true,
  createdAt: true,
});

export type PatientPortalAccount = typeof patientPortalAccounts.$inferSelect;
export type InsertPatientPortalAccount = z.infer<typeof insertPatientPortalAccountSchema>;

// Canonical scan types for the clinic
export const CANONICAL_SCAN_TYPES: { name: string; hasLaterality: boolean }[] = [
  { name: "Carotid and vertebral", hasLaterality: false },
  { name: "Upper limb arteries", hasLaterality: true },
  { name: "Aortoiliac", hasLaterality: false },
  { name: "Mesenteric (visceral) arteries", hasLaterality: false },
  { name: "Renal arteries", hasLaterality: false },
  { name: "Lower limb arteries (including aorto iliac)", hasLaterality: true },
  { name: "Lower limb DVT", hasLaterality: true },
  { name: "Upper limb DVT", hasLaterality: true },
  { name: "Ovarian/pelvic veins", hasLaterality: false },
  { name: "IVC/Iliac veins", hasLaterality: false },
  { name: "Varicose veins/chronic venous insufficiency", hasLaterality: true },
  { name: "AV Fistula", hasLaterality: true },
  { name: "Pre-AV Fistula Mapping", hasLaterality: true },
  { name: "Bypass conduit mapping (leg veins)", hasLaterality: true },
  { name: "Bypass conduit mapping (arm veins)", hasLaterality: true },
  { name: "Thoracic outlet syndrome", hasLaterality: true },
  { name: "Palmar and digital arteries", hasLaterality: true },
  { name: "Pedal Acceleration Time", hasLaterality: true },
  { name: "Temporal arteries", hasLaterality: false },
  { name: "Resting ABI", hasLaterality: false },
  { name: "Exercise ABI", hasLaterality: false },
  { name: "Finger brachial indices", hasLaterality: false },
];

// Scan duration settings per clinic
export const scanDurationSettings = pgTable("scan_duration_settings", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  scanType: varchar("scan_type", { length: 200 }).notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  hasLaterality: boolean("has_laterality").notNull().default(false),
  unilateralDuration: integer("unilateral_duration"),
  bilateralDuration: integer("bilateral_duration"),
});

export const insertScanDurationSettingSchema = createInsertSchema(scanDurationSettings).omit({
  id: true,
});

export type ScanDurationSetting = typeof scanDurationSettings.$inferSelect;
export type InsertScanDurationSetting = z.infer<typeof insertScanDurationSettingSchema>;

// Referring doctors (per clinic)
export const referringDoctors = pgTable("referring_doctors", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  name: varchar("name", { length: 200 }).notNull(),
  practiceName: varchar("practice_name", { length: 200 }),
  providerNumber: varchar("provider_number", { length: 50 }),
  phone: varchar("phone", { length: 50 }),
  fax: varchar("fax", { length: 50 }),
  email: varchar("email", { length: 200 }),
  address: text("address"),
  notes: text("notes"),
});

export const insertReferringDoctorSchema = createInsertSchema(referringDoctors).omit({ id: true });
export type ReferringDoctor = typeof referringDoctors.$inferSelect;
export type InsertReferringDoctor = z.infer<typeof insertReferringDoctorSchema>;

// Scan requests
export const scanRequests = pgTable("scan_requests", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id),
  patientId: integer("patient_id").references(() => patients.id),
  referringDoctorId: integer("referring_doctor_id").references(() => referringDoctors.id),
  patientName: varchar("patient_name", { length: 200 }).notNull(),
  patientUrNumber: varchar("patient_ur_number", { length: 20 }),
  patientDob: varchar("patient_dob", { length: 20 }),
  patientPhone: varchar("patient_phone", { length: 50 }),
  patientEmail: varchar("patient_email", { length: 200 }),
  referringDoctorName: varchar("referring_doctor_name", { length: 200 }),
  referringDoctorProviderNumber: varchar("referring_doctor_provider_number", { length: 50 }),
  scanTypes: text("scan_types").array().notNull().default([]),
  urgency: varchar("urgency", { length: 20 }).notNull().default("routine"),
  clinicalIndication: text("clinical_indication"),
  clinicalHistory: text("clinical_history"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  notes: text("notes"),
  requestDate: varchar("request_date", { length: 20 }).notNull(),
  scheduledAppointmentId: integer("scheduled_appointment_id").references(() => appointments.id),
  source: varchar("source", { length: 20 }).notNull().default("internal"),
  submittedByReferrerId: varchar("submitted_by_referrer_id", { length: 36 }),
  referrerName: varchar("referrer_name", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScanRequestSchema = createInsertSchema(scanRequests).omit({ id: true, createdAt: true });
export type ScanRequest = typeof scanRequests.$inferSelect;
export type InsertScanRequest = z.infer<typeof insertScanRequestSchema>;

// Calendar events (block-outs, theatre days, recurring non-patient events)
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").references(() => clinics.id),
  title: varchar("title", { length: 255 }).notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  color: varchar("color", { length: 50 }).notNull().default("purple"),
  recurrence: varchar("recurrence", { length: 50 }).notNull().default("none"),
  recurrenceEndDate: timestamp("recurrence_end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true });
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

// Report distribution log
export const reportDistributions = pgTable("report_distributions", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  clinicId: integer("clinic_id").references(() => clinics.id),
  method: varchar("method", { length: 20 }).notNull(), // "email" | "copy_html"
  recipientName: varchar("recipient_name", { length: 200 }),
  recipientEmail: varchar("recipient_email", { length: 200 }),
  notes: text("notes"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
  confirmedBy: varchar("confirmed_by", { length: 200 }),
});

export const insertReportDistributionSchema = createInsertSchema(reportDistributions).omit({ id: true, sentAt: true });
export type ReportDistribution = typeof reportDistributions.$inferSelect;
export type InsertReportDistribution = z.infer<typeof insertReportDistributionSchema>;

// Per-scan-type content templates — used as AI generation baseline
export const scanTypeContentTemplates = pgTable("scan_type_content_templates", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").references(() => clinics.id),
  scanType: varchar("scan_type", { length: 200 }).notNull(),
  findingsTemplate: text("findings_template"),
  impressionTemplate: text("impression_template"),
  indicationTemplate: text("indication_template"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertScanTypeContentTemplateSchema = createInsertSchema(scanTypeContentTemplates).omit({ id: true, updatedAt: true });
export type ScanTypeContentTemplate = typeof scanTypeContentTemplates.$inferSelect;
export type InsertScanTypeContentTemplate = z.infer<typeof insertScanTypeContentTemplateSchema>;
