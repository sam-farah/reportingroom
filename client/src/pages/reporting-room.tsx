import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Edit3, FileText, Download, Eye, Calendar, User, Save, X, ChevronLeft, ChevronRight, Trash2, CheckCircle2, CheckCircle, Minimize2 } from "lucide-react";
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
import type { Report, ReportTemplate } from "@shared/schema";
import { format } from "date-fns";

interface EditableReport extends Report {
  templateId?: number;
}

export default function ReportingRoom() {
  const { toast } = useToast();
  const [editingReport, setEditingReport] = useState<EditableReport | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAmendDialogOpen, setIsAmendDialogOpen] = useState(false);
  const [amendingReport, setAmendingReport] = useState<EditableReport | null>(null);
  const [amendmentReason, setAmendmentReason] = useState("");
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
    onSuccess: () => {
      toast({
        title: "Report Deleted",
        description: "Report has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/recent"] });
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
    console.log('Opening report editor for:', report.patientName);
    setEditingReport({ ...report });
    setIsFullscreenMode(true);
    setIsEditDialogOpen(true);
    
    console.log('Fullscreen mode set to:', true);
    
    // Try to enter browser fullscreen for better experience
    setTimeout(() => {
      document.documentElement.requestFullscreen?.().catch((err) => {
        console.log('Browser fullscreen not available:', err);
        // Continue with app fullscreen UI
      });
    }, 100);
  };

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
              text-align: center; 
              border-bottom: 2px solid ${template?.primaryColor || '#0066cc'}; 
              padding-bottom: 20px; 
              margin-bottom: 30px; 
            }
            .header h1 {
              margin: 0 0 10px 0;
              color: ${template?.primaryColor || '#0066cc'};
              font-size: 24px;
              font-weight: bold;
            }
            .header .subtitle {
              color: #666;
              font-size: 16px;
              margin: 5px 0;
            }
            .clinic-info { 
              margin: 5px 0;
              font-size: 14px;
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
              <h1>${template?.clinicName || 'Reporting Room Medical'}</h1>
              <div class="subtitle">Medical Examination Report</div>
              ${template?.clinicAddress ? `<div class="clinic-info">${template.clinicAddress}</div>` : ''}
              ${template?.clinicPhone ? `<div class="clinic-info">${template.clinicPhone}</div>` : ''}
            </div>
          ` : ''}
          
          <div class="patient-info">
            <h3>Patient Information</h3>
            <div class="info-item">
              <span class="info-label">Patient Name:</span> ${report.patientName}
            </div>
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

  const updateEditingReport = (field: keyof EditableReport, value: any) => {
    if (!editingReport) return;
    setEditingReport(prev => prev ? { ...prev, [field]: value } : null);
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
                <CardTitle className="text-lg flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-blue-600" />
                  {report.patientName}
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
                    onClick={() => handleExportPDF(report)}
                  >
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportDOCX(report)}
                  >
                    DOCX
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
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                {editingReport.digitalWorksheetId ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <img 
                      src={`/api/digital-worksheets/${editingReport.digitalWorksheetId}/image`}
                      alt="Digital Worksheet"
                      className="max-w-full max-h-full object-contain border border-gray-300 rounded-lg"
                      onError={(e) => {
                        console.error('Failed to load digital worksheet image:', editingReport.digitalWorksheetId);
                        e.currentTarget.style.display = 'none';
                      }}
                      onLoad={() => console.log('Successfully loaded digital worksheet:', editingReport.digitalWorksheetId)}
                    />
                  </div>
                ) : editingReport.worksheetId ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <img 
                      src={`/api/worksheets/${editingReport.worksheetId}/image`}
                      alt="Uploaded Worksheet"
                      className="max-w-full max-h-full object-contain border border-gray-300 rounded-lg"
                      onError={(e) => {
                        console.error('Failed to load worksheet image:', editingReport.worksheetId);
                        e.currentTarget.style.display = 'none';
                      }}
                      onLoad={() => console.log('Successfully loaded worksheet:', editingReport.worksheetId)}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>No worksheet image available</p>
                  </div>
                )}
                
                {/* Debug info */}
                <div className="absolute bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
                  <div>Digital ID: {editingReport.digitalWorksheetId || 'None'}</div>
                  <div>Worksheet ID: {editingReport.worksheetId || 'None'}</div>
                </div>
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
                  <Label htmlFor="fullscreen-indication">Indication</Label>
                  <Textarea
                    id="fullscreen-indication"
                    value={editingReport.indication}
                    onChange={(e) => updateEditingReport('indication', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullscreen-findings">Findings</Label>
                  <Textarea
                    id="fullscreen-findings"
                    value={editingReport.findings}
                    onChange={(e) => updateEditingReport('findings', e.target.value)}
                    rows={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullscreen-impression">Impression</Label>
                  <Textarea
                    id="fullscreen-impression"
                    value={editingReport.impression}
                    onChange={(e) => updateEditingReport('impression', e.target.value)}
                    rows={4}
                  />
                </div>

                {/* Finalization */}
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fullscreen-finalizeReport"
                      checked={editingReport.isFinalized}
                      onCheckedChange={(checked) => updateEditingReport('isFinalized', checked)}
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
                    onClick={() => handleExportDOCX(editingReport)}
                    variant="outline"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export DOCX
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientName">Patient Name</Label>
                    <Input
                      id="patientName"
                      value={editingReport.patientName}
                      onChange={(e) => updateEditingReport('patientName', e.target.value)}
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
                  <Label htmlFor="indication">Indication</Label>
                  <Textarea
                    id="indication"
                    value={editingReport.indication}
                    onChange={(e) => updateEditingReport('indication', e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Findings */}
                <div className="space-y-2">
                  <Label htmlFor="findings">Findings</Label>
                  <Textarea
                    id="findings"
                    value={editingReport.findings}
                    onChange={(e) => updateEditingReport('findings', e.target.value)}
                    rows={6}
                  />
                </div>

                {/* Impression */}
                <div className="space-y-2">
                  <Label htmlFor="impression">Impression</Label>
                  <Textarea
                    id="impression"
                    value={editingReport.impression}
                    onChange={(e) => updateEditingReport('impression', e.target.value)}
                    rows={4}
                  />
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
                    onClick={() => handleExportDOCX(editingReport)}
                    variant="outline"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export DOCX
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
    </div>
  );
}
