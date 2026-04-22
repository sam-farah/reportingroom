import { db } from "../db";
import { trainingPairs, reportDistributions, reports, worksheets } from "@shared/schema";
import { eq, and, isNotNull, isNull, lt, sql } from "drizzle-orm";
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
 * Self-healing sweep: find any distributions older than `olderThanSeconds` that
 * haven't been linked to a training pair, and try to train them now.
 * Returns how many were successfully trained on this pass.
 *
 * Runs on a timer at startup so a transient failure (DB hiccup, etc.) gets
 * automatically picked up within a minute. Also exposed manually via
 * POST /api/training-audit/retry for the "Retry training" workflow.
 */
export async function sweepUntrainedDistributions(olderThanSeconds = 60): Promise<{
  attempted: number;
  trained: number;
  failed: number;
}> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const pending = await db
    .select({ id: reportDistributions.id, reportId: reportDistributions.reportId })
    .from(reportDistributions)
    .where(and(isNull(reportDistributions.trainingPairId), lt(reportDistributions.sentAt, cutoff)))
    .limit(50);

  if (pending.length === 0) return { attempted: 0, trained: 0, failed: 0 };

  console.log(`[auto-train] Sweep found ${pending.length} untrained distribution(s) — retrying`);
  let trained = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await autoTrainFromDistribution(row.reportId, row.id);
    if (result) trained++;
    else failed++;
  }
  console.log(`[auto-train] Sweep complete: ${trained} trained, ${failed} failed`);
  return { attempted: pending.length, trained, failed };
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startAutoTrainingSweep(intervalMs = 60_000): void {
  if (sweepTimer) return;
  // Run once shortly after boot so anything stranded by a previous outage
  // gets picked up immediately, then on the regular interval.
  setTimeout(() => sweepUntrainedDistributions().catch(err => console.error("[auto-train] sweep error:", err)), 10_000);
  sweepTimer = setInterval(
    () => sweepUntrainedDistributions().catch(err => console.error("[auto-train] sweep error:", err)),
    intervalMs
  );
  console.log(`[auto-train] Self-healing sweep scheduled every ${intervalMs / 1000}s`);
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
