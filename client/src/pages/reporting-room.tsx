import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Edit3, FileText, Download, Eye, Calendar, User, Save, X, ChevronLeft, ChevronRight, Trash2, CheckCircle2, CheckCircle, Minimize2, Type, Hash, Mic, Share2, Copy, Check, Undo2, Archive, ClipboardCheck, PlusCircle, Upload, Plus } from "lucide-react";
import InlineVoiceRecorder from "@/components/inline-voice-recorder";
import { WorksheetViewer } from "@/components/worksheet-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Report, ReportTemplate, Physician, ReferringDoctor, ReportDistribution, Sonographer } from "@shared/schema";
import { format } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import TextShortcuts from "@/components/text-shortcuts";
import { Link } from "wouter";

function formatDobAU(dob: string | null | undefined): string {
  if (!dob) return "";
  // Already DD/MM/YYYY — return as-is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) return dob;
  // ISO YYYY-MM-DD → DD/MM/YYYY
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // DD-MM-YYYY → DD/MM/YYYY
  const dmy = dob.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  // D/M/YYYY (single-digit day or month) — pad to DD/MM/YYYY (Australian: day first)
  const slashDMY = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDMY) return `${slashDMY[1].padStart(2, '0')}/${slashDMY[2].padStart(2, '0')}/${slashDMY[3]}`;
  return dob;
}

function cleanStudyType(studyType: string): string {
  return studyType
    .replace(/\bduplex\b/gi, "ultrasound")
    .replace(/\b(arm|arms|leg|legs)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatPhysicianName(name: string): string {
  // Handle "Last, First" storage format → display as "First Last"
  if (name.includes(",")) {
    const [last, first] = name.split(",").map(s => s.trim());
    return `${first} ${last}`;
  }
  return name;
}

function formatFindings(text: string): string {
  // Convert lines starting with Right: / Left: / Bilateral: into bold subheadings
  return text
    .split("\n")
    .map(line => {
      if (/^(Right|Left|Bilateral|Right side|Left side)\s*:/i.test(line.trim())) {
        return `\n<strong style="display:block;margin-top:10px;margin-bottom:2px;font-size:14px;color:#1a1a1a;">${line.trim()}</strong>`;
      }
      return line;
    })
    .join("\n");
}

/** Scan a rendered canvas from the bottom upward to find the last row with non-white pixels.
 *  Returns the pixel Y coordinate of the content bottom (exclusive), so we can trim trailing whitespace. */
function findCanvasContentBottom(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.height;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  // Step through every 6th column for speed while remaining accurate enough
  const colStep = Math.max(1, Math.floor(width / 120));
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x += colStep) {
      const i = (y * width + x) * 4;
      // Consider any pixel darker than 248 (off-white or colored) as "content"
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
        return y + 2; // +2 px buffer so we don't clip descenders
      }
    }
  }
  return 0;
}

async function generateReportPdfBase64(html: string, worksheetDataUrl?: string | null): Promise<string> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });
    await new Promise(r => setTimeout(r, 800));
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error("iframe body unavailable");

    // Measure the true content height via DOM — gives initial estimate
    const allEls = body.querySelectorAll("*");
    let maxBottom = 0;
    allEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    });
    const contentHeightPx = Math.min(Math.ceil(maxBottom) + 8, body.scrollHeight);

    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      width: 794,
      height: contentHeightPx,
      windowWidth: 794,
      scrollY: 0,
    });

    // Pixel-accurate trim: find the last row with real (non-white) content
    // This eliminates blank pages caused by padding/margin overhang in the HTML
    const contentBottomPx = findCanvasContentBottom(canvas);

    const A4_W_MM = 210, A4_H_MM = 297;
    const pxToMm = A4_W_MM / canvas.width;
    const totalHeightMm = contentBottomPx * pxToMm; // use trimmed height
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let yMm = 0;
    while (yMm < totalHeightMm) {
      const pageHeightMm = Math.min(A4_H_MM, totalHeightMm - yMm);
      const srcY = Math.round((yMm / totalHeightMm) * contentBottomPx);
      const srcH = Math.round((pageHeightMm / totalHeightMm) * contentBottomPx);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.max(srcH, 1);
      slice.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      pdf.addImage(slice.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, A4_W_MM, pageHeightMm);
      yMm += pageHeightMm;
      if (yMm < totalHeightMm) pdf.addPage();
    }
    // Append worksheet as a dedicated final page
    if (worksheetDataUrl) {
      const wsImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = worksheetDataUrl;
      });
      const scale = Math.min(A4_W_MM / wsImg.width, A4_H_MM / wsImg.height);
      const drawW = wsImg.width * scale, drawH = wsImg.height * scale;
      const orientation = drawH > drawW ? "portrait" : "landscape";
      pdf.addPage([A4_W_MM, A4_H_MM], orientation);
      const pageW = orientation === "landscape" ? A4_H_MM : A4_W_MM;
      const pageH = orientation === "landscape" ? A4_W_MM : A4_H_MM;
      const xOff = (pageW - drawW) / 2, yOff = (pageH - drawH) / 2;
      pdf.addImage(worksheetDataUrl, "JPEG", xOff, yOff, drawW, drawH);
    }
    return pdf.output("datauristring").split(",")[1];
  } finally {
    document.body.removeChild(iframe);
  }
}

interface EditableReport extends Report {
  templateId?: number;
}

