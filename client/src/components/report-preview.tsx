import { useState } from "react";
import { Image, Edit3, Save, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Report, Physician, Clinic } from "@shared/schema";

interface ReportPreviewProps {
  report: Report | null;
  physician?: Physician;
  logoFile?: File | null;
  onReportUpdate?: (updatedReport: Report) => void;
}

export default function ReportPreview({ report, physician, logoFile, onReportUpdate }: ReportPreviewProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedReport, setEditedReport] = useState<Report | null>(null);

  // Fetch clinic information
  const { data: clinic } = useQuery<Clinic>({
    queryKey: ["/api/clinic"],
    retry: false,
  });

  const updateReportMutation = useMutation({
    mutationFn: async (updatedData: Partial<Report>) => {
      if (!report) throw new Error("No report to update");
      
      const response = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify(updatedData),
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: (updatedReport: Report) => {
      setIsEditing(false);
      setEditedReport(null);
      onReportUpdate?.(updatedReport);
      toast({
        title: "Report Updated",
        description: "Your changes have been saved successfully",
      });
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

  const finalizeReportMutation = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("No report to finalize");
      
      const response = await fetch(`/api/reports/${report.id}/finalize`, {
        method: "POST",
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: (finalizedReport: Report) => {
      onReportUpdate?.(finalizedReport);
      toast({
        title: "Report Finalized",
        description: "Report has been electronically signed and finalized",
      });
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

  if (!report) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 min-h-96 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Image className="w-8 h-8 text-gray-400" />
          </div>
          <p>Upload a worksheet and generate a report to see the preview</p>
        </div>
      </div>
    );
  }

  const currentReport = editedReport || report;

  const handleEdit = () => {
    setEditedReport({ ...report });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedReport(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!editedReport) return;
    
    const changes = {
      patientName: editedReport.patientName,
      patientDob: editedReport.patientDob,
      examDate: editedReport.examDate,
      studyType: editedReport.studyType,
      indication: editedReport.indication,
      findings: editedReport.findings,
      impression: editedReport.impression,
    };
    
    updateReportMutation.mutate(changes);
  };

  const updateField = (field: keyof Report, value: string) => {
    if (!editedReport) return;
    setEditedReport({ ...editedReport, [field]: value });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 min-h-96">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
            {logoFile ? (
              <img 
                src={URL.createObjectURL(logoFile)} 
                alt="Logo" 
                className="w-full h-full object-contain rounded-lg"
              />
            ) : clinic?.logoUrl ? (
              <img 
                src={clinic.logoUrl} 
                alt="Clinic Logo" 
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <Image className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{clinic?.name || 'Medical Clinic'}</h3>
            <p className="text-sm text-gray-600">Ultrasound Report</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-right mr-4">
            <p className="text-sm text-gray-600">
              Report Date: {new Date().toLocaleDateString()}
            </p>
          </div>
          {isEditing ? (
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateReportMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Save className="w-4 h-4 mr-1" />
                {updateReportMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={updateReportMutation.isPending}
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEdit}
              className="text-blue-600 border-blue-600 hover:bg-blue-50"
            >
              <Edit3 className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Patient Information */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Patient Information</h4>
          <div className="text-sm space-y-2">
            <div className="flex items-center">
              <span className="font-medium w-20">Name:</span>
              {isEditing ? (
                <Input
                  value={currentReport.patientName}
                  onChange={(e) => updateField('patientName', e.target.value)}
                  className="ml-2 h-8 text-sm"
                />
              ) : (
                <span className="ml-2">{currentReport.patientName}</span>
              )}
            </div>
            <div className="flex items-center">
              <span className="font-medium w-20">DOB:</span>
              {isEditing ? (
                <Input
                  type="date"
                  value={currentReport.patientDob || ''}
                  onChange={(e) => updateField('patientDob', e.target.value)}
                  className="ml-2 h-8 text-sm"
                />
              ) : (
                <span className="ml-2">{currentReport.patientDob}</span>
              )}
            </div>
            <div className="flex items-center">
              <span className="font-medium w-20">Exam Date:</span>
              {isEditing ? (
                <Input
                  type="date"
                  value={currentReport.examDate}
                  onChange={(e) => updateField('examDate', e.target.value)}
                  className="ml-2 h-8 text-sm"
                />
              ) : (
                <span className="ml-2">{currentReport.examDate}</span>
              )}
            </div>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Study Information</h4>
          <div className="text-sm space-y-2">
            <div className="flex items-center">
              <span className="font-medium w-24">Study Type:</span>
              {isEditing ? (
                <Input
                  value={currentReport.studyType}
                  onChange={(e) => updateField('studyType', e.target.value)}
                  className="ml-2 h-8 text-sm"
                />
              ) : (
                <span className="ml-2">{currentReport.studyType}</span>
              )}
            </div>
            <div className="flex items-start">
              <span className="font-medium w-24 pt-1">Indication:</span>
              {isEditing ? (
                <Textarea
                  value={currentReport.indication}
                  onChange={(e) => updateField('indication', e.target.value)}
                  className="ml-2 text-sm resize-none"
                  rows={2}
                />
              ) : (
                <span className="ml-2">{currentReport.indication}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Findings */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-900 mb-3">Findings</h4>
        {isEditing ? (
          <Textarea
            value={currentReport.findings}
            onChange={(e) => updateField('findings', e.target.value)}
            className="text-sm min-h-32"
            placeholder="Enter detailed findings..."
          />
        ) : (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">
            {currentReport.findings}
          </div>
        )}
      </div>

      {/* Impression */}
      <div className="mb-8">
        <h4 className="font-semibold text-gray-900 mb-3">Impression</h4>
        {isEditing ? (
          <Textarea
            value={currentReport.impression}
            onChange={(e) => updateField('impression', e.target.value)}
            className="text-sm min-h-24"
            placeholder="Enter clinical impression..."
          />
        ) : (
          <div className="text-sm text-gray-700 whitespace-pre-wrap">
            {currentReport.impression}
          </div>
        )}
      </div>

      {/* Signature */}
      <div className="border-t pt-6">
        <div className="flex justify-between items-end">
          <div>
            {/* Finalization Status */}
            {report.isFinalized ? (
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Electronically signed on {new Date(report.finalizedAt!).toLocaleDateString()}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="finalize-report"
                    checked={false}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        finalizeReportMutation.mutate();
                      }
                    }}
                    disabled={finalizeReportMutation.isPending}
                  />
                  <label htmlFor="finalize-report" className="text-sm font-medium cursor-pointer">
                    {finalizeReportMutation.isPending ? "Finalizing..." : "Finalize Report"}
                  </label>
                </div>
              </div>
            )}
          </div>
          
          <div className="text-right">
            <div className="w-48 h-16 bg-gray-100 rounded mb-2 flex items-center justify-center">
              <span className="text-xs text-gray-500">Digital Signature</span>
            </div>
            <p className="text-sm font-medium">
              {physician ? `${physician.name}, ${physician.title}` : "Dr. [Physician Name]"}
            </p>
            <p className="text-xs text-gray-600">
              {physician?.specialty || "Radiologist"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
