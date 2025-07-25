import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, Download, Printer, Image, CheckCircle, Loader2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./file-upload";
import ReportPreview from "./report-preview";
import type { Worksheet, Physician, Report } from "@shared/schema";

export default function UserPanel() {
  const { toast } = useToast();
  const [selectedWorksheet, setSelectedWorksheet] = useState<Worksheet | null>(null);
  const [selectedPhysician, setSelectedPhysician] = useState<string>("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'processing' | 'completed'>('idle');

  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

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
        setPatientDob(data.ocrResult.patientDob || "");
        
        // Parse exam date from various formats to YYYY-MM-DD
        let examDateFormatted = "";
        if (data.ocrResult.examDate) {
          const examDateStr = data.ocrResult.examDate;
          console.log('Raw exam date from OCR:', examDateStr);
          
          // Try to parse various date formats
          let parsedDate = null;
          
          // Format: 7.7.23 or 7/7/23 or 07.07.23 etc.
          if (examDateStr.match(/^\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}$/)) {
            const parts = examDateStr.split(/[\.\/]/);
            let day = parseInt(parts[0]);
            let month = parseInt(parts[1]);
            let year = parseInt(parts[2]);
            
            // Handle 2-digit years
            if (year < 100) {
              year = year > 50 ? 1900 + year : 2000 + year;
            }
            
            parsedDate = new Date(year, month - 1, day);
          }
          
          if (parsedDate && !isNaN(parsedDate.getTime())) {
            examDateFormatted = parsedDate.toISOString().split('T')[0];
            console.log('Parsed exam date:', examDateFormatted);
          }
        }
        
        setExamDate(examDateFormatted || new Date().toISOString().split('T')[0]);
        
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

      let logoUrl = null;
      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        const logoResponse = await fetch('/api/upload-logo', {
          method: 'POST',
          body: formData,
        });
        if (logoResponse.ok) {
          const logoData = await logoResponse.json();
          logoUrl = logoData.url;
        }
      }

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
    setExamDate(new Date().toISOString().split('T')[0]);
    setGeneratedReport(null);
    
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

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLogoFile(file);
      toast({
        title: "Logo Selected",
        description: file.name,
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
                
                {/* Logo Upload */}
                <div className="mb-4">
                  <Label>Logo</Label>
                  <div className="flex items-center space-x-3 mt-2">
                    <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                      <Image className="text-gray-400 w-6 h-6" />
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                        id="logo-upload"
                      />
                      <Label htmlFor="logo-upload" className="medical-text-primary hover:underline cursor-pointer">
                        Upload Logo
                      </Label>
                      {logoFile && (
                        <p className="text-xs text-gray-600 mt-1">{logoFile.name}</p>
                      )}
                    </div>
                  </div>
                </div>

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
                logoFile={logoFile}
                onReportUpdate={setGeneratedReport}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
