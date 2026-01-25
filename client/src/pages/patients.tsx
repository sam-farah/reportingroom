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
import { Plus, Search, User, Phone, Mail, Calendar, FileText, ClipboardList, Edit, Trash2, ChevronLeft, MapPin } from "lucide-react";
import { format } from "date-fns";
import type { Patient, Worksheet, Report, Appointment } from "@shared/schema";

export default function Patients() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

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

  if (selectedPatient) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Button variant="ghost" className="mb-4" onClick={() => setSelectedPatient(null)}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Patient List
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Patient Details
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(selectedPatient)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Patient Records</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="appointments">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="appointments">
                      Appointments ({patientAppointments.length})
                    </TabsTrigger>
                    <TabsTrigger value="worksheets">
                      Worksheets ({patientWorksheets.length})
                    </TabsTrigger>
                    <TabsTrigger value="reports">
                      Reports ({patientReports.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="appointments" className="mt-4">
                    {patientAppointments.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">No appointments found</div>
                    ) : (
                      <div className="space-y-2">
                        {patientAppointments.map((apt) => (
                          <div key={apt.id} className="p-3 border rounded-lg flex justify-between items-center">
                            <div>
                              <div className="font-medium">{format(new Date(apt.appointmentDate), "PPP p")}</div>
                              <div className="text-sm text-gray-600">{apt.scanType}</div>
                            </div>
                            <Badge variant={apt.status === "completed" ? "secondary" : apt.status === "cancelled" ? "destructive" : "default"}>
                              {apt.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="worksheets" className="mt-4">
                    {patientWorksheets.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">No worksheets found</div>
                    ) : (
                      <div className="space-y-2">
                        {patientWorksheets.map((ws) => (
                          <div key={ws.id} className="p-3 border rounded-lg flex justify-between items-center">
                            <div>
                              <div className="font-medium">{ws.originalName}</div>
                              <div className="text-sm text-gray-600">
                                Uploaded: {ws.uploadedAt ? format(new Date(ws.uploadedAt), "PPP") : "N/A"}
                              </div>
                            </div>
                            <Badge variant={ws.ocrProcessed ? "default" : "secondary"}>
                              {ws.ocrProcessed ? "Processed" : "Pending"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="reports" className="mt-4">
                    {patientReports.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">No reports found</div>
                    ) : (
                      <div className="space-y-2">
                        {patientReports.map((report) => (
                          <div key={report.id} className="p-3 border rounded-lg flex justify-between items-center">
                            <div>
                              <div className="font-medium">{report.studyType}</div>
                              <div className="text-sm text-gray-600">
                                {report.examDate} | Generated: {format(new Date(report.generatedAt), "PPP")}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {report.isFinalized && <Badge variant="default">Finalized</Badge>}
                              {report.isAmended && <Badge variant="secondary">Amended</Badge>}
                              {report.isDraft && <Badge variant="outline">Draft</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
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
