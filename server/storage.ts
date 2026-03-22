import {
  users,
  clinics,
  userInvitations,
  physicians,
  worksheets,
  reports,
  trainingPairs,
  reportTemplates,
  sonographers,
  patients,
  patientDocuments,
  patientPortalInvitations,
  patientPortalAccounts,
  type PatientPortalInvitation,
  type InsertPatientPortalInvitation,
  type PatientPortalAccount,
  type InsertPatientPortalAccount,
  type User,
  type UpsertUser,
  type Clinic,
  type InsertClinic,
  type UserInvitation,
  type InsertUserInvitation,
  type Physician,
  type InsertPhysician,
  type Worksheet,
  type InsertWorksheet,
  type Report,
  type InsertReport,
  type TrainingPair,
  type InsertTrainingPair,
  type ReportTemplate,
  type InsertReportTemplate,
  type Sonographer,
  type InsertSonographerData,
  type Patient,
  type InsertPatientData,
  type PatientDocument,
  type InsertPatientDocument,
  worksheetTemplates,
  digitalWorksheets,
  type WorksheetTemplate,
  type DigitalWorksheet,
  type InsertWorksheetTemplate,
  type InsertDigitalWorksheet,
  legendEntries,
  type LegendEntry,
  type InsertLegendEntry,
  textShortcuts,
  type TextShortcut,
  type InsertTextShortcut,
  appointments,
  type Appointment,
  type InsertAppointment,
  scanDurationSettings,
  type ScanDurationSetting,
  type InsertScanDurationSetting,
  CANONICAL_SCAN_TYPES,
  referringDoctors,
  type ReferringDoctor,
  type InsertReferringDoctor,
  scanRequests,
  type ScanRequest,
  type InsertScanRequest,
  calendarEvents,
  type CalendarEvent,
  type InsertCalendarEvent,
  reportDistributions,
  type ReportDistribution,
  type InsertReportDistribution,
  scanTypeContentTemplates,
  type ScanTypeContentTemplate,
  type InsertScanTypeContentTemplate,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and, or, ilike, sql, max } from "drizzle-orm";
