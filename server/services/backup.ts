import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { storage } from '../storage';
import { db } from '../db';
import { systemSettings } from '@shared/schema';
import { eq, sql as drizzleSql } from 'drizzle-orm';

const BACKUP_METADATA_FILE = path.join(process.cwd(), '.last-backup.json');
const LAST_BACKUP_KEY = 'last_backup';

interface BackupMetadata {
  lastBackupDate: string;
  filesIncluded: number;
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  } catch (error) {
    console.error('Error reading system setting:', key, error);
    return null;
  }
}

async function writeSetting(key: string, value: string): Promise<void> {
  try {
    await db.execute(drizzleSql`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);
  } catch (error) {
    console.error('Error writing system setting:', key, error);
  }
}

// One-time migration: if the DB doesn't yet have a record but the legacy
// .last-backup.json file does, copy its value across so we don't lose history.
let migrationDone = false;
async function migrateLegacyMetadataIfNeeded(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const existing = await readSetting(LAST_BACKUP_KEY);
    if (existing) return;
    if (fs.existsSync(BACKUP_METADATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(BACKUP_METADATA_FILE, 'utf-8')) as BackupMetadata;
      if (data?.lastBackupDate) {
        await writeSetting(LAST_BACKUP_KEY, JSON.stringify(data));
        console.log('[backup] Migrated legacy .last-backup.json into system_settings');
      }
    }
  } catch (error) {
    console.error('Error migrating legacy backup metadata:', error);
  }
}

export async function getLastBackupDate(): Promise<Date | null> {
  await migrateLegacyMetadataIfNeeded();
  const raw = await readSetting(LAST_BACKUP_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as BackupMetadata;
    return data.lastBackupDate ? new Date(data.lastBackupDate) : null;
  } catch {
    return null;
  }
}

export async function setLastBackupDate(date: Date, filesIncluded: number): Promise<void> {
  const metadata: BackupMetadata = {
    lastBackupDate: date.toISOString(),
    filesIncluded,
  };
  await writeSetting(LAST_BACKUP_KEY, JSON.stringify(metadata));
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
  const sinceDate = includeAll ? undefined : (await getLastBackupDate()) || undefined;
  const files = await collectPatientFiles(sinceDate);
  
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    let totalSize = 0;
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.on('end', () => {
      setLastBackupDate(new Date(), files.length).catch(err =>
        console.error('Failed to record backup date:', err)
      );
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
  const lastBackup = await getLastBackupDate();
  const allFiles = await collectPatientFiles();
  const newFiles = lastBackup ? await collectPatientFiles(lastBackup) : allFiles;
  
  return {
    lastBackupDate: lastBackup ? lastBackup.toISOString() : null,
    totalFilesAvailable: allFiles.length,
    filesSinceLastBackup: newFiles.length
  };
}
