import { 
  users, 
  physicians, 
  worksheets, 
  reports, 
  trainingPairs,
  type User, 
  type InsertUser,
  type Physician,
  type InsertPhysician,
  type Worksheet,
  type InsertWorksheet,
  type Report,
  type InsertReport,
  type TrainingPair,
  type InsertTrainingPair
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllPhysicians(): Promise<Physician[]>;
  getPhysician(id: number): Promise<Physician | undefined>;
  createPhysician(physician: InsertPhysician): Promise<Physician>;
  updatePhysician(id: number, physician: Partial<InsertPhysician>): Promise<Physician | undefined>;
  
  getAllWorksheets(): Promise<Worksheet[]>;
  getWorksheet(id: number): Promise<Worksheet | undefined>;
  createWorksheet(worksheet: InsertWorksheet): Promise<Worksheet>;
  updateWorksheet(id: number, worksheet: Partial<InsertWorksheet>): Promise<Worksheet | undefined>;
  
  getAllReports(): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  getReportsByWorksheet(worksheetId: number): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  
  getAllTrainingPairs(): Promise<TrainingPair[]>;
  getTrainingPair(id: number): Promise<TrainingPair | undefined>;
  createTrainingPair(trainingPair: InsertTrainingPair): Promise<TrainingPair>;
  getTrainingPairsByCategory(category: string): Promise<TrainingPair[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private physicians: Map<number, Physician>;
  private worksheets: Map<number, Worksheet>;
  private reports: Map<number, Report>;
  private trainingPairs: Map<number, TrainingPair>;
  private currentUserId: number;
  private currentPhysicianId: number;
  private currentWorksheetId: number;
  private currentReportId: number;
  private currentTrainingPairId: number;

  constructor() {
    this.users = new Map();
    this.physicians = new Map();
    this.worksheets = new Map();
    this.reports = new Map();
    this.trainingPairs = new Map();
    this.currentUserId = 1;
    this.currentPhysicianId = 1;
    this.currentWorksheetId = 1;
    this.currentReportId = 1;
    this.currentTrainingPairId = 1;
    
    // Initialize with default physicians
    this.initializeDefaultData();
  }

  private async initializeDefaultData() {
    await this.createPhysician({
      name: "Dr. Sarah Johnson",
      title: "MD",
      specialty: "Radiologist",
      signatureUrl: "/signatures/sarah-johnson.png"
    });
    
    await this.createPhysician({
      name: "Dr. Michael Chen",
      title: "MD",
      specialty: "Radiologist",
      signatureUrl: "/signatures/michael-chen.png"
    });
    
    await this.createPhysician({
      name: "Dr. Emily Rodriguez",
      title: "MD",
      specialty: "Radiologist",
      signatureUrl: "/signatures/emily-rodriguez.png"
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllPhysicians(): Promise<Physician[]> {
    return Array.from(this.physicians.values());
  }

  async getPhysician(id: number): Promise<Physician | undefined> {
    return this.physicians.get(id);
  }

  async createPhysician(insertPhysician: InsertPhysician): Promise<Physician> {
    const id = this.currentPhysicianId++;
    const physician: Physician = { ...insertPhysician, id };
    this.physicians.set(id, physician);
    return physician;
  }

  async updatePhysician(id: number, updates: Partial<InsertPhysician>): Promise<Physician | undefined> {
    const physician = this.physicians.get(id);
    if (!physician) return undefined;
    
    const updated = { ...physician, ...updates };
    this.physicians.set(id, updated);
    return updated;
  }

  async getAllWorksheets(): Promise<Worksheet[]> {
    return Array.from(this.worksheets.values());
  }

  async getWorksheet(id: number): Promise<Worksheet | undefined> {
    return this.worksheets.get(id);
  }

  async createWorksheet(insertWorksheet: InsertWorksheet): Promise<Worksheet> {
    const id = this.currentWorksheetId++;
    const worksheet: Worksheet = { 
      ...insertWorksheet, 
      id,
      uploadedAt: new Date()
    };
    this.worksheets.set(id, worksheet);
    return worksheet;
  }

  async updateWorksheet(id: number, updates: Partial<InsertWorksheet>): Promise<Worksheet | undefined> {
    const worksheet = this.worksheets.get(id);
    if (!worksheet) return undefined;
    
    const updated = { ...worksheet, ...updates };
    this.worksheets.set(id, updated);
    return updated;
  }

  async getAllReports(): Promise<Report[]> {
    return Array.from(this.reports.values());
  }

  async getReport(id: number): Promise<Report | undefined> {
    return this.reports.get(id);
  }

  async getReportsByWorksheet(worksheetId: number): Promise<Report[]> {
    return Array.from(this.reports.values()).filter(
      report => report.worksheetId === worksheetId
    );
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const id = this.currentReportId++;
    const report: Report = { 
      ...insertReport, 
      id,
      generatedAt: new Date()
    };
    this.reports.set(id, report);
    return report;
  }

  async getAllTrainingPairs(): Promise<TrainingPair[]> {
    return Array.from(this.trainingPairs.values());
  }

  async getTrainingPair(id: number): Promise<TrainingPair | undefined> {
    return this.trainingPairs.get(id);
  }

  async createTrainingPair(insertTrainingPair: InsertTrainingPair): Promise<TrainingPair> {
    const id = this.currentTrainingPairId++;
    const trainingPair: TrainingPair = { 
      ...insertTrainingPair, 
      id,
      uploadedAt: new Date()
    };
    this.trainingPairs.set(id, trainingPair);
    return trainingPair;
  }

  async getTrainingPairsByCategory(category: string): Promise<TrainingPair[]> {
    return Array.from(this.trainingPairs.values()).filter(
      pair => pair.category === category
    );
  }
}

export const storage = new MemStorage();