export default function ReportingRoom({ initialOpenReportId, onReportOpened, onStartAnotherScan }: { initialOpenReportId?: number | null; onReportOpened?: () => void; onStartAnotherScan?: (params: { patientId: number | null; patientName: string; examDate: string }) => void } = {}) {
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<EditableReport | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [isReuploading, setIsReuploading] = useState(false);
  const [reuploadLoading, setReuploadLoading] = useState(false);
  const [reuploadDragOver, setReuploadDragOver] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAmendDialogOpen, setIsAmendDialogOpen] = useState(false);
  const [amendingReport, setAmendingReport] = useState<EditableReport | null>(null);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeTextArea, setActiveTextArea] = useState<string | null>(null);
  const [activeVoiceDictation, setActiveVoiceDictation] = useState<string>('');
  const [previousFieldValues, setPreviousFieldValues] = useState<Record<string, string>>({});
  const [distributeReport, setDistributeReport] = useState<Report | null>(null);
  const [distributeHtml, setDistributeHtml] = useState<string>("");
  const [distributeHtmlNoWs, setDistributeHtmlNoWs] = useState<string>("");
  const [distributeHtmlWithWs, setDistributeHtmlWithWs] = useState<string>("");
  const [distributeIncludeWorksheet, setDistributeIncludeWorksheet] = useState(true);
  const [distributeHasWorksheet, setDistributeHasWorksheet] = useState(false);
  const [distributeWorksheetDataUrl, setDistributeWorksheetDataUrl] = useState<string | null>(null);
  const [distributeCopied, setDistributeCopied] = useState(false);
  const [distributeLoading, setDistributeLoading] = useState(false);
  const [htmlBuilt, setHtmlBuilt] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailToName, setEmailToName] = useState("");
  const [emailCcs, setEmailCcs] = useState<string[]>([""]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [markSentName, setMarkSentName] = useState("");
  const [markSentEmail, setMarkSentEmail] = useState("");
  const [markSentNotes, setMarkSentNotes] = useState("");
  const [markSentLogging, setMarkSentLogging] = useState(false);
  const [showMarkSent, setShowMarkSent] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [faxNumber, setFaxNumber] = useState("");
  const [faxSending, setFaxSending] = useState(false);
  const [faxSent, setFaxSent] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  const REPORTS_PER_PAGE = 12;

  // Fetch recent reports
  const { data: reports = [], isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports/recent"],
    retry: false,
  });

  // Fetch all templates for selection
  const { data: templates = [] } = useQuery<ReportTemplate[]>({
    queryKey: ["/api/templates"],
    retry: false,
  });

  // Fetch clinic details for exports
  const { data: clinicSettings } = useQuery<{ clinicName: string; address?: string; phone?: string; kioskLogoUrl?: string }>({
    queryKey: ["/api/kiosk/settings"],
    retry: false,
  });

  // Fetch full clinic data (includes logoUrl for report header)
  const { data: clinicData } = useQuery<{ id: number; name: string; address?: string; phone?: string; fax?: string; email?: string; logoUrl?: string }>({
    queryKey: ["/api/clinic"],
    retry: false,
  });

  // Resolved clinic logo URL — always goes through the authenticated API endpoint
  const clinicLogoApiUrl = clinicData?.logoUrl ? '/api/clinic/logo' : null;

  // Fetch physicians for distribute feature
  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
    retry: false,
  });

  // Fetch sonographers for report attribution
  const { data: sonographersList = [] } = useQuery<Sonographer[]>({
    queryKey: ["/api/sonographers"],
    retry: false,
  });

  // Fetch referring doctors for distribute email dropdown
  const { data: referringDoctors = [] } = useQuery<ReferringDoctor[]>({
    queryKey: ["/api/referring-doctors"],
    retry: false,
  });

  // Fetch distribution history for the currently-open distribute dialog
  const { data: distributions = [], refetch: refetchDistributions } = useQuery<ReportDistribution[]>({
    queryKey: ["/api/reports", distributeReport?.id, "distributions"],
    enabled: !!distributeReport,
    retry: false,
  });

  // Distribution counts for all reports — drives card badge + greyed styling
  const { data: distributionCounts = {}, refetch: refetchDistributionCounts } = useQuery<Record<number, number>>({
    queryKey: ["/api/distributions-summary"],
    retry: false,
  });

  // Fetch patient appointments to pre-populate referring doctor fields in distribute dialog
  const { data: patientAppointmentsForDist = [] } = useQuery<any[]>({
    queryKey: ["/api/patients", distributeReport?.patientId, "appointments"],
    enabled: !!distributeReport?.patientId,
    retry: false,
  });

  // When appointments load for a distribute dialog, pre-fill referring doctor fields from the most recent one
  useEffect(() => {
    if (!distributeReport || patientAppointmentsForDist.length === 0) return;
    const sorted = [...patientAppointmentsForDist].sort(
      (a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime()
    );
    const latest = sorted.find(a => a.referringDoctorName || a.referringDoctorEmail || a.referringDoctorFax);
    if (!latest) return;
    if (latest.referringDoctorEmail && !emailTo) setEmailTo(latest.referringDoctorEmail);
    if (latest.referringDoctorName && !emailToName) setEmailToName(latest.referringDoctorName);
    if (latest.referringDoctorFax && !faxNumber) setFaxNumber(latest.referringDoctorFax);
    // Pre-fill CC from copyTo if present (only when no CCs have been set yet)
    const ccLatest = sorted.find(a => a.copyToEmail);
    const noCcsYet = emailCcs.every(c => !c.trim());
    if (ccLatest?.copyToEmail && noCcsYet) setEmailCcs([ccLatest.copyToEmail]);
  }, [patientAppointmentsForDist, distributeReport?.id]);

  // Update report mutation
  const updateReportMutation = useMutation({
    mutationFn: async (reportData: Partial<Report>) => {
      if (!editingReport) throw new Error("No report to update");
      const response = await apiRequest(`/api/reports/${editingReport.id}`, "PATCH", reportData);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Report Updated",
        description: "Report has been saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      setIsFullscreenMode(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setIsEditDialogOpen(false);
      setEditingReport(null);
      setIsReuploading(false);
      setHasUnsavedChanges(false);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update report",
        variant: "destructive",
      });
    },
  });

  // Amendment report mutation
  const amendReportMutation = useMutation({
    mutationFn: async (data: { reportId: number; updates: Partial<Report>; reason: string }) => {
      const response = await apiRequest(`/api/reports/${data.reportId}/amend`, "POST", {
        ...data.updates,
        reason: data.reason,
      });
      return await response.json();
    },
    onSuccess: (amendedReport: Report) => {
      toast({
        title: "Report Amended",
        description: "Report has been successfully amended and requires re-finalization",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      
      // Update the editing report if it's the same one
      if (editingReport && editingReport.id === amendedReport.id) {
        setEditingReport(amendedReport);
      }
      
      setIsAmendDialogOpen(false);
      setAmendingReport(null);
      setAmendmentReason("");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Amendment Failed",
        description: error.message || "Failed to amend report",
        variant: "destructive",
      });
    },
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await apiRequest(`/api/reports/${reportId}`, "DELETE");
      return await response.json();
    },
    onSuccess: (_, deletedReportId) => {
      toast({
        title: "Report Deleted",
        description: "Report has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      
      // Handle fullscreen mode navigation after deletion
      if (isFullscreenMode && editingReport && editingReport.id === deletedReportId) {
        const currentIndex = getCurrentReportIndex();
        const availableReports = filteredReports.filter(r => r.id !== deletedReportId);
        
        if (availableReports.length === 0) {
          // No reports left, exit fullscreen
          setIsFullscreenMode(false);
          setIsEditDialogOpen(false);
          setEditingReport(null);
        } else {
          // Navigate to next available report
          let nextIndex = currentIndex;
          if (nextIndex >= availableReports.length) {
            nextIndex = availableReports.length - 1;
          }
          setEditingReport({ ...availableReports[nextIndex] });
        }
      }
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete report",
        variant: "destructive",
      });
    },
  });

  // Finalize report mutation
  const finalizeReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await apiRequest(`/api/reports/${reportId}/finalize`, "POST");
      return await response.json();
    },
    onSuccess: (finalizedReport: Report) => {
      toast({
        title: "Report Finalized",
        description: "Report has been electronically signed and finalized",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      
      // Update the editing report if it's the one that was finalized
      if (editingReport && editingReport.id === finalizedReport.id) {
        setEditingReport(finalizedReport);
      }
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Finalization Failed",
        description: error.message || "Failed to finalize report",
        variant: "destructive",
      });
    },
  });

  const sonographerCompleteMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await apiRequest(`/api/reports/${reportId}/sonographer-complete`, "POST");
      return await response.json();
    },
    onSuccess: (updated: Report) => {
      toast({ title: "Sonographer Complete", description: "Report marked as complete by sonographer." });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      if (editingReport && editingReport.id === updated.id) setEditingReport(updated as any);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not mark as complete.", variant: "destructive" });
    },
  });

  const archiveReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await apiRequest(`/api/reports/${reportId}/archive`, "POST");
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Workflow Archived", description: "Report workflow has been archived." });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not archive workflow.", variant: "destructive" });
    },
  });

  const handleEditReport = (report: Report) => {
    const defaultTemplate = templates.find((t: ReportTemplate) => t.isDefault) || templates[0];
    setIsReuploading(false);
    setReuploadDragOver(false);
    setHasUnsavedChanges(false);
    setEditingReport({ 
      ...report,
      templateId: (report as EditableReport).templateId || defaultTemplate?.id,
    });
    setIsFullscreenMode(true);
    setIsEditDialogOpen(true);
    setTimeout(() => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }, 100);
  };

  // Auto-open report when passed directly via prop (from dashboard after generation)
  useEffect(() => {
    if (!initialOpenReportId || reports.length === 0) return;
    const target = reports.find(r => r.id === initialOpenReportId);
    if (target) {
      handleEditReport(target);
      onReportOpened?.();
    }
  }, [initialOpenReportId, reports]);

  // Navigation between reports in edit dialog
  const getCurrentReportIndex = () => {
    if (!editingReport) return -1;
    return filteredReports.findIndex(r => r.id === editingReport.id);
  };

  const navigateToPreviousReport = () => {
    const currentIndex = getCurrentReportIndex();
    if (currentIndex > 0) {
      const previousReport = filteredReports[currentIndex - 1];
      setEditingReport({ ...previousReport });
    }
  };

  const navigateToNextReport = () => {
    const currentIndex = getCurrentReportIndex();
    if (currentIndex < filteredReports.length - 1) {
      const nextReport = filteredReports[currentIndex + 1];
      setEditingReport({ ...nextReport });
    }
  };

  const handleFinalizeInDialog = () => {
    if (editingReport) {
      finalizeReportMutation.mutate(editingReport.id);
    }
  };

  const handleAmendReport = (report: Report) => {
    setAmendingReport({ ...report });
    setIsAmendDialogOpen(true);
  };

  const handleSaveAmendment = () => {
    if (!amendingReport || !amendmentReason.trim()) return;

    const { id, generatedAt, worksheetId, ...updateData } = amendingReport;
    amendReportMutation.mutate({
      reportId: id,
      updates: updateData,
      reason: amendmentReason.trim(),
    });
  };

  // ── Shared helper: composite clinic header onto the worksheet image ──────────
  const generateLabelledCanvas = async (report: Report): Promise<HTMLCanvasElement | null> => {
    const imageUrl = (report as any).digitalWorksheetId
      ? `/api/digital-worksheets/${(report as any).digitalWorksheetId}/image`
      : (report as any).worksheetId
        ? `/api/worksheets/${(report as any).worksheetId}/image`
        : null;
    if (!imageUrl) return null;

    const worksheetRes = await fetch(imageUrl, { credentials: 'include' });
    if (!worksheetRes.ok) return null;
    const worksheetBlob = await worksheetRes.blob();
    const worksheetDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(worksheetBlob);
    });

    let logoImg: HTMLImageElement | null = null;
    if (clinicLogoApiUrl) {
      try {
        const logoRes = await fetch(clinicLogoApiUrl, { credentials: 'include' });
        if (logoRes.ok) {
          const logoBlob = await logoRes.blob();
          const logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(logoBlob);
          });
          logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = logoDataUrl;
          });
        }
      } catch { /* logo optional */ }
    }

    const wsImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = worksheetDataUrl;
    });

    const DPI = 200;
    const A4_W = Math.round((210 / 25.4) * DPI);
    const A4_H = Math.round((297 / 25.4) * DPI);
    const HEADER_HEIGHT = Math.round(A4_H * 0.11);
    const PADDING = Math.round(A4_W * 0.025);

    const canvas = document.createElement('canvas');
    canvas.width = A4_W; canvas.height = A4_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, A4_W, A4_H);

    const primaryColor = (templates.find((t: ReportTemplate) => t.isDefault) || templates[0])?.primaryColor || '#0066cc';
    ctx.strokeStyle = primaryColor; ctx.lineWidth = Math.round(A4_W * 0.003);
    ctx.beginPath(); ctx.moveTo(0, HEADER_HEIGHT); ctx.lineTo(A4_W, HEADER_HEIGHT); ctx.stroke();

    let textStartX = PADDING;
    if (logoImg) {
      const logoMaxH = HEADER_HEIGHT - PADDING * 2;
      const logoMaxW = Math.round(A4_W * 0.2);
      const scale = Math.min(logoMaxW / logoImg.width, logoMaxH / logoImg.height, 1);
      const logoW = logoImg.width * scale; const logoH = logoImg.height * scale;
      const logoY = (HEADER_HEIGHT - logoH) / 2;
      ctx.drawImage(logoImg, PADDING, logoY, logoW, logoH);
      textStartX = PADDING + logoW + Math.round(A4_W * 0.015);
    }

    const infoFontSize = Math.round(A4_W * 0.0135);
    ctx.fillStyle = '#333333'; ctx.font = `${infoFontSize}px Arial, sans-serif`;
    const lines = [
      `Patient: ${report.patientName}`,
      (report as any).patientDob ? `DOB: ${(report as any).patientDob}` : null,
      `Exam Date: ${formatDobAU((report as any).examDate)}`,
      (report as any).patientUrNumber ? `UR: ${(report as any).patientUrNumber}` : null,
      `Scan: ${report.studyType}`,
    ].filter(Boolean) as string[];
    const colW = (A4_W - textStartX - PADDING) / 2;
    const leftLines = lines.slice(0, Math.ceil(lines.length / 2));
    const rightLines = lines.slice(Math.ceil(lines.length / 2));
    const lineH = infoFontSize + Math.round(infoFontSize * 0.45);
    const textY = (HEADER_HEIGHT - Math.ceil(lines.length / 2) * lineH) / 2 + infoFontSize;
    leftLines.forEach((line, i) => ctx.fillText(line, textStartX, textY + i * lineH));
    rightLines.forEach((line, i) => ctx.fillText(line, textStartX + colW, textY + i * lineH));

    const wsAreaH = A4_H - HEADER_HEIGHT;
    const wsScale = Math.min(A4_W / wsImg.width, wsAreaH / wsImg.height);
    const wsDrawW = wsImg.width * wsScale; const wsDrawH = wsImg.height * wsScale;
    const wsX = (A4_W - wsDrawW) / 2; const wsY = HEADER_HEIGHT + (wsAreaH - wsDrawH) / 2;
    ctx.drawImage(wsImg, wsX, wsY, wsDrawW, wsDrawH);
    return canvas;
  };

  const handleSaveReport = () => {
    if (!editingReport) return;

    // Send only the user-editable fields — avoids passing stale timestamps / read-only metadata
    // that Drizzle would reject when updating the row.
    const updateData: Record<string, any> = {
      patientName: editingReport.patientName,
      patientUrNumber: (editingReport as any).patientUrNumber ?? null,
      patientDob: editingReport.patientDob,
      examDate: editingReport.examDate,
      studyType: editingReport.studyType,
      indication: editingReport.indication,
      findings: editingReport.findings,
      impression: editingReport.impression,
      physicianId: editingReport.physicianId ?? null,
      sonographerId: (editingReport as any).sonographerId ?? null,
      patientId: (editingReport as any).patientId ?? null,
      isFinalized: Boolean(editingReport.isFinalized),
    };

    // Save the report immediately so the user gets instant feedback.
    updateReportMutation.mutate(updateData as any);

    // Generate and upload the labelled worksheet in the background (non-blocking, non-fatal).
    if (editingReport.worksheetId || (editingReport as any).digitalWorksheetId) {
      const reportId = editingReport.id;
      (async () => {
        try {
          const canvas = await generateLabelledCanvas(editingReport);
          if (!canvas) return;
          const blob: Blob | null = await new Promise((resolve) => {
            try { canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.93); }
            catch { resolve(null); }
          });
          if (!blob) return;
          const formData = new FormData();
          formData.append("worksheet", new File([blob], `labelled-${reportId}.jpg`, { type: 'image/jpeg' }));
          const uploadRes = await fetch("/api/worksheets/upload", { method: "POST", body: formData });
          if (!uploadRes.ok) return;
          const { worksheetId: newId } = await uploadRes.json();
          if (!newId) return;
          await apiRequest(`/api/reports/${reportId}`, "PATCH", { labelledWorksheetId: newId });
        } catch { /* labelling is best-effort */ }
      })();
    }
  };

  // ── Closes the editor, or prompts if there are unsaved changes ───────────────
  const closeEditor = () => {
    setIsFullscreenMode(false);
    setIsEditDialogOpen(false);
    setIsReuploading(false);
    setHasUnsavedChanges(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(console.error);
  };

  const handleTryClose = () => {
    if (hasUnsavedChanges) {
      setIsCloseConfirmOpen(true);
    } else {
      closeEditor();
    }
  };

  const handleReuploadWorksheet = async (file: File) => {
    if (!editingReport) return;
    setReuploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("worksheet", file);
      const uploadRes = await fetch("/api/worksheets/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { worksheetId: newWorksheetId } = await uploadRes.json();

      // Patch the report with the new worksheetId + clear digitalWorksheetId
      const patchRes = await fetch(`/api/reports/${editingReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheetId: newWorksheetId, digitalWorksheetId: null }),
      });
      if (!patchRes.ok) throw new Error("Failed to link worksheet to report");

      setEditingReport(prev => prev ? { ...prev, worksheetId: newWorksheetId, digitalWorksheetId: null } : prev);
      setIsReuploading(false);
      toast({ title: "Worksheet replaced", description: "The new worksheet has been saved to this report." });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
    } catch (err: any) {
      toast({ title: "Reupload failed", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setReuploadLoading(false);
      setReuploadDragOver(false);
    }
  };

  const handleExportPDF = (report: Report) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const template = templates.find((t: ReportTemplate) => t.id === (editingReport?.templateId || (report as EditableReport).templateId)) || templates[0];
    const pc = template?.primaryColor || '#0066cc';
    const ac = template?.accentColor || '#e8f4fd';
    const ff = template?.fontFamily || 'Arial';
    const fs = template?.fontSize || '12px';
    const sigPos = template?.signaturePosition || 'right';
    const hdrStyle = (template?.headerStyle as string) || 'left-logo';
    const secStyle = (template?.sectionTitleStyle as string) || 'underline';
    const boxStyle = (template?.patientBoxStyle as string) || 'card';

    // Derive a slightly darker border color from the accent
    const acBorder = ac;

    const sectionTitleCSS = secStyle === 'filled'
      ? `color:#fff; background:${pc}; padding:7px 16px; margin-bottom:14px; margin-left:-16px; margin-right:-16px; font-size:14px; font-weight:700; letter-spacing:0.03em;`
      : secStyle === 'sidebar'
      ? `color:#1a1a1a; border-left:4px solid ${pc}; padding-left:10px; margin-bottom:12px; font-size:15px; font-weight:700;`
      : secStyle === 'pill'
      ? `color:#fff; background:${pc}; border-radius:30px; padding:4px 16px; display:inline-block; margin-bottom:12px; font-size:13px; font-weight:700;`
      : secStyle === 'minimal'
      ? `color:#1a1a1a; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; font-size:12px; margin-bottom:10px;`
      : /* underline default */ `color:${pc}; border-bottom:2px solid ${pc}; padding-bottom:7px; margin-bottom:14px; font-size:16px; font-weight:700;`;

    const patientBoxCSS = boxStyle === 'banner'
      ? `background:${pc}; color:#fff; padding:16px 20px; border-radius:0; margin-bottom:28px;`
      : boxStyle === 'table'
      ? `border:1px solid #ccc; border-radius:4px; padding:0; margin-bottom:28px; overflow:hidden;`
      : boxStyle === 'minimal'
      ? `border-bottom:2px solid ${pc}; padding-bottom:16px; background:none; margin-bottom:28px;`
      : /* card default */ `background:${ac}; border:1px solid ${acBorder}; border-radius:6px; padding:16px 20px; margin-bottom:28px;`;

    const patientBoxH3CSS = boxStyle === 'banner'
      ? `color:#fff; border-bottom:1px solid rgba(255,255,255,0.4); padding-bottom:8px; margin-bottom:10px; font-size:14px;`
      : `color:${pc}; border-bottom:1px solid ${acBorder}; padding-bottom:8px; margin-bottom:10px; font-size:14px;`;

    const headerCSS = hdrStyle === 'centered'
      ? `text-align:center; border-bottom:3px solid ${pc}; padding-bottom:18px; margin-bottom:26px;`
      : hdrStyle === 'compact'
      ? `display:flex; align-items:center; gap:14px; border-bottom:2px solid ${pc}; padding-bottom:10px; margin-bottom:20px;`
      : /* left-logo default */ `display:flex; align-items:flex-start; gap:20px; border-bottom:3px solid ${pc}; padding-bottom:18px; margin-bottom:26px;`;

    const logoCSS = hdrStyle === 'centered'
      ? `display:inline-block; margin-bottom:10px;`
      : hdrStyle === 'compact'
      ? `flex-shrink:0;`
      : `flex-shrink:0;`;

    const logoImgCSS = hdrStyle === 'compact' ? `max-height:48px; max-width:120px;` : `max-height:80px; max-width:200px;`;
    const h1Size = hdrStyle === 'compact' ? '16px' : '22px';
    const subtitleSize = hdrStyle === 'compact' ? '12px' : '14px';

    const clinicName = clinicData?.name || clinicSettings?.clinicName || 'Medical Clinic';
    const clinicAddress = clinicData?.address || clinicSettings?.address || '';
    const clinicPhone = clinicData?.phone || clinicSettings?.phone || '';
    const clinicFax = clinicData?.fax || '';
    const clinicEmail = clinicData?.email || '';

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Medical Report – ${report.patientName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:${ff},sans-serif;font-size:${fs};line-height:1.65;color:#1a1a1a;background:#fff;padding:32px 40px;max-width:820px;}
    .header{${headerCSS}}
    .header-logo{${logoCSS}}
    .header-logo img{object-fit:contain;display:block;${logoImgCSS}}
    .header-info{flex:1;}
    .header-info h1{font-size:${h1Size};font-weight:700;color:${pc};margin-bottom:4px;}
    .header-info .subtitle{font-size:${subtitleSize};color:#555;margin:2px 0;}
    .clinic-info{font-size:12px;color:#777;margin-top:2px;}
    .patient-box{${patientBoxCSS}display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;}
    .patient-box h3{grid-column:span 2;${patientBoxH3CSS}font-weight:700;}
    .pi{font-size:13px;margin-bottom:2px;}
    .pi .label{font-weight:bold;color:#444;}
    .ur{color:#1d4ed8;font-family:monospace;font-weight:bold;}
    .section{margin-bottom:14px;page-break-inside:avoid;}
    .section-title{${sectionTitleCSS}}
    .section-content{font-size:14px;line-height:1.55;white-space:pre-wrap;}
    .worksheet-img{max-width:100%;border:1px solid #ddd;border-radius:4px;margin-bottom:24px;display:block;}
    .amended-note{background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#92400e;}
    .signature-area{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;text-align:${sigPos};}
    .sig-line{border-top:1.5px solid #555;width:220px;display:inline-block;margin-bottom:6px;}
    .sig-name{font-weight:700;font-size:14px;}
    .sig-creds{font-size:12px;color:#555;}
    .finalized{margin-top:6px;font-size:11px;color:#16a34a;font-weight:600;}
    @media print{body{padding:16px;}@page{margin:15mm;}}
  </style>
</head>
<body>
  ${template?.showHeader !== false ? `<div class="header">
    ${clinicLogoApiUrl ? `<div class="header-logo"><img src="${clinicLogoApiUrl}" alt="Clinic Logo" /></div>` : ''}
    <div class="header-info">
      <h1>${clinicName}</h1>
      <div class="subtitle">Medical Examination Report</div>
      ${clinicAddress ? `<div class="clinic-info">${clinicAddress}</div>` : ''}
      ${clinicPhone ? `<div class="clinic-info">Phone: ${clinicPhone}</div>` : ''}
      ${clinicFax ? `<div class="clinic-info">Fax: ${clinicFax}</div>` : ''}
      ${clinicEmail ? `<div class="clinic-info">${clinicEmail}</div>` : ''}
    </div>
  </div>` : ''}

  ${report.isAmended ? `<div class="amended-note">&#9888; This report has been amended. Original findings may have changed.</div>` : ''}

  <div class="patient-box">
    <div class="pi"><span class="label">Patient Name:</span> ${report.patientName}</div>
    ${report.patientUrNumber ? `<div class="pi"><span class="label">UR Number:</span> <span class="ur">UR ${report.patientUrNumber}</span></div>` : '<div></div>'}
    <div class="pi"><span class="label">Date of Birth:</span> ${formatDobAU(report.patientDob)}</div>
    <div class="pi"><span class="label">Exam Date:</span> ${formatDobAU(report.examDate)}</div>
    <div class="pi"><span class="label">Report ID:</span> ${report.id}</div>
    <div class="pi"><span class="label">Report Date:</span> ${format(new Date(), 'dd/MM/yyyy')}</div>
  </div>

  ${template?.showStudyType !== false ? `<div class="section"><div class="section-title">Study Type</div><div class="section-content">${report.studyType}</div></div>` : ''}
  ${template?.showIndication !== false ? `<div class="section"><div class="section-title">Clinical Indication</div><div class="section-content">${report.indication}</div></div>` : ''}
  ${template?.showFindings !== false ? `<div class="section"><div class="section-title">Findings</div><div class="section-content">${report.findings.replace(/\n/g, '<br><br>')}</div></div>` : ''}
  ${template?.showImpression !== false ? `<div class="section"><div class="section-title">Impression</div><div class="section-content">${report.impression.replace(/\n/g, '<br><br>')}</div></div>` : ''}

  ${template?.showSignature !== false ? `<div class="signature-area">
    <div class="sig-line"></div>
    <div class="sig-name">Physician Signature &amp; Date</div>
    ${report.isFinalized && report.finalizedAt ? `<div class="finalized">Electronically signed on ${new Date(report.finalizedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}</div>` : ''}
  </div>` : ''}

</body>
</html>`);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 250);
  };

  const handleExportDOCX = async (report: Report) => {
    try {
      const templateId = editingReport?.templateId || 1;
      const response = await fetch(`/api/reports/${report.id}/docx?templateId=${templateId}`);
      if (!response.ok) throw new Error('Failed to generate DOCX');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `report-${report.patientName.replace(/\s+/g, '-')}-${report.id}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export DOCX file",
        variant: "destructive",
      });
    }
  };

  const handleDistribute = (report: Report) => {
    setDistributeReport(report);
    setDistributeCopied(false);
    setDistributeIncludeWorksheet(true);
    setEmailSent(false);
    setEmailSending(false);
    setEmailTo("");
    setEmailToName("");
    setEmailSubject(`Medical Report — ${report.patientName}`);
    setShowMarkSent(false);
    setMarkSentName("");
    setMarkSentEmail("");
    setMarkSentNotes("");
    setFaxNumber("");
    setFaxSent(false);
    setFaxSending(false);
    setHtmlBuilt(false);
    setDistributeHtml("");
    setDistributeHtmlWithWs("");
    setDistributeHtmlNoWs("");
    setDistributeWorksheetDataUrl(null);
  };

  const buildDistributeHtml = async () => {
    if (!distributeReport) return;
    const report = distributeReport;
    setDistributeLoading(true);

    // Helper to fetch a URL and return a base64 data-URI
    const toBase64 = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    // Look up physician from already-loaded list
    let physicianName = "";
    let physicianTitle = "";
    let physicianSpecialty = "";
    let signatureDataUrl: string | null = null;

    if (report.physicianId) {
      const physician = physicians.find(p => p.id === report.physicianId);
      if (physician) {
        physicianName = formatPhysicianName(physician.name || "");
        physicianTitle = physician.title || "";
        physicianSpecialty = physician.specialty || "";
        if (physician.signatureUrl) {
          signatureDataUrl = await toBase64(physician.signatureUrl);
        }
      }
    }

    // Look up sonographer
    let sonographerName = "";
    if (report.sonographerId) {
      const sono = sonographersList.find(s => s.id === report.sonographerId);
      if (sono) {
        sonographerName = (sono.title ? sono.title + " " : "") + sono.name;
      }
    }

    // Fetch worksheet image
    let worksheetDataUrl: string | null = null;
    if (report.worksheetId) {
      worksheetDataUrl = await toBase64(`/api/worksheets/${report.worksheetId}/image`);
    } else if (report.digitalWorksheetId) {
      worksheetDataUrl = await toBase64(`/api/digital-worksheets/${report.digitalWorksheetId}/image`);
    }

    const clinic = clinicSettings;
    const template = templates.find((t: ReportTemplate) => t.id === ((report as EditableReport).templateId)) || templates.find((t: ReportTemplate) => t.isDefault) || templates[0];
    const pc = template?.primaryColor || '#0066cc';
    const ac = template?.accentColor || '#e8f4fd';
    const ff = template?.fontFamily || 'Arial';
    const fs = template?.fontSize || '13px';
    const sigPos = template?.signaturePosition || 'right';
    const hdrStyle = (template?.headerStyle as string) || 'left-logo';
    const secStyle = (template?.sectionTitleStyle as string) || 'underline';
    const boxStyle = (template?.patientBoxStyle as string) || 'card';
    const todayAU = format(new Date(), 'dd/MM/yyyy');

    const sectionTitleCSS = secStyle === 'filled'
      ? `color:#fff;background:${pc};padding:6px 14px;margin-bottom:12px;font-size:14px;font-weight:700;letter-spacing:0.03em;`
      : secStyle === 'sidebar'
      ? `color:#1a1a1a;border-left:4px solid ${pc};padding-left:10px;margin-bottom:10px;font-size:15px;font-weight:700;`
      : secStyle === 'pill'
      ? `color:#fff;background:${pc};border-radius:30px;padding:3px 14px;display:inline-block;margin-bottom:10px;font-size:13px;font-weight:700;`
      : secStyle === 'minimal'
      ? `color:#1a1a1a;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;font-size:11px;margin-bottom:8px;`
      : `color:${pc};border-bottom:2px solid ${pc};padding-bottom:5px;margin-bottom:10px;font-size:15px;font-weight:700;`;

    const patientBoxCSS = boxStyle === 'banner'
      ? `background:${pc};color:#fff;padding:14px 18px;border-radius:0;margin-bottom:22px;`
      : boxStyle === 'table'
      ? `border:1px solid #ccc;border-radius:4px;padding:0;margin-bottom:22px;overflow:hidden;`
      : boxStyle === 'minimal'
      ? `border-bottom:2px solid ${pc};padding-bottom:14px;background:none;margin-bottom:22px;`
      : `background:${ac};border:1px solid ${ac};border-radius:6px;padding:14px 18px;margin-bottom:22px;`;

    const patientBoxH3CSS = boxStyle === 'banner'
      ? `color:#fff;border-bottom:1px solid rgba(255,255,255,0.4);padding-bottom:6px;margin-bottom:8px;font-size:13px;`
      : `color:${pc};border-bottom:1px solid ${ac};padding-bottom:6px;margin-bottom:8px;font-size:13px;`;

    const headerCSS = hdrStyle === 'centered'
      ? `text-align:center;border-bottom:3px solid ${pc};padding-bottom:16px;margin-bottom:22px;`
      : hdrStyle === 'compact'
      ? `display:flex;align-items:center;gap:12px;border-bottom:2px solid ${pc};padding-bottom:10px;margin-bottom:18px;`
      : `display:flex;align-items:flex-start;gap:18px;border-bottom:3px solid ${pc};padding-bottom:16px;margin-bottom:22px;`;

    const logoImgCSS = hdrStyle === 'compact' ? `max-height:44px;max-width:110px;` : `max-height:70px;max-width:180px;`;
    const h1Size = hdrStyle === 'compact' ? '16px' : '20px';

    // Load clinic logo for report header
    let clinicLogoDataUrl: string | null = null;
    if (clinicLogoApiUrl) {
      clinicLogoDataUrl = await toBase64(clinicLogoApiUrl);
    }

    // Always composite the labelled header strip onto the worksheet image for the distribute dialog.
    // The per-distribution toggle controls whether it is included; it defaults to ON.
    let labelledWorksheetDataUrl: string | null = worksheetDataUrl;
    if (worksheetDataUrl) {
      try {
        const wsImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = worksheetDataUrl!;
        });
        let logoImgEl: HTMLImageElement | null = null;
        if (clinicLogoDataUrl) {
          logoImgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = clinicLogoDataUrl!;
          });
        }
        const W = wsImg.width;
        const HPAD = Math.round(W * 0.025);
        const HHEIGHT = Math.round(W * 0.1);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = wsImg.height + HHEIGHT;
        const ctx = canvas.getContext('2d')!;
        // White header background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, HHEIGHT);
        // Border line under header
        ctx.strokeStyle = pc;
        ctx.lineWidth = Math.round(W * 0.003);
        ctx.beginPath(); ctx.moveTo(0, HHEIGHT); ctx.lineTo(W, HHEIGHT); ctx.stroke();
        // Logo on the left
        let textStartX = HPAD;
        if (logoImgEl) {
          const logoMaxH = HHEIGHT - HPAD * 2;
          const logoMaxW = Math.round(W * 0.2);
          const scale = Math.min(logoMaxW / logoImgEl.width, logoMaxH / logoImgEl.height, 1);
          const logoW = logoImgEl.width * scale;
          const logoH = logoImgEl.height * scale;
          const logoY = (HHEIGHT - logoH) / 2;
          ctx.drawImage(logoImgEl, HPAD, logoY, logoW, logoH);
          textStartX = HPAD + logoW + Math.round(W * 0.015);
        }
        // Patient info lines (no clinic name text — logo is sufficient)
        const infoFontSize = Math.round(W * 0.0135);
        ctx.fillStyle = '#333333';
        ctx.font = `${infoFontSize}px Arial, sans-serif`;
        const infoLines = [
          `Patient: ${report.patientName}`,
          report.patientDob ? `DOB: ${formatDobAU(report.patientDob)}` : null,
          `Exam Date: ${formatDobAU(report.examDate)}`,
          report.patientUrNumber ? `UR: ${report.patientUrNumber}` : null,
          `Scan: ${report.studyType}`,
        ].filter(Boolean) as string[];
        const infoColW = (W - textStartX - HPAD) / 2;
        const leftInfoLines = infoLines.slice(0, Math.ceil(infoLines.length / 2));
        const rightInfoLines = infoLines.slice(Math.ceil(infoLines.length / 2));
        const lineH = infoFontSize + Math.round(infoFontSize * 0.45);
        const textY = (HHEIGHT - Math.ceil(infoLines.length / 2) * lineH) / 2 + infoFontSize;
        leftInfoLines.forEach((line, i) => ctx.fillText(line, textStartX, textY + i * lineH));
        rightInfoLines.forEach((line, i) => ctx.fillText(line, textStartX + infoColW, textY + i * lineH));
        // Worksheet image below header
        ctx.drawImage(wsImg, 0, HHEIGHT);
        labelledWorksheetDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      } catch {
        // fall back to raw worksheet if compositing fails
        labelledWorksheetDataUrl = worksheetDataUrl;
      }
    }

    const clinicName = clinicData?.name || clinic?.clinicName || 'Medical Clinic';
    const clinicAddress = clinicData?.address || clinic?.address || '';
    const clinicPhone = clinicData?.phone || clinic?.phone || '';
    const clinicFax = clinicData?.fax || '';
    const clinicEmail = clinicData?.email || '';

    const accessionId = report.worksheetId ? `WS-${report.worksheetId}` : report.digitalWorksheetId ? `DW-${report.digitalWorksheetId}` : '';
    const displayStudyType = cleanStudyType(report.studyType);
    const displayExamDate = formatDobAU(report.examDate);

    const makeHtml = (wsUrl: string | null, copiesTo: string = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medical Report – ${report.patientName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:${ff},Arial,sans-serif;font-size:${fs};color:#222;background:#fff;padding:30px 38px;max-width:780px;margin:0 auto;}
    .header{${headerCSS}}
    .header-logo{flex-shrink:0;}
    .header-logo img{object-fit:contain;display:block;${logoImgCSS}}
    .header-info{flex:1;}
    .header-info h1{font-size:${h1Size};font-weight:700;color:${pc};margin-bottom:3px;}
    .header-info .sub{font-size:13px;color:#555;}
    .header-info .clinic-info{font-size:12px;color:#777;margin-top:2px;}
    .patient-box{${patientBoxCSS}display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;}
    .patient-box h3{grid-column:span 2;${patientBoxH3CSS}font-weight:700;}
    .pi{font-size:12px;}
    .pi .label{font-weight:bold;color:#444;}
    .pi-full{grid-column:span 2;font-size:12px;}
    .pi-full .label{font-weight:bold;color:#444;}
    .ur{color:#1d4ed8;font-family:monospace;font-weight:bold;}
    .section{margin-bottom:12px;page-break-inside:avoid;}
    .section-title{${sectionTitleCSS}}
    .section-content{font-size:13px;line-height:1.55;white-space:pre-wrap;}
    .worksheet-page{page-break-before:always;break-before:page;padding-top:30px;}
    .worksheet-page-header{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;color:#555;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;page-break-after:avoid;break-after:avoid;}
    .worksheet-page-header .label{font-weight:bold;color:#444;}
    .worksheet-img{max-width:100%;max-height:255mm;object-fit:contain;border:1px solid #ddd;border-radius:4px;display:block;}
    .sig-area{margin-top:28px;padding-top:12px;border-top:1px solid #ddd;text-align:${sigPos};}
    .sig-img{max-height:68px;margin-bottom:4px;}
    .sig-name{font-weight:bold;font-size:13px;}
    .sig-creds{font-size:12px;color:#555;}
    .copies-to{font-size:12px;color:#555;margin-top:6px;}
    .finalized{margin-top:5px;font-size:11px;color:#16a34a;font-weight:600;}
    .amended-note{background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:8px 12px;margin-bottom:14px;font-size:12px;color:#92400e;}
  </style>
</head>
<body>
  ${template?.showHeader !== false ? `<div class="header">
    ${clinicLogoDataUrl ? `<div class="header-logo"><img src="${clinicLogoDataUrl}" alt="Clinic Logo" /></div>` : ''}
    <div class="header-info">
      <h1>${clinicName}</h1>
      <div class="sub">Vascular Ultrasound Report</div>
      ${clinicAddress ? `<div class="clinic-info">${clinicAddress}</div>` : ''}
      ${[clinicPhone ? `Ph: ${clinicPhone}` : '', clinicFax ? `Fax: ${clinicFax}` : ''].filter(Boolean).join('  &nbsp;|&nbsp;  ')}
      ${clinicEmail ? `<div class="clinic-info">${clinicEmail}</div>` : ''}
    </div>
  </div>` : ''}

  ${report.isAmended ? `<div class="amended-note">&#9888; This report has been amended. Original findings may have changed.</div>` : ''}

  <div class="patient-box">
    <div class="pi"><span class="label">Patient Name:</span> ${report.patientName}</div>
    <div class="pi"><span class="label">UR Number:</span> ${report.patientUrNumber ? `<span class="ur">UR ${report.patientUrNumber}</span>` : '—'}</div>
    <div class="pi"><span class="label">Date of Birth:</span> ${formatDobAU(report.patientDob)}</div>
    <div class="pi"><span class="label">Exam Date:</span> ${displayExamDate}</div>
    <div class="pi"><span class="label">Report Date:</span> ${todayAU}</div>
    <div></div>
    <div class="pi-full"><span class="label">Study:</span> ${displayStudyType}</div>
    <div class="pi">${accessionId ? `<span class="label">Accession:</span> ${accessionId}` : ''}</div>
    <div class="pi">${sonographerName ? `<span class="label">Sonographer:</span> ${sonographerName}` : ''}</div>
  </div>

  ${template?.showIndication !== false ? `<div class="section"><div class="section-title">Clinical Indication</div><div class="section-content">${report.indication}</div></div>` : ''}
  ${template?.showFindings !== false ? `<div class="section"><div class="section-title">Findings</div><div class="section-content">${formatFindings(report.findings)}</div></div>` : ''}
  ${template?.showImpression !== false ? `<div class="section"><div class="section-title">Impression</div><div class="section-content">${report.impression}</div></div>` : ''}

  ${template?.showSignature !== false ? `<div class="sig-area">
    ${signatureDataUrl ? `<img class="sig-img" src="${signatureDataUrl}" alt="Physician Signature" />` : ''}
    ${physicianName ? `<div class="sig-name">${physicianName}${physicianTitle ? ' ' + physicianTitle : ''}</div>` : ''}
    ${physicianSpecialty ? `<div class="sig-creds">${physicianSpecialty}</div>` : ''}
    ${copiesTo ? `<div class="copies-to"><strong>Copies to:</strong> ${copiesTo}</div>` : '<!--COPIES_TO_PLACEHOLDER-->'}
    ${report.isFinalized && report.finalizedAt ? `<div class="finalized">Electronically signed ${new Date(report.finalizedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}</div>` : ''}
  </div>` : ''}


  ${wsUrl ? `<div class="worksheet-page">
    <div class="worksheet-page-header">
      <div><span class="label">${report.patientName}</span>${report.patientUrNumber ? ` &nbsp;·&nbsp; <span class="ur">UR ${report.patientUrNumber}</span>` : ''}</div>
      <div>
        ${accessionId ? `<span class="label">Accession:</span> ${accessionId}` : ''}
        ${accessionId && sonographerName ? ' &nbsp;·&nbsp; ' : ''}
        ${sonographerName ? `<span class="label">Sonographer:</span> ${sonographerName}` : ''}
      </div>
    </div>
    <img class="worksheet-img" src="${wsUrl}" alt="Labelled Worksheet" />
  </div>` : ''}
</body>
</html>`;

    const hasWs = !!labelledWorksheetDataUrl;
    const htmlWithWs = makeHtml(labelledWorksheetDataUrl);
    const htmlNoWs = makeHtml(null);
    setDistributeHasWorksheet(hasWs);
    setDistributeWorksheetDataUrl(labelledWorksheetDataUrl);
    setDistributeHtmlWithWs(htmlWithWs);
    setDistributeHtmlNoWs(htmlNoWs);
    setDistributeHtml(htmlWithWs); // default: worksheet included
    setHtmlBuilt(true);
    setDistributeLoading(false);
  };

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(distributeHtml);
      setDistributeCopied(true);
      setShowMarkSent(true);
      toast({ title: "Copied!", description: "HTML copied — paste into your messaging app, then record the distribution below." });
      setTimeout(() => setDistributeCopied(false), 3000);
    } catch {
      toast({ title: "Copy failed", description: "Please select all and copy manually.", variant: "destructive" });
    }
  };

  const handleMarkSent = async () => {
    if (!distributeReport) return;
    setMarkSentLogging(true);
    try {
      // Generate a PDF snapshot of exactly what was transmitted
      let pdfBlob: string | null = null;
      try {
        pdfBlob = await generateReportPdfBase64(distributeHtmlNoWs, distributeWorksheetDataUrl);
      } catch (pdfErr) {
        console.warn("PDF generation failed for Copy HTML record:", pdfErr);
      }
      await fetch(`/api/reports/${distributeReport.id}/distributions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "copy_html",
          recipientName: markSentName || null,
          recipientEmail: markSentEmail || null,
          notes: markSentNotes || null,
          pdfBlob: pdfBlob || null,
          worksheetIncluded: !!distributeWorksheetDataUrl,
        }),
      });
      refetchDistributions();
      refetchDistributionCounts();
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      setMarkSentName("");
      setMarkSentEmail("");
      setMarkSentNotes("");
      setShowMarkSent(false);
      toast({ title: "Distribution Recorded", description: "The transmitted PDF has been stored and report archived." });
    } catch {
      toast({ title: "Log Failed", description: "Could not save distribution record.", variant: "destructive" });
    } finally {
      setMarkSentLogging(false);
    }
  };

  const handleSendEmail = async () => {
    if (!distributeReport || !emailTo) return;
    if (!htmlBuilt) await buildDistributeHtml();
    setEmailSending(true);
    setEmailSent(false);
    try {
      // Inject copies-to into the report HTML before generating the PDF
      const ccList = emailCcs.map(e => e.trim()).filter(Boolean);
      const copiesTo = [emailToName || emailTo, ...ccList].filter(Boolean).join(", ");
      const htmlForEmail = distributeHtml.replace(
        "<!--COPIES_TO_PLACEHOLDER-->",
        copiesTo ? `<div class="copies-to"><strong>Copies to:</strong> ${copiesTo}</div>` : ""
      );

      // Build a single combined PDF: report pages first, worksheet as dedicated final page
      const htmlForPdf = distributeHtmlNoWs.replace(
        "<!--COPIES_TO_PLACEHOLDER-->",
        copiesTo ? `<div class="copies-to"><strong>Copies to:</strong> ${copiesTo}</div>` : ""
      );
      let pdfBase64: string | undefined;
      try {
        pdfBase64 = await generateReportPdfBase64(htmlForPdf, distributeWorksheetDataUrl);
      } catch (pdfErr) {
        console.warn("Report PDF generation failed, sending without attachment:", pdfErr);
      }
      const res = await fetch(`/api/reports/${distributeReport.id}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: emailTo,
          toName: emailToName || emailTo,
          ccEmails: emailCcs.map(e => e.trim()).filter(Boolean),
          subject: emailSubject || `Medical Report — ${distributeReport.patientName}`,
          reportHtml: htmlForEmail,
          pdfBase64,
          patientName: distributeReport.patientName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Send failed");
      setEmailSent(true);
      refetchDistributions();
      refetchDistributionCounts();
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      toast({ title: "Email Sent", description: `Report sent to ${emailTo}` });
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err: any) {
      toast({ title: "Send Failed", description: err.message || "Could not send email", variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendFax = async () => {
    if (!distributeReport || !faxNumber.trim()) return;
    setFaxSending(true);
    setFaxSent(false);
    try {
      // Build a single combined PDF: report pages first, worksheet as dedicated final page
      let pdfBase64: string | undefined;
      try {
        pdfBase64 = await generateReportPdfBase64(distributeHtmlNoWs, distributeWorksheetDataUrl);
      } catch (pdfErr) {
        console.warn("PDF generation failed for fax, sending without attachment:", pdfErr);
      }
      const res = await fetch(`/api/reports/${distributeReport.id}/send-fax`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faxNumber: faxNumber.trim(),
          pdfBase64,
          patientName: distributeReport.patientName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Fax send failed");
      setFaxSent(true);
      refetchDistributions();
      refetchDistributionCounts();
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
      toast({ title: "Fax Sent", description: `Report faxed to ${faxNumber.trim()}` });
      setTimeout(() => setFaxSent(false), 4000);
    } catch (err: any) {
      toast({ title: "Fax Failed", description: err.message || "Could not send fax", variant: "destructive" });
    } finally {
      setFaxSending(false);
    }
  };

  const updateEditingReport = (field: keyof EditableReport, value: any) => {
    if (!editingReport) return;
    setEditingReport(prev => prev ? { ...prev, [field]: value } : null);
    setHasUnsavedChanges(true);
  };

  const clearField = (field: 'indication' | 'findings' | 'impression') => {
    if (!editingReport) return;
    setPreviousFieldValues(prev => ({ ...prev, [field]: editingReport[field] || '' }));
    updateEditingReport(field, '');
  };

  const undoField = (field: 'indication' | 'findings' | 'impression') => {
    if (previousFieldValues[field] === undefined) return;
    updateEditingReport(field, previousFieldValues[field]);
    setPreviousFieldValues(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  // Handle voice dictation transcription
  const handleVoiceTranscription = (text: string, field: string) => {
    if (editingReport) {
      const currentValue = editingReport[field as keyof EditableReport] as string || '';
      const newValue = currentValue ? currentValue + ' ' + text : text;
      updateEditingReport(field as keyof EditableReport, newValue);
    }
  };

  // Toggle voice dictation for a specific field
  const toggleVoiceDictation = (field: string) => {
    if (activeVoiceDictation === field) {
      setActiveVoiceDictation('');
    } else {
      setActiveVoiceDictation(field);
    }
  };

  const handleInsertShortcut = (text: string, shortcutId: number) => {
    if (!editingReport || !activeTextArea) return;
    
    // Get current cursor position if possible, otherwise append
    const currentValue = editingReport[activeTextArea as keyof EditableReport] as string || '';
    const newValue = currentValue + (currentValue ? '\n\n' : '') + text;
    
    updateEditingReport(activeTextArea as keyof EditableReport, newValue);
    
    // Close shortcuts panel
    setShowShortcuts(false);
    
    toast({
      title: "Text Inserted",
      description: "Shortcut text has been added to the report",
    });
  };

  const handleDownloadLabelledWorksheet = async (report: Report) => {
    try {
      if (!report.worksheetId && !(report as any).digitalWorksheetId) {
        toast({ title: "No worksheet", description: "No worksheet image is attached to this report.", variant: "destructive" });
        return;
      }
      const canvas = await generateLabelledCanvas(report);
      if (!canvas) throw new Error("Failed to generate labelled canvas");

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297);
      pdf.save(`worksheet-${report.patientName.replace(/\s+/g, '-')}-${report.examDate}.pdf`);
      toast({ title: "Downloaded", description: "Labelled worksheet saved as A4 PDF." });
    } catch (error) {
      console.error("Download labelled worksheet error:", error);
      toast({ title: "Error", description: "Failed to generate labelled worksheet.", variant: "destructive" });
    }
  };

  const handleDeleteReport = (report: Report) => {
    if (window.confirm(`Are you sure you want to delete the report for ${report.patientName}? This action cannot be undone.`)) {
      deleteReportMutation.mutate(report.id);
    }
  };

  const filteredReports = reports.filter((report: Report) => {
    if (!showArchived && (report as any).isArchived) return false;
    return (
      report.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.studyType.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredReports.length / REPORTS_PER_PAGE);
  const startIndex = (currentPage - 1) * REPORTS_PER_PAGE;
  const endIndex = startIndex + REPORTS_PER_PAGE;
  const currentReports = filteredReports.slice(startIndex, endIndex);

  // Reset to first page when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (reportsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">
            View, edit, and export recent medical reports
            {filteredReports.length > 0 && (
              <span className="ml-2 text-sm">
                ({filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(v => !v)}
            className={showArchived ? "bg-gray-600 hover:bg-gray-700 text-white" : "text-gray-600"}
          >
            <Archive className="w-4 h-4 mr-1.5" />
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
          <div className="relative">
            <Input
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-64"
            />
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {currentReports.map((report: Report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  {report.patientName}
                  {(report as any).patientUrNumber && (
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs normal-case">UR {(report as any).patientUrNumber}</span>
                  )}
                </CardTitle>
                <div className="text-xs text-gray-500">
                  #{report.id}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  {formatDobAU(report.examDate)}
                </div>
                <div className="text-sm font-medium text-gray-800">
                  {report.studyType}
                </div>
                <div className="text-xs text-gray-500">
                  Generated: {format(new Date(report.generatedAt), 'dd/MM/yyyy')}
                </div>
                {report.isFinalized && report.finalizedAt && (
                  <div className="flex items-center text-xs text-green-600 mt-1">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Signed: {format(new Date(report.finalizedAt), 'dd/MM/yyyy')}
                  </div>
                )}
                {(distributionCounts[report.id] ?? 0) > 0 && (
                  <div className="flex items-center text-xs text-blue-600 mt-1">
                    <svg className="w-3 h-3 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Distributed {distributionCounts[report.id] > 1 ? `×${distributionCounts[report.id]}` : ""}
                  </div>
                )}
                {(report as any).isSonographerComplete && (report as any).sonographerCompletedAt && (
                  <div className="flex items-center text-xs text-teal-600 mt-1">
                    <ClipboardCheck className="w-3 h-3 mr-1" />
                    Sono Complete: {format(new Date((report as any).sonographerCompletedAt), 'dd/MM/yyyy')}
                  </div>
                )}
                {report.isAmended && report.amendedAt && (
                  <div className="flex items-center text-xs text-orange-600 mt-1">
                    <Edit3 className="w-3 h-3 mr-1" />
                    Amended: {format(new Date(report.amendedAt), 'dd/MM/yyyy')}
                  </div>
                )}
                {(report as any).isArchived && (
                  <div className="flex items-center text-xs text-gray-500 mt-1">
                    <Archive className="w-3 h-3 mr-1" />
                    Archived
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2">
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditReport(report)}
                    className="flex-1"
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportPDF(report)}
                  >
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDistribute(report)}
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Share2 className="w-3 h-3 mr-1" />
                    Distribute
                  </Button>
                </div>
                {/* Sonographer Complete + Archive row */}
                <div className="flex space-x-2">
                  {(report as any).isSonographerComplete ? (
                    <div className="flex items-center justify-center flex-1 py-1.5 px-2 text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded">
                      <ClipboardCheck className="w-3 h-3 mr-1" />
                      Sono Complete
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-teal-600 border-teal-200 hover:bg-teal-50 text-xs"
                      onClick={() => sonographerCompleteMutation.mutate(report.id)}
                      disabled={sonographerCompleteMutation.isPending}
                    >
                      <ClipboardCheck className="w-3 h-3 mr-1" />
                      Sono Complete
                    </Button>
                  )}
                  {(distributionCounts[report.id] ?? 0) > 0 && !(report as any).isArchived && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-500 border-gray-200 hover:bg-gray-50 px-2"
                      onClick={() => {
                        if (confirm("Archive this workflow? It will be hidden from the main reports list.")) {
                          archiveReportMutation.mutate(report.id);
                        }
                      }}
                      disabled={archiveReportMutation.isPending}
                      title="Archive workflow"
                    >
                      <Archive className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="flex space-x-2">
                  {report.isFinalized ? (
                    <div className="flex items-center justify-center w-full py-2 px-3 text-xs text-green-600 bg-green-50 border border-green-200 rounded">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Finalized
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 w-full">
                      <Checkbox
                        checked={false}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            finalizeReportMutation.mutate(report.id);
                          }
                        }}
                        disabled={finalizeReportMutation.isPending}
                        className="scale-75"
                      />
                      <span className="text-xs text-gray-600 flex-1">
                        {finalizeReportMutation.isPending ? "Finalizing..." : "Finalize"}
                      </span>
                    </div>
                  )}
                  {report.isFinalized && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAmendReport(report)}
                      className="text-orange-600 border-orange-200 hover:bg-orange-50"
                    >
                      Amend
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteReport(report)}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 px-2"
                    disabled={deleteReportMutation.isPending}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {currentReports.length === 0 && (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Reports Found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'No reports match your search criteria' : 'No reports have been generated yet'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredReports.length)} of {filteredReports.length} reports
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    className={`w-10 h-10 ${currentPage === pageNum ? 'medical-btn-primary' : ''}`}
                    onClick={() => goToPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Fullscreen Split View - Rendered Outside Dialog */}
      {isFullscreenMode && editingReport && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm">
            <div>
              <h2 className="text-xl font-semibold">Edit Report - {editingReport.patientName}</h2>
              <p className="text-sm text-gray-600">Template: {templates.find(t => t.id === editingReport.templateId)?.name || 'Standard Report'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToPreviousReport}
                disabled={getCurrentReportIndex() <= 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                {getCurrentReportIndex() + 1} of {filteredReports.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToNextReport}
                disabled={getCurrentReportIndex() >= filteredReports.length - 1}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              {onStartAnotherScan && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsFullscreenMode(false);
                    setIsEditDialogOpen(false);
                    if (document.fullscreenElement) document.exitFullscreen().catch(console.error);
                    onStartAnotherScan({
                      patientId: editingReport.patientId ?? null,
                      patientName: editingReport.patientName,
                      examDate: editingReport.examDate,
                    });
                  }}
                  className="text-teal-700 border-teal-300 hover:bg-teal-50 hover:border-teal-400"
                >
                  <PlusCircle className="w-4 h-4 mr-1.5" />
                  Another scan — {editingReport.patientName.split(" ")[0]}
                </Button>
              )}
              {!(editingReport as any).isArchived ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-gray-500 border-gray-200 hover:bg-gray-50"
                  onClick={() => {
                    if (confirm("Archive this workflow? It will be hidden from the main reports list.")) {
                      archiveReportMutation.mutate(editingReport.id);
                    }
                  }}
                  disabled={archiveReportMutation.isPending}
                  title="Archive workflow"
                >
                  <Archive className="w-4 h-4 mr-1" />
                  Archive
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-gray-500 border-gray-200 hover:bg-gray-50"
                  onClick={() => archiveReportMutation.mutate(editingReport.id)}
                  disabled={archiveReportMutation.isPending}
                  title="Unarchive workflow"
                >
                  <Archive className="w-4 h-4 mr-1" />
                  Unarchive
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteReport(editingReport)}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                disabled={deleteReportMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {deleteReportMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
              {hasUnsavedChanges && (
                <span className="text-amber-600 text-xs font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  Unsaved changes
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleTryClose}
              >
                <Minimize2 className="w-4 h-4 mr-2" />
                Exit Fullscreen
              </Button>
            </div>
          </div>
          
          {/* Split View Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - Worksheet */}
            <div className="w-1/2 border-r bg-gray-50 flex flex-col">
              <div className="p-4 border-b bg-white flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold truncate">Worksheet — {editingReport.patientName}</h3>
                  <p className="text-sm text-gray-600">
                    {isReuploading ? "Drop or select a replacement file" : "Original drawing or uploaded worksheet"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isReuploading && (editingReport.worksheetId || editingReport.digitalWorksheetId) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadLabelledWorksheet(editingReport)}
                      title="Download a copy of the worksheet with clinic logo and patient details stamped at the top"
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Download Labelled Copy
                    </Button>
                  )}
                  {isReuploading ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setIsReuploading(false); setReuploadDragOver(false); }}
                      disabled={reuploadLoading}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsReuploading(true)}
                      className="text-amber-700 border-amber-300 hover:bg-amber-50 hover:border-amber-400"
                    >
                      <Upload className="w-4 h-4 mr-1.5" />
                      Replace Worksheet
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                {isReuploading ? (
                  /* ── Reupload drop zone ── */
                  <div
                    className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer select-none ${
                      reuploadDragOver
                        ? "border-amber-400 bg-amber-50"
                        : "border-gray-300 bg-white hover:border-amber-300 hover:bg-amber-50/40"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setReuploadDragOver(true); }}
                    onDragLeave={() => setReuploadDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setReuploadDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleReuploadWorksheet(file);
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*,.pdf";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleReuploadWorksheet(file);
                      };
                      input.click();
                    }}
                  >
                    {reuploadLoading ? (
                      <>
                        <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-amber-700 font-medium">Uploading worksheet…</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 text-amber-400 mb-4" />
                        <p className="text-base font-semibold text-gray-700 mb-1">Drop the correct worksheet here</p>
                        <p className="text-sm text-gray-500">or click to browse — JPG, PNG, PDF accepted</p>
                        <p className="text-xs text-amber-600 mt-3">This will replace the current worksheet on this report</p>
                      </>
                    )}
                  </div>
                ) : editingReport.digitalWorksheetId ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <img 
                      src={`/api/digital-worksheets/${editingReport.digitalWorksheetId}/image`}
                      alt="Digital Worksheet"
                      className="max-w-full max-h-full object-contain border border-gray-300 rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ) : (editingReport as any).labelledWorksheetId ? (
                  /* Show the annotated (labelled) version once the report has been saved */
                  <WorksheetViewer
                    worksheetId={(editingReport as any).labelledWorksheetId}
                    alt="Annotated Worksheet"
                  />
                ) : editingReport.worksheetId ? (
                  <WorksheetViewer 
                    worksheetId={editingReport.worksheetId} 
                    alt="Uploaded Worksheet"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="mb-3">No worksheet uploaded yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsReuploading(true)}
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      <Upload className="w-4 h-4 mr-1.5" />
                      Upload Worksheet
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Panel - Report Editor */}
            <div className="w-1/2 flex flex-col bg-white">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold">Report Editor</h3>
                <p className="text-sm text-gray-600">Edit report content and save changes</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Template Selection */}
                <div className="space-y-2">
                  <Label htmlFor="fullscreen-template">Report Template</Label>
                  <Select
                    value={editingReport.templateId?.toString() || ""}
                    onValueChange={(value) => updateEditingReport('templateId', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template: ReportTemplate) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Patient Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullscreen-patientName">Patient Name</Label>
                    <Input
                      id="fullscreen-patientName"
                      value={editingReport.patientName}
                      onChange={(e) => updateEditingReport('patientName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullscreen-patientUrNumber" className="text-blue-700 font-semibold">UR Number</Label>
                    <Input
                      id="fullscreen-patientUrNumber"
                      className="font-mono font-bold text-blue-700"
                      placeholder="e.g. 100001"
                      value={(editingReport as any).patientUrNumber || ""}
                      onChange={(e) => updateEditingReport('patientUrNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullscreen-patientDob">Date of Birth</Label>
                    <Input
                      id="fullscreen-patientDob"
                      value={editingReport.patientDob}
                      onChange={(e) => updateEditingReport('patientDob', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullscreen-examDate">Exam Date</Label>
                    <Input
                      id="fullscreen-examDate"
                      value={editingReport.examDate}
                      onChange={(e) => updateEditingReport('examDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullscreen-studyType">Study Type</Label>
                    <Input
                      id="fullscreen-studyType"
                      value={editingReport.studyType}
                      onChange={(e) => updateEditingReport('studyType', e.target.value)}
                    />
                  </div>
                </div>

                {/* Reporting Doctor */}
                <div className="space-y-2">
                  <Label htmlFor="fullscreen-physicianId">Reporting Doctor</Label>
                  <select
                    id="fullscreen-physicianId"
                    data-testid="select-physician-fullscreen"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editingReport.physicianId ? String(editingReport.physicianId) : ""}
                    onChange={(e) => updateEditingReport('physicianId', e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select reporting doctor —</option>
                    {physicians.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatPhysicianName(p.name)}{p.title ? ` ${p.title}` : ''}{p.specialty ? ` — ${p.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Report Fields */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="fullscreen-indication">Indication</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={activeVoiceDictation === 'indication' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleVoiceDictation('indication')}
                        data-testid="button-dictate-indication"
                      >
                        <Mic className="w-4 h-4 mr-1" />
                        {activeVoiceDictation === 'indication' ? 'Recording...' : 'Dictate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTextArea('indication');
                          setShowShortcuts(!showShortcuts);
                        }}
                      >
                        <Hash className="w-4 h-4 mr-1" />
                        Shortcuts
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => clearField('indication')} title="Clear indication" disabled={!editingReport?.indication}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => undoField('indication')} title="Undo" disabled={previousFieldValues['indication'] === undefined}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="fullscreen-indication"
                    value={editingReport.indication}
                    onChange={(e) => updateEditingReport('indication', e.target.value)}
                    rows={3}
                  />
                  
                  {/* Inline Voice Recorder */}
                  {activeVoiceDictation === 'indication' && (
                    <InlineVoiceRecorder
                      fieldName="indication"
                      onTranscription={handleVoiceTranscription}
                      onClose={() => setActiveVoiceDictation('')}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="fullscreen-findings">Findings</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={activeVoiceDictation === 'findings' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleVoiceDictation('findings')}
                        data-testid="button-dictate-findings"
                      >
                        <Mic className="w-4 h-4 mr-1" />
                        {activeVoiceDictation === 'findings' ? 'Recording...' : 'Dictate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTextArea('findings');
                          setShowShortcuts(!showShortcuts);
                        }}
                      >
                        <Hash className="w-4 h-4 mr-1" />
                        Shortcuts
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => clearField('findings')} title="Clear findings" disabled={!editingReport?.findings}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => undoField('findings')} title="Undo" disabled={previousFieldValues['findings'] === undefined}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="fullscreen-findings"
                    value={editingReport.findings}
                    onChange={(e) => updateEditingReport('findings', e.target.value)}
                    rows={6}
                  />
                  
                  {/* Inline Voice Recorder */}
                  {activeVoiceDictation === 'findings' && (
                    <InlineVoiceRecorder
                      fieldName="findings"
                      onTranscription={handleVoiceTranscription}
                      onClose={() => setActiveVoiceDictation('')}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="fullscreen-impression">Impression</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={activeVoiceDictation === 'impression' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleVoiceDictation('impression')}
                        data-testid="button-dictate-impression"
                      >
                        <Mic className="w-4 h-4 mr-1" />
                        {activeVoiceDictation === 'impression' ? 'Recording...' : 'Dictate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTextArea('impression');
                          setShowShortcuts(!showShortcuts);
                        }}
                      >
                        <Hash className="w-4 h-4 mr-1" />
                        Shortcuts
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => clearField('impression')} title="Clear impression" disabled={!editingReport?.impression}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => undoField('impression')} title="Undo" disabled={previousFieldValues['impression'] === undefined}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="fullscreen-impression"
                    value={editingReport.impression}
                    onChange={(e) => updateEditingReport('impression', e.target.value)}
                    rows={4}
                  />
                  
                  {/* Inline Voice Recorder */}
                  {activeVoiceDictation === 'impression' && (
                    <InlineVoiceRecorder
                      fieldName="impression"
                      onTranscription={handleVoiceTranscription}
                      onClose={() => setActiveVoiceDictation('')}
                    />
                  )}
                </div>

                {/* Sono Complete */}
                <div className="border-t pt-4">
                  {(editingReport as any).isSonographerComplete ? (
                    <div className="flex items-center text-sm text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                      <ClipboardCheck className="w-4 h-4 mr-2 flex-shrink-0" />
                      Sono complete — {(editingReport as any).sonographerCompletedBy || "Sonographer"}{(editingReport as any).sonographerCompletedAt ? ` on ${format(new Date((editingReport as any).sonographerCompletedAt), 'dd MMM yyyy')}` : ""}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-teal-600 border-teal-200 hover:bg-teal-50"
                      onClick={() => sonographerCompleteMutation.mutate(editingReport.id)}
                      disabled={sonographerCompleteMutation.isPending}
                    >
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      Mark Sono Complete
                    </Button>
                  )}
                </div>

                {/* Finalization */}
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fullscreen-finalizeReport"
                      checked={Boolean(editingReport.isFinalized)}
                      onCheckedChange={(checked) => updateEditingReport('isFinalized', Boolean(checked))}
                    />
                    <Label htmlFor="fullscreen-finalizeReport" className="text-sm">
                      Finalize this report (will add electronic signature timestamp)
                    </Label>
                  </div>
                  
                  {editingReport.isFinalized && (
                    <div className="text-green-600 text-sm flex items-center">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      This report will be electronically signed upon saving
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={handleTryClose}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Close
                  </Button>
                  <Button
                    onClick={() => handleExportPDF(editingReport)}
                    variant="outline"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button
                    onClick={() => handleDistribute(editingReport)}
                    variant="outline"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Distribute
                  </Button>
                  <Button
                    onClick={handleSaveReport}
                    disabled={updateReportMutation.isPending}
                    className="medical-btn-primary"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateReportMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Text Shortcuts Side Panel */}
          {showShortcuts && (
            <div className="fixed top-0 right-0 h-full w-96 bg-white border-l shadow-lg z-[110] overflow-y-auto">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Text Shortcuts</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowShortcuts(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Click any shortcut to insert into {activeTextArea}
                </p>
              </div>
              <div className="p-4">
                <TextShortcuts
                  onInsertShortcut={handleInsertShortcut}
                  compact={true}
                  showUsageTracking={true}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Regular Report Editor Dialog */}
      <Dialog open={isEditDialogOpen && !isFullscreenMode} onOpenChange={(open) => {
        if (!open) handleTryClose();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {editingReport && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle>Edit Report - {editingReport.patientName}</DialogTitle>
                    <DialogDescription>
                      Review and modify report details, then save your changes.
                    </DialogDescription>
                  </div>
                  {onStartAnotherScan && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditDialogOpen(false);
                        onStartAnotherScan({
                          patientId: editingReport.patientId ?? null,
                          patientName: editingReport.patientName,
                          examDate: editingReport.examDate,
                        });
                      }}
                      className="shrink-0 text-teal-700 border-teal-300 hover:bg-teal-50 hover:border-teal-400"
                    >
                      <PlusCircle className="w-4 h-4 mr-1.5" />
                      Another scan — {editingReport.patientName.split(" ")[0]}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-6">
                {/* Template Selection */}
                <div className="space-y-2">
                  <Label htmlFor="template">Report Template</Label>
                  <Select
                    value={editingReport.templateId?.toString() || ""}
                    onValueChange={(value) => updateEditingReport('templateId', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template: ReportTemplate) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Patient Information */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientName">Patient Name</Label>
                    <Input
                      id="patientName"
                      value={editingReport.patientName}
                      onChange={(e) => updateEditingReport('patientName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientUrNumber" className="text-blue-700 font-semibold">UR Number</Label>
                    <Input
                      id="patientUrNumber"
                      className="font-mono font-bold text-blue-700"
                      placeholder="e.g. 100001"
                      value={(editingReport as any).patientUrNumber || ""}
                      onChange={(e) => updateEditingReport('patientUrNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientDob">Date of Birth</Label>
                    <Input
                      id="patientDob"
                      value={editingReport.patientDob}
                      onChange={(e) => updateEditingReport('patientDob', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="examDate">Exam Date</Label>
                    <Input
                      id="examDate"
                      value={editingReport.examDate}
                      onChange={(e) => updateEditingReport('examDate', e.target.value)}
                    />
                  </div>
                </div>

                {/* Study Type */}
                <div className="space-y-2">
                  <Label htmlFor="studyType">Study Type</Label>
                  <Input
                    id="studyType"
                    value={editingReport.studyType}
                    onChange={(e) => updateEditingReport('studyType', e.target.value)}
                  />
                </div>

                {/* Reporting Doctor */}
                <div className="space-y-2">
                  <Label htmlFor="physicianId">Reporting Doctor</Label>
                  <select
                    id="physicianId"
                    data-testid="select-physician"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editingReport.physicianId ? String(editingReport.physicianId) : ""}
                    onChange={(e) => updateEditingReport('physicianId', e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select reporting doctor —</option>
                    {physicians.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatPhysicianName(p.name)}{p.title ? ` ${p.title}` : ''}{p.specialty ? ` — ${p.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Indication */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="indication">Indication</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={activeVoiceDictation === 'indication' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleVoiceDictation('indication')}
                        data-testid="button-dictate-indication-dialog"
                      >
                        <Mic className="w-4 h-4 mr-1" />
                        {activeVoiceDictation === 'indication' ? 'Recording...' : 'Dictate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTextArea('indication');
                          setShowShortcuts(!showShortcuts);
                        }}
                      >
                        <Hash className="w-4 h-4 mr-1" />
                        Shortcuts
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => clearField('indication')} title="Clear indication" disabled={!editingReport?.indication}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => undoField('indication')} title="Undo" disabled={previousFieldValues['indication'] === undefined}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="indication"
                    value={editingReport.indication}
                    onChange={(e) => updateEditingReport('indication', e.target.value)}
                    rows={3}
                  />
                  
                  {/* Inline Voice Recorder */}
                  {activeVoiceDictation === 'indication' && (
                    <InlineVoiceRecorder
                      fieldName="indication"
                      onTranscription={handleVoiceTranscription}
                      onClose={() => setActiveVoiceDictation('')}
                    />
                  )}
                </div>

                {/* Findings */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="findings">Findings</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={activeVoiceDictation === 'findings' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleVoiceDictation('findings')}
                        data-testid="button-dictate-findings-dialog"
                      >
                        <Mic className="w-4 h-4 mr-1" />
                        {activeVoiceDictation === 'findings' ? 'Recording...' : 'Dictate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTextArea('findings');
                          setShowShortcuts(!showShortcuts);
                        }}
                      >
                        <Hash className="w-4 h-4 mr-1" />
                        Shortcuts
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => clearField('findings')} title="Clear findings" disabled={!editingReport?.findings}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => undoField('findings')} title="Undo" disabled={previousFieldValues['findings'] === undefined}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="findings"
                    value={editingReport.findings}
                    onChange={(e) => updateEditingReport('findings', e.target.value)}
                    rows={6}
                  />
                  
                  {/* Inline Voice Recorder */}
                  {activeVoiceDictation === 'findings' && (
                    <InlineVoiceRecorder
                      fieldName="findings"
                      onTranscription={handleVoiceTranscription}
                      onClose={() => setActiveVoiceDictation('')}
                    />
                  )}
                </div>

                {/* Impression */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="impression">Impression</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={activeVoiceDictation === 'impression' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleVoiceDictation('impression')}
                        data-testid="button-dictate-impression-dialog"
                      >
                        <Mic className="w-4 h-4 mr-1" />
                        {activeVoiceDictation === 'impression' ? 'Recording...' : 'Dictate'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTextArea('impression');
                          setShowShortcuts(!showShortcuts);
                        }}
                      >
                        <Hash className="w-4 h-4 mr-1" />
                        Shortcuts
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => clearField('impression')} title="Clear impression" disabled={!editingReport?.impression}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => undoField('impression')} title="Undo" disabled={previousFieldValues['impression'] === undefined}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="impression"
                    value={editingReport.impression}
                    onChange={(e) => updateEditingReport('impression', e.target.value)}
                    rows={4}
                  />
                  
                  {/* Inline Voice Recorder */}
                  {activeVoiceDictation === 'impression' && (
                    <InlineVoiceRecorder
                      fieldName="impression"
                      onTranscription={handleVoiceTranscription}
                      onClose={() => setActiveVoiceDictation('')}
                    />
                  )}
                </div>

                {/* Sono Complete */}
                <div className="border-t pt-4">
                  {(editingReport as any).isSonographerComplete ? (
                    <div className="flex items-center text-sm text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                      <ClipboardCheck className="w-4 h-4 mr-2 flex-shrink-0" />
                      Sono complete — {(editingReport as any).sonographerCompletedBy || "Sonographer"}{(editingReport as any).sonographerCompletedAt ? ` on ${format(new Date((editingReport as any).sonographerCompletedAt), 'dd MMM yyyy')}` : ""}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-teal-600 border-teal-200 hover:bg-teal-50"
                      onClick={() => sonographerCompleteMutation.mutate(editingReport.id)}
                      disabled={sonographerCompleteMutation.isPending}
                    >
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      Mark Sono Complete
                    </Button>
                  )}
                </div>

                {/* Finalization */}
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="finalizeReport"
                      checked={!!editingReport.isFinalized}
                      onCheckedChange={(checked) => updateEditingReport('isFinalized', checked)}
                    />
                    <Label htmlFor="finalizeReport" className="text-sm">
                      Finalize this report (will add electronic signature timestamp)
                    </Label>
                  </div>
                  
                  {editingReport.isFinalized && (
                    <div className="text-green-600 text-sm flex items-center">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      This report will be electronically signed upon saving
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setIsFullscreenMode(false);
                      // Exit browser fullscreen if active
                      if (document.fullscreenElement) {
                        document.exitFullscreen().catch(console.error);
                      }
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Close
                  </Button>
                  <Button
                    onClick={() => handleExportPDF(editingReport)}
                    variant="outline"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button
                    onClick={() => handleDistribute(editingReport)}
                    variant="outline"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Distribute
                  </Button>
                  <Button
                    onClick={handleSaveReport}
                    disabled={updateReportMutation.isPending}
                    className="medical-btn-primary"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateReportMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>

        {/* Text Shortcuts Side Panel for Regular Dialog */}
        {showShortcuts && (
          <div className="fixed top-0 right-0 h-full w-96 bg-white border-l shadow-lg z-[60] overflow-y-auto">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Text Shortcuts</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowShortcuts(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Click any shortcut to insert into {activeTextArea}
              </p>
            </div>
            <div className="p-4">
              <TextShortcuts
                onInsertShortcut={handleInsertShortcut}
                compact={true}
                showUsageTracking={true}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Amendment Dialog */}
      <Dialog open={isAmendDialogOpen} onOpenChange={setIsAmendDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Amend Report - {amendingReport?.patientName}</DialogTitle>
            <DialogDescription>
              Make amendments to this report. All changes must include a reason and will reset finalization status.
            </DialogDescription>
          </DialogHeader>

          {amendingReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amend-patient-name">Patient Name</Label>
                  <Input
                    id="amend-patient-name"
                    value={amendingReport.patientName}
                    onChange={(e) => setAmendingReport(prev => prev ? { ...prev, patientName: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="amend-patient-dob">Date of Birth</Label>
                  <Input
                    id="amend-patient-dob"
                    value={amendingReport.patientDob}
                    onChange={(e) => setAmendingReport(prev => prev ? { ...prev, patientDob: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="amend-exam-date">Exam Date</Label>
                  <Input
                    id="amend-exam-date"
                    value={amendingReport.examDate}
                    onChange={(e) => setAmendingReport(prev => prev ? { ...prev, examDate: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="amend-study-type">Study Type</Label>
                  <Input
                    id="amend-study-type"
                    value={amendingReport.studyType}
                    onChange={(e) => setAmendingReport(prev => prev ? { ...prev, studyType: e.target.value } : null)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="amend-indication">Indication</Label>
                <Textarea
                  id="amend-indication"
                  value={amendingReport.indication}
                  onChange={(e) => setAmendingReport(prev => prev ? { ...prev, indication: e.target.value } : null)}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="amend-findings">Findings</Label>
                <Textarea
                  id="amend-findings"
                  value={amendingReport.findings}
                  onChange={(e) => setAmendingReport(prev => prev ? { ...prev, findings: e.target.value } : null)}
                  rows={6}
                />
              </div>

              <div>
                <Label htmlFor="amend-impression">Impression</Label>
                <Textarea
                  id="amend-impression"
                  value={amendingReport.impression}
                  onChange={(e) => setAmendingReport(prev => prev ? { ...prev, impression: e.target.value } : null)}
                  rows={4}
                />
              </div>

              <div className="border-t pt-4">
                <Label htmlFor="amendment-reason">Amendment Reason *</Label>
                <Textarea
                  id="amendment-reason"
                  placeholder="Please provide a reason for this amendment (required)..."
                  value={amendmentReason}
                  onChange={(e) => setAmendmentReason(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This reason will be recorded in the audit trail and cannot be changed after saving.
                </p>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-md border border-orange-200">
                  ⚠️ Amending this report will reset its finalization status
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAmendDialogOpen(false);
                      setAmendingReport(null);
                      setAmendmentReason("");
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveAmendment}
                    disabled={amendReportMutation.isPending || !amendmentReason.trim()}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {amendReportMutation.isPending ? "Saving Amendment..." : "Save Amendment"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* ── Distribute Dialog ── */}
      <Dialog open={!!distributeReport} onOpenChange={(open) => { if (!open) setDistributeReport(null); }}>
        <DialogContent className="max-w-[95vw] xl:max-w-[1400px] w-full max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              Distribute Report — {distributeReport?.patientName}
            </DialogTitle>
            <DialogDescription>
              Send via email or copy the HTML to paste into your messaging application.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-y-auto pr-1">

              {/* ── Email Section ── */}
              <div className="border border-blue-100 rounded-lg bg-blue-50/40 p-4 space-y-3">
                <h3 className="font-semibold text-sm text-blue-800 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Send via Email
                </h3>

                {/* Referring Doctor select */}
                {referringDoctors.filter(d => d.email).length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Autofill from Referring Doctor</Label>
                    <Select
                      onValueChange={(value) => {
                        if (value === "__manual__") {
                          setEmailTo("");
                          setEmailToName("");
                          setEmailSubject(`Medical Report — ${distributeReport?.patientName ?? ""}`);
                        } else {
                          const doc = referringDoctors.find(d => String(d.id) === value);
                          if (doc) {
                            setEmailTo(doc.email ?? "");
                            setEmailToName(doc.name);
                            setEmailSubject(`Medical Report — ${distributeReport?.patientName ?? ""} — Attn: ${doc.name}`);
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="bg-white text-sm h-9">
                        <SelectValue placeholder="Choose a doctor to autofill…" />
                      </SelectTrigger>
                      <SelectContent>
                        {referringDoctors.filter(d => d.email).map(doc => (
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

                {/* Manual email input */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">To (Email) *</Label>
                    <Input
                      type="email"
                      placeholder="doctor@practice.com"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      className="bg-white text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Recipient Name</Label>
                    <Input
                      placeholder="Dr. Smith"
                      value={emailToName}
                      onChange={(e) => setEmailToName(e.target.value)}
                      className="bg-white text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-gray-600">CC (optional)</Label>

                  {referringDoctors.filter(d => d.email).length > 0 && (
                    <Select
                      onValueChange={(value) => {
                        const doc = referringDoctors.find(d => String(d.id) === value);
                        if (!doc?.email) return;
                        setEmailCcs(prev => {
                          if (prev.some(c => c.trim().toLowerCase() === doc.email!.toLowerCase())) return prev;
                          const firstEmpty = prev.findIndex(c => !c.trim());
                          if (firstEmpty >= 0) {
                            const next = [...prev];
                            next[firstEmpty] = doc.email!;
                            return next;
                          }
                          return [...prev, doc.email!];
                        });
                      }}
                    >
                      <SelectTrigger className="bg-white text-sm h-9" data-testid="select-cc-autofill">
                        <SelectValue placeholder="Autofill CC from a referring doctor…" />
                      </SelectTrigger>
                      <SelectContent>
                        {referringDoctors.filter(d => d.email).map(doc => (
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
                          data-testid={`input-cc-${idx}`}
                        />
                        {emailCcs.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEmailCcs(emailCcs.filter((_, i) => i !== idx))}
                            className="h-9 w-9 p-0 text-gray-400 hover:text-red-600"
                            aria-label="Remove CC"
                            data-testid={`button-remove-cc-${idx}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEmailCcs([...emailCcs, ""])}
                      className="h-8 text-xs"
                      data-testid="button-add-cc"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add another CC
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Subject</Label>
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="bg-white text-sm"
                  />
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

                {/* Referring doctor fax select */}
                {referringDoctors.some(d => d.fax) && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Autofill from Referring Doctor</Label>
                    <Select
                      onValueChange={(value) => {
                        const doc = referringDoctors.find(d => String(d.id) === value);
                        if (doc?.fax) setFaxNumber(doc.fax);
                      }}
                    >
                      <SelectTrigger className="bg-white text-sm h-9">
                        <SelectValue placeholder="Choose a doctor to autofill fax…" />
                      </SelectTrigger>
                      <SelectContent>
                        {referringDoctors.filter(d => d.fax).map(doc => (
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
                        onChange={(e) => setFaxNumber(e.target.value.replace(/[^\d\s\-]/g, ""))}
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
              {distributeHasWorksheet && (
                <div className="flex items-center gap-3 px-1">
                  <Switch
                    id="dist-ws-toggle"
                    checked={distributeIncludeWorksheet}
                    onCheckedChange={(checked) => {
                      setDistributeIncludeWorksheet(checked);
                      setDistributeHtml(checked ? distributeHtmlWithWs : distributeHtmlNoWs);
                    }}
                  />
                  <Label htmlFor="dist-ws-toggle" className="text-sm cursor-pointer select-none">
                    Include worksheet image (with clinic logo)
                  </Label>
                </div>
              )}

              {/* ── HTML / Preview Section ── */}
              <div className="border border-gray-200 rounded-lg bg-gray-50/40 p-4 space-y-3">
                <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Copy className="w-4 h-4" />
                  Copy HTML
                </h3>
                {!htmlBuilt ? (
                  <div className="text-center py-4">
                    {distributeLoading ? (
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <div className="animate-spin w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full" />
                        <p className="text-sm">Building report HTML…</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">Generate the report HTML to preview or copy it into your messaging app.</p>
                        <Button onClick={buildDistributeHtml} variant="outline" className="gap-2">
                          <Eye className="w-4 h-4" />
                          Generate Preview &amp; HTML
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Preview */}
                    <div className="border rounded-lg overflow-hidden" style={{ height: 280 }}>
                      <div className="bg-gray-50 border-b px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Report Preview</div>
                      <iframe
                        srcDoc={distributeHtml}
                        title="Report Preview"
                        className="w-full border-0"
                        style={{ height: 246 }}
                        sandbox="allow-same-origin"
                      />
                    </div>

                    {/* Raw HTML + copy */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 border-b px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Copy HTML — paste into your messaging app</div>
                      <textarea
                        readOnly
                        value={distributeHtml}
                        className="w-full p-3 text-xs font-mono bg-white resize-none focus:outline-none"
                        style={{ height: 100 }}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleCopyHtml} variant="outline" className={distributeCopied ? "border-green-400 text-green-700" : ""}>
                        {distributeCopied ? <Check className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                        {distributeCopied ? "Copied!" : "Copy HTML"}
                      </Button>
                    </div>
                  </>
                )}

                {/* Mark as Sent — appears after copying */}
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
                  <p className="text-xs text-gray-400 px-4 py-4 text-center">No distributions recorded yet for this report.</p>
                ) : (
                  <ul className="divide-y">
                    {distributions.map((d) => (
                      <li key={d.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={`mt-0.5 rounded-full p-1 flex-shrink-0 ${d.method === "email" ? "bg-blue-100 text-blue-600" : d.method === "fax" ? "bg-teal-100 text-teal-600" : "bg-amber-100 text-amber-600"}`}>
                          {d.method === "email"
                            ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            : d.method === "fax"
                            ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            : <Copy className="w-3 h-3" />
                          }
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

            {/* ── Right: Condensed Patient File ── */}
            <PatientSummaryPanel patientId={distributeReport?.patientId ?? null} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes confirmation */}
      <AlertDialog open={isCloseConfirmOpen} onOpenChange={setIsCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              The report and worksheet changes you made have not been saved yet. If you close now, your edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back and save</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setIsCloseConfirmOpen(false); closeEditor(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Discard changes and close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

// Condensed patient file panel shown on the right of the Distribute dialog.
// Surfaces critical information staff should know before sending the report.
function PatientSummaryPanel({ patientId }: { patientId: number | null }) {
  const enabled = !!patientId;
  const { data: patient } = useQuery<any>({
    queryKey: ["/api/patients", patientId],
    enabled,
    retry: false,
  });
  const { data: notes = [] } = useQuery<any[]>({
    queryKey: ["/api/patients", patientId, "notes"],
    enabled,
    retry: false,
  });
  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/patients", patientId, "documents"],
    enabled,
    retry: false,
  });
  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ["/api/patients", patientId, "appointments"],
    enabled,
    retry: false,
  });

  if (!patientId) {
    return (
      <aside className="border rounded-lg bg-gray-50 p-4 text-sm text-gray-500 lg:overflow-y-auto">
        No patient linked to this report — patient summary not available.
      </aside>
    );
  }

  const fullName = patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() : "";
  const allergies = (patient?.allergies || "").trim();
  const history = (patient?.medicalHistory || "").trim();
  const generalNotes = (patient?.notes || "").trim();
  const hasCritical = !!allergies;

  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.documentDate || b.createdAt || 0).getTime() - new Date(a.documentDate || a.createdAt || 0).getTime())
    .slice(0, 5);
  const recentNotes = [...notes]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 5);
  const recentAppts = [...appointments]
    .sort((a, b) => new Date(b.appointmentDate || 0).getTime() - new Date(a.appointmentDate || 0).getTime())
    .slice(0, 5);

  return (
    <aside className="border rounded-lg bg-white flex flex-col min-h-0 lg:overflow-y-auto" data-testid="distribute-patient-panel">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-sm text-gray-800">Patient File</h3>
          {patient?.urNumber && (
            <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              UR {patient.urNumber}
            </span>
          )}
        </div>
        {patient && (
          <div className="mt-1">
            <p className="text-sm font-medium text-gray-900">{fullName}</p>
            <p className="text-xs text-gray-500">
              {[
                patient.dateOfBirth && `DOB ${patient.dateOfBirth}`,
                patient.gender,
                patient.phone,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4 text-sm">
        {hasCritical && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700 mb-1">⚠ Allergies</p>
            <p className="text-sm text-red-900 whitespace-pre-wrap">{allergies}</p>
          </div>
        )}

        {history && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Medical History</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-6">{history}</p>
          </div>
        )}

        {generalNotes && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">General Notes</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-6">{generalNotes}</p>
          </div>
        )}

        {patient?.referringPhysician && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Referring Physician</p>
            <p className="text-sm text-gray-800">{patient.referringPhysician}</p>
          </div>
        )}

        {(patient?.emergencyContactName || patient?.emergencyContactPhone) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Emergency Contact</p>
            <p className="text-sm text-gray-800">
              {patient.emergencyContactName}
              {patient.emergencyContactPhone && ` — ${patient.emergencyContactPhone}`}
            </p>
          </div>
        )}

        {recentNotes.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Recent Patient Notes</p>
            <ul className="space-y-2">
              {recentNotes.map((n) => (
                <li key={n.id} className="text-xs border-l-2 border-amber-300 pl-2">
                  <p className="text-gray-800 whitespace-pre-wrap line-clamp-4">{n.note || n.content || ""}</p>
                  <p className="text-gray-400 mt-0.5">
                    {n.createdAt && format(new Date(n.createdAt), "d MMM yyyy")}
                    {n.authorName && ` · ${n.authorName}`}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recentAppts.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Recent Appointments</p>
            <ul className="space-y-1">
              {recentAppts.map((a) => (
                <li key={a.id} className="text-xs text-gray-700 flex justify-between gap-2">
                  <span className="truncate">{a.scanType || "Appointment"}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    {a.appointmentDate && format(new Date(a.appointmentDate), "d MMM yyyy")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recentDocs.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Recent Documents</p>
            <ul className="space-y-1">
              {recentDocs.map((d) => (
                <li key={d.id} className="text-xs text-gray-700 flex justify-between gap-2">
                  <span className="truncate">{d.title || d.originalName}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    {d.documentDate && format(new Date(d.documentDate), "d MMM yyyy")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasCritical && !history && !generalNotes && recentNotes.length === 0 && (
          <p className="text-xs text-gray-400 italic">No critical notes on file.</p>
        )}
      </div>
    </aside>
  );
}
