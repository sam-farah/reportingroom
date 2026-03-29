/**
 * Persistent file storage backed by PostgreSQL.
 *
 * Uploaded files are saved to both the local disk (fast serving) and the
 * `file_blobs` table in the database (permanent backup). When serving, the
 * disk is tried first and the database is used as a fallback. This means
 * files are never lost even if the server container is reset.
 */

import fs from "fs";
import path from "path";
import { db } from "../db";
import { fileBlobs } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function saveFileToDB(
  filename: string,
  filePath: string,
  mimeType?: string,
  originalName?: string,
): Promise<void> {
  try {
    const data = fs.readFileSync(filePath);
    const size = data.length;
    await db
      .insert(fileBlobs)
      .values({ filename, data, mimeType: mimeType ?? null, originalName: originalName ?? null, size })
      .onConflictDoNothing();
  } catch (err) {
    console.error(`[fileStorage] Failed to save ${filename} to DB:`, err);
  }
}

export async function getFileFromDB(
  filename: string,
): Promise<{ data: Buffer; mimeType: string | null; originalName: string | null } | null> {
  try {
    const rows = await db.select().from(fileBlobs).where(eq(fileBlobs.filename, filename)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      data: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data as unknown as string, "binary"),
      mimeType: row.mimeType,
      originalName: row.originalName,
    };
  } catch (err) {
    console.error(`[fileStorage] Failed to read ${filename} from DB:`, err);
    return null;
  }
}

/**
 * Detect MIME type from the first bytes of a buffer (magic bytes).
 */
export function detectMimeType(data: Buffer): string {
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) return "application/pdf";
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return "image/png";
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return "image/webp";
  return "application/octet-stream";
}

/**
 * Backfill: save all files currently on disk to the database.
 * Run once on startup to protect files already on disk.
 */
export async function backfillFilesToDB(uploadDir: string): Promise<void> {
  try {
    const files = fs.readdirSync(uploadDir);
    let saved = 0;
    for (const filename of files) {
      if (filename.startsWith(".")) continue;
      const filePath = path.join(uploadDir, filename);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const existing = await db.select({ filename: fileBlobs.filename }).from(fileBlobs).where(eq(fileBlobs.filename, filename)).limit(1);
      if (existing.length > 0) continue;

      const data = fs.readFileSync(filePath);
      const mimeType = detectMimeType(data);
      await db.insert(fileBlobs).values({ filename, data, mimeType, size: data.length }).onConflictDoNothing();
      saved++;
    }
    if (saved > 0) console.log(`[fileStorage] Backfilled ${saved} files from disk to database.`);
  } catch (err) {
    console.error("[fileStorage] Backfill error:", err);
  }
}
