import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Edit3, FileText, Download, Eye, Calendar, User, Save, X, ChevronLeft, ChevronRight, Trash2, CheckCircle2, CheckCircle, Minimize2, Type, Hash, Mic, Share2, Copy, Check } from "lucide-react";
import InlineVoiceRecorder from "@/components/inline-voice-recorder";
import { WorksheetViewer } from "@/components/worksheet-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Report, ReportTemplate, Physician, ReferringDoctor, ReportDistribution } from "@shared/schema";
import { format } from "date-fns";
import TextShortcuts from "@/components/text-shortcuts";

interface EditableReport extends Report {
  templateId?: number;
}

export default function ReportingRoom({ initialOpenReportId, onReportOpened }: { initialOpenReportId?: number | null; onReportOpened?: () => void } = {}) {
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<EditableReport | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAmendDialogOpen, setIsAmendDialogOpen] = useState(false);
  const [amendingReport, setAmendingReport] = useState<EditableReport | null>(null);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeTextArea, setActiveTextArea] = useState<string | null>(null);
  const [activeVoiceDictation, setActiveVoiceDictation] = useState<string>('');
  const [distributeReport, setDistributeReport] = useState<Report | null>(null);
  const [distributeHtml, setDistributeHtml] = useState<string>("");
  const [distributeCopied, setDistributeCopied] = useState(false);
  const [distributeLoading, setDistributeLoading] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailToName, setEmailToName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [markSentName, setMarkSentName] = useState("");
  const [markSentEmail, setMarkSentEmail] = useState("");
  const [markSentNotes, setMarkSentNotes] = useState("");
  const [markSentLogging, setMarkSentLogging] = useState(false);
  const [showMarkSent, setShowMarkSent] = useState(false);
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

  // Fetch physicians for distribute feature
  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
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
      setIsEditDialogOpen(false);
      setEditingReport(null);
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

  const handleEditReport = (report: Report) => {
    const defaultTemplate = templates.find((t: ReportTemplate) => t.isDefault) || templates[0];
    setEditingReport({ 
      ...report,
      templateId: report.templateId || defaultTemplate?.id,
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

  const handleSaveReport = () => {
    if (!editingReport) return;

    const { id, generatedAt, worksheetId, ...updateData } = editingReport;
    updateReportMutation.mutate(updateData);
  };

  const handleExportPDF = (report: Report) => {
    // Create a new window for PDF export
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const template = templates.find((t: ReportTemplate) => t.id === (editingReport?.templateId || 1)) || templates[0];
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Medical Report - ${report.patientName}</title>
          <style>
            body { 
              font-family: ${template?.fontFamily || 'Arial'}, sans-serif; 
              font-size: ${template?.fontSize || '12px'};
              line-height: 1.6;
              margin: 40px;
              color: #333;
              max-width: 800px;
            }
            .header { 
              display: flex;
              align-items: flex-start;
              gap: 20px;
              border-bottom: 2px solid ${template?.primaryColor || '#0066cc'}; 
              padding-bottom: 20px; 
              margin-bottom: 30px; 
            }
            .header-logo img { max-height: 80px; max-width: 200px; object-fit: contain; display: block; }
            .header-info { flex: 1; }
            .header h1 {
              margin: 0 0 6px 0;
              color: ${template?.primaryColor || '#0066cc'};
              font-size: 22px;
              font-weight: bold;
            }
            .header .subtitle {
              color: #666;
              font-size: 14px;
              margin: 3px 0;
            }
            .clinic-info { 
              margin: 3px 0;
              font-size: 13px;
              color: #666;
            }
            .patient-info { 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 20px; 
              margin-bottom: 30px;
              padding: 20px;
              background-color: #f8f9fa;
              border-radius: 8px;
            }
            .patient-info h3 {
              color: ${template?.primaryColor || '#0066cc'};
              margin: 0 0 15px 0;
              font-size: 16px;
              grid-column: span 2;
              border-bottom: 1px solid #dee2e6;
              padding-bottom: 8px;
            }
            .info-item {
              margin-bottom: 10px;
              font-size: 14px;
            }
            .info-label {
              font-weight: bold;
              color: #495057;
            }
            .section { 
              margin-bottom: 30px;
              page-break-inside: avoid;
            }
            .section-title { 
              font-size: 18px;
              font-weight: bold; 
              color: ${template?.primaryColor || '#0066cc'}; 
              border-bottom: 2px solid ${template?.primaryColor || '#0066cc'}; 
              padding-bottom: 8px; 
              margin-bottom: 15px; 
            }
            .section-content {
              font-size: 14px;
              line-height: 1.7;
              text-align: justify;
            }
            .footer { 
              margin-top: 50px; 
              padding-top: 20px; 
              border-top: 1px solid #dee2e6; 
              text-align: center; 
              font-size: 11px; 
              color: #6c757d; 
            }
            .signature-area {
              margin-top: 50px;
              text-align: ${template?.signaturePosition || 'right'};
            }
            .signature-line {
              border-top: 2px solid #333;
              width: 250px;
              margin: 30px auto 10px auto;
              display: inline-block;
            }
            .signature-text {
              font-size: 12px;
              color: #495057;
              margin-top: 5px;
            }
            @media print {
              body { margin: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${template?.showHeader !== false ? `
            <div class="header">
              ${clinicData?.logoUrl ? `<div class="header-logo"><img src="${clinicData.logoUrl}" alt="Clinic Logo" /></div>` : ''}
              <div class="header-info">
                <h1>${clinicData?.name || clinicSettings?.clinicName || template?.clinicName || 'Medical Clinic'}</h1>
                <div class="subtitle">Medical Examination Report</div>
                ${(clinicData?.address || clinicSettings?.address || template?.clinicAddress) ? `<div class="clinic-info">${clinicData?.address || clinicSettings?.address || template?.clinicAddress}</div>` : ''}
                ${(clinicData?.phone || clinicSettings?.phone || template?.clinicPhone) ? `<div class="clinic-info">Phone: ${clinicData?.phone || clinicSettings?.phone || template?.clinicPhone}</div>` : ''}
                ${clinicData?.fax ? `<div class="clinic-info">Fax: ${clinicData.fax}</div>` : ''}
                ${clinicData?.email ? `<div class="clinic-info">${clinicData.email}</div>` : ''}
              </div>
            </div>
          ` : ''}
          
          <div class="patient-info">
            <h3>Patient Information</h3>
            <div class="info-item">
              <span class="info-label">Patient Name:</span> ${report.patientName}
            </div>
            ${report.patientUrNumber ? `<div class="info-item"><span class="info-label">UR Number:</span> <strong style="color:#1d4ed8;font-family:monospace">${report.patientUrNumber}</strong></div>` : ''}
            <div class="info-item">
              <span class="info-label">Date of Birth:</span> ${report.patientDob}
            </div>
            <div class="info-item">
              <span class="info-label">Exam Date:</span> ${report.examDate}
            </div>
            <div class="info-item">
              <span class="info-label">Report ID:</span> ${report.id}
            </div>
          </div>

          ${template?.showStudyType !== false ? `
            <div class="section">
              <div class="section-title">Study Type</div>
              <div class="section-content">${report.studyType}</div>
            </div>
          ` : ''}

          ${template?.showIndication !== false ? `
            <div class="section">
              <div class="section-title">Clinical Indication</div>
              <div class="section-content">${report.indication}</div>
            </div>
          ` : ''}

          ${template?.showFindings !== false ? `
            <div class="section">
              <div class="section-title">Findings</div>
              <div class="section-content">${report.findings.replace(/\n/g, '<br><br>')}</div>
            </div>
          ` : ''}

          ${template?.showImpression !== false ? `
            <div class="section">
              <div class="section-title">Impression</div>
              <div class="section-content">${report.impression.replace(/\n/g, '<br><br>')}</div>
            </div>
          ` : ''}

          ${template?.showSignature !== false ? `
            <div class="signature-area">
              <div class="signature-line"></div>
              <div class="signature-text">Physician Signature & Date</div>
              ${report.isFinalized && report.finalizedAt ? `
                <div class="finalized-text" style="margin-top: 15px; font-size: 11px; color: #22c55e; font-weight: 600;">
                  Electronically signed on ${new Date(report.finalizedAt).toLocaleDateString()}
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${template?.showFooter !== false ? `
            <div class="footer">
              ${template?.footerText ? `<div>${template.footerText}</div>` : ''}
              ${template?.showGenerationDate !== false ? `<div>Report Generated: ${format(new Date(), 'MMMM dd, yyyy')}</div>` : ''}
              <div>Reporting Room Medical System</div>
            </div>
          ` : ''}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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

  const handleDistribute = async (report: Report) => {
    setDistributeLoading(true);
    setDistributeReport(report);
    setDistributeCopied(false);
    setEmailSent(false);
    setEmailSending(false);
    setEmailTo("");
    setEmailToName("");
    setEmailSubject(`Medical Report — ${report.patientName}`);
    setShowMarkSent(false);
    setMarkSentName("");
    setMarkSentEmail("");
    setMarkSentNotes("");

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
    let physicianCredentials = "";
    let signatureDataUrl: string | null = null;

    if (report.physicianId) {
      const physician = physicians.find(p => p.id === report.physicianId);
      if (physician) {
        physicianName = physician.name || "";
        physicianTitle = physician.title || "";
        physicianCredentials = physician.credentials || "";
        if (physician.signatureUrl) {
          signatureDataUrl = await toBase64(physician.signatureUrl);
        }
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
    const primaryColor = "#0066cc";
    const today = format(new Date(), 'MMMM dd, yyyy');

    // Load clinic logo for report header
    let clinicLogoDataUrl: string | null = null;
    if (clinicData?.logoUrl) {
      clinicLogoDataUrl = await toBase64(clinicData.logoUrl);
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medical Report – ${report.patientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #222; background: #fff; padding: 32px 40px; max-width: 780px; margin: 0 auto; }
    .header { display: flex; align-items: flex-start; gap: 20px; border-bottom: 3px solid ${primaryColor}; padding-bottom: 18px; margin-bottom: 24px; }
    .header-logo { flex-shrink: 0; }
    .header-logo img { max-height: 72px; max-width: 180px; object-fit: contain; display: block; }
    .header-info { flex: 1; }
    .header-info h1 { font-size: 20px; font-weight: bold; color: ${primaryColor}; margin-bottom: 3px; }
    .header-info .sub { font-size: 13px; color: #555; }
    .header-info .clinic-info { font-size: 12px; color: #777; margin-top: 2px; }
    .patient-box { background: #f4f8ff; border: 1px solid #d0e4ff; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .patient-box h3 { grid-column: span 2; font-size: 14px; font-weight: bold; color: ${primaryColor}; border-bottom: 1px solid #c0d8ff; padding-bottom: 6px; margin-bottom: 4px; }
    .pi { font-size: 13px; }
    .pi .label { font-weight: bold; color: #444; }
    .ur { color: #1d4ed8; font-family: monospace; font-weight: bold; }
    .section { margin-bottom: 22px; page-break-inside: avoid; }
    .section-title { font-size: 15px; font-weight: bold; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px; margin-bottom: 10px; }
    .section-content { font-size: 13px; line-height: 1.75; white-space: pre-wrap; }
    .worksheet-img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 24px; display: block; }
    .signature-area { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; }
    .sig-img { max-height: 70px; margin-bottom: 4px; }
    .sig-name { font-weight: bold; font-size: 13px; }
    .sig-creds { font-size: 12px; color: #555; }
    .finalized { margin-top: 6px; font-size: 11px; color: #16a34a; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #888; text-align: center; }
    .amended-note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #92400e; }
  </style>
</head>
<body>
  <div class="header">
    ${clinicLogoDataUrl ? `<div class="header-logo"><img src="${clinicLogoDataUrl}" alt="Clinic Logo" /></div>` : ''}
    <div class="header-info">
      <h1>${clinicData?.name || clinic?.clinicName || 'Medical Clinic'}</h1>
      <div class="sub">Medical Examination Report</div>
      ${(clinicData?.address || clinic?.address) ? `<div class="clinic-info">${clinicData?.address || clinic?.address}</div>` : ''}
      ${(clinicData?.phone || clinic?.phone) ? `<div class="clinic-info">Phone: ${clinicData?.phone || clinic?.phone}</div>` : ''}
      ${clinicData?.fax ? `<div class="clinic-info">Fax: ${clinicData.fax}</div>` : ''}
      ${clinicData?.email ? `<div class="clinic-info">${clinicData.email}</div>` : ''}
    </div>
  </div>

  ${report.isAmended ? `<div class="amended-note">⚠ This report has been amended. Original findings may have changed.</div>` : ''}

  <div class="patient-box">
    <h3>Patient Information</h3>
    <div class="pi"><span class="label">Patient Name:</span> ${report.patientName}</div>
    ${report.patientUrNumber ? `<div class="pi"><span class="label">UR Number:</span> <span class="ur">UR ${report.patientUrNumber}</span></div>` : '<div></div>'}
    <div class="pi"><span class="label">Date of Birth:</span> ${report.patientDob}</div>
    <div class="pi"><span class="label">Exam Date:</span> ${report.examDate}</div>
    <div class="pi"><span class="label">Report ID:</span> ${report.id}</div>
    <div class="pi"><span class="label">Report Date:</span> ${today}</div>
  </div>

  ${worksheetDataUrl ? `<img class="worksheet-img" src="${worksheetDataUrl}" alt="Original Worksheet" />` : ''}

  <div class="section">
    <div class="section-title">Study Type</div>
    <div class="section-content">${report.studyType}</div>
  </div>

  <div class="section">
    <div class="section-title">Clinical Indication</div>
    <div class="section-content">${report.indication}</div>
  </div>

  <div class="section">
    <div class="section-title">Findings</div>
    <div class="section-content">${report.findings}</div>
  </div>

  <div class="section">
    <div class="section-title">Impression</div>
    <div class="section-content">${report.impression}</div>
  </div>

  <div class="signature-area">
    ${signatureDataUrl ? `<img class="sig-img" src="${signatureDataUrl}" alt="Physician Signature" />` : ''}
    ${physicianName ? `<div class="sig-name">${physicianTitle ? physicianTitle + ' ' : ''}${physicianName}</div>` : ''}
    ${physicianCredentials ? `<div class="sig-creds">${physicianCredentials}</div>` : ''}
    ${report.isFinalized && report.finalizedAt ? `<div class="finalized">Electronically signed on ${new Date(report.finalizedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}</div>` : ''}
  </div>

  <div class="footer">
    <div>Report generated: ${today}</div>
    <div>${clinic?.clinicName || ''}</div>
  </div>
</body>
</html>`;

    setDistributeHtml(html);
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
      await fetch(`/api/reports/${distributeReport.id}/distributions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "copy_html",
          recipientName: markSentName || null,
          recipientEmail: markSentEmail || null,
          notes: markSentNotes || null,
        }),
      });
      refetchDistributions();
      refetchDistributionCounts();
      setMarkSentName("");
      setMarkSentEmail("");
      setMarkSentNotes("");
      setShowMarkSent(false);
      toast({ title: "Distribution Recorded", description: "The copy has been logged in the distribution history." });
    } catch {
      toast({ title: "Log Failed", description: "Could not save distribution record.", variant: "destructive" });
    } finally {
      setMarkSentLogging(false);
    }
  };

  const handleSendEmail = async () => {
    if (!distributeReport || !emailTo || !distributeHtml) return;
    setEmailSending(true);
    setEmailSent(false);
    try {
      const res = await fetch(`/api/reports/${distributeReport.id}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: emailTo,
          toName: emailToName || emailTo,
          subject: emailSubject || `Medical Report — ${distributeReport.patientName}`,
          reportHtml: distributeHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Send failed");
      setEmailSent(true);
      refetchDistributions();
      refetchDistributionCounts();
      toast({ title: "Email Sent", description: `Report sent to ${emailTo}` });
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err: any) {
      toast({ title: "Send Failed", description: err.message || "Could not send email", variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  };

  const updateEditingReport = (field: keyof EditableReport, value: any) => {
    if (!editingReport) return;
    setEditingReport(prev => prev ? { ...prev, [field]: value } : null);
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

  const handleDeleteReport = (report: Report) => {
    if (window.confirm(`Are you sure you want to delete the report for ${report.patientName}? This action cannot be undone.`)) {
      deleteReportMutation.mutate(report.id);
    }
  };

  const filteredReports = reports.filter((report: Report) =>
    report.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.studyType.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex items-center space-x-4">
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
                  {report.examDate}
                </div>
                <div className="text-sm font-medium text-gray-800">
                  {report.studyType}
                </div>
                <div className="text-xs text-gray-500">
                  Generated: {format(new Date(report.generatedAt), 'MMM dd, yyyy')}
                </div>
                {report.isFinalized && report.finalizedAt && (
                  <div className="flex items-center text-xs text-green-600 mt-1">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Signed: {format(new Date(report.finalizedAt), 'MMM dd, yyyy')}
                  </div>
                )}
                {(distributionCounts[report.id] ?? 0) > 0 && (
                  <div className="flex items-center text-xs text-blue-600 mt-1">
                    <svg className="w-3 h-3 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Distributed {distributionCounts[report.id] > 1 ? `×${distributionCounts[report.id]}` : ""}
                  </div>
                )}
                {report.isAmended && report.amendedAt && (
                  <div className="flex items-center text-xs text-orange-600 mt-1">
                    <Edit3 className="w-3 h-3 mr-1" />
                    Amended: {format(new Date(report.amendedAt), 'MMM dd, yyyy')}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsFullscreenMode(false);
                  setIsEditDialogOpen(false);
                  // Exit browser fullscreen if active
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(console.error);
                  }
                }}
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
              <div className="p-4 border-b bg-white">
                <h3 className="text-lg font-semibold">Worksheet - {editingReport.patientName}</h3>
                <p className="text-sm text-gray-600">Original drawing or uploaded worksheet</p>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                {editingReport.digitalWorksheetId ? (
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
                ) : editingReport.worksheetId ? (
                  <WorksheetViewer 
                    worksheetId={editingReport.worksheetId} 
                    alt="Uploaded Worksheet"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>No worksheet image available</p>
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
                    onClick={() => {
                      setIsFullscreenMode(false);
                      setIsEditDialogOpen(false);
                      // Exit browser fullscreen if active (non-fullscreen close button)
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
        setIsEditDialogOpen(open);
        if (!open) {
          setIsFullscreenMode(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {editingReport && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Report - {editingReport.patientName}</DialogTitle>
                <DialogDescription>
                  Review and modify report details, then save your changes.
                </DialogDescription>
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
        <DialogContent className="max-w-5xl w-full max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              Distribute Report — {distributeReport?.patientName}
            </DialogTitle>
            <DialogDescription>
              Send via email or copy the HTML to paste into your messaging application.
            </DialogDescription>
          </DialogHeader>

          {distributeLoading ? (
            <div className="flex-1 flex items-center justify-center py-16 text-gray-500">
              <div className="text-center space-y-2">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
                <p>Building report HTML…</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-y-auto pr-1">

              {/* ── Email Section ── */}
              <div className="border border-blue-100 rounded-lg bg-blue-50/40 p-4 space-y-3">
                <h3 className="font-semibold text-sm text-blue-800 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Send via Email
                </h3>

                {/* Referring Doctor dropdown */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Select Referring Doctor</Label>
                  <Select
                    value={emailTo ? `${emailTo}||${emailToName}` : ""}
                    onValueChange={(val) => {
                      if (val === "__custom") {
                        setEmailTo("");
                        setEmailToName("");
                      } else {
                        const [email, name] = val.split("||");
                        setEmailTo(email);
                        setEmailToName(name || "");
                      }
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder={referringDoctors.length === 0 ? "No referring doctors saved yet — enter email below" : "Choose from referring doctors…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {referringDoctors.filter(d => d.email).map(doc => (
                        <SelectItem key={doc.id} value={`${doc.email}||${doc.name}`}>
                          <span className="font-medium">{doc.name}</span>
                          {doc.practiceName && <span className="text-gray-400 ml-1 text-xs">· {doc.practiceName}</span>}
                          <span className="text-gray-400 ml-1 text-xs">· {doc.email}</span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom">Enter email manually…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Manual email input */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Email Address *</Label>
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

              {/* ── HTML / Preview Section ── */}
              <div className="space-y-3">
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
                        <div className={`mt-0.5 rounded-full p-1 flex-shrink-0 ${d.method === "email" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
                          {d.method === "email"
                            ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            : <Copy className="w-3 h-3" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-gray-700 capitalize">{d.method === "email" ? "Email" : "Copy HTML"}</span>
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
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
