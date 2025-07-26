import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Edit3, FileText, Download, Eye, Calendar, User, Save, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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

  const handleEditReport = (report: Report) => {
    setEditingReport({ ...report });
    setIsEditDialogOpen(true);
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
                    onClick={() => handleExportDOCX(report)}
                  >
                    DOCX
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteReport(report)}
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                  disabled={deleteReportMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleteReportMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
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

      {/* Report Editor Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Report - {editingReport?.patientName}</DialogTitle>
          </DialogHeader>

          {editingReport && (
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

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}