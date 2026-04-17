import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "../storage";
import { saveFileToDB } from "./fileStorage";
import { syncDocumentToPatientFolder } from "./fileSync";
import { buildScanRequestHtml } from "./scanRequestHtml";
import type { ScanRequest } from "@shared/schema";

const uploadDir = path.join(process.cwd(), "uploads");

/**
 * Archive a scan request as an HTML document attached to a patient's file.
 * Idempotent-ish: returns existing document if already archived for this request+patient.
 */
export async function archiveScanRequestToPatientFile(
  scanRequest: ScanRequest,
  patientId: number,
): Promise<{ documentId: number; filename: string } | null> {
  try {
    if (!patientId) return null;

    const patient = await storage.getPatient(patientId);
    if (!patient) return null;

    // Skip if we've already archived this request for this patient
    const existingDocs = await storage.getPatientDocuments(patientId);
    const reqTitle = `Scan Request REQ-${String(scanRequest.id).padStart(5, "0")}`;
    const alreadyArchived = existingDocs.find(
      (d: any) => d.title === reqTitle && !d.isArchived,
    );
    if (alreadyArchived) {
      return { documentId: alreadyArchived.id, filename: alreadyArchived.filename };
    }

    const clinic = await storage.getClinic(scanRequest.clinicId);
    const html = buildScanRequestHtml(scanRequest, clinic ?? null);

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const filename = crypto.randomBytes(16).toString("hex");
    const originalName = `${reqTitle}.html`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, Buffer.from(html, "utf8"));
    await saveFileToDB(filename, filePath, "text/html", originalName).catch((e) =>
      console.error("scanRequestArchive: saveFileToDB failed", e),
    );

    const today = new Date().toISOString().split("T")[0];
    const sourceLabel =
      scanRequest.source === "web_form"
        ? "web referral form"
        : scanRequest.source === "referrer_portal"
          ? "referrer portal"
          : "scan request";
    const document = await storage.createPatientDocument({
      patientId,
      title: reqTitle,
      filename,
      originalName,
      fileUrl: `/uploads/${filename}`,
      documentDate: today,
      notes: `Auto-saved from ${sourceLabel} — Scan type(s): ${(scanRequest.scanTypes ?? []).join(", ")}${scanRequest.referringDoctorName ? ` · Ref: ${scanRequest.referringDoctorName}` : ""}`,
    });

    syncDocumentToPatientFolder(patientId, {
      id: document.id,
      title: document.title,
      fileUrl: document.fileUrl,
    }).catch((e) => console.error("scanRequestArchive: folder sync failed", e));

    console.log(
      `📎 Auto-archived scan request REQ-${String(scanRequest.id).padStart(5, "0")} → patient #${patientId} (${patient.firstName} ${patient.lastName})`,
    );
    return { documentId: document.id, filename };
  } catch (err) {
    console.error("scanRequestArchive: failed", err);
    return null;
  }
}
