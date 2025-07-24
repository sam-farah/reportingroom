import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, Download, Printer, Image } from "lucide-react";
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
      if (data.ocrResult) {
        setPatientName(data.ocrResult.patientName || "");
        setPatientDob(data.ocrResult.patientDob || "");
        setExamDate(data.ocrResult.examDate || new Date().toISOString().split('T')[0]);
        toast({
          title: "OCR Processing Complete",
          description: `Patient data extracted with ${Math.round(data.ocrResult.confidence * 100)}% confidence`,
        });
      }
    },
    onError: (error: Error) => {
      console.error('OCR processing error:', error);
      
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
    // Automatically start OCR processing
    ocrMutation.mutate(worksheet.id);
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
        <p className="text-gray-600">Upload your ultrasound worksheet to generate a professional report</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                <Upload className="medical-text-primary mr-2 inline" />
                Upload Worksheet
              </h2>
              
              <FileUpload
                onFileUploaded={handleWorksheetUploaded}
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                maxSize={10 * 1024 * 1024}
              />
              <p className="text-xs text-gray-500 mt-2">
                Supports image files (JPEG, PNG, GIF, WebP) and PDF files. PDFs will be automatically converted to images for processing.
              </p>

              {/* OCR Results */}
              {selectedWorksheet && (
                <div className="mt-6">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Patient Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="patientName">Patient Name</Label>
                      <Input
                        id="patientName"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="Enter patient name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="patientDob">Date of Birth</Label>
                      <Input
                        id="patientDob"
                        type="date"
                        value={patientDob}
                        onChange={(e) => setPatientDob(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="examDate">Exam Date</Label>
                      <Input
                        id="examDate"
                        type="date"
                        value={examDate}
                        onChange={(e) => setExamDate(e.target.value)}
                      />
                    </div>
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
                    <Button className="bg-[var(--medical-success)] hover:bg-[var(--medical-success)]/80 text-white">
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
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
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
