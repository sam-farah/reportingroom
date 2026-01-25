import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, Plus, Clock, User, Phone, Mail, Calendar as CalendarIcon, X, Edit, Trash2, Search, UserCheck } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, addMonths, subMonths, addWeeks, subWeeks, isSameMonth, isSameDay, isSameWeek, parseISO, getHours, getMinutes } from "date-fns";
import type { Appointment, Physician, Sonographer, Patient } from "@shared/schema";

const SCAN_TYPES = [
  "Lower Limb Venous",
  "Carotid Duplex", 
  "Abdominal Aorta",
  "Upper Limb Venous",
  "Upper Limb Arterial",
  "Lower Limb Arterial",
  "Renal Duplex",
  "Mesenteric Duplex",
  "Post Endovenous Intervention",
  "Other"
];

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  completed: "bg-gray-100 text-gray-800 border-gray-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-orange-100 text-orange-800 border-orange-200",
};

type ViewMode = "day" | "week" | "month";

export default function Calendar() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null);

  const [formData, setFormData] = useState({
    patientName: "",
    patientDob: "",
    patientPhone: "",
    patientEmail: "",
    appointmentDate: "",
    appointmentTime: "09:00",
    duration: "30",
    scanTypes: [] as string[],
    physicianId: "",
    sonographerId: "",
    notes: "",
    status: "scheduled",
    patientId: null as number | null,
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientResults, setShowPatientResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const { data: searchedPatients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", "search", patientSearch],
    queryFn: async () => {
      if (!patientSearch || patientSearch.length < 2) return [];
      const response = await fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: patientSearch.length >= 2,
  });

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setFormData(prev => ({
      ...prev,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientDob: patient.dateOfBirth,
      patientPhone: patient.phone || "",
      patientEmail: patient.email || "",
      patientId: patient.id,
    }));
    setPatientSearch("");
    setShowPatientResults(false);
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
    setFormData(prev => ({
      ...prev,
      patientName: "",
      patientDob: "",
      patientPhone: "",
      patientEmail: "",
      patientId: null,
    }));
  };

  const getDateRange = () => {
    switch (viewMode) {
      case "day":
        return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
      case "week":
        return { start: startOfDay(startOfWeek(currentDate)), end: endOfDay(endOfWeek(currentDate)) };
      case "month":
      default:
        return { start: startOfDay(startOfWeek(startOfMonth(currentDate))), end: endOfDay(endOfWeek(endOfMonth(currentDate))) };
    }
  };
  
  const HOURS = Array.from({ length: 12 }, (_, i) => i + 7);
  
  const getAppointmentPosition = (apt: Appointment) => {
    const aptDate = new Date(apt.appointmentDate);
    const hours = getHours(aptDate);
    const minutes = getMinutes(aptDate);
    const top = ((hours - 7) * 60 + minutes) * (60 / 60);
    const height = apt.duration * (60 / 60);
    return { top, height };
  };

  const { start: startDate, end: endDate } = getDateRange();

  const navigatePrevious = () => {
    switch (viewMode) {
      case "day":
        setCurrentDate(addDays(currentDate, -1));
        break;
      case "week":
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(subMonths(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (viewMode) {
      case "day":
        setCurrentDate(addDays(currentDate, 1));
        break;
      case "week":
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(addMonths(currentDate, 1));
        break;
    }
  };

  const getHeaderTitle = () => {
    switch (viewMode) {
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "week":
        return `${format(startOfWeek(currentDate), "MMM d")} - ${format(endOfWeek(currentDate), "MMM d, yyyy")}`;
      case "month":
      default:
        return format(currentDate, "MMMM yyyy");
    }
  };

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/appointments?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch appointments");
      return response.json();
    },
  });

  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
  });

  const { data: sonographers = [] } = useQuery<Sonographer[]>({
    queryKey: ["/api/sonographers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/appointments", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Success", description: "Appointment created successfully" });
      resetForm();
      setIsBookingDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create appointment", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest(`/api/appointments/${id}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Success", description: "Appointment updated successfully" });
      resetForm();
      setEditingAppointment(null);
      setIsBookingDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update appointment", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/appointments/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Success", description: "Appointment deleted successfully" });
      setViewingAppointment(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete appointment", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      patientName: "",
      patientDob: "",
      patientPhone: "",
      patientEmail: "",
      appointmentDate: "",
      appointmentTime: "09:00",
      duration: "30",
      scanTypes: [],
      physicianId: "",
      sonographerId: "",
      notes: "",
      status: "scheduled",
      patientId: null,
    });
    setSelectedPatient(null);
    setPatientSearch("");
  };

  const handleScanTypeToggle = (scanType: string) => {
    setFormData(prev => ({
      ...prev,
      scanTypes: prev.scanTypes.includes(scanType)
        ? prev.scanTypes.filter(t => t !== scanType)
        : [...prev.scanTypes, scanType]
    }));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setFormData(prev => ({
      ...prev,
      appointmentDate: format(date, "yyyy-MM-dd"),
    }));
    setEditingAppointment(null);
    setIsBookingDialogOpen(true);
  };

  const handleEditAppointment = (appointment: Appointment) => {
    const appointmentDate = new Date(appointment.appointmentDate);
    const scanTypesArray = appointment.scanType ? appointment.scanType.split(", ") : [];
    setFormData({
      patientName: appointment.patientName,
      patientDob: appointment.patientDob || "",
      patientPhone: appointment.patientPhone || "",
      patientEmail: appointment.patientEmail || "",
      appointmentDate: format(appointmentDate, "yyyy-MM-dd"),
      appointmentTime: format(appointmentDate, "HH:mm"),
      duration: String(appointment.duration),
      scanTypes: scanTypesArray,
      physicianId: appointment.physicianId ? String(appointment.physicianId) : "",
      sonographerId: appointment.sonographerId ? String(appointment.sonographerId) : "",
      notes: appointment.notes || "",
      status: appointment.status,
      patientId: appointment.patientId || null,
    });
    setSelectedPatient(null);
    setEditingAppointment(appointment);
    setViewingAppointment(null);
    setIsBookingDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const appointmentDateTime = new Date(`${formData.appointmentDate}T${formData.appointmentTime}`);
    
    const data = {
      patientName: formData.patientName,
      patientDob: formData.patientDob || null,
      patientPhone: formData.patientPhone || null,
      patientEmail: formData.patientEmail || null,
      patientId: formData.patientId,
      appointmentDate: appointmentDateTime.toISOString(),
      duration: parseInt(formData.duration),
      scanType: formData.scanTypes.length > 0 ? formData.scanTypes.join(", ") : null,
      physicianId: formData.physicianId ? parseInt(formData.physicianId) : null,
      sonographerId: formData.sonographerId ? parseInt(formData.sonographerId) : null,
      notes: formData.notes || null,
      status: formData.status,
    };

    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt => 
      isSameDay(new Date(apt.appointmentDate), date)
    );
  };

  const renderCalendarDays = () => {
    const days = [];
    let day = startDate;

    while (day <= endDate) {
      const currentDay = day;
      const dayAppointments = getAppointmentsForDate(currentDay);
      const isCurrentMonth = isSameMonth(currentDay, currentDate);
      const isToday = isSameDay(currentDay, new Date());

      days.push(
        <div
          key={currentDay.toISOString()}
          className={`min-h-[120px] border border-gray-200 p-1 cursor-pointer hover:bg-gray-50 transition-colors ${
            !isCurrentMonth ? "bg-gray-50 text-gray-400" : "bg-white"
          } ${isToday ? "ring-2 ring-blue-500 ring-inset" : ""}`}
          onClick={() => handleDateClick(currentDay)}
        >
          <div className={`text-sm font-medium mb-1 ${isToday ? "text-blue-600" : ""}`}>
            {format(currentDay, "d")}
          </div>
          <div className="space-y-1">
            {dayAppointments.slice(0, 3).map((apt) => (
              <div
                key={apt.id}
                className={`text-xs p-1 rounded truncate cursor-pointer border ${STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingAppointment(apt);
                }}
              >
                {format(new Date(apt.appointmentDate), "HH:mm")} - {apt.patientName}
              </div>
            ))}
            {dayAppointments.length > 3 && (
              <div className="text-xs text-gray-500 pl-1">
                +{dayAppointments.length - 3} more
              </div>
            )}
          </div>
        </div>
      );

      day = addDays(day, 1);
    }

    return days;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-gray-600 mb-4">Please log in to access the calendar.</p>
              <Button onClick={() => window.location.href = "/api/login"}>
                Log In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appointment Calendar</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage patient bookings and appointments</p>
          </div>
          <Button onClick={() => { resetForm(); setEditingAppointment(null); setIsBookingDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Booking
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={navigatePrevious}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={navigateNext}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <CardTitle className="text-xl">
                {getHeaderTitle()}
              </CardTitle>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button
                  variant={viewMode === "day" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("day")}
                  className="text-xs"
                >
                  Day
                </Button>
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("week")}
                  className="text-xs"
                >
                  Week
                </Button>
                <Button
                  variant={viewMode === "month" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("month")}
                  className="text-xs"
                >
                  Month
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === "day" && (
              <div className="min-h-[500px]">
                <div className="text-center font-semibold text-gray-600 bg-gray-100 p-2 border border-gray-200 mb-2">
                  {format(currentDate, "EEEE, MMMM d")}
                </div>
                <div className="flex border border-gray-200">
                  <div className="w-20 flex-shrink-0 bg-gray-50">
                    {HOURS.map((hour) => (
                      <div key={hour} className="h-[60px] border-b border-gray-200 pr-2 text-right text-sm text-gray-500 pt-1">
                        {format(new Date().setHours(hour, 0), "h a")}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 relative">
                    {HOURS.map((hour) => (
                      <div 
                        key={hour} 
                        className="h-[60px] border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          const clickedDate = new Date(currentDate);
                          clickedDate.setHours(hour, 0, 0, 0);
                          setFormData(prev => ({
                            ...prev,
                            appointmentDate: format(currentDate, "yyyy-MM-dd"),
                            appointmentTime: format(clickedDate, "HH:mm"),
                          }));
                          setEditingAppointment(null);
                          setIsBookingDialogOpen(true);
                        }}
                      />
                    ))}
                    {getAppointmentsForDate(currentDate).map((apt) => {
                      const { top, height } = getAppointmentPosition(apt);
                      return (
                        <div
                          key={apt.id}
                          className={`absolute left-1 right-1 p-2 rounded cursor-pointer border overflow-hidden ${STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled}`}
                          style={{ top: `${top}px`, height: `${Math.max(height, 30)}px` }}
                          onClick={() => setViewingAppointment(apt)}
                        >
                          <div className="text-sm font-medium truncate">{apt.patientName}</div>
                          <div className="text-xs truncate">{format(new Date(apt.appointmentDate), "h:mm a")} - {apt.scanType}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {viewMode === "week" && (
              <div className="min-h-[500px] overflow-x-auto">
                <div className="flex">
                  <div className="w-16 flex-shrink-0"></div>
                  <div className="flex-1 grid grid-cols-7">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => {
                      const weekDay = addDays(startOfWeek(currentDate), index);
                      return (
                        <div key={day} className="p-2 text-center font-semibold text-gray-600 bg-gray-100 border border-gray-200">
                          <div>{day}</div>
                          <div className={`text-lg ${isSameDay(weekDay, new Date()) ? "text-blue-600 font-bold" : ""}`}>
                            {format(weekDay, "d")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex">
                  <div className="w-16 flex-shrink-0">
                    {HOURS.map((hour) => (
                      <div key={hour} className="h-[60px] border-b border-gray-200 text-xs text-gray-500 text-right pr-2 pt-1">
                        {format(new Date().setHours(hour, 0), "h a")}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 grid grid-cols-7">
                    {Array.from({ length: 7 }).map((_, dayIndex) => {
                      const weekDay = addDays(startOfWeek(currentDate), dayIndex);
                      const dayAppointments = getAppointmentsForDate(weekDay);
                      return (
                        <div
                          key={dayIndex}
                          className={`relative border-r border-gray-200 ${
                            isSameDay(weekDay, new Date()) ? "bg-blue-50/30" : ""
                          }`}
                        >
                          {HOURS.map((hour) => (
                            <div
                              key={hour}
                              className="h-[60px] border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                              onClick={() => {
                                const clickedDate = new Date(weekDay);
                                clickedDate.setHours(hour, 0, 0, 0);
                                setSelectedDate(clickedDate);
                                setFormData(prev => ({
                                  ...prev,
                                  appointmentDate: format(clickedDate, "yyyy-MM-dd"),
                                  appointmentTime: format(clickedDate, "HH:mm"),
                                }));
                                setEditingAppointment(null);
                                setIsBookingDialogOpen(true);
                              }}
                            />
                          ))}
                          {dayAppointments.map((apt) => {
                            const { top, height } = getAppointmentPosition(apt);
                            if (top < 0 || top > HOURS.length * 60) return null;
                            return (
                              <div
                                key={apt.id}
                                className={`absolute left-0 right-0 mx-0.5 p-1 rounded text-xs cursor-pointer border overflow-hidden ${STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${Math.max(height, 20)}px`,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingAppointment(apt);
                                }}
                              >
                                <div className="font-medium truncate">{apt.patientName}</div>
                                <div className="text-[10px] truncate">{format(new Date(apt.appointmentDate), "h:mm a")}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {viewMode === "month" && (
              <div className="grid grid-cols-7 gap-0">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="p-2 text-center font-semibold text-gray-600 bg-gray-100 border border-gray-200">
                    {day}
                  </div>
                ))}
                {renderCalendarDays()}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAppointment ? "Edit Appointment" : "New Appointment"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Search Existing Patient</Label>
                  {selectedPatient ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mt-1">
                      <UserCheck className="w-5 h-5 text-green-600" />
                      <div className="flex-1">
                        <div className="font-medium text-green-800">
                          {selectedPatient.firstName} {selectedPatient.lastName}
                        </div>
                        <div className="text-sm text-green-600">
                          DOB: {selectedPatient.dateOfBirth}
                          {selectedPatient.phone && ` | ${selectedPatient.phone}`}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={handleClearPatient}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Type patient name to search..."
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setShowPatientResults(true);
                        }}
                        onFocus={() => setShowPatientResults(true)}
                        className="pl-10"
                      />
                      {showPatientResults && patientSearch.length >= 2 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {searchedPatients.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">No patients found</div>
                          ) : (
                            searchedPatients.map((patient) => (
                              <div
                                key={patient.id}
                                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                onClick={() => handleSelectPatient(patient)}
                              >
                                <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                                <div className="text-sm text-gray-500">
                                  DOB: {patient.dateOfBirth}
                                  {patient.phone && ` | ${patient.phone}`}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Search for existing patient or enter details manually below</p>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="patientName">Patient Name *</Label>
                  <Input
                    id="patientName"
                    value={formData.patientName}
                    onChange={(e) => setFormData(prev => ({ ...prev, patientName: e.target.value, patientId: null }))}
                    required
                    disabled={!!selectedPatient}
                  />
                </div>
                <div>
                  <Label htmlFor="patientDob">Date of Birth</Label>
                  <Input
                    id="patientDob"
                    type="date"
                    value={formData.patientDob}
                    onChange={(e) => setFormData(prev => ({ ...prev, patientDob: e.target.value }))}
                    disabled={!!selectedPatient}
                  />
                </div>
                <div>
                  <Label htmlFor="patientPhone">Phone</Label>
                  <Input
                    id="patientPhone"
                    value={formData.patientPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, patientPhone: e.target.value }))}
                    disabled={!!selectedPatient}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="patientEmail">Email</Label>
                  <Input
                    id="patientEmail"
                    type="email"
                    value={formData.patientEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, patientEmail: e.target.value }))}
                    disabled={!!selectedPatient}
                  />
                </div>
                <div>
                  <Label htmlFor="appointmentDate">Appointment Date *</Label>
                  <Input
                    id="appointmentDate"
                    type="date"
                    value={formData.appointmentDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, appointmentDate: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="appointmentTime">Time *</Label>
                  <Input
                    id="appointmentTime"
                    type="time"
                    value={formData.appointmentTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, appointmentTime: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Select value={formData.duration} onValueChange={(value) => setFormData(prev => ({ ...prev, duration: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Scan Type(s)</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-lg bg-gray-50">
                    {SCAN_TYPES.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`scan-${type}`}
                          checked={formData.scanTypes.includes(type)}
                          onCheckedChange={() => handleScanTypeToggle(type)}
                        />
                        <label
                          htmlFor={`scan-${type}`}
                          className="text-sm cursor-pointer"
                        >
                          {type}
                        </label>
                      </div>
                    ))}
                  </div>
                  {formData.scanTypes.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: {formData.scanTypes.join(", ")}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="physicianId">Physician</Label>
                  <Select value={formData.physicianId} onValueChange={(value) => setFormData(prev => ({ ...prev, physicianId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select physician" />
                    </SelectTrigger>
                    <SelectContent>
                      {(physicians as Physician[]).filter(p => p.isActive).map((physician) => (
                        <SelectItem key={physician.id} value={String(physician.id)}>{physician.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="sonographerId">Sonographer</Label>
                  <Select value={formData.sonographerId} onValueChange={(value) => setFormData(prev => ({ ...prev, sonographerId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sonographer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sonographers as Sonographer[]).filter(s => s.isActive).map((sonographer) => (
                        <SelectItem key={sonographer.id} value={String(sonographer.id)}>{sonographer.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editingAppointment && (
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="no_show">No Show</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setIsBookingDialogOpen(false); resetForm(); setEditingAppointment(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingAppointment ? "Update" : "Create Booking"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewingAppointment} onOpenChange={(open) => !open && setViewingAppointment(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Appointment Details</DialogTitle>
            </DialogHeader>
            {viewingAppointment && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-gray-500" />
                  <span className="font-semibold">{viewingAppointment.patientName}</span>
                  <span className={`ml-auto px-2 py-1 text-xs rounded-full ${STATUS_COLORS[viewingAppointment.status]}`}>
                    {viewingAppointment.status.replace("_", " ")}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-gray-500" />
                    <span>{format(new Date(viewingAppointment.appointmentDate), "PPP")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span>{format(new Date(viewingAppointment.appointmentDate), "p")} ({viewingAppointment.duration} min)</span>
                  </div>
                  {viewingAppointment.patientPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <span>{viewingAppointment.patientPhone}</span>
                    </div>
                  )}
                  {viewingAppointment.patientEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span>{viewingAppointment.patientEmail}</span>
                    </div>
                  )}
                </div>

                {viewingAppointment.scanType && (
                  <div className="text-sm">
                    <span className="font-medium">Scan Type:</span> {viewingAppointment.scanType}
                  </div>
                )}

                {viewingAppointment.notes && (
                  <div className="text-sm">
                    <span className="font-medium">Notes:</span>
                    <p className="text-gray-600 mt-1">{viewingAppointment.notes}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" size="sm" onClick={() => handleEditAppointment(viewingAppointment)}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this appointment?")) {
                        deleteMutation.mutate(viewingAppointment.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
