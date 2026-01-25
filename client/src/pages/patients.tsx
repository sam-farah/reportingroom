import { useState } from "react";
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
import { Plus, Search, User, Phone, Mail, Calendar, FileText, ClipboardList, Edit, Trash2, ChevronLeft, MapPin, File, Clock, CheckCircle, AlertCircle, X } from "lucide-react";
import { format } from "date-fns";
import type { Patient, Worksheet, Report, Appointment } from "@shared/schema";

export default function Patients() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<{ type: 'report' | 'worksheet' | 'appointment'; id: number } | null>(null);
  const [showPatientInfo, setShowPatientInfo] = useState(false);

  const [formData, setFormData] = useState({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Success", description: "Patient updated successfully" });
      resetForm();
      setEditingPatient(null);
      setIsDialogOpen(false);
      if (selectedPatient) {
        setSelectedPatient(null);
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
    ...patientAppointments.map(a => ({
      type: 'appointment' as const,
      id: a.id,
      title: a.scanType || 'Appointment',
      date: a.appointmentDate ? format(new Date(a.appointmentDate), "yyyy-MM-dd") : '',
      status: a.status || 'scheduled',
      isAmended: false,
      data: a,
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
    if (selectedDocument.type === 'appointment') {
      return patientAppointments.find(a => a.id === selectedDocument.id);
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
                <div className="mt-4">
                  <img 
                    src={`/api/worksheets/${worksheet.id}/image`} 
                    alt="Worksheet" 
                    className="max-w-full rounded border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
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
                  <h1 className="text-lg font-bold">{selectedPatient.firstName} {selectedPatient.lastName}</h1>
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
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700">
              <h2 className="font-semibold text-gray-700 dark:text-gray-300">Documents ({allDocuments.length})</h2>
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
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {doc.type === 'report' ? <FileText className="w-4 h-4" /> :
                           doc.type === 'worksheet' ? <ClipboardList className="w-4 h-4" /> :
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
                {!selectedPatient.isActive && (
                  <Badge variant="secondary" className="mt-1">Inactive</Badge>
                )}
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
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span>{selectedPatient.email}</span>
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
                        <div className="text-sm text-gray-600">
                          DOB: {patient.dateOfBirth}
                          {patient.phone && ` | ${patient.phone}`}
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