import { FieldEncryption, MedicalDataEncryption } from "./encryption";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Clinic operations
  getAllClinics(): Promise<Clinic[]>;
  getClinic(id: number): Promise<Clinic | undefined>;
  getClinicByEmail(email: string): Promise<Clinic | undefined>;
  createClinic(clinic: InsertClinic): Promise<Clinic>;
  updateClinic(id: number, clinic: Partial<InsertClinic>): Promise<Clinic | undefined>;
  
  // User invitation operations
  createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation>;
  getUserInvitation(token: string): Promise<UserInvitation | undefined>;
  getInvitationByToken(token: string): Promise<UserInvitation | undefined>;
  getClinicInvitations(clinicId: number): Promise<UserInvitation[]>;
  acceptInvitation(token: string, userId: string): Promise<void>;
  getUsersByClinic(clinicId: number): Promise<User[]>;
  
  // Staff management operations
  getClinicStaff(clinicId: number): Promise<User[]>;
  getPendingInvitations(clinicId: number): Promise<UserInvitation[]>;
  createInvitation(invitation: InsertUserInvitation): Promise<UserInvitation>;
  cancelInvitation(invitationId: number, clinicId: number): Promise<void>;
  deactivateStaffMember(staffId: string, clinicId: number): Promise<void>;
  
  getAllPhysicians(): Promise<Physician[]>;
  getPhysician(id: number): Promise<Physician | undefined>;
  createPhysician(physician: InsertPhysician): Promise<Physician>;
  updatePhysician(id: number, physician: Partial<InsertPhysician>): Promise<Physician | undefined>;
  togglePhysicianStatus(id: number): Promise<Physician | undefined>;
  deletePhysician(id: number): Promise<void>;
  
  getAllWorksheets(): Promise<Worksheet[]>;
  getWorksheet(id: number): Promise<Worksheet | undefined>;
  createWorksheet(worksheet: InsertWorksheet): Promise<Worksheet>;
  updateWorksheet(id: number, worksheet: Partial<InsertWorksheet>): Promise<Worksheet | undefined>;
  
  getAllReports(): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  getReportsByWorksheet(worksheetId: number): Promise<Report[]>;
  getRecentReports(limit: number): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: number, report: Partial<InsertReport>): Promise<Report | undefined>;
  amendReport(id: number, updates: Partial<InsertReport>, userId: string, reason: string): Promise<Report | undefined>;
  deleteReport(id: number): Promise<void>;
  
  getAllTrainingPairs(): Promise<TrainingPair[]>;
  getTrainingPair(id: number): Promise<TrainingPair | undefined>;
  createTrainingPair(trainingPair: InsertTrainingPair): Promise<TrainingPair>;
  getTrainingPairsByCategory(category: string): Promise<TrainingPair[]>;
  
  getAllReportTemplates(): Promise<ReportTemplate[]>;
  getReportTemplate(id: number): Promise<ReportTemplate | undefined>;
  createReportTemplate(template: InsertReportTemplate): Promise<ReportTemplate>;
  updateReportTemplate(id: number, template: Partial<InsertReportTemplate>): Promise<ReportTemplate | undefined>;
  deleteReportTemplate(id: number): Promise<void>;
  getDefaultTemplate(): Promise<ReportTemplate | undefined>;
  
  getAllSonographers(): Promise<Sonographer[]>;
  getSonographer(id: number): Promise<Sonographer | undefined>;
  getSonographerByInitials(initials: string): Promise<Sonographer | undefined>;
  createSonographer(sonographer: InsertSonographerData): Promise<Sonographer>;
  updateSonographer(id: number, sonographer: Partial<InsertSonographerData>): Promise<Sonographer | undefined>;
  toggleSonographerStatus(id: number): Promise<Sonographer | undefined>;
  deleteSonographer(id: number): Promise<void>;

  // Worksheet template operations
  getAllWorksheetTemplates(): Promise<WorksheetTemplate[]>;
  getWorksheetTemplate(id: number): Promise<WorksheetTemplate | undefined>;
  createWorksheetTemplate(template: InsertWorksheetTemplate): Promise<WorksheetTemplate>;
  updateWorksheetTemplate(id: number, template: Partial<InsertWorksheetTemplate>): Promise<WorksheetTemplate | undefined>;
  deleteWorksheetTemplate(id: number): Promise<void>;

  // Digital worksheet operations
  getAllDigitalWorksheets(): Promise<DigitalWorksheet[]>;
  getDigitalWorksheet(id: number): Promise<DigitalWorksheet | undefined>;
  createDigitalWorksheet(worksheet: InsertDigitalWorksheet): Promise<DigitalWorksheet>;
  updateDigitalWorksheet(id: number, worksheet: Partial<InsertDigitalWorksheet>): Promise<DigitalWorksheet | undefined>;
  getDraftDigitalWorksheets(): Promise<DigitalWorksheet[]>;
  createDraftReport(data: any): Promise<Report>;

  // Legend entries operations
  getAllLegendEntries(): Promise<LegendEntry[]>;
  getLegendEntry(id: number): Promise<LegendEntry | undefined>;
  createLegendEntry(entry: InsertLegendEntry): Promise<LegendEntry>;
  updateLegendEntry(id: number, entry: Partial<InsertLegendEntry>): Promise<LegendEntry | undefined>;
  deleteLegendEntry(id: number): Promise<void>;
  
  // Text shortcuts operations
  getAllTextShortcuts(): Promise<TextShortcut[]>;
  createTextShortcut(shortcut: InsertTextShortcut): Promise<TextShortcut>;
  updateTextShortcut(id: number, shortcut: Partial<InsertTextShortcut>): Promise<TextShortcut | undefined>;
  deleteTextShortcut(id: number): Promise<void>;
  incrementShortcutUsage(id: number): Promise<void>;
  getLegendEntriesByCategory(category: string): Promise<LegendEntry[]>;
  
  // Appointment operations
  getAllAppointments(): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentsByDateRange(startDate: Date, endDate: Date): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number): Promise<void>;
  
  // Calendar event operations
  getCalendarEventsByDateRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: number): Promise<void>;

  // Patient operations
  getAllPatients(): Promise<Patient[]>;
  getPatient(id: number): Promise<Patient | undefined>;
  searchPatients(query: string): Promise<Patient[]>;
  createPatient(patient: InsertPatientData): Promise<Patient>;
  updatePatient(id: number, patient: Partial<InsertPatientData>): Promise<Patient | undefined>;
  deletePatient(id: number): Promise<void>;
  getPatientWorksheets(patientId: number): Promise<Worksheet[]>;
  getPatientDigitalWorksheets(patientId: number): Promise<DigitalWorksheet[]>;
  getPatientReports(patientId: number): Promise<Report[]>;
  getPatientAppointments(patientId: number): Promise<Appointment[]>;
  
  // Patient document operations
  getPatientDocuments(patientId: number): Promise<PatientDocument[]>;
  createPatientDocument(document: InsertPatientDocument): Promise<PatientDocument>;
  deletePatientDocument(id: number): Promise<void>;

  // Patient portal operations
  createPatientPortalInvitation(data: InsertPatientPortalInvitation): Promise<PatientPortalInvitation>;
  getPatientPortalInvitationByToken(token: string): Promise<PatientPortalInvitation | undefined>;
  getPatientPortalInvitationByPatientId(patientId: number): Promise<PatientPortalInvitation | undefined>;
  acceptPatientPortalInvitation(token: string): Promise<void>;
  createPatientPortalAccount(data: InsertPatientPortalAccount): Promise<PatientPortalAccount>;
  getPatientPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined>;
  getPatientPortalAccountById(id: number): Promise<PatientPortalAccount | undefined>;
  getPatientPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined>;
  getScanDurationSettings(clinicId: number): Promise<ScanDurationSetting[]>;
  upsertScanDurationSettings(clinicId: number, settings: Omit<InsertScanDurationSetting, 'clinicId'>[]): Promise<ScanDurationSetting[]>;

  // Referring doctor operations
  getReferringDoctors(clinicId: number): Promise<ReferringDoctor[]>;
  getReferringDoctor(id: number): Promise<ReferringDoctor | undefined>;
  searchReferringDoctors(clinicId: number, query: string): Promise<ReferringDoctor[]>;
  createReferringDoctor(doctor: InsertReferringDoctor): Promise<ReferringDoctor>;
  updateReferringDoctor(id: number, doctor: Partial<InsertReferringDoctor>): Promise<ReferringDoctor | undefined>;
  deleteReferringDoctor(id: number): Promise<void>;

  // Scan request operations
  getScanRequests(clinicId: number): Promise<ScanRequest[]>;
  getScanRequest(id: number): Promise<ScanRequest | undefined>;
  createScanRequest(request: InsertScanRequest): Promise<ScanRequest>;
  updateScanRequest(id: number, request: Partial<InsertScanRequest>): Promise<ScanRequest | undefined>;
  deleteScanRequest(id: number): Promise<void>;

  // Report distributions
  getReportDistributions(reportId: number): Promise<ReportDistribution[]>;
  getReportDistributionCounts(clinicId: number): Promise<Record<number, number>>;
  createReportDistribution(distribution: InsertReportDistribution): Promise<ReportDistribution>;

  // Scan type content templates
  getScanTypeContentTemplates(clinicId: number): Promise<ScanTypeContentTemplate[]>;
  getScanTypeContentTemplate(clinicId: number, scanType: string): Promise<ScanTypeContentTemplate | undefined>;
  upsertScanTypeContentTemplate(template: InsertScanTypeContentTemplate): Promise<ScanTypeContentTemplate>;
  deleteScanTypeContentTemplate(clinicId: number, scanType: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Clinic operations
  async getAllClinics(): Promise<Clinic[]> {
    return await db.select().from(clinics).orderBy(desc(clinics.createdAt));
  }

  async getClinic(id: number): Promise<Clinic | undefined> {
    const [clinic] = await db.select().from(clinics).where(eq(clinics.id, id));
    return clinic;
  }

  async getClinicByEmail(email: string): Promise<Clinic | undefined> {
    const [clinic] = await db.select().from(clinics).where(eq(clinics.email, email));
    return clinic;
  }

  async createClinic(clinicData: InsertClinic): Promise<Clinic> {
    const [clinic] = await db.insert(clinics).values(clinicData).returning();
    return clinic;
  }

  async updateClinic(id: number, clinicData: Partial<InsertClinic>): Promise<Clinic | undefined> {
    const [clinic] = await db
      .update(clinics)
      .set({ ...clinicData, updatedAt: new Date() })
      .where(eq(clinics.id, id))
      .returning();
    return clinic;
  }

  // User invitation operations
  async createUserInvitation(invitationData: InsertUserInvitation): Promise<UserInvitation> {
    const [invitation] = await db
      .insert(userInvitations)
      .values(invitationData)
      .returning();
    return invitation;
  }

  async getUserInvitation(token: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.token, token));
    return invitation;
  }

  async getInvitationByToken(token: string): Promise<UserInvitation | undefined> {
    return this.getUserInvitation(token);
  }

  async getClinicInvitations(clinicId: number): Promise<UserInvitation[]> {
    return await db
      .select()
      .from(userInvitations)
      .where(and(eq(userInvitations.clinicId, clinicId), eq(userInvitations.isActive, true)))
      .orderBy(desc(userInvitations.createdAt));
  }

  async acceptInvitation(token: string, userId: string): Promise<void> {
    const invitation = await this.getUserInvitation(token);
    if (!invitation || invitation.acceptedAt) {
      throw new Error("Invalid or already accepted invitation");
    }

    // Update user with clinic information
    await db
      .update(users)
      .set({
        clinicId: invitation.clinicId,
        role: invitation.role,
        joinedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Mark invitation as accepted
    await db
      .update(userInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(userInvitations.token, token));
  }

  async getUsersByClinic(clinicId: number): Promise<User[]> {
    const users_list = await db
      .select()
      .from(users)
      .where(eq(users.clinicId, clinicId))
      .orderBy(desc(users.createdAt));
    return users_list.map(user => FieldEncryption.decryptFields(user) as User);
  }

  // Staff management operations
  async getClinicStaff(clinicId: number): Promise<User[]> {
    const staff = await db
      .select()
      .from(users)
      .where(eq(users.clinicId, clinicId))
      .orderBy(desc(users.joinedAt));
    return staff.map(user => FieldEncryption.decryptFields(user) as User);
  }

  async getPendingInvitations(clinicId: number): Promise<UserInvitation[]> {
    return await db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.clinicId, clinicId))
      .orderBy(desc(userInvitations.createdAt));
  }

  async createInvitation(invitationData: InsertUserInvitation): Promise<UserInvitation> {
    const [invitation] = await db
      .insert(userInvitations)
      .values(invitationData)
      .returning();
    return invitation;
  }

  async cancelInvitation(invitationId: number, clinicId: number): Promise<void> {
    await db
      .update(userInvitations)
      .set({ isActive: false })
      .where(eq(userInvitations.id, invitationId));
  }

  async deactivateStaffMember(staffId: string, clinicId: number): Promise<void> {
    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, staffId));
  }

  async updateClinicLogo(clinicId: number, logoUrl: string): Promise<void> {
    await db
      .update(clinics)
      .set({ logoUrl, updatedAt: new Date() })
      .where(eq(clinics.id, clinicId));
  }

  async getAllPhysicians(): Promise<Physician[]> {
    return await db.select().from(physicians);
  }

  async getPhysician(id: number): Promise<Physician | undefined> {
    const [physician] = await db.select().from(physicians).where(eq(physicians.id, id));
    return physician;
  }

  async createPhysician(insertPhysician: InsertPhysician): Promise<Physician> {
    const [physician] = await db
      .insert(physicians)
      .values(insertPhysician)
      .returning();
    return physician;
  }

  async updatePhysician(id: number, updates: Partial<InsertPhysician>): Promise<Physician | undefined> {
    const [physician] = await db
      .update(physicians)
      .set(updates)
      .where(eq(physicians.id, id))
      .returning();
    return physician;
  }

  async deletePhysician(id: number): Promise<void> {
    await db.delete(physicians).where(eq(physicians.id, id));
  }

  async togglePhysicianStatus(id: number): Promise<Physician | undefined> {
    const [current] = await db.select().from(physicians).where(eq(physicians.id, id));
    if (!current) return undefined;
    
    const [physician] = await db
      .update(physicians)
      .set({ isActive: !current.isActive })
      .where(eq(physicians.id, id))
      .returning();
    return physician;
  }

  async getAllWorksheets(): Promise<Worksheet[]> {
    return await db.select().from(worksheets);
  }

  async getWorksheet(id: number): Promise<Worksheet | undefined> {
    const [worksheet] = await db.select().from(worksheets).where(eq(worksheets.id, id));
    return worksheet;
  }

  async createWorksheet(insertWorksheet: InsertWorksheet): Promise<Worksheet> {
    const [worksheet] = await db
      .insert(worksheets)
      .values(insertWorksheet)
      .returning();
    return worksheet;
  }

  async updateWorksheet(id: number, updates: Partial<InsertWorksheet>): Promise<Worksheet | undefined> {
    const [worksheet] = await db
      .update(worksheets)
      .set(updates)
      .where(eq(worksheets.id, id))
      .returning();
    return worksheet;
  }

  async getAllReports(): Promise<Report[]> {
    const allReports = await db.select().from(reports);
    return allReports.map(report => FieldEncryption.decryptFields(report) as Report);
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report ? FieldEncryption.decryptFields(report) as Report : undefined;
  }

  async getReportsByWorksheet(worksheetId: number): Promise<Report[]> {
    const reports = await db.select().from(reports).where(eq(reports.worksheetId, worksheetId));
    return reports.map(report => FieldEncryption.decryptFields(report) as Report);
  }

  async getRecentReports(limit: number): Promise<Report[]> {
    const reportResults = await db
      .select()
      .from(reports)
      .orderBy(desc(reports.generatedAt))
      .limit(limit);
    return reportResults.map(report => FieldEncryption.decryptFields(report) as Report);
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    // Encrypt sensitive medical data before storing
    const encryptedData = FieldEncryption.encryptFields(insertReport);
    
    const [report] = await db
      .insert(reports)
      .values(encryptedData as any)
      .returning();
    
    // Decrypt for return (user expects decrypted data)
    return FieldEncryption.decryptFields(report) as Report;
  }

  async updateReport(id: number, updates: Partial<InsertReport>): Promise<Report | undefined> {
    // Encrypt sensitive fields in updates
    const encryptedUpdates = FieldEncryption.encryptFields(updates);
    
    const [report] = await db
      .update(reports)
      .set(encryptedUpdates)
      .where(eq(reports.id, id))
      .returning();
    
    return report ? FieldEncryption.decryptFields(report) as Report : undefined;
  }

  async finalizeReport(id: number, userId: string): Promise<Report | undefined> {
    const [report] = await db
      .update(reports)
      .set({
        isFinalized: true,
        finalizedAt: new Date(),
        finalizedBy: userId,
        isDraft: false,
      })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async amendReport(id: number, updates: Partial<InsertReport>, userId: string, reason: string): Promise<Report | undefined> {
    const [report] = await db
      .update(reports)
      .set({
        ...updates,
        isAmended: true,
        amendedAt: new Date(),
        amendedBy: userId,
        amendmentReason: reason,
        // Reset finalization status if report was finalized
        isFinalized: false,
        finalizedAt: null,
        finalizedBy: null,
      })
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  async getAllTrainingPairs(): Promise<TrainingPair[]> {
    return await db.select().from(trainingPairs);
  }

  async getReportsByCategory(category: string, limit: number = 5): Promise<Report[]> {
    const categoryReports = await db
      .select()
      .from(reports)
      .where(sql`LOWER(${reports.studyType}) LIKE ${'%' + category.toLowerCase() + '%'}`)
      .orderBy(desc(reports.createdAt))
      .limit(limit);
    
    return categoryReports.map(report => FieldEncryption.decryptFields(report) as Report);
  }

  async getTrainingPair(id: number): Promise<TrainingPair | undefined> {
    const [trainingPair] = await db.select().from(trainingPairs).where(eq(trainingPairs.id, id));
    return trainingPair;
  }

  async createTrainingPair(insertTrainingPair: InsertTrainingPair): Promise<TrainingPair> {
    const [trainingPair] = await db
      .insert(trainingPairs)
      .values(insertTrainingPair)
      .returning();
    return trainingPair;
  }

  async getTrainingPairsByCategory(category: string): Promise<TrainingPair[]> {
    return await db.select().from(trainingPairs).where(eq(trainingPairs.category, category));
  }

  // Report Template operations
  async getAllReportTemplates(): Promise<ReportTemplate[]> {
    return await db.select().from(reportTemplates);
  }

  async getReportTemplate(id: number): Promise<ReportTemplate | undefined> {
    const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id));
    return template;
  }

  async createReportTemplate(insertTemplate: InsertReportTemplate): Promise<ReportTemplate> {
    const [template] = await db
      .insert(reportTemplates)
      .values(insertTemplate)
      .returning();
    return template;
  }

  async updateReportTemplate(id: number, updates: Partial<InsertReportTemplate>): Promise<ReportTemplate | undefined> {
    const [template] = await db
      .update(reportTemplates)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(reportTemplates.id, id))
      .returning();
    return template;
  }

  async deleteReportTemplate(id: number): Promise<void> {
    await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
  }

  async getDefaultTemplate(): Promise<ReportTemplate | undefined> {
    const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.isDefault, true));
    return template;
  }

  // Sonographer operations
  async getAllSonographers(): Promise<Sonographer[]> {
    return await db.select().from(sonographers).orderBy(sonographers.name);
  }

  async getSonographer(id: number): Promise<Sonographer | undefined> {
    const [sonographer] = await db
      .select()
      .from(sonographers)
      .where(eq(sonographers.id, id));
    return sonographer;
  }

  async getSonographerByInitials(initials: string): Promise<Sonographer | undefined> {
    const [sonographer] = await db
      .select()
      .from(sonographers)
      .where(eq(sonographers.initials, initials.toUpperCase()));
    return sonographer;
  }

  async createSonographer(sonographerData: InsertSonographerData): Promise<Sonographer> {
    const [sonographer] = await db
      .insert(sonographers)
      .values({
        ...sonographerData,
        initials: sonographerData.initials.toUpperCase(),
      })
      .returning();
    return sonographer;
  }

  async updateSonographer(id: number, sonographerData: Partial<InsertSonographerData>): Promise<Sonographer | undefined> {
    const updateData = sonographerData.initials 
      ? { ...sonographerData, initials: sonographerData.initials.toUpperCase() }
      : sonographerData;
      
    const [sonographer] = await db
      .update(sonographers)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(sonographers.id, id))
      .returning();
    return sonographer;
  }

  async deleteSonographer(id: number): Promise<void> {
    // First, remove the sonographer reference from any associated reports
    await db.update(reports).set({ sonographerId: null }).where(eq(reports.sonographerId, id));
    // Also remove from digital worksheets
    await db.update(digitalWorksheets).set({ sonographerId: null }).where(eq(digitalWorksheets.sonographerId, id));
    // Now delete the sonographer
    await db.delete(sonographers).where(eq(sonographers.id, id));
  }

  async toggleSonographerStatus(id: number): Promise<Sonographer | undefined> {
    // Get current sonographer
    const [current] = await db.select().from(sonographers).where(eq(sonographers.id, id));
    if (!current) return undefined;
    
    // Toggle isActive
    const [sonographer] = await db
      .update(sonographers)
      .set({ isActive: !current.isActive, updatedAt: new Date() })
      .where(eq(sonographers.id, id))
      .returning();
    return sonographer;
  }

  // Worksheet Template operations
  async getAllWorksheetTemplates(): Promise<WorksheetTemplate[]> {
    return await db.select().from(worksheetTemplates).orderBy(worksheetTemplates.name);
  }

  async getWorksheetTemplate(id: number): Promise<WorksheetTemplate | undefined> {
    const [template] = await db
      .select()
      .from(worksheetTemplates)
      .where(eq(worksheetTemplates.id, id));
    return template;
  }

  async createWorksheetTemplate(templateData: InsertWorksheetTemplate): Promise<WorksheetTemplate> {
    const [template] = await db
      .insert(worksheetTemplates)
      .values(templateData)
      .returning();
    return template;
  }

  async updateWorksheetTemplate(id: number, templateData: Partial<InsertWorksheetTemplate>): Promise<WorksheetTemplate | undefined> {
    const [template] = await db
      .update(worksheetTemplates)
      .set({
        ...templateData,
        updatedAt: new Date(),
      })
      .where(eq(worksheetTemplates.id, id))
      .returning();
    return template;
  }

  async deleteWorksheetTemplate(id: number): Promise<void> {
    // Nullify templateId on any digital worksheets that reference this template
    // before deleting, to avoid foreign key violation
    await db.update(digitalWorksheets)
      .set({ templateId: null })
      .where(eq(digitalWorksheets.templateId, id));
    await db.delete(worksheetTemplates).where(eq(worksheetTemplates.id, id));
  }

  // Digital Worksheet operations
  async getAllDigitalWorksheets(): Promise<DigitalWorksheet[]> {
    return await db.select().from(digitalWorksheets).orderBy(desc(digitalWorksheets.createdAt));
  }

  async getDigitalWorksheet(id: number): Promise<DigitalWorksheet | undefined> {
    const [worksheet] = await db
      .select()
      .from(digitalWorksheets)
      .where(eq(digitalWorksheets.id, id));
    return worksheet;
  }

  async createDigitalWorksheet(worksheetData: InsertDigitalWorksheet): Promise<DigitalWorksheet> {
    const [worksheet] = await db
      .insert(digitalWorksheets)
      .values(worksheetData)
      .returning();
    return worksheet;
  }

  async updateDigitalWorksheet(id: number, worksheetData: Partial<InsertDigitalWorksheet>): Promise<DigitalWorksheet | undefined> {
    const [worksheet] = await db
      .update(digitalWorksheets)
      .set({
        ...worksheetData,
        updatedAt: new Date(),
      })
      .where(eq(digitalWorksheets.id, id))
      .returning();
    return worksheet;
  }

  async deleteDigitalWorksheet(id: number): Promise<void> {
    await db.delete(digitalWorksheets).where(eq(digitalWorksheets.id, id));
  }

  async getDraftDigitalWorksheets(): Promise<DigitalWorksheet[]> {
    return await db
      .select()
      .from(digitalWorksheets)
      .where(eq(digitalWorksheets.isDraft, true))
      .orderBy(digitalWorksheets.updatedAt);
  }

  async createDraftReport(reportData: any): Promise<Report> {
    const reportToInsert = {
      patientName: reportData.patientName,
      patientDob: reportData.patientDob,
      examDate: reportData.examDate,
      studyType: reportData.studyType || 'Digital Drawing Study',
      indication: reportData.indication || 'Digital drawing session completed',
      findings: reportData.findings || 'Digital worksheet completed with drawings and annotations',
      impression: reportData.impression || 'Study completed - awaiting physician review',
      physicianId: 1, // Default to first physician
      sonographerId: reportData.sonographerId ? parseInt(reportData.sonographerId) : null,
      digitalWorksheetId: reportData.digitalWorksheetId,
      isDraft: true,
      generatedAt: new Date(),
    };

    const [created] = await db
      .insert(reports)
      .values(reportToInsert)
      .returning();
    return created;
  }

  // Legend Entries operations
  async getAllLegendEntries(): Promise<LegendEntry[]> {
    return await db.select().from(legendEntries).orderBy(desc(legendEntries.createdAt));
  }

  async getLegendEntry(id: number): Promise<LegendEntry | undefined> {
    const [entry] = await db
      .select()
      .from(legendEntries)
      .where(eq(legendEntries.id, id));
    return entry;
  }

  async createLegendEntry(entryData: InsertLegendEntry): Promise<LegendEntry> {
    const [entry] = await db
      .insert(legendEntries)
      .values(entryData)
      .returning();
    return entry;
  }

  async updateLegendEntry(id: number, entryData: Partial<InsertLegendEntry>): Promise<LegendEntry | undefined> {
    const [entry] = await db
      .update(legendEntries)
      .set({
        ...entryData,
        updatedAt: new Date(),
      })
      .where(eq(legendEntries.id, id))
      .returning();
    return entry;
  }

  async deleteLegendEntry(id: number): Promise<void> {
    await db.delete(legendEntries).where(eq(legendEntries.id, id));
  }

  async getLegendEntriesByCategory(category: string): Promise<LegendEntry[]> {
    return await db
      .select()
      .from(legendEntries)
      .where(eq(legendEntries.category, category))
      .orderBy(legendEntries.title);
  }

  // Text shortcuts operations
  async getAllTextShortcuts(): Promise<TextShortcut[]> {
    return await db.select().from(textShortcuts).orderBy(desc(textShortcuts.usageCount), textShortcuts.title);
  }

  async createTextShortcut(shortcut: InsertTextShortcut): Promise<TextShortcut> {
    const [newShortcut] = await db.insert(textShortcuts).values(shortcut).returning();
    return newShortcut;
  }

  async updateTextShortcut(id: number, shortcut: Partial<InsertTextShortcut>): Promise<TextShortcut | undefined> {
    const [updated] = await db
      .update(textShortcuts)
      .set({ ...shortcut, updatedAt: new Date() })
      .where(eq(textShortcuts.id, id))
      .returning();
    return updated;
  }

  async deleteTextShortcut(id: number): Promise<void> {
    await db.delete(textShortcuts).where(eq(textShortcuts.id, id));
  }

  async incrementShortcutUsage(id: number): Promise<void> {
    await db
      .update(textShortcuts)
      .set({ 
        usageCount: textShortcuts.usageCount + 1,
        updatedAt: new Date() 
      })
      .where(eq(textShortcuts.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    return allUsers.map(user => FieldEncryption.decryptFields(user) as User);
  }

  // Appointment operations
  async getAllAppointments(): Promise<Appointment[]> {
    return await db.select().from(appointments).orderBy(desc(appointments.appointmentDate));
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async getAppointmentsByDateRange(startDate: Date, endDate: Date): Promise<Appointment[]> {
    return await db
      .select()
      .from(appointments)
      .where(
        and(
          gte(appointments.appointmentDate, startDate),
          lte(appointments.appointmentDate, endDate)
        )
      )
      .orderBy(appointments.appointmentDate);
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values(appointment).returning();
    return newAppointment;
  }

  async updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updated] = await db
      .update(appointments)
      .set({ ...appointment, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  // Calendar event operations
  async getCalendarEventsByDateRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    return await db
      .select()
      .from(calendarEvents)
      .where(
        or(
          and(gte(calendarEvents.startTime, startDate), lte(calendarEvents.startTime, endDate)),
          and(lte(calendarEvents.startTime, startDate), gte(calendarEvents.endTime, startDate))
        )
      )
      .orderBy(calendarEvents.startTime);
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [newEvent] = await db.insert(calendarEvents).values(event).returning();
    return newEvent;
  }

  async updateCalendarEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const [updated] = await db.update(calendarEvents).set(event).where(eq(calendarEvents.id, id)).returning();
    return updated;
  }

  async deleteCalendarEvent(id: number): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  // Patient operations
  async getAllPatients(): Promise<Patient[]> {
    return await db.select().from(patients).orderBy(desc(patients.createdAt));
  }

  async getPatient(id: number): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient;
  }

  async searchPatients(query: string): Promise<Patient[]> {
    const searchTerm = `%${query}%`;
    return await db.select().from(patients).where(
      or(
        ilike(patients.firstName, searchTerm),
        ilike(patients.lastName, searchTerm),
        ilike(patients.phone, searchTerm),
        ilike(patients.email, searchTerm),
        sql`(${patients.firstName} || ' ' || ${patients.lastName}) ILIKE ${searchTerm}`
      )
    ).orderBy(patients.lastName, patients.firstName);
  }

  async generateNextUrNumber(clinicId?: number | null): Promise<string> {
    // Find the highest existing UR number for this clinic (or globally if no clinic)
    const query = clinicId
      ? db.select({ maxUr: max(patients.urNumber) }).from(patients).where(eq(patients.clinicId, clinicId))
      : db.select({ maxUr: max(patients.urNumber) }).from(patients);
    const [result] = await query;
    const maxUr = result?.maxUr;
    // Parse numeric part (strip any non-digit prefix like "NVI-") and increment
    const numeric = maxUr ? parseInt(maxUr.replace(/\D/g, ''), 10) : 0;
    const next = isNaN(numeric) || numeric < 100000 ? 100001 : numeric + 1;
    return String(next).padStart(6, '0');
  }

  async createPatient(patient: InsertPatientData): Promise<Patient> {
    // Auto-assign UR number if not provided
    let urNumber = (patient as any).urNumber;
    if (!urNumber) {
      urNumber = await this.generateNextUrNumber((patient as any).clinicId);
    }
    const [created] = await db.insert(patients).values({ ...patient, urNumber }).returning();
    return created;
  }

  async updatePatient(id: number, patient: Partial<InsertPatientData>): Promise<Patient | undefined> {
    const [updated] = await db.update(patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return updated;
  }

  async deletePatient(id: number): Promise<void> {
    await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
  }

  async getPatientWorksheets(patientId: number): Promise<Worksheet[]> {
    return await db.select().from(worksheets).where(eq(worksheets.patientId, patientId)).orderBy(desc(worksheets.uploadedAt));
  }

  async getPatientDigitalWorksheets(patientId: number): Promise<DigitalWorksheet[]> {
    return await db.select().from(digitalWorksheets).where(eq(digitalWorksheets.patientId, patientId)).orderBy(desc(digitalWorksheets.createdAt));
  }

  async getPatientReports(patientId: number): Promise<Report[]> {
    const reportResults = await db.select().from(reports).where(eq(reports.patientId, patientId)).orderBy(desc(reports.generatedAt));
    return reportResults.map(report => FieldEncryption.decryptFields(report) as Report);
  }

  async getPatientAppointments(patientId: number): Promise<Appointment[]> {
    return await db.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.appointmentDate));
  }

  async getPatientDocuments(patientId: number): Promise<PatientDocument[]> {
    return await db.select().from(patientDocuments).where(eq(patientDocuments.patientId, patientId)).orderBy(desc(patientDocuments.documentDate));
  }

  async createPatientDocument(document: InsertPatientDocument): Promise<PatientDocument> {
    const [created] = await db.insert(patientDocuments).values(document).returning();
    return created;
  }

  async deletePatientDocument(id: number): Promise<void> {
    await db.delete(patientDocuments).where(eq(patientDocuments.id, id));
  }

  // Patient portal operations
  async createPatientPortalInvitation(data: InsertPatientPortalInvitation): Promise<PatientPortalInvitation> {
    const [invitation] = await db
      .insert(patientPortalInvitations)
      .values(data)
      .returning();
    return invitation;
  }

  async getPatientPortalInvitationByToken(token: string): Promise<PatientPortalInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(patientPortalInvitations)
      .where(eq(patientPortalInvitations.token, token));
    return invitation;
  }

  async getPatientPortalInvitationByPatientId(patientId: number): Promise<PatientPortalInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(patientPortalInvitations)
      .where(and(eq(patientPortalInvitations.patientId, patientId), eq(patientPortalInvitations.isActive, true)))
      .orderBy(desc(patientPortalInvitations.createdAt))
      .limit(1);
    return invitation;
  }

  async acceptPatientPortalInvitation(token: string): Promise<void> {
    await db
      .update(patientPortalInvitations)
      .set({
        isActive: false,
        acceptedAt: new Date(),
      })
      .where(eq(patientPortalInvitations.token, token));
  }

  async createPatientPortalAccount(data: InsertPatientPortalAccount): Promise<PatientPortalAccount> {
    const [account] = await db
      .insert(patientPortalAccounts)
      .values(data)
      .returning();
    return account;
  }

  async getPatientPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined> {
    const [account] = await db
      .select()
      .from(patientPortalAccounts)
      .where(eq(patientPortalAccounts.email, email));
    return account;
  }

  async getPatientPortalAccountById(id: number): Promise<PatientPortalAccount | undefined> {
    const [account] = await db
      .select()
      .from(patientPortalAccounts)
      .where(eq(patientPortalAccounts.id, id));
    return account;
  }

  async getPatientPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined> {
    const [account] = await db
      .select()
      .from(patientPortalAccounts)
      .where(eq(patientPortalAccounts.patientId, patientId));
    return account;
  }

  async getScanDurationSettings(clinicId: number): Promise<ScanDurationSetting[]> {
    const existing = await db
      .select()
      .from(scanDurationSettings)
      .where(eq(scanDurationSettings.clinicId, clinicId));

    // Return defaults for any scan types not yet configured
    const existingTypes = new Set(existing.map(s => s.scanType));
    const defaults: ScanDurationSetting[] = CANONICAL_SCAN_TYPES
      .filter(ct => !existingTypes.has(ct.name))
      .map((ct, idx) => ({
        id: -(idx + 1),
        clinicId,
        scanType: ct.name,
        isEnabled: true,
        hasLaterality: ct.hasLaterality,
        unilateralDuration: ct.hasLaterality ? 30 : null,
        bilateralDuration: 45,
      }));

    const all = [...existing, ...defaults];
    // Sort by canonical order
    const order = CANONICAL_SCAN_TYPES.map(ct => ct.name);
    return all.sort((a, b) => order.indexOf(a.scanType) - order.indexOf(b.scanType));
  }

  async upsertScanDurationSettings(clinicId: number, settings: Omit<InsertScanDurationSetting, 'clinicId'>[]): Promise<ScanDurationSetting[]> {
    const result: ScanDurationSetting[] = [];
    for (const setting of settings) {
      const [existing] = await db
        .select()
        .from(scanDurationSettings)
        .where(and(
          eq(scanDurationSettings.clinicId, clinicId),
          eq(scanDurationSettings.scanType, setting.scanType)
        ));

      if (existing) {
        const [updated] = await db
          .update(scanDurationSettings)
          .set({
            isEnabled: setting.isEnabled,
            hasLaterality: setting.hasLaterality,
            unilateralDuration: setting.unilateralDuration,
            bilateralDuration: setting.bilateralDuration,
          })
          .where(eq(scanDurationSettings.id, existing.id))
          .returning();
        result.push(updated);
      } else {
        const [created] = await db
          .insert(scanDurationSettings)
          .values({ ...setting, clinicId })
          .returning();
        result.push(created);
      }
    }
    return result;
  }

  // Referring doctor operations
  async getReferringDoctors(clinicId: number): Promise<ReferringDoctor[]> {
    return db.select().from(referringDoctors).where(eq(referringDoctors.clinicId, clinicId)).orderBy(referringDoctors.name);
  }

  async getReferringDoctor(id: number): Promise<ReferringDoctor | undefined> {
    const [doctor] = await db.select().from(referringDoctors).where(eq(referringDoctors.id, id));
    return doctor;
  }

  async searchReferringDoctors(clinicId: number, query: string): Promise<ReferringDoctor[]> {
    return db.select().from(referringDoctors).where(
      and(
        eq(referringDoctors.clinicId, clinicId),
        or(
          ilike(referringDoctors.name, `%${query}%`),
          ilike(referringDoctors.providerNumber, `%${query}%`),
          ilike(referringDoctors.practiceName, `%${query}%`)
        )
      )
    ).orderBy(referringDoctors.name);
  }

  async createReferringDoctor(doctor: InsertReferringDoctor): Promise<ReferringDoctor> {
    const [created] = await db.insert(referringDoctors).values(doctor).returning();
    return created;
  }

  async updateReferringDoctor(id: number, doctor: Partial<InsertReferringDoctor>): Promise<ReferringDoctor | undefined> {
    const [updated] = await db.update(referringDoctors).set(doctor).where(eq(referringDoctors.id, id)).returning();
    return updated;
  }

  async deleteReferringDoctor(id: number): Promise<void> {
    await db.delete(referringDoctors).where(eq(referringDoctors.id, id));
  }

  // Scan request operations
  async getScanRequests(clinicId: number): Promise<ScanRequest[]> {
    return db.select().from(scanRequests).where(eq(scanRequests.clinicId, clinicId)).orderBy(desc(scanRequests.createdAt));
  }

  async getScanRequest(id: number): Promise<ScanRequest | undefined> {
    const [request] = await db.select().from(scanRequests).where(eq(scanRequests.id, id));
    return request;
  }

  async createScanRequest(request: InsertScanRequest): Promise<ScanRequest> {
    const [created] = await db.insert(scanRequests).values(request).returning();
    return created;
  }

  async updateScanRequest(id: number, request: Partial<InsertScanRequest>): Promise<ScanRequest | undefined> {
    const [updated] = await db.update(scanRequests).set(request).where(eq(scanRequests.id, id)).returning();
    return updated;
  }

  async deleteScanRequest(id: number): Promise<void> {
    await db.delete(scanRequests).where(eq(scanRequests.id, id));
  }

  async getReportDistributions(reportId: number): Promise<ReportDistribution[]> {
    return db
      .select()
      .from(reportDistributions)
      .where(eq(reportDistributions.reportId, reportId))
      .orderBy(desc(reportDistributions.sentAt));
  }

  async getReportDistributionCounts(clinicId: number): Promise<Record<number, number>> {
    const rows = await db
      .select({ reportId: reportDistributions.reportId, count: sql<number>`count(*)::int` })
      .from(reportDistributions)
      .where(eq(reportDistributions.clinicId, clinicId))
      .groupBy(reportDistributions.reportId);
    return Object.fromEntries(rows.map(r => [r.reportId, r.count]));
  }

  async createReportDistribution(distribution: InsertReportDistribution): Promise<ReportDistribution> {
    const [created] = await db.insert(reportDistributions).values(distribution).returning();
    return created;
  }

  async getScanTypeContentTemplates(clinicId: number): Promise<ScanTypeContentTemplate[]> {
    return db.select().from(scanTypeContentTemplates).where(eq(scanTypeContentTemplates.clinicId, clinicId));
  }

  async getScanTypeContentTemplate(clinicId: number, scanType: string): Promise<ScanTypeContentTemplate | undefined> {
    const [row] = await db.select().from(scanTypeContentTemplates)
      .where(and(eq(scanTypeContentTemplates.clinicId, clinicId), eq(scanTypeContentTemplates.scanType, scanType)));
    return row;
  }

  async upsertScanTypeContentTemplate(template: InsertScanTypeContentTemplate): Promise<ScanTypeContentTemplate> {
    const existing = await this.getScanTypeContentTemplate(template.clinicId!, template.scanType);
    if (existing) {
      const [updated] = await db.update(scanTypeContentTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(eq(scanTypeContentTemplates.clinicId, template.clinicId!), eq(scanTypeContentTemplates.scanType, template.scanType)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(scanTypeContentTemplates).values({ ...template, updatedAt: new Date() }).returning();
    return created;
  }

  async deleteScanTypeContentTemplate(clinicId: number, scanType: string): Promise<void> {
    await db.delete(scanTypeContentTemplates)
      .where(and(eq(scanTypeContentTemplates.clinicId, clinicId), eq(scanTypeContentTemplates.scanType, scanType)));
  }
}

export const storage = new DatabaseStorage();
