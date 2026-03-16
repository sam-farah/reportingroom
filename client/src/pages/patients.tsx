import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, User, Phone, Mail, Calendar, FileText, ClipboardList, Edit, Trash2, ChevronLeft, MapPin, File, Clock, CheckCircle, AlertCircle, X, Upload } from "lucide-react";
import { format } from "date-fns";
import type { Patient, Worksheet, Report, Appointment, DigitalWorksheet, PatientDocument } from "@shared/schema";
import { WorksheetViewer } from "@/components/worksheet-viewer";
import { Download, ExternalLink } from "lucide-react";

function PdfViewer({ url, title }: { url: string; title: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        setError(err.message || "Could not load PDF");
      })
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (loading) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center bg-gray-50 rounded-lg border">
        <div className="text-center text-gray-500">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="w-full h-[300px] flex flex-col items-center justify-center bg-gray-50 rounded-lg border gap-4">
        <FileText className="w-12 h-12 text-gray-400" />
        <p className="text-gray-600 text-sm">{error || "Unable to preview this PDF"}</p>
        <div className="flex gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <ExternalLink className="w-4 h-4" />
            Open in new tab
          </a>
          <a
            href={url}
            download
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in new tab
        </a>
        <a
          href={url}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
      </div>
      <iframe
        src={blobUrl}
        className="w-full h-[650px] rounded-lg border bg-white"
        title={title}
      />
    </div>
  );
}

