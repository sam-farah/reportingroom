import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Image, CheckCircle, Loader2, Camera, Search, User, X, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./file-upload";
import DrawingCanvas from "./drawing-canvas";
import type { Worksheet, Physician, Report, Patient, ScanTypeContentTemplate, Sonographer } from "@shared/schema";

export default function UserPanel({ preLinkedPatientId, preLinkedPatientName, preLinkedExamDate, preLinkedPhysicianId, onPreLinkedPatientConsumed, defaultTab, onReportGenerated }: { preLinkedPatientId?: number | null; preLinkedPatientName?: string; preLinkedExamDate?: string; preLinkedPhysicianId?: number | null; onPreLinkedPatientConsumed?: () => void; defaultTab?: "upload" | "draw"; onReportGenerated?: (reportId: number) => void } = {}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedWorksheet, setSelectedWorksheet] = useState<Worksheet | null>(null);
  const [selectedPhysician, setSelectedPhysician] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const [patientName, setPatientName] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'processing' | 'completed'>('idle');
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmSonographerId, setConfirmSonographerId] = useState<string>("");

  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const { data: allPatients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const res = await fetch("/api/patients", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: contentTemplates = [] } = useQuery<ScanTypeContentTemplate[]>({
    queryKey: ["/api/content-templates"],
  });

  const { data: sonographers = [] } = useQuery<Sonographer[]>({
    queryKey: ["/api/sonographers"],
  });
  const activeSonographers = sonographers.filter((s) => s.isActive !== false);

  // Only show content templates that have actual content saved (green-dot ones)
  const populatedContentTemplates = contentTemplates.filter(
    (t) => (t.findingsTemplate && t.findingsTemplate.trim()) || (t.impressionTemplate && t.impressionTemplate.trim())
  );

  const filteredPatients = patientSearch.trim().length > 0
    ? allPatients.filter(p => {
        const full = `${p.firstName} ${p.lastName} ${p.urNumber || ""}`.toLowerCase();
        return full.includes(patientSearch.toLowerCase());
      })
    : allPatients.slice(0, 8);

  // Auto-link patient when arriving from calendar "Begin Study" or "Start another scan"
  useEffect(() => {
    if (allPatients.length === 0) return;
    if (preLinkedExamDate) {
      setExamDate(preLinkedExamDate);
    }
    if (preLinkedPhysicianId) {
      // Reporting doctor was already chosen on the appointment (right after
      // verbal consent) — prefill it here so the sonographer doesn't have to
      // pick it again, but it stays editable in case of a genuine override.
      setSelectedPhysician(String(preLinkedPhysicianId));
    }
    if (preLinkedPatientId) {
      // Exact match by ID — best case
      const found = allPatients.find(p => p.id === preLinkedPatientId);
      if (found) {
        setLinkedPatient(found);
        if (!patientName) setPatientName(`${found.firstName} ${found.lastName}`);
        if (!patientDob && found.dateOfBirth) setPatientDob(found.dateOfBirth);
        onPreLinkedPatientConsumed?.();
        toast({ title: "Patient linked", description: `${found.firstName} ${found.lastName} is ready for report generation` });
      }
    } else if (preLinkedPatientName) {
      // No ID — try to match by name
      const nameLower = preLinkedPatientName.toLowerCase();
      const found = allPatients.find(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase() === nameLower
      );
      if (found) {
        setLinkedPatient(found);
        if (!patientName) setPatientName(`${found.firstName} ${found.lastName}`);
        if (!patientDob && found.dateOfBirth) setPatientDob(found.dateOfBirth);
        onPreLinkedPatientConsumed?.();
        toast({ title: "Patient linked", description: `${found.firstName} ${found.lastName} matched by name` });
      } else {
        // Pre-fill search so the user can quickly find and confirm
        setPatientSearch(preLinkedPatientName);
        setShowPatientDropdown(true);
        onPreLinkedPatientConsumed?.();
        toast({ title: "Select patient", description: `Please confirm the patient record for "${preLinkedPatientName}"` });
      }
    }
  }, [preLinkedPatientId, preLinkedPatientName, preLinkedPhysicianId, allPatients]);

  // Handle authentication errors
  useEffect(() => {
    const handleAuthError = (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    };

    // You can add error handling here if needed
  }, [toast]);

  const ocrMutation = useMutation({
    mutationFn: async ({ worksheetId, linkedPatientId }: { worksheetId: number; linkedPatientId: number | null }) => {
      console.log('Starting OCR for worksheet ID:', worksheetId, 'linked patient:', linkedPatientId);
      const response = await fetch(`/api/worksheets/${worksheetId}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedPatientId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('OCR processing failed:', errorData);
        throw new Error(errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log('OCR processing successful:', data);
      setUploadStatus('completed');
      if (data.ocrResult) {
        // Only update patient name and DOB from OCR if no patient is linked
        if (!linkedPatient && !data.linkedPatientUsed) {
          setPatientName(data.ocrResult.patientName || "");
        }
        
        // Parse DOB from various formats to YYYY-MM-DD
        let dobFormatted = "";
        if (data.ocrResult.patientDob) {
          const dobStr = data.ocrResult.patientDob;
          console.log('Raw DOB from OCR:', dobStr);
          
          // Try to parse various date formats
          let parsedDate = null;
          
          // Format: 22-7-52, 15/03/85, 07.12.90 etc.
          if (dobStr.match(/^\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}$/)) {
            const parts = dobStr.split(/[\.\/\-]/);
            let day = parseInt(parts[0]);
            let month = parseInt(parts[1]);
            let year = parseInt(parts[2]);
            
            // Handle 2-digit years for DOB (different logic than exam dates)
            // For DOB: years 00-30 = 2000s, 31-99 = 1900s
            if (year < 100) {
              year = year <= 30 ? 2000 + year : 1900 + year;
            }
            
            parsedDate = new Date(year, month - 1, day);
            console.log('Attempted to parse DOB:', { day, month, year, parsedDate });
          }
          
          if (parsedDate && !isNaN(parsedDate.getTime())) {
            dobFormatted = parsedDate.toISOString().split('T')[0];
            console.log('Successfully parsed DOB to:', dobFormatted);
          } else {
            console.log('Failed to parse DOB, leaving empty for manual entry');
            dobFormatted = "";
          }
        }
        
        // Only set DOB from OCR if no linked patient (whose DOB is already pre-filled)
        if (!linkedPatient && !data.linkedPatientUsed) {
          setPatientDob(dobFormatted);
        }
        
        // Parse exam date from various formats to YYYY-MM-DD
        let examDateFormatted = "";
        if (data.ocrResult.examDate) {
          const examDateStr = data.ocrResult.examDate;
          console.log('Raw exam date from OCR:', examDateStr);
          
          // Try to parse various date formats
          let parsedDate = null;
          
          // Format: 7.7.23, 7-7-25, 7/7/23 or 07.07.23 etc.
          if (examDateStr.match(/^\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}$/)) {
            const parts = examDateStr.split(/[\.\/\-]/);
            let day = parseInt(parts[0]);
            let month = parseInt(parts[1]);
            let year = parseInt(parts[2]);
            
            // Handle 2-digit years (assume years 26-99 are 1900s, 00-25 are 2000s)
            if (year < 100) {
              year = year > 25 ? 1900 + year : 2000 + year;
            }
            
            parsedDate = new Date(year, month - 1, day);
            console.log('Attempted to parse date:', { day, month, year, parsedDate });
          }
          
          if (parsedDate && !isNaN(parsedDate.getTime())) {
            examDateFormatted = parsedDate.toISOString().split('T')[0];
            console.log('Successfully parsed exam date to:', examDateFormatted);
          } else {
            console.log('Failed to parse exam date, using original value');
            // If parsing fails, try to use the original date as-is for display
            examDateFormatted = "";
          }
        }
        
        setExamDate(examDateFormatted || "");
        
        toast({
          title: "OCR Complete",
          description: `Patient data extracted with ${Math.round(data.ocrResult.confidence * 100)}% confidence`,
        });
      }
    },
    onError: (error: Error) => {
      console.error('OCR processing error:', error);
      setUploadStatus('completed'); // Still mark as completed even if OCR fails
      
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
        title: "OCR Processing Failed",
        description: error.message || "Please enter patient information manually",
        variant: "destructive",
      });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorksheet || !selectedPhysician) {
        throw new Error("Missing required data");
      }

      // Logo will be handled by clinic settings
      const logoUrl = null;

      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worksheetId: selectedWorksheet.id,
          physicianId: parseInt(selectedPhysician),
          logoUrl,
          contentTemplateScanType: selectedTemplate || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Report generation failed:', errorData);
        throw new Error(errorData.details || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Report Generated",
        description: "Opening report editor…",
      });
      if (onReportGenerated) {
        onReportGenerated(report.id);
      } else {
        navigate(`/?openReport=${report.id}`);
      }
    },
    onError: (error: Error) => {
      console.error('Report generation error:', error);
      
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
        title: "Generation Failed",
        description: error.message || "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleWorksheetUploaded = (worksheet: Worksheet) => {
    setSelectedWorksheet(worksheet);
    setUploadStatus('uploaded');
    
    // Capture linked patient BEFORE any reset so we can pass it to OCR
    const capturedLinkedPatient = linkedPatient;
    
    // Reset OCR-derived fields only (keep the linked patient if one was pre-selected)
    setPatientName(capturedLinkedPatient ? `${capturedLinkedPatient.firstName} ${capturedLinkedPatient.lastName}` : "");
    setPatientDob(capturedLinkedPatient?.dateOfBirth || "");
    setExamDate("");
    if (!capturedLinkedPatient) {
      setPatientSearch("");
    }
    
    // Brief delay to show upload success, then start OCR processing
    setTimeout(() => {
      setUploadStatus('processing');
      ocrMutation.mutate({ worksheetId: worksheet.id, linkedPatientId: capturedLinkedPatient?.id ?? null });
    }, 500);
  };

  const handleWorksheetCreated = async (imageData: string, templateName: string) => {
    try {
      // Convert base64 image to blob and create file
      const response = await fetch(imageData);
      const blob = await response.blob();
      const file = new File([blob], `${templateName.replace(/\s+/g, '-')}-${Date.now()}.png`, { type: 'image/png' });

      // Create FormData and upload
      const formData = new FormData();
      formData.append('worksheet', file);

      const uploadResponse = await fetch('/api/worksheets/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload drawn worksheet');
      }

      const worksheet = await uploadResponse.json();
      handleWorksheetUploaded(worksheet);
      
      toast({
        title: "Worksheet Created",
        description: `${templateName} worksheet created and ready for processing`,
      });
    } catch (error) {
      console.error('Error creating worksheet:', error);
      toast({
        title: "Error",
        description: "Failed to create worksheet",
        variant: "destructive",
      });
    }
  };

  const handleGenerateReport = () => {
    if (!selectedWorksheet) {
      toast({
        title: "No Worksheet",
        description: "Please upload a worksheet first",
        variant: "destructive",
      });
      return;
    }

    if (!linkedPatient) {
      toast({
        title: "No Patient Selected",
        description: "Please select a patient from the patient list before generating a report",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPhysician) {
      toast({
        title: "No Physician Selected",
        description: "Please select a reporting physician",
        variant: "destructive",
      });
      return;
    }

    // Checkpoint: the sonographer must confirm patient details (name, DOB,
    // exam date) and the performing sonographer BEFORE the report is
    // generated and filed — catching mistakes here avoids delete-and-restart.
    setConfirmChecked(false);
    setConfirmSonographerId("");
    setShowConfirmDialog(true);
  };

  // Persist the confirmed details onto the worksheet, then generate.
  const confirmAndGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorksheet) throw new Error("No worksheet selected");
      const res = await fetch(`/api/worksheets/${selectedWorksheet.id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patientName: patientName || "",
          patientDob: patientDob || "",
          examDate: examDate || "",
          sonographerId: confirmSonographerId ? parseInt(confirmSonographerId) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to save confirmed details");
      }
      return res.json();
    },
    onSuccess: (updated: Worksheet) => {
      setSelectedWorksheet(updated);
      setShowConfirmDialog(false);
      generateReportMutation.mutate();
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't Save Details",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const dobMismatch =
    !!linkedPatient?.dateOfBirth && !!patientDob && linkedPatient.dateOfBirth !== patientDob;

  const formatDmy = (iso: string | null | undefined) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Report Generation</h1>
        <p className="text-gray-600">Upload an ultrasound worksheet to generate a professional report</p>
      </div>

      <div>
        {/* Worksheet Input Section */}
        <div>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {defaultTab === "draw" ? "Draw Worksheet" : "Upload Worksheet"}
              </h2>
              {defaultTab === "draw" ? (
                <DrawingCanvas onWorksheetCreated={handleWorksheetCreated} />
              ) : (
              <div className="w-full">
                <FileUpload
                  onFileUploaded={handleWorksheetUploaded}
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                  maxSize={10 * 1024 * 1024}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Supports image files (JPEG, PNG, GIF, WebP) and PDF files. PDFs will be automatically converted to images for processing.
                </p>

                {/* Upload Status Indicators */}
                {uploadStatus !== 'idle' && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
                    <div className="space-y-2">
                      {/* File Upload Status */}
                      <div className="flex items-center space-x-2">
                        {uploadStatus === 'uploaded' || uploadStatus === 'processing' || uploadStatus === 'completed' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        )}
                        <span className="text-sm text-gray-700">File uploaded successfully</span>
                      </div>

                      {/* OCR Processing Status */}
                      {(uploadStatus === 'processing' || uploadStatus === 'completed') && (
                        <div className="flex items-center space-x-2">
                          {uploadStatus === 'completed' ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                          )}
                          <span className="text-sm text-gray-700">
                            {uploadStatus === 'completed' ? 'OCR processing complete' : 'Processing OCR...'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Patient record link — always visible */}
              <div className="mt-6">
                <Label>
                  Link to Patient Record <span className="text-red-500">*</span>
                </Label>
                {linkedPatient ? (
                      <div className="mt-1 bg-green-50 border border-green-200 rounded-xl overflow-hidden">
                        {/* Verified header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-green-100 border-b border-green-200">
                          <div className="flex items-center gap-1.5 text-green-700">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold uppercase tracking-wide">Patient ID Verified</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setLinkedPatient(null); setPatientSearch(""); }}
                            className="text-green-500 hover:text-green-700"
                            title="Change patient"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* 3 ID points */}
                        <div className="grid grid-cols-3 divide-x divide-green-200">
                          <div className="px-3 py-2.5">
                            <div className="text-xs text-green-600 uppercase tracking-wide mb-0.5">Full Name</div>
                            <div className="text-sm font-semibold text-gray-900 leading-tight">
                              {linkedPatient.firstName} {linkedPatient.lastName}
                            </div>
                          </div>
                          <div className="px-3 py-2.5">
                            <div className="text-xs text-green-600 uppercase tracking-wide mb-0.5">Date of Birth</div>
                            <div className="text-sm font-semibold text-gray-900">
                              {linkedPatient.dateOfBirth
                                ? (() => {
                                    const [y, m, d] = (linkedPatient.dateOfBirth || "").split("-");
                                    return y && m && d ? `${d}/${m}/${y}` : linkedPatient.dateOfBirth;
                                  })()
                                : <span className="text-gray-400 italic text-xs">Not recorded</span>}
                            </div>
                          </div>
                          <div className="px-3 py-2.5">
                            <div className="text-xs text-green-600 uppercase tracking-wide mb-0.5">UR Number</div>
                            <div className="text-sm font-semibold text-gray-900">
                              {linkedPatient.urNumber
                                ? <span className="font-mono text-blue-700">UR {linkedPatient.urNumber}</span>
                                : <span className="text-gray-400 italic text-xs">Not assigned</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative mt-1">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="Search by name or UR number..."
                            value={patientSearch}
                            onChange={(e) => { setPatientSearch(e.target.value); setShowPatientDropdown(true); }}
                            onFocus={() => setShowPatientDropdown(true)}
                            className="pl-8 border-orange-300 focus:border-orange-400"
                          />
                        </div>
                        {showPatientDropdown && filteredPatients.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredPatients.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                                onMouseDown={() => {
                                  setLinkedPatient(p);
                                  setPatientSearch("");
                                  setShowPatientDropdown(false);
                                  if (!patientName) setPatientName(`${p.firstName} ${p.lastName}`);
                                  if (!patientDob && p.dateOfBirth) setPatientDob(p.dateOfBirth);
                                }}
                              >
                                <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <div>
                                  <div className="text-sm font-medium">{p.firstName} {p.lastName}</div>
                                  {p.urNumber && <div className="text-xs text-blue-600">UR {p.urNumber}</div>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-orange-600 mt-1">A patient must be selected to generate a report</p>
                      </div>
                    )}
                </div>

              {/* OCR-extracted patient fields — only shown after worksheet upload */}
              {selectedWorksheet && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Extracted Patient Details</h3>
                    {uploadStatus === 'completed' && (patientName || patientDob || examDate) && (
                      <div className="flex items-center text-xs text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        OCR Extracted
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="patientName">Patient Name</Label>
                    <Input
                      id="patientName"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder={uploadStatus === 'processing' ? "Extracting..." : "Enter patient name"}
                      className={patientName ? "bg-green-50 border-green-200" : ""}
                    />
                    {patientName && uploadStatus === 'completed' && (
                      <p className="text-xs text-green-600 mt-1">✓ Extracted from document</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="patientDob">Date of Birth</Label>
                    <Input
                      id="patientDob"
                      type="date"
                      value={patientDob}
                      onChange={(e) => setPatientDob(e.target.value)}
                      className={patientDob ? "bg-green-50 border-green-200" : ""}
                    />
                    {patientDob && uploadStatus === 'completed' && (
                      <p className="text-xs text-green-600 mt-1">✓ Extracted from document</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="examDate">Exam Date</Label>
                    <Input
                      id="examDate"
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                      className={examDate && examDate !== new Date().toISOString().split('T')[0] ? "bg-green-50 border-green-200" : ""}
                    />
                    {examDate && examDate !== new Date().toISOString().split('T')[0] && uploadStatus === 'completed' && (
                      <p className="text-xs text-green-600 mt-1">✓ Extracted from document</p>
                    )}
                  </div>
                  {uploadStatus === 'completed' && !patientName && !patientDob && !examDate && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        OCR couldn't extract patient information. Please enter details manually.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Report Settings */}
              <div className="mt-6">
                <h3 className="text-md font-medium text-gray-900 mb-3">Report Settings</h3>

                {/* Physician Selection */}
                <div className="mb-4">
                  <Label>Reporting Physician</Label>
                  <Select value={selectedPhysician} onValueChange={setSelectedPhysician}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select physician" />
                    </SelectTrigger>
                    <SelectContent>
                      {physicians.map((physician) => (
                        <SelectItem key={physician.id} value={physician.id.toString()}>
                          {physician.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Content Template Selection */}
                <div className="mb-6">
                  <Label className="flex items-center gap-1.5">
                    <LayoutTemplate className="w-3.5 h-3.5 text-gray-500" />
                    Content Template
                  </Label>
                  <Select
                    value={selectedTemplate || "auto"}
                    onValueChange={(v) => setSelectedTemplate(v === "auto" ? "" : v)}
                    disabled={populatedContentTemplates.length === 0}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={populatedContentTemplates.length === 0 ? "No templates saved yet" : "Auto-detect from scan type"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        <span className="text-gray-500">Auto-detect from scan type</span>
                      </SelectItem>
                      {populatedContentTemplates.map((t) => (
                        <SelectItem key={t.scanType} value={t.scanType}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 inline-block flex-shrink-0" />
                            {t.scanType}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400 mt-1">
                    {populatedContentTemplates.length === 0
                      ? "Save content templates in Admin → Content Templates first"
                      : "Override which content template the AI uses to structure this report"}
                  </p>
                </div>

                <Button
                  onClick={handleGenerateReport}
                  disabled={generateReportMutation.isPending}
                  className="w-full medical-btn-primary"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {generateReportMutation.isPending ? "Generating report…" : "Generate Report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pre-generation confirmation checkpoint */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => { if (!confirmAndGenerateMutation.isPending) setShowConfirmDialog(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm Study Details</DialogTitle>
            <DialogDescription>
              Please double-check these details before the report is generated. Correcting a mistake here saves deleting the study later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="confirmName">Patient Name</Label>
              <Input
                id="confirmName"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="confirmDob">Date of Birth</Label>
                <Input
                  id="confirmDob"
                  type="date"
                  value={patientDob}
                  onChange={(e) => setPatientDob(e.target.value)}
                  className={dobMismatch ? "border-red-400 bg-red-50" : ""}
                />
              </div>
              <div>
                <Label htmlFor="confirmExamDate">Date of Study</Label>
                <Input
                  id="confirmExamDate"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
              </div>
            </div>
            {dobMismatch && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                This DOB doesn't match the linked patient record ({formatDmy(linkedPatient?.dateOfBirth)} for {linkedPatient?.firstName} {linkedPatient?.lastName}). Please check which is correct before continuing.
              </div>
            )}
            <div>
              <Label>Sonographer</Label>
              <Select value={confirmSonographerId || "auto"} onValueChange={(v) => setConfirmSonographerId(v === "auto" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sonographer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <span className="text-gray-500">Auto — from the patient's appointment</span>
                  </SelectItem>
                  {activeSonographers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title ? `${s.title} ` : ""}{s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                Leave on Auto to use the sonographer from the scheduled appointment, or pick one explicitly.
              </p>
            </div>
            {linkedPatient && (
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                Linked patient: <span className="font-semibold">{linkedPatient.firstName} {linkedPatient.lastName}</span>
                {linkedPatient.urNumber && <> · UR {linkedPatient.urNumber}</>}
                {linkedPatient.dateOfBirth && <> · DOB {formatDmy(linkedPatient.dateOfBirth)}</>}
              </div>
            )}
            <label className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <Checkbox
                checked={confirmChecked}
                onCheckedChange={(v) => setConfirmChecked(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-amber-900">
                I have checked the patient name, date of birth, date of study and sonographer, and they are correct.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={confirmAndGenerateMutation.isPending}
            >
              Go Back
            </Button>
            <Button
              onClick={() => confirmAndGenerateMutation.mutate()}
              disabled={!confirmChecked || confirmAndGenerateMutation.isPending || generateReportMutation.isPending}
              className="medical-btn-primary"
            >
              {confirmAndGenerateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-2" /> Confirm & Generate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
