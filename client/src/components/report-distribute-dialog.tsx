import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2, Copy, Check, CheckCircle, Eye, Download, Plus, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type {
  Report,
  ReportTemplate,
  Physician,
  Sonographer,
  ReferringDoctor,
  ReportDistribution,
  Appointment,
} from "@shared/schema";
import {
  buildReportHtml,
  generateReportPdfBase64,
  generateCombinedReportPdfBase64,
  cleanStudyType,
  formatDobAU,
  type ReportHtmlDeps,
} from "@/lib/report-distribution";

interface BuiltReport {
  report: Report;
  htmlNoWs: string;
  htmlWithWs: string;
  worksheetDataUrl: string | null;
}

interface ReportDistributeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: Report[];
  patientId: number;
  patientName: string;
}

export default function ReportDistributeDialog({
  open,
  onOpenChange,
  reports,
  patientId,
  patientName,
}: ReportDistributeDialogProps) {
  const { toast } = useToast();

  // ── Self-fetched reference data ──
  const { data: physicians = [] } = useQuery<Physician[]>({ queryKey: ["/api/physicians"], enabled: open });
  const { data: sonographers = [] } = useQuery<Sonographer[]>({ queryKey: ["/api/sonographers"], enabled: open });
  const { data: templates = [] } = useQuery<ReportTemplate[]>({ queryKey: ["/api/templates"], enabled: open });
  const { data: referringDoctors = [] } = useQuery<ReferringDoctor[]>({ queryKey: ["/api/referring-doctors"], enabled: open });
  const { data: clinicData } = useQuery<{
    id: number;
    name: string;
    address?: string;
    phone?: string;
    fax?: string;
    email?: string;
    logoUrl?: string;
  }>({ queryKey: ["/api/clinic"], enabled: open });
  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/patients", patientId, "appointments"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/appointments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!patientId,
  });

  const reportIds = useMemo(() => reports.map((r) => r.id), [reports]);

  // Merged distribution history across all selected reports
  const { data: distributions = [], refetch: refetchDistributions } = useQuery<ReportDistribution[]>({
    queryKey: ["/api/reports", "distributions-merged", reportIds],
    queryFn: async () => {
      const all = await Promise.all(
        reportIds.map(async (rid) => {
          const res = await fetch(`/api/reports/${rid}/distributions`, { credentials: "include" });
          if (!res.ok) return [];
          return (await res.json()) as ReportDistribution[];
        }),
      );
      return all
        .flat()
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    },
    enabled: open && reportIds.length > 0,
  });

  const clinicLogoApiUrl = clinicData?.logoUrl ? "/api/clinic/logo" : null;
  const deps: ReportHtmlDeps = { physicians, sonographers, templates, clinicData, clinicLogoApiUrl };

  // ── Local state ──
  const [built, setBuilt] = useState<BuiltReport[]>([]);
  const [htmlBuilt, setHtmlBuilt] = useState(false);
  const [building, setBuilding] = useState(false);
  const [includeWorksheet, setIncludeWorksheet] = useState(true);

  const [emailTo, setEmailTo] = useState("");
  const [emailToName, setEmailToName] = useState("");
  const [emailCcs, setEmailCcs] = useState<string[]>([""]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [faxNumber, setFaxNumber] = useState("");
  const [faxSending, setFaxSending] = useState(false);
  const [faxSent, setFaxSent] = useState(false);

  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showMarkSent, setShowMarkSent] = useState(false);
  const [markSentName, setMarkSentName] = useState("");
  const [markSentEmail, setMarkSentEmail] = useState("");
  const [markSentNotes, setMarkSentNotes] = useState("");
  const [markSentLogging, setMarkSentLogging] = useState(false);

  // Reset all state whenever the dialog opens (or the report set changes)
  useEffect(() => {
    if (!open) return;
    setBuilt([]);
    setHtmlBuilt(false);
    setBuilding(false);
    setIncludeWorksheet(true);
    setEmailTo("");
    setEmailToName("");
    setEmailCcs([""]);
    setEmailSubject(`Medical Report — ${patientName}`);
    setEmailSending(false);
    setEmailSent(false);
    setFaxNumber("");
    setFaxSending(false);
    setFaxSent(false);
    setCopied(false);
    setShowMarkSent(false);
    setMarkSentName("");
    setMarkSentEmail("");
    setMarkSentNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportIds.join(",")]);

  // Autofill referring doctor / copy-to from the patient's most recent appointment
  useEffect(() => {
    if (!open || appointments.length === 0) return;
    const sorted = [...appointments].sort(
      (a, b) => new Date(b.appointmentDate as any).getTime() - new Date(a.appointmentDate as any).getTime(),
    );
    const apptWithDoc = sorted.find((a) => a.referringDoctorEmail || a.referringDoctorFax || a.referringDoctorName);
    if (!apptWithDoc) return;
    setEmailTo((prev) => prev || apptWithDoc.referringDoctorEmail || "");
    setEmailToName((prev) => prev || apptWithDoc.referringDoctorName || "");
    if (apptWithDoc.referringDoctorFax) {
      setFaxNumber((prev) => prev || apptWithDoc.referringDoctorFax!.replace(/[^\d\s-]/g, ""));
    }
    if (apptWithDoc.copyToEmail) {
      setEmailCcs((prev) => (prev.some((c) => c.trim()) ? prev : [apptWithDoc.copyToEmail!]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointments.length]);

  const hasWorksheet = built.some((b) => b.worksheetDataUrl);
  const docsForEmailRecord = referringDoctors.filter((d) => d.email);

  // ── Build all selected reports' HTML ──
  const buildAll = async (): Promise<BuiltReport[]> => {
    setBuilding(true);
    try {
      const results: BuiltReport[] = [];
      for (const report of reports) {
        const { htmlNoWs, htmlWithWs, worksheetDataUrl } = await buildReportHtml(report, deps);
        results.push({ report, htmlNoWs, htmlWithWs, worksheetDataUrl });
      }
      setBuilt(results);
      setHtmlBuilt(true);
      return results;
    } finally {
      setBuilding(false);
    }
  };

  // Combined HTML for the "Copy HTML" textarea / preview
  const combinedHtml = useMemo(() => {
    if (built.length === 0) return "";
    return built
      .map((b) => (includeWorksheet ? b.htmlWithWs : b.htmlNoWs))
      .join("\n<!-- ──────────── next report ──────────── -->\n");
  }, [built, includeWorksheet]);

  // ── Email ──
  const handleSendEmail = async () => {
    if (!emailTo.trim()) return;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const ccList = emailCcs.map((e) => e.trim()).filter(Boolean);
    const badCcs = ccList.filter((e) => !EMAIL_RE.test(e));
    if (badCcs.length > 0) {
      toast({ title: "Invalid CC email", description: `Please fix: ${badCcs.join(", ")}`, variant: "destructive" });
      return;
    }
    if (!EMAIL_RE.test(emailTo.trim())) {
      toast({ title: "Invalid recipient email", description: `Please fix: ${emailTo}`, variant: "destructive" });
      return;
    }
    setEmailSending(true);
    setEmailSent(false);
    try {
      const results = built.length > 0 ? built : await buildAll();
      const mainRecipient = emailToName || emailTo;
      const recipientsBlock = [
        mainRecipient ? `<div class="copies-to"><strong>To:</strong> ${mainRecipient}</div>` : "",
        ccList.length > 0 ? `<div class="copies-to"><strong>Copies to:</strong> ${ccList.join(", ")}</div>` : "",
      ]
        .filter(Boolean)
        .join("");

      // Combined HTML body (worksheet honoured by the toggle)
      const htmlForEmail = results
        .map((b) =>
          (includeWorksheet ? b.htmlWithWs : b.htmlNoWs).replace("<!--COPIES_TO_PLACEHOLDER-->", recipientsBlock),
        )
        .join("\n<hr style=\"page-break-before:always;border:none;\"/>\n");

      // Combined PDF: each report's pages + (optional) worksheet as a dedicated page
      let pdfBase64: string | undefined;
      try {
        pdfBase64 = await generateCombinedReportPdfBase64(
          results.map((b) => ({
            html: b.htmlNoWs.replace("<!--COPIES_TO_PLACEHOLDER-->", recipientsBlock),
            worksheetDataUrl: includeWorksheet ? b.worksheetDataUrl : null,
          })),
        );
      } catch (pdfErr) {
        console.warn("Combined PDF generation failed, sending without attachment:", pdfErr);
      }

      const res = await fetch(`/api/reports/distribute-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportIds,
          patientId,
          toEmail: emailTo,
          toName: emailToName || emailTo,
          ccEmails: ccList,
          subject: emailSubject || `Medical Report — ${patientName}`,
          reportHtml: htmlForEmail,
          pdfBase64,
          worksheetIncluded: includeWorksheet && hasWorksheet,
          patientName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Send failed");
      setEmailSent(true);
      onDistributed();
      toast({ title: "Email Sent", description: data.message || `Sent to ${emailTo}` });
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err: any) {
      toast({ title: "Send Failed", description: err.message || "Could not send email", variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  };

  // ── Fax ──
  const handleSendFax = async () => {
    if (!faxNumber.trim()) return;
    setFaxSending(true);
    setFaxSent(false);
    try {
      const results = built.length > 0 ? built : await buildAll();
      // Fax always includes the worksheet (matches the reporting-room behaviour).
      // A fax with no PDF is meaningless, so abort if generation fails.
      let pdfBase64: string;
      try {
        pdfBase64 = await generateCombinedReportPdfBase64(
          results.map((b) => ({ html: b.htmlNoWs, worksheetDataUrl: b.worksheetDataUrl })),
        );
      } catch (pdfErr) {
        console.error("Combined PDF generation failed for fax:", pdfErr);
        throw new Error("Could not generate the report PDF to fax. Please try again.");
      }
      const res = await fetch(`/api/reports/distribute-fax`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds, patientId, faxNumber: faxNumber.trim(), pdfBase64, patientName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Fax send failed");
      setFaxSent(true);
      onDistributed();
      toast({ title: "Fax Sent", description: `Report${reportIds.length > 1 ? "s" : ""} faxed to ${faxNumber.trim()}` });
      setTimeout(() => setFaxSent(false), 4000);
    } catch (err: any) {
      toast({ title: "Fax Failed", description: err.message || "Could not send fax", variant: "destructive" });
    } finally {
      setFaxSending(false);
    }
  };

  // ── Copy HTML ──
  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(combinedHtml);
      setCopied(true);
      setShowMarkSent(true);
      toast({ title: "Copied!", description: "HTML copied — paste into your messaging app, then record the distribution below." });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: "Copy failed", description: "Please select all and copy manually.", variant: "destructive" });
    }
  };

  // ── Download combined PDF ──
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const results = built.length > 0 ? built : await buildAll();
      const pdfBase64 = await generateCombinedReportPdfBase64(
        results.map((b) => ({
          html: b.htmlNoWs.replace("<!--COPIES_TO_PLACEHOLDER-->", ""),
          worksheetDataUrl: includeWorksheet ? b.worksheetDataUrl : null,
        })),
      );
      const byteChars = atob(pdfBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const safeName = (patientName || "Patient").replace(/[^a-zA-Z0-9_-]+/g, "_");
      const allFinalized = results.every((b) => b.report.isFinalized);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${allFinalized ? "Report" : "Interim_Report"}_${safeName}_${results.length}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: allFinalized ? "PDF Downloaded" : "Interim Report Downloaded", description: "You can now attach it to an email or fax it manually." });
    } catch (err: any) {
      toast({ title: "Download Failed", description: err.message || "Could not generate PDF", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ── Record copy-html distribution (loops the existing per-report endpoint) ──
  const handleMarkSent = async () => {
    setMarkSentLogging(true);
    try {
      const results = built.length > 0 ? built : await buildAll();
      let pdfBlob: string | null = null;
      try {
        pdfBlob = await generateCombinedReportPdfBase64(
          results.map((b) => ({ html: b.htmlNoWs, worksheetDataUrl: includeWorksheet ? b.worksheetDataUrl : null })),
        );
      } catch (pdfErr) {
        console.warn("PDF generation failed for Copy HTML record:", pdfErr);
      }
      const combinedNote =
        reportIds.length > 1
          ? `Combined distribution of ${reportIds.length} reports (#${reportIds.join(", #")})`
          : null;
      const userNote = markSentNotes || null;
      const finalNote = [combinedNote, userNote].filter(Boolean).join(" — ") || null;
      for (const rid of reportIds) {
        const res = await fetch(`/api/reports/${rid}/distributions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "copy_html",
            recipientName: markSentName || null,
            recipientEmail: markSentEmail || null,
            notes: finalNote,
            pdfBlob: pdfBlob || null,
            worksheetIncluded: includeWorksheet && hasWorksheet,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Could not record distribution for report ${rid}`);
        }
      }
      onDistributed();
      setMarkSentName("");
      setMarkSentEmail("");
      setMarkSentNotes("");
      setShowMarkSent(false);
      toast({ title: "Distribution Recorded", description: "The transmitted PDF has been stored and reports archived." });
    } catch {
      toast({ title: "Log Failed", description: "Could not save distribution record.", variant: "destructive" });
    } finally {
      setMarkSentLogging(false);
    }
  };

  // Invalidate the patient-file queries affected by a send
  const onDistributed = () => {
    refetchDistributions();
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "reports"] });
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "transmitted-reports"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
  };

  const allFinalized = reports.every((r) => r.isFinalized);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-[1000px] w-full max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-600" />
            Distribute {reports.length > 1 ? `${reports.length} Reports` : "Report"} — {patientName}
          </DialogTitle>
          <DialogDescription>
            Send via email or fax, or copy the HTML to paste into your messaging application.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-y-auto pr-1">
          {/* ── Selected reports summary ── */}
          <div className="border border-gray-200 rounded-lg bg-gray-50/60 p-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              {reports.length > 1 ? `${reports.length} reports selected` : "Report selected"}
            </div>
            <ul className="space-y-1">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="font-medium">{cleanStudyType(r.studyType)}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{formatDobAU(r.examDate)}</span>
                  <span
                    className={`ml-auto text-xs rounded-full px-2 py-0.5 ${r.isFinalized ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {r.isFinalized ? "Finalised" : "Interim"}
                  </span>
                </li>
              ))}
            </ul>
            {!allFinalized && (
              <p className="text-xs text-amber-700 mt-2">
                Some reports are not finalised — they will be distributed as INTERIM reports.
              </p>
            )}
          </div>

          {/* ── Email Section ── */}
          <div className="border border-blue-100 rounded-lg bg-blue-50/40 p-4 space-y-3">
            <h3 className="font-semibold text-sm text-blue-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Send via Email
            </h3>

            {docsForEmailRecord.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Autofill from Referring Doctor</Label>
                <Select
                  onValueChange={(value) => {
                    if (value === "__manual__") {
                      setEmailTo("");
                      setEmailToName("");
                      setEmailSubject(`Medical Report — ${patientName}`);
                    } else {
                      const doc = referringDoctors.find((d) => String(d.id) === value);
                      if (doc) {
                        setEmailTo(doc.email ?? "");
                        setEmailToName(doc.name);
                        setEmailSubject(`Medical Report — ${patientName} — Attn: ${doc.name}`);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="bg-white text-sm h-9">
                    <SelectValue placeholder="Choose a doctor to autofill…" />
                  </SelectTrigger>
                  <SelectContent>
                    {docsForEmailRecord.map((doc) => (
                      <SelectItem key={doc.id} value={String(doc.id)}>
                        <div className="flex flex-col">
                          <span>{doc.name}</span>
                          <span className="text-xs text-gray-400">{[doc.practiceName, doc.email].filter(Boolean).join(" · ")}</span>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="__manual__">
                      <span className="text-gray-400 italic">Clear / enter manually…</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">To (Email) *</Label>
                <Input type="email" placeholder="doctor@practice.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className="bg-white text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Recipient Name</Label>
                <Input placeholder="Dr. Smith" value={emailToName} onChange={(e) => setEmailToName(e.target.value)} className="bg-white text-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-600">CC (optional)</Label>
              {docsForEmailRecord.length > 0 && (
                <Select
                  onValueChange={(value) => {
                    const doc = referringDoctors.find((d) => String(d.id) === value);
                    if (!doc?.email) return;
                    setEmailCcs((prev) => {
                      if (prev.some((c) => c.trim().toLowerCase() === doc.email!.toLowerCase())) return prev;
                      const firstEmpty = prev.findIndex((c) => !c.trim());
                      if (firstEmpty >= 0) {
                        const next = [...prev];
                        next[firstEmpty] = doc.email!;
                        return next;
                      }
                      return [...prev, doc.email!];
                    });
                  }}
                >
                  <SelectTrigger className="bg-white text-sm h-9">
                    <SelectValue placeholder="Autofill CC from a referring doctor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {docsForEmailRecord.map((doc) => (
                      <SelectItem key={doc.id} value={String(doc.id)}>
                        <div className="flex flex-col">
                          <span>{doc.name}</span>
                          <span className="text-xs text-gray-400">{[doc.practiceName, doc.email].filter(Boolean).join(" · ")}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="space-y-2">
                {emailCcs.map((cc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder="cc@example.com"
                      value={cc}
                      onChange={(e) => {
                        const next = [...emailCcs];
                        next[idx] = e.target.value;
                        setEmailCcs(next);
                      }}
                      className="bg-white text-sm flex-1"
                    />
                    {emailCcs.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEmailCcs(emailCcs.filter((_, i) => i !== idx))}
                        className="h-9 w-9 p-0 text-gray-400 hover:text-red-600"
                        aria-label="Remove CC"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEmailCcs([...emailCcs, ""])} className="h-8 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add another CC
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Subject</Label>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="bg-white text-sm" />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSendEmail}
                disabled={!emailTo || emailSending}
                className={emailSent ? "bg-green-600 hover:bg-green-700 text-white" : "medical-btn-primary"}
              >
                {emailSending ? (
                  <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />Sending…</>
                ) : emailSent ? (
                  <><Check className="w-4 h-4 mr-2" />Sent!</>
                ) : (
                  <><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send Email</>
                )}
              </Button>
            </div>
          </div>

          {/* ── Fax Section ── */}
          <div className="border border-teal-100 rounded-lg bg-teal-50/40 p-4 space-y-3">
            <h3 className="font-semibold text-sm text-teal-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Send via Fax
            </h3>

            {referringDoctors.some((d) => d.fax) && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Autofill from Referring Doctor</Label>
                <Select
                  onValueChange={(value) => {
                    const doc = referringDoctors.find((d) => String(d.id) === value);
                    if (doc?.fax) setFaxNumber(doc.fax);
                  }}
                >
                  <SelectTrigger className="bg-white text-sm h-9">
                    <SelectValue placeholder="Choose a doctor to autofill fax…" />
                  </SelectTrigger>
                  <SelectContent>
                    {referringDoctors.filter((d) => d.fax).map((doc) => (
                      <SelectItem key={doc.id} value={String(doc.id)}>
                        <div className="flex flex-col">
                          <span>{doc.name}</span>
                          <span className="text-xs text-gray-400">{[doc.practiceName, doc.fax].filter(Boolean).join(" · ")}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-gray-600">Fax Number</Label>
                <div className="flex items-center gap-0">
                  <span className="flex items-center px-3 h-9 text-sm bg-teal-100 border border-r-0 border-teal-200 rounded-l-md text-teal-700 font-mono select-none">+613</span>
                  <Input
                    type="tel"
                    placeholder="86771755"
                    value={faxNumber}
                    onChange={(e) => setFaxNumber(e.target.value.replace(/[^\d\s-]/g, ""))}
                    className="bg-white text-sm rounded-l-none font-mono"
                  />
                </div>
                <p className="text-xs text-teal-700/70">Local number — the 613 prefix is added automatically. Include area code (e.g. 86771755).</p>
              </div>
              <Button
                onClick={handleSendFax}
                disabled={!faxNumber.trim() || faxSending}
                className={faxSent ? "bg-green-600 hover:bg-green-700 text-white" : "bg-teal-600 hover:bg-teal-700 text-white"}
              >
                {faxSending ? (
                  <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />Sending…</>
                ) : faxSent ? (
                  <><Check className="w-4 h-4 mr-2" />Faxed!</>
                ) : (
                  <><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>Send Fax</>
                )}
              </Button>
            </div>
          </div>

          {/* ── Worksheet toggle ── */}
          {hasWorksheet && (
            <div className="flex items-center gap-3 px-1">
              <Switch id="dist-ws-toggle" checked={includeWorksheet} onCheckedChange={setIncludeWorksheet} />
              <Label htmlFor="dist-ws-toggle" className="text-sm cursor-pointer select-none">
                Include worksheet image(s) (with clinic logo)
              </Label>
            </div>
          )}

          {/* ── HTML / Preview Section ── */}
          <div className="border border-gray-200 rounded-lg bg-gray-50/40 p-4 space-y-3">
            <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <Copy className="w-4 h-4" />
              Preview &amp; Copy HTML
            </h3>
            {!htmlBuilt ? (
              <div className="text-center py-4">
                {building ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
                    <p className="text-sm">Building report HTML…</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Generate the report HTML to preview or copy it into your messaging app.</p>
                    <Button onClick={() => buildAll()} variant="outline" className="gap-2">
                      <Eye className="w-4 h-4" />
                      Generate Preview &amp; HTML
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {built.map((b) => (
                    <div key={b.report.id} className="border rounded-lg overflow-hidden" style={{ height: 300 }}>
                      <div className="bg-gray-50 border-b px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {cleanStudyType(b.report.studyType)} — {formatDobAU(b.report.examDate)}
                      </div>
                      <iframe
                        srcDoc={includeWorksheet ? b.htmlWithWs : b.htmlNoWs}
                        title={`Report ${b.report.id} Preview`}
                        className="w-full border-0"
                        style={{ height: 266 }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ))}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 border-b px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Copy HTML — paste into your messaging app</div>
                  <textarea readOnly value={combinedHtml} className="w-full p-3 text-xs font-mono bg-white resize-none focus:outline-none" style={{ height: 100 }} />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className={allFinalized ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}
                  >
                    {downloadingPdf ? (
                      <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />Building PDF…</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />{allFinalized ? "Download PDF" : "Download Interim Report"}</>
                    )}
                  </Button>
                  <Button onClick={handleCopyHtml} variant="outline" className={copied ? "border-green-400 text-green-700" : ""}>
                    {copied ? <Check className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copied ? "Copied!" : "Copy HTML"}
                  </Button>
                </div>
              </>
            )}

            {showMarkSent && (
              <div className="border border-amber-100 rounded-lg bg-amber-50/50 p-4 space-y-3">
                <h3 className="font-semibold text-sm text-amber-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Record this distribution
                </h3>
                <p className="text-xs text-amber-700">You copied the HTML — who did you send it to? (optional, but recommended for audit trail)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Recipient Name</Label>
                    <Input placeholder="Dr. Smith" value={markSentName} onChange={(e) => setMarkSentName(e.target.value)} className="bg-white text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Recipient Email</Label>
                    <Input type="email" placeholder="doctor@practice.com" value={markSentEmail} onChange={(e) => setMarkSentEmail(e.target.value)} className="bg-white text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Notes (optional)</Label>
                  <Input placeholder="e.g. Sent via Helix / Medical Objects" value={markSentNotes} onChange={(e) => setMarkSentNotes(e.target.value)} className="bg-white text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowMarkSent(false)}>Skip</Button>
                  <Button size="sm" onClick={handleMarkSent} disabled={markSentLogging} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {markSentLogging ? <><div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-2" />Saving…</> : <><Check className="w-3 h-3 mr-2" />Record Distribution</>}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Distribution History ── */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Distribution History</span>
              {distributions.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-semibold">{distributions.length} sent</span>
              )}
            </div>
            {distributions.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-4 text-center">No distributions recorded yet for these reports.</p>
            ) : (
              <ul className="divide-y">
                {distributions.map((d) => (
                  <li key={d.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1 flex-shrink-0 ${d.method === "email" ? "bg-blue-100 text-blue-600" : d.method === "fax" ? "bg-teal-100 text-teal-600" : "bg-amber-100 text-amber-600"}`}>
                      {d.method === "email" ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      ) : d.method === "fax" ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-gray-700 capitalize">{d.method === "email" ? "Email" : d.method === "fax" ? "Fax" : "Copy HTML"}</span>
                        <span className="text-xs text-gray-400">{format(new Date(d.sentAt), "d MMM yyyy, h:mm a")}</span>
                      </div>
                      {(d.recipientName || d.recipientEmail) && (
                        <p className="text-xs text-gray-600 truncate">{[d.recipientName, d.recipientEmail].filter(Boolean).join(" — ")}</p>
                      )}
                      {d.notes && <p className="text-xs text-gray-400 italic">{d.notes}</p>}
                      {d.confirmedBy && <p className="text-xs text-gray-400">by {d.confirmedBy}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
