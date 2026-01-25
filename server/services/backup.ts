import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { storage } from '../storage';

const BACKUP_METADATA_FILE = path.join(process.cwd(), '.last-backup.json');

interface BackupMetadata {
  lastBackupDate: string;
  filesIncluded: number;
}

export function getLastBackupDate(): Date | null {
  try {
    if (fs.existsSync(BACKUP_METADATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(BACKUP_METADATA_FILE, 'utf-8'));
      return new Date(data.lastBackupDate);
    }
  } catch (error) {
    console.error('Error reading backup metadata:', error);
  }
  return null;
}

export function setLastBackupDate(date: Date, filesIncluded: number): void {
  try {
    const metadata: BackupMetadata = {
      lastBackupDate: date.toISOString(),
      filesIncluded
    };
    fs.writeFileSync(BACKUP_METADATA_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error saving backup metadata:', error);
  }
}

interface FileInfo {
  path: string;
  name: string;
  modifiedDate: Date;
  patientName: string;
  type: string;
}

async function collectPatientFiles(sinceDate?: Date): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  const uploadDir = path.join(process.cwd(), 'uploads');
  
  try {
    const patients = await storage.getAllPatients();
    
    for (const patient of patients) {
      const patientName = `${patient.firstName}_${patient.lastName}`;
      
      const worksheets = await storage.getPatientWorksheets(patient.id);
      for (const ws of worksheets) {
        const filePath = ws.fileUrl?.replace(/^\//, '');
        if (filePath) {
          const fullPath = path.join(process.cwd(), filePath);
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (!sinceDate || stats.mtime > sinceDate) {
              files.push({
                path: fullPath,
                name: `${patientName}/worksheets/${ws.originalName || ws.filename}`,
                modifiedDate: stats.mtime,
                patientName,
                type: 'worksheet'
              });
            }
          }
        }
      }

      const reports = await storage.getPatientReports(patient.id);
      for (const report of reports) {
        const reportDate = new Date(report.generatedAt || new Date());
        if (!sinceDate || reportDate > sinceDate) {
          const reportJson = JSON.stringify({
            id: report.id,
            patientName: report.patientName,
            patientDob: report.patientDob,
            examDate: report.examDate,
            studyType: report.studyType,
            indication: report.indication,
            findings: report.findings,
            impression: report.impression,
            isFinalized: report.isFinalized,
            finalizedAt: report.finalizedAt,
            generatedAt: report.generatedAt,
          }, null, 2);
          
          files.push({
            path: '',
            name: `${patientName}/reports/report_${report.id}.json`,
            modifiedDate: reportDate,
            patientName,
            type: 'report',
            content: reportJson
          } as any);
        }
      }

      const documents = await storage.getPatientDocuments(patient.id);
      for (const doc of documents) {
        const filePath = doc.fileUrl?.replace(/^\//, '');
        if (filePath) {
          const fullPath = path.join(process.cwd(), filePath);
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (!sinceDate || stats.mtime > sinceDate) {
              const ext = path.extname(doc.originalName || doc.filename);
              files.push({
                path: fullPath,
                name: `${patientName}/documents/${doc.title || doc.originalName}${ext ? '' : '.file'}`,
                modifiedDate: stats.mtime,
                patientName,
                type: 'document'
              });
            }
          }
        }
      }

      const digitalWorksheets = await storage.getPatientDigitalWorksheets(patient.id);
      for (const dw of digitalWorksheets) {
        const dwDate = new Date(dw.createdAt || new Date());
        if (!sinceDate || dwDate > sinceDate) {
          if (dw.drawingData) {
            files.push({
              path: '',
              name: `${patientName}/digital-worksheets/worksheet_${dw.id}.png`,
              modifiedDate: dwDate,
              patientName,
              type: 'digitalWorksheet',
              base64Data: dw.drawingData
            } as any);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error collecting patient files:', error);
  }
  
  return files;
}

export async function createBackupArchive(
  outputStream: NodeJS.WritableStream,
  includeAll: boolean = true
): Promise<{ filesIncluded: number; totalSize: number }> {
  const sinceDate = includeAll ? undefined : getLastBackupDate() || undefined;
  const files = await collectPatientFiles(sinceDate);
  
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    let totalSize = 0;
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.on('end', () => {
      setLastBackupDate(new Date(), files.length);
      resolve({ filesIncluded: files.length, totalSize });
    });
    
    archive.pipe(outputStream);
    
    for (const file of files) {
      if ((file as any).content) {
        archive.append((file as any).content, { name: file.name });
        totalSize += (file as any).content.length;
      } else if ((file as any).base64Data) {
        const base64 = (file as any).base64Data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        archive.append(buffer, { name: file.name });
        totalSize += buffer.length;
      } else if (file.path && fs.existsSync(file.path)) {
        const stats = fs.statSync(file.path);
        totalSize += stats.size;
        archive.file(file.path, { name: file.name });
      }
    }
    
    archive.finalize();
  });
}

export async function getBackupInfo(): Promise<{
  lastBackupDate: string | null;
  totalFilesAvailable: number;
  filesSinceLastBackup: number;
}> {
  const lastBackup = getLastBackupDate();
  const allFiles = await collectPatientFiles();
  const newFiles = lastBackup ? await collectPatientFiles(lastBackup) : allFiles;
  
  return {
    lastBackupDate: lastBackup ? lastBackup.toISOString() : null,
    totalFilesAvailable: allFiles.length,
    filesSinceLastBackup: newFiles.length
  };
}
