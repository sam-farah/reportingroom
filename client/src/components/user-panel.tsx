import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, Download, Printer, Image, CheckCircle, Loader2, FileDown, Camera, Search, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./file-upload";
import ReportPreview from "./report-preview";
import type { Worksheet, Physician, Report, Patient } from "@shared/schema";

export default function UserPanel({ preLinkedPatientId, preLinkedPatientName, onPreLinkedPatientConsumed }: { preLinkedPatientId?: number | null; preLinkedPatientName?: string; onPreLinkedPatientConsumed?: () => void } = {}) {
  const { toast } = useToast();
  const [selectedWorksheet, setSelectedWorksheet] = useState<Worksheet | null>(null);
  const [selectedPhysician, setSelectedPhysician] = useState<string>("");

  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'processing' | 'completed'>('idle');
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

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

  const filteredPatients = patientSearch.trim().length > 0
    ? allPatients.filter(p => {
        const full = `${p.firstName} ${p.lastName} ${p.urNumber || ""}`.toLowerCase();
        return full.includes(patientSearch.toLowerCase());
      })
    : allPatients.slice(0, 8);

  // Auto-link patient when arriving from calendar "Begin Study"
  useEffect(() => {
    if (allPatients.length === 0) return;
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
  }, [preLinkedPatientId, preLinkedPatientName, allPatients]);

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
    mutationFn: async (worksheetId: number) => {
      console.log('Starting OCR for worksheet ID:', worksheetId);
      const response = await fetch(`/api/worksheets/${worksheetId}/ocr`, {
        method: 'POST',
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
        setPatientName(data.ocrResult.patientName || "");
        
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
        
        setPatientDob(dobFormatted);
        
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
      setGeneratedReport(report);
      toast({
        title: "Report Generated",
        description: "Your ultrasound report has been successfully generated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
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
    
    // Reset form state
    setPatientName("");
    setPatientDob("");
    setExamDate("");
    setGeneratedReport(null);
    setLinkedPatient(null);
    setPatientSearch("");
    
    // Brief delay to show upload success, then start OCR processing
    setTimeout(() => {
      setUploadStatus('processing');
      ocrMutation.mutate(worksheet.id);
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



  const handleDownloadPdf = () => {
    if (!generatedReport) {
      toast({
        title: "No Report Available",
        description: "Please generate a report first",
        variant: "destructive",
      });
      return;
    }

    // Open the printable report page in a new tab
    const url = `/api/reports/${generatedReport.id}/pdf`;
    window.open(url, '_blank');

    toast({
      title: "Print Page Opened",
      description: "Use the print button or Ctrl+P to save as PDF",
    });
  };

  const handleDownloadDocx = async () => {
    if (!generatedReport) {
      toast({
        title: "No Report Available",
        description: "Please generate a report first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/reports/${generatedReport.id}/docx`);
      
      if (!response.ok) {
        throw new Error('Failed to generate DOCX');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${generatedReport.patientName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_${generatedReport.examDate}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "DOCX Downloaded",
        description: "Report downloaded successfully",
      });
    } catch (error) {
      console.error('DOCX download error:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download DOCX file",
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

    generateReportMutation.mutate();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Report Generation</h1>
        <p className="text-gray-600">Upload an ultrasound worksheet to generate professional reports</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Worksheet Input Section */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Upload Worksheet
              </h2>
              
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

              {/* Patient Information */}
              {selectedWorksheet && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-md font-medium text-gray-900">Patient Information</h3>
                    {uploadStatus === 'completed' && (patientName || patientDob || examDate) && (
                      <div className="flex items-center text-xs text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        OCR Extracted
                      </div>
                    )}
                  </div>

                  {/* Patient record link — required */}
                  <div className="mb-4">
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
                  
                  <div className="space-y-3">
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

                <Button
                  onClick={handleGenerateReport}
                  disabled={generateReportMutation.isPending}
                  className="w-full medical-btn-primary"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {generateReportMutation.isPending ? "Generating..." : "Generate Report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report Preview */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  <FileText className="medical-text-primary mr-2 inline" />
                  Report Preview
                </h2>
                {generatedReport && (
                  <div className="flex space-x-2">
                    <Button 
                      onClick={handleDownloadPdf}
                      className="bg-[var(--medical-success)] hover:bg-[var(--medical-success)]/80 text-white"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </Button>
                    <Button 
                      onClick={handleDownloadDocx}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <FileDown className="w-4 h-4 mr-2" />
                      DOCX
                    </Button>
                    <Button variant="secondary">
                      <Printer className="w-4 h-4 mr-2" />
                      Print
                    </Button>
                  </div>
                )}
              </div>

              <ReportPreview
                report={generatedReport}
                physician={physicians.find(p => p.id.toString() === selectedPhysician)}
                onReportUpdate={setGeneratedReport}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