export default function Patients() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<{ type: 'report' | 'worksheet' | 'digitalWorksheet' | 'appointment' | 'document'; id: number } | null>(null);
  const [showPatientInfo, setShowPatientInfo] = useState(false);

  const [formData, setFormData] = useState({
    urNumber: "",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    insuranceProvider: "",
    insuranceId: "",
    referringPhysician: "",
    medicalHistory: "",
    allergies: "",
    notes: "",
  });

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients", searchQuery],
    queryFn: async () => {
      const url = searchQuery ? `/api/patients?search=${encodeURIComponent(searchQuery)}` : "/api/patients";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    },
  });

  const { data: patientWorksheets = [] } = useQuery<Worksheet[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "worksheets"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/worksheets`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch worksheets");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientDigitalWorksheets = [] } = useQuery<DigitalWorksheet[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "digital-worksheets"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/digital-worksheets`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch digital worksheets");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientReports = [] } = useQuery<Report[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "reports"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/reports`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch reports");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "appointments"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/appointments`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch appointments");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientDocuments = [] } = useQuery<PatientDocument[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "documents"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/documents`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("Request Form");
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: portalStatus } = useQuery<{ hasPortalAccess: boolean; invitePending: boolean }>({
    queryKey: ["/api/patients", selectedPatient?.id, "portal-status"],
    queryFn: async () => {
      if (!selectedPatient) return { hasPortalAccess: false, invitePending: false };
      const response = await fetch(`/api/patients/${selectedPatient.id}/portal-status`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch portal status");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const invitePortalMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      return await apiRequest(`/api/patients/${selectedPatient.id}/portal-invite`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "portal-status"] });
      toast({ title: "Success", description: `Invitation sent to ${selectedPatient?.email}` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to send invitation", variant: "destructive" });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ file, title, documentDate }: { file: File; title: string; documentDate: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("documentDate", documentDate);
      
      const response = await fetch(`/api/patients/${selectedPatient!.id}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "documents"] });
      setIsUploadDialogOpen(false);
      setUploadFile(null);
      setUploadTitle("Request Form");
      setUploadDate(new Date().toISOString().split('T')[0]);
      toast({ title: "Document uploaded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to upload document", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/patients", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Success", description: "Patient created successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create patient", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest(`/api/patients/${id}`, "PUT", data);
    },
    onSuccess: (updatedPatient: Patient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Success", description: "Patient updated successfully" });
      resetForm();
      setEditingPatient(null);
      setIsDialogOpen(false);
      if (selectedPatient && updatedPatient) {
        setSelectedPatient(updatedPatient);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update patient", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/patients/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Success", description: "Patient deactivated successfully" });
      setSelectedPatient(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete patient", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      urNumber: "",
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      insuranceProvider: "",
      insuranceId: "",
      referringPhysician: "",
      medicalHistory: "",
      allergies: "",
      notes: "",
    });
  };

  const handleEdit = (patient: Patient) => {
    setFormData({
      urNumber: patient.urNumber || "",
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender || "",
      phone: patient.phone || "",
      email: patient.email || "",
      address: patient.address || "",
      city: patient.city || "",
      state: patient.state || "",
      zipCode: patient.zipCode || "",
      insuranceProvider: patient.insuranceProvider || "",
      insuranceId: patient.insuranceId || "",
      referringPhysician: patient.referringPhysician || "",
      medicalHistory: patient.medicalHistory || "",
      allergies: patient.allergies || "",
      notes: patient.notes || "",
    });
    setEditingPatient(patient);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPatient) {
      updateMutation.mutate({ id: editingPatient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Combine all documents into a single list for EMR-style view
  const allDocuments = [
    ...patientReports.map(r => ({
      type: 'report' as const,
      id: r.id,
      title: r.studyType || 'Report',
      date: r.examDate || (r.generatedAt ? format(new Date(r.generatedAt), "yyyy-MM-dd") : ''),
      status: r.isFinalized ? 'finalized' : r.isDraft ? 'draft' : 'pending',
      isAmended: r.isAmended,
      data: r,
    })),
    ...patientWorksheets.map(w => ({
      type: 'worksheet' as const,
      id: w.id,
      title: w.originalName || 'Worksheet',
      date: w.uploadedAt ? format(new Date(w.uploadedAt), "yyyy-MM-dd") : '',
      status: w.ocrProcessed ? 'processed' : 'pending',
      isAmended: false,
      data: w,
    })),
    ...patientDigitalWorksheets.map(dw => ({
      type: 'digitalWorksheet' as const,
      id: dw.id,
      title: dw.patientName ? `${dw.studyType || 'Drawing'} - ${dw.patientName}` : (dw.studyType || 'Digital Worksheet'),
      date: dw.createdAt ? format(new Date(dw.createdAt), "yyyy-MM-dd") : '',
      status: dw.isDraft ? 'draft' : 'completed',
      isAmended: false,
      data: dw,
    })),
    ...patientAppointments.map(a => ({
      type: 'appointment' as const,
      id: a.id,
      title: a.scanType || 'Appointment',
      date: a.appointmentDate ? format(new Date(a.appointmentDate), "yyyy-MM-dd") : '',
      status: a.status || 'scheduled',
      isAmended: false,
      data: a,
    })),
    ...patientDocuments.map(d => ({
      type: 'document' as const,
      id: d.id,
      title: d.title || 'Document',
      date: d.documentDate || '',
      status: 'uploaded',
      isAmended: false,
      data: d,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getSelectedDocumentData = () => {
    if (!selectedDocument) return null;
    if (selectedDocument.type === 'report') {
      return patientReports.find(r => r.id === selectedDocument.id);
    }
    if (selectedDocument.type === 'worksheet') {
      return patientWorksheets.find(w => w.id === selectedDocument.id);
    }
    if (selectedDocument.type === 'digitalWorksheet') {
      return patientDigitalWorksheets.find(dw => dw.id === selectedDocument.id);
    }
    if (selectedDocument.type === 'appointment') {
      return patientAppointments.find(a => a.id === selectedDocument.id);
    }
    if (selectedDocument.type === 'document') {
      return patientDocuments.find(d => d.id === selectedDocument.id);
    }
    return null;
  };

  const renderDocumentPreview = () => {
    const doc = getSelectedDocumentData();
    if (!doc) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <FileText className="w-16 h-16 mb-4" />
          <p className="text-lg">Select a document to view</p>
        </div>
      );
    }

    if (selectedDocument?.type === 'report') {
      const report = doc as Report;
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div className="border-b pb-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{report.studyType}</h2>
                  <p className="text-gray-600">Exam Date: {report.examDate}</p>
                </div>
                <div className="flex gap-2">
                  {report.isFinalized && <Badge className="bg-green-600">Finalized</Badge>}
                  {report.isAmended && <Badge variant="secondary">Amended</Badge>}
                  {report.isDraft && <Badge variant="outline">Draft</Badge>}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Patient Information</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <p><strong>Name:</strong> {report.patientName}</p>
                  <p><strong>DOB:</strong> {report.patientDob}</p>
                </div>
              </div>

              {report.indication && (
                <div>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Indication</h3>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded whitespace-pre-wrap">
                    {report.indication}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Findings</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded whitespace-pre-wrap">
                  {report.findings}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Impression</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded whitespace-pre-wrap">
                  {report.impression}
                </div>
              </div>

              {report.isAmended && report.amendmentReason && (
                <div>
                  <h3 className="font-semibold text-orange-600 mb-2">Amendment Note</h3>
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded border border-orange-200">
                    <p>{report.amendmentReason}</p>
                    {report.amendedAt && <p className="text-sm text-gray-500 mt-2">Amended: {format(new Date(report.amendedAt), "PPP p")}</p>}
                  </div>
                </div>
              )}

              {report.isFinalized && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-gray-500">
                    Finalized: {report.finalizedAt ? format(new Date(report.finalizedAt), "PPP p") : 'N/A'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (selectedDocument?.type === 'worksheet') {
      const worksheet = doc as Worksheet;
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div className="border-b pb-4 mb-4">
              <h2 className="text-xl font-bold">{worksheet.originalName}</h2>
              <p className="text-gray-600">Uploaded: {worksheet.uploadedAt ? format(new Date(worksheet.uploadedAt), "PPP") : 'N/A'}</p>
            </div>
            <div className="space-y-4">
              <Badge variant={worksheet.ocrProcessed ? "default" : "secondary"}>
                {worksheet.ocrProcessed ? "OCR Processed" : "Pending Processing"}
              </Badge>
              {worksheet.filename && (
                <div className="mt-4" style={{ minHeight: '400px' }}>
                  <WorksheetViewer 
                    worksheetId={worksheet.id} 
                    alt={worksheet.originalName}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (selectedDocument?.type === 'digitalWorksheet') {
      const digitalWorksheet = doc as DigitalWorksheet;
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div className="border-b pb-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{digitalWorksheet.studyType || 'Digital Worksheet'}</h2>
                  <p className="text-gray-600">Created: {digitalWorksheet.createdAt ? format(new Date(digitalWorksheet.createdAt), "PPP") : 'N/A'}</p>
                </div>
                <Badge variant={digitalWorksheet.isDraft ? "outline" : "default"}>
                  {digitalWorksheet.isDraft ? "Draft" : "Completed"}
                </Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Patient Information</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <p><strong>Name:</strong> {digitalWorksheet.patientName}</p>
                  {digitalWorksheet.patientDob && <p><strong>DOB:</strong> {digitalWorksheet.patientDob}</p>}
                  <p><strong>Exam Date:</strong> {digitalWorksheet.examDate}</p>
                </div>
              </div>
              {digitalWorksheet.drawingData && (
                <div>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Worksheet Drawing</h3>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    <img 
                      src={`/api/digital-worksheets/${digitalWorksheet.id}/image`} 
                      alt="Digital Worksheet Drawing" 
                      className="max-w-full rounded border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
              {digitalWorksheet.completedAt && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-gray-500">
                    Completed: {format(new Date(digitalWorksheet.completedAt), "PPP p")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (selectedDocument?.type === 'appointment') {
      const appointment = doc as Appointment;
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div className="border-b pb-4 mb-4">
              <h2 className="text-xl font-bold">{appointment.scanType}</h2>
              <p className="text-gray-600">{appointment.appointmentDate ? format(new Date(appointment.appointmentDate), "PPP p") : ''}</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={appointment.status === "completed" ? "secondary" : appointment.status === "cancelled" ? "destructive" : "default"}>
                  {appointment.status}
                </Badge>
              </div>
              {appointment.notes && (
                <div>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Notes</h3>
                  <p className="text-gray-600">{appointment.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (selectedDocument?.type === 'document') {
      const patientDoc = doc as PatientDocument;
      const isImage = patientDoc.originalName?.match(/\.(jpg|jpeg|png|gif|bmp)$/i);
      const isPdf = patientDoc.originalName?.match(/\.pdf$/i);
      
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div className="border-b pb-4 mb-4">
              <h2 className="text-xl font-bold">{patientDoc.title}</h2>
              <p className="text-gray-600">Date: {patientDoc.documentDate}</p>
              <p className="text-sm text-gray-500">Original file: {patientDoc.originalName}</p>
            </div>
            <div className="mt-4">
              {isImage && (
                <img 
                  src={patientDoc.fileUrl} 
                  alt={patientDoc.title}
                  className="max-w-full rounded-lg shadow"
                />
              )}
              {isPdf && (
                <PdfViewer url={patientDoc.fileUrl} title={patientDoc.title} />
              )}
              {!isImage && !isPdf && (
                <div className="text-center py-8">
                  <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">Preview not available for this file type</p>
                  <a 
                    href={patientDoc.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Download file
                  </a>
                </div>
              )}
              {patientDoc.notes && (
                <div className="mt-4">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Notes</h3>
                  <p className="text-gray-600">{patientDoc.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (selectedPatient) {
    return (
      <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
        {/* Patient Header Bar */}
        <div className="bg-white dark:bg-gray-800 border-b shadow-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedPatient(null); setSelectedDocument(null); }}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div className="h-8 w-px bg-gray-300" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold">{selectedPatient.firstName} {selectedPatient.lastName}</h1>
                    {selectedPatient.urNumber && (
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">UR {selectedPatient.urNumber}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>DOB: {selectedPatient.dateOfBirth}</span>
                    {selectedPatient.phone && <span>{selectedPatient.phone}</span>}
                    {selectedPatient.allergies && (
                      <span className="text-red-600 font-medium">Allergies: {selectedPatient.allergies}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPatientInfo(true)}>
                <User className="w-4 h-4 mr-1" />
                Full Details
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleEdit(selectedPatient)}>
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - EMR Style Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Document List */}
          <div className="w-80 bg-white dark:bg-gray-800 border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 dark:text-gray-300">Documents ({allDocuments.length})</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsUploadDialogOpen(true)}
                className="h-7 px-2"
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {allDocuments.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No documents found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {allDocuments.map((doc) => (
                    <div
                      key={`${doc.type}-${doc.id}`}
                      className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedDocument?.type === doc.type && selectedDocument?.id === doc.id
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500'
                          : ''
                      }`}
                      onClick={() => setSelectedDocument({ type: doc.type, id: doc.id })}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded ${
                          doc.type === 'report' ? 'bg-green-100 text-green-600' :
                          doc.type === 'worksheet' ? 'bg-purple-100 text-purple-600' :
                          doc.type === 'digitalWorksheet' ? 'bg-orange-100 text-orange-600' :
                          doc.type === 'document' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {doc.type === 'report' ? <FileText className="w-4 h-4" /> :
                           doc.type === 'worksheet' ? <ClipboardList className="w-4 h-4" /> :
                           doc.type === 'digitalWorksheet' ? <ClipboardList className="w-4 h-4" /> :
                           doc.type === 'document' ? <File className="w-4 h-4" /> :
                           <Calendar className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{doc.title}</div>
                          <div className="text-xs text-gray-500">{doc.date}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {doc.type}
                            </Badge>
                            {doc.status === 'finalized' && (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                            {doc.status === 'draft' && (
                              <Clock className="w-3 h-3 text-yellow-500" />
                            )}
                            {doc.isAmended && (
                              <AlertCircle className="w-3 h-3 text-orange-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Document Preview */}
          <div className="flex-1 p-4 overflow-hidden bg-gray-50 dark:bg-gray-900">
            {renderDocumentPreview()}
          </div>
        </div>

        {/* Patient Info Modal */}
        <Dialog open={showPatientInfo} onOpenChange={setShowPatientInfo}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Patient Details
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{selectedPatient.firstName} {selectedPatient.lastName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {selectedPatient.urNumber && (
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded text-sm">UR {selectedPatient.urNumber}</span>
                  )}
                  {!selectedPatient.isActive && <Badge variant="secondary">Inactive</Badge>}
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>DOB: {selectedPatient.dateOfBirth}</span>
                </div>
                {selectedPatient.gender && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <User className="w-4 h-4" />
                    <span>Gender: {selectedPatient.gender}</span>
                  </div>
                )}
                {selectedPatient.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{selectedPatient.phone}</span>
                  </div>
                )}
                {selectedPatient.email && (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span>{selectedPatient.email}</span>
                    </div>
                    {portalStatus?.hasPortalAccess ? (
                      <Badge variant="outline" className="w-fit bg-green-50 text-green-700 border-green-200 gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Portal Access Active
                      </Badge>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-fit h-7 text-xs gap-1.5"
                        onClick={() => invitePortalMutation.mutate()}
                        disabled={invitePortalMutation.isPending}
                      >
                        <Mail className="w-3 h-3" />
                        {portalStatus?.invitePending ? "Resend Portal Invitation" : "Invite to Patient Portal"}
                        {invitePortalMutation.isPending && <Clock className="w-3 h-3 animate-spin" />}
                      </Button>
                    )}
                  </div>
                )}
                {(selectedPatient.address || selectedPatient.city) && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 mt-0.5" />
                    <span>
                      {selectedPatient.address && <div>{selectedPatient.address}</div>}
                      {selectedPatient.city && <div>{selectedPatient.city}, {selectedPatient.state} {selectedPatient.zipCode}</div>}
                    </span>
                  </div>
                )}
              </div>

              {selectedPatient.insuranceProvider && (
                <div className="pt-2 border-t">
                  <div className="text-sm font-medium">Insurance</div>
                  <div className="text-sm text-gray-600">{selectedPatient.insuranceProvider}</div>
                  {selectedPatient.insuranceId && (
                    <div className="text-sm text-gray-600">ID: {selectedPatient.insuranceId}</div>
                  )}
                </div>
              )}

              {selectedPatient.referringPhysician && (
                <div className="pt-2 border-t">
                  <div className="text-sm font-medium">Referring Physician</div>
                  <div className="text-sm text-gray-600">{selectedPatient.referringPhysician}</div>
                </div>
              )}

              {selectedPatient.allergies && (
                <div className="pt-2 border-t">
                  <div className="text-sm font-medium text-red-600">Allergies</div>
                  <div className="text-sm text-gray-600">{selectedPatient.allergies}</div>
                </div>
              )}

              {selectedPatient.medicalHistory && (
                <div className="pt-2 border-t">
                  <div className="text-sm font-medium">Medical History</div>
                  <div className="text-sm text-gray-600">{selectedPatient.medicalHistory}</div>
                </div>
              )}

              {selectedPatient.notes && (
                <div className="pt-2 border-t">
                  <div className="text-sm font-medium">Notes</div>
                  <div className="text-sm text-gray-600">{selectedPatient.notes}</div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Upload Document Dialog */}
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Document
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="docTitle">Document Title</Label>
                <Input
                  id="docTitle"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Request Form"
                />
              </div>
              <div>
                <Label htmlFor="docDate">Document Date</Label>
                <Input
                  id="docDate"
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="docFile">File</Label>
                <Input
                  id="docFile"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (uploadFile) {
                      uploadDocumentMutation.mutate({
                        file: uploadFile,
                        title: uploadTitle,
                        documentDate: uploadDate,
                      });
                    }
                  }}
                  disabled={!uploadFile || uploadDocumentMutation.isPending}
                >
                  {uploadDocumentMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patient Records</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage patient information and medical records</p>
          </div>
          <Button onClick={() => { resetForm(); setEditingPatient(null); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Patient
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search patients by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : patients.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No patients found</h3>
              <p className="text-gray-600 mt-1">Add your first patient to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {patients.filter(p => p.isActive !== false).map((patient) => (
              <Card 
                key={patient.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedPatient(patient)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-lg">{patient.firstName} {patient.lastName}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                          {patient.urNumber && (
                            <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-xs">UR {patient.urNumber}</span>
                          )}
                          <span>DOB: {patient.dateOfBirth}</span>
                          {patient.phone && <span>{patient.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-gray-500">
                        {patient.insuranceProvider && <div>{patient.insuranceProvider}</div>}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleEdit(patient); }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPatient ? "Edit Patient" : "Add New Patient"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* UR Number */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex-1">
                  <Label htmlFor="urNumber" className="text-blue-800 font-semibold">UR Number</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="urNumber"
                      className="font-mono font-bold text-blue-700 border-blue-300 bg-white w-40"
                      placeholder={editingPatient ? "—" : "Auto-generated"}
                      value={formData.urNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, urNumber: e.target.value }))}
                    />
                    {!editingPatient && (
                      <span className="text-xs text-blue-600">Leave blank to auto-assign</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="zipCode">Zip Code</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                  <Input
                    id="insuranceProvider"
                    value={formData.insuranceProvider}
                    onChange={(e) => setFormData(prev => ({ ...prev, insuranceProvider: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="insuranceId">Insurance ID</Label>
                  <Input
                    id="insuranceId"
                    value={formData.insuranceId}
                    onChange={(e) => setFormData(prev => ({ ...prev, insuranceId: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="referringPhysician">Referring Physician</Label>
                  <Input
                    id="referringPhysician"
                    value={formData.referringPhysician}
                    onChange={(e) => setFormData(prev => ({ ...prev, referringPhysician: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="allergies">Allergies</Label>
                  <Input
                    id="allergies"
                    value={formData.allergies}
                    onChange={(e) => setFormData(prev => ({ ...prev, allergies: e.target.value }))}
                    placeholder="List any known allergies"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="medicalHistory">Medical History</Label>
                  <Textarea
                    id="medicalHistory"
                    value={formData.medicalHistory}
                    onChange={(e) => setFormData(prev => ({ ...prev, medicalHistory: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); setEditingPatient(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingPatient ? "Update" : "Add Patient"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
