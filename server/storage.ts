import {
  users,
  physicians,
  worksheets,
  reports,
  trainingPairs,
  reportTemplates,
  type User,
  type UpsertUser,
  type Physician,
  type InsertPhysician,
  type Worksheet,
  type InsertWorksheet,
  type Report,
  type InsertReport,
  type TrainingPair,
  type InsertTrainingPair,
  type ReportTemplate,
  type InsertReportTemplate
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  getAllPhysicians(): Promise<Physician[]>;
  getPhysician(id: number): Promise<Physician | undefined>;
  createPhysician(physician: InsertPhysician): Promise<Physician>;
  updatePhysician(id: number, physician: Partial<InsertPhysician>): Promise<Physician | undefined>;
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
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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
    return await db.select().from(reports);
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async getReportsByWorksheet(worksheetId: number): Promise<Report[]> {
    return await db.select().from(reports).where(eq(reports.worksheetId, worksheetId));
  }

  async getRecentReports(limit: number): Promise<Report[]> {
    return await db
      .select()
      .from(reports)
      .orderBy(desc(reports.generatedAt))
      .limit(limit);
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const [report] = await db
      .insert(reports)
      .values(insertReport)
      .returning();
    return report;
  }

  async updateReport(id: number, updates: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db
      .update(reports)
      .set(updates)
      .where(eq(reports.id, id))
      .returning();
    return report;
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  async getAllTrainingPairs(): Promise<TrainingPair[]> {
    return await db.select().from(trainingPairs);
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
}

export const storage = new DatabaseStorage();
