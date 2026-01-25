import fs from 'fs';
import path from 'path';
import { storage } from '../storage';

const PATIENT_FILES_DIR = path.join(process.cwd(), 'patient-files');

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

function getFileExtension(filePath: string, mimeType?: string): string {
  const ext = path.extname(filePath);
  if (ext) return ext;
  
  if (mimeType) {
    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return mimeMap[mimeType] || '';
  }
  return '';
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getPatientFolderPath(patientName: string, patientId: number): string {
  const folderName = `${sanitizeFolderName(patientName)}_${patientId}`;
  return path.join(PATIENT_FILES_DIR, folderName);
}

export async function syncFileToPatientFolder(
  sourceFilePath: string,
  patientId: number,
  patientName: string,
  documentType: 'worksheets' | 'reports' | 'documents' | 'digital-worksheets',
  fileName: string,
  mimeType?: string
): Promise<string> {
  try {
    const patientFolder = getPatientFolderPath(patientName, patientId);
    const typeFolder = path.join(patientFolder, documentType);
    ensureDir(typeFolder);

    const ext = getFileExtension(fileName, mimeType);
    const baseName = path.basename(fileName, ext);
    const sanitizedName = sanitizeFolderName(baseName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const destFileName = `${sanitizedName}_${timestamp}${ext}`;
    const destPath = path.join(typeFolder, destFileName);

    const absoluteSource = path.isAbsolute(sourceFilePath) 
      ? sourceFilePath 
      : path.join(process.cwd(), sourceFilePath);

    if (fs.existsSync(absoluteSource)) {
      fs.copyFileSync(absoluteSource, destPath);
      console.log(`📁 Synced file to: ${destPath}`);
      return destPath;
    } else {
      console.warn(`⚠️ Source file not found: ${absoluteSource}`);
      return '';
    }
  } catch (error) {
    console.error('Error syncing file to patient folder:', error);
    return '';
  }
}

export async function syncWorksheetToPatientFolder(worksheetId: number): Promise<string> {
  try {
    const worksheet = await storage.getWorksheet(worksheetId);
    if (!worksheet) return '';

    const patientId = worksheet.patientId;
    if (!patientId) {
      console.log('Worksheet has no patient ID, skipping sync');
      return '';
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) return '';

    const patientName = `${patient.firstName}_${patient.lastName}`;
    const filePath = worksheet.fileUrl?.replace(/^\//, '');
    
    if (filePath && fs.existsSync(path.join(process.cwd(), filePath))) {
      const originalName = worksheet.originalName || `worksheet_${worksheetId}`;
      return await syncFileToPatientFolder(
        filePath,
        patientId,
        patientName,
        'worksheets',
        originalName
      );
    }
    return '';
  } catch (error) {
    console.error('Error syncing worksheet:', error);
    return '';
  }
}

export async function syncReportToPatientFolder(reportId: number): Promise<string> {
  try {
    const report = await storage.getReport(reportId);
    if (!report) return '';

    const patientId = report.patientId;
    if (!patientId) {
      console.log('Report has no patient ID, skipping sync');
      return '';
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) return '';

    const patientName = `${patient.firstName}_${patient.lastName}`;
    const patientFolder = getPatientFolderPath(patientName, patientId);
    const reportsFolder = path.join(patientFolder, 'reports');
    ensureDir(reportsFolder);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `report_${reportId}_${timestamp}.json`;
    const destPath = path.join(reportsFolder, fileName);

    const reportData = {
      id: report.id,
      patientName: report.patientName,
      patientDob: report.patientDob,
      examDate: report.examDate,
      studyType: report.studyType,
      findings: report.findings,
      impression: report.impression,
      isFinalized: report.isFinalized,
      finalizedAt: report.finalizedAt,
      generatedAt: report.generatedAt,
    };

    fs.writeFileSync(destPath, JSON.stringify(reportData, null, 2));
    console.log(`📁 Synced report to: ${destPath}`);
    return destPath;
  } catch (error) {
    console.error('Error syncing report:', error);
    return '';
  }
}

export async function syncDocumentToPatientFolder(
  patientId: number,
  document: { id: number; title: string; fileUrl: string }
): Promise<string> {
  try {
    const patient = await storage.getPatient(patientId);
    if (!patient) return '';

    const patientName = `${patient.firstName}_${patient.lastName}`;
    const filePath = document.fileUrl?.replace(/^\//, '');
    
    if (filePath && fs.existsSync(path.join(process.cwd(), filePath))) {
      const originalName = document.title || `document_${document.id}`;
      const ext = getFileExtension(filePath);
      return await syncFileToPatientFolder(
        filePath,
        patientId,
        patientName,
        'documents',
        originalName + ext
      );
    }
    return '';
  } catch (error) {
    console.error('Error syncing document:', error);
    return '';
  }
}

export async function syncDigitalWorksheetToPatientFolder(
  worksheetId: number
): Promise<string> {
  try {
    const worksheet = await storage.getDigitalWorksheet(worksheetId);
    if (!worksheet) return '';

    const patientId = worksheet.patientId;
    if (!patientId) {
      console.log('Digital worksheet has no patient ID, skipping sync');
      return '';
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) return '';

    const patientName = `${patient.firstName}_${patient.lastName}`;
    const drawingData = worksheet.drawingData;
    
    if (drawingData) {
      const patientFolder = getPatientFolderPath(patientName, patientId);
      const typeFolder = path.join(patientFolder, 'digital-worksheets');
      ensureDir(typeFolder);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const destFileName = `digital_worksheet_${worksheetId}_${timestamp}.png`;
      const destPath = path.join(typeFolder, destFileName);

      const base64Data = drawingData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(destPath, buffer);
      console.log(`📁 Synced digital worksheet to: ${destPath}`);
      return destPath;
    }
    return '';
  } catch (error) {
    console.error('Error syncing digital worksheet:', error);
    return '';
  }
}

export async function syncAllPatientFiles(): Promise<{
  worksheets: number;
  reports: number;
  documents: number;
  digitalWorksheets: number;
}> {
  const stats = { worksheets: 0, reports: 0, documents: 0, digitalWorksheets: 0 };

  try {
    console.log('🔄 Starting full patient files sync...');
    ensureDir(PATIENT_FILES_DIR);

    const patients = await storage.getAllPatients();
    
    for (const patient of patients) {
      const patientName = `${patient.firstName}_${patient.lastName}`;
      
      const worksheets = await storage.getPatientWorksheets(patient.id);
      for (const ws of worksheets) {
        const filePath = ws.fileUrl?.replace(/^\//, '');
        if (filePath && fs.existsSync(path.join(process.cwd(), filePath))) {
          const originalName = ws.originalName || `worksheet_${ws.id}`;
          const result = await syncFileToPatientFolder(
            filePath,
            patient.id,
            patientName,
            'worksheets',
            originalName
          );
          if (result) stats.worksheets++;
        }
      }

      const reports = await storage.getPatientReports(patient.id);
      for (const report of reports) {
        const patientFolder = getPatientFolderPath(patientName, patient.id);
        const reportsFolder = path.join(patientFolder, 'reports');
        ensureDir(reportsFolder);

        const timestamp = new Date(report.generatedAt || new Date()).toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const fileName = `report_${report.id}_${timestamp}.json`;
        const destPath = path.join(reportsFolder, fileName);

        const reportData = {
          id: report.id,
          patientName: report.patientName,
          studyType: report.studyType,
          findings: report.findings,
          impression: report.impression,
          isFinalized: report.isFinalized,
          generatedAt: report.generatedAt,
        };

        fs.writeFileSync(destPath, JSON.stringify(reportData, null, 2));
        stats.reports++;
      }

      const documents = await storage.getPatientDocuments(patient.id);
      for (const doc of documents) {
        const filePath = doc.fileUrl?.replace(/^\//, '');
        if (filePath && fs.existsSync(path.join(process.cwd(), filePath))) {
          const originalName = doc.title || `document_${doc.id}`;
          const ext = getFileExtension(filePath);
          const result = await syncFileToPatientFolder(
            filePath,
            patient.id,
            patientName,
            'documents',
            originalName + ext
          );
          if (result) stats.documents++;
        }
      }

      const digitalWorksheets = await storage.getPatientDigitalWorksheets(patient.id);
      for (const dw of digitalWorksheets) {
        const drawingData = dw.drawingData;
        if (drawingData) {
          const patientFolder = getPatientFolderPath(patientName, patient.id);
          const typeFolder = path.join(patientFolder, 'digital-worksheets');
          ensureDir(typeFolder);

          const timestamp = new Date(dw.createdAt || new Date()).toISOString().replace(/[:.]/g, '-').substring(0, 19);
          const destFileName = `digital_worksheet_${dw.id}_${timestamp}.png`;
          const destPath = path.join(typeFolder, destFileName);

          const base64Data = drawingData.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(destPath, buffer);
          stats.digitalWorksheets++;
        }
      }
    }

    console.log(`✅ Sync complete: ${stats.worksheets} worksheets, ${stats.reports} reports, ${stats.documents} documents, ${stats.digitalWorksheets} digital worksheets`);
    return stats;
  } catch (error) {
    console.error('Error during full sync:', error);
    return stats;
  }
}

export function getPatientFilesDir(): string {
  return PATIENT_FILES_DIR;
}
