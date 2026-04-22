import { db } from "../db";
import { trainingPairs, reportDistributions, reports, worksheets } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { storage } from "../storage";

function inferComplexity(report: { findings: string; impression: string }): string {
  const text = `${report.findings} ${report.impression}`.toLowerCase();
  if (/normal|unremarkable|no evidence|patent/.test(text) && !/abnormal|stenosis|thrombus|occlusion|reflux|aneurysm/.test(text)) {
    return "normal";
  }
  if (/severe|critical|extensive|multiple|complex|bilateral.*occlusion/.test(text)) {
    return "complex";
  }
  return "abnormal";
}

function buildReportText(report: any): string {
  const lines: string[] = [];
  if (report.studyType) lines.push(`STUDY: ${report.studyType}`);
  if (report.indication) lines.push(`INDICATION: ${report.indication}`);
  if (report.findings) lines.push(`FINDINGS:\n${report.findings}`);
  if (report.impression) lines.push(`IMPRESSION:\n${report.impression}`);
  return lines.join("\n\n");
}

/**
 * Auto-create a training pair from a distributed report.
 * Idempotent — if this report already has an auto-imported training pair, returns the existing one.
 * Updates the distribution row with trainingPairId + addedToTrainingAt for audit.
 */
export async function autoTrainFromDistribution(reportId: number, distributionId: number): Promise<number | null> {
  try {
    const report = await storage.getReport(reportId);
    if (!report) {
      console.warn(`[auto-train] Report ${reportId} not found`);
      return null;
    }

    // Idempotency: if a training pair already exists for this report, just link the distribution to it.
    const [existing] = await db
      .select()
      .from(trainingPairs)
      .where(and(eq(trainingPairs.sourceReportId, reportId), eq(trainingPairs.autoImported, true)))
      .limit(1);

    let trainingPairId: number;

    if (existing) {
      trainingPairId = existing.id;
      console.log(`[auto-train] Reusing existing training pair ${trainingPairId} for report ${reportId}`);
    } else {
      const worksheet = report.worksheetId ? await storage.getWorksheet(report.worksheetId) : null;
      const category = report.studyType || "General";
      const complexity = inferComplexity(report);
      const reportText = buildReportText(report);

      const [created] = await db
        .insert(trainingPairs)
        .values({
          worksheetUrl: worksheet?.fileUrl || null,
          reportUrl: null,
          category,
          complexityLevel: complexity,
          sourceReportId: reportId,
          sourceDistributionId: distributionId,
          worksheetText: null, // OCR will still happen on worksheet image at generation time
          reportText,
          autoImported: true,
        })
        .returning();

      trainingPairId = created.id;
      console.log(`[auto-train] Created training pair ${trainingPairId} from distributed report ${reportId} (${category}/${complexity})`);
    }

    // Stamp the distribution row for audit
    await db
      .update(reportDistributions)
      .set({ trainingPairId, addedToTrainingAt: new Date() })
      .where(eq(reportDistributions.id, distributionId));

    return trainingPairId;
  } catch (error) {
    console.error(`[auto-train] Failed to auto-train from report ${reportId}, distribution ${distributionId}:`, error);
    return null;
  }
}

/**
 * Audit summary: how many distributed reports have been added to training, and which ones haven't.
 */
export async function getTrainingAuditSummary(clinicId?: number) {
  const baseWhere = clinicId ? eq(reportDistributions.clinicId, clinicId) : undefined;

  const allDistributions = await db
    .select({
      id: reportDistributions.id,
      reportId: reportDistributions.reportId,
      method: reportDistributions.method,
      recipientName: reportDistributions.recipientName,
      recipientEmail: reportDistributions.recipientEmail,
      sentAt: reportDistributions.sentAt,
      trainingPairId: reportDistributions.trainingPairId,
      addedToTrainingAt: reportDistributions.addedToTrainingAt,
    })
    .from(reportDistributions)
    .where(baseWhere as any);

  const trainedCount = allDistributions.filter(d => d.trainingPairId !== null).length;
  const untrainedCount = allDistributions.length - trainedCount;

  return {
    totalDistributions: allDistributions.length,
    trainedCount,
    untrainedCount,
    distributions: allDistributions,
  };
}
