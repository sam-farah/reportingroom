import { useState, useMemo } from "react";
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
import { ChevronLeft, ChevronRight, Plus, Clock, User, Phone, Mail, Calendar as CalendarIcon, X, Edit, Trash2, Search, UserCheck, Undo2, DollarSign, FolderOpen, UserPlus, CalendarX2, Repeat, CalendarClock } from "lucide-react";
import { capitalizeWords } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, addMonths, subMonths, addWeeks, subWeeks, isSameMonth, isSameDay, isSameWeek, parseISO, getHours, getMinutes, subDays } from "date-fns";
import type { Appointment, Physician, Sonographer, Patient, ScanDurationSetting, CalendarEvent } from "@shared/schema";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";

const EVENT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  purple: { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300", dot: "bg-purple-400" },
  teal:   { bg: "bg-teal-100",   text: "text-teal-900",   border: "border-teal-300",   dot: "bg-teal-400" },
  orange: { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-300", dot: "bg-orange-400" },
  rose:   { bg: "bg-rose-100",   text: "text-rose-900",   border: "border-rose-300",   dot: "bg-rose-400" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-900", border: "border-indigo-300", dot: "bg-indigo-400" },
  amber:  { bg: "bg-amber-100",  text: "text-amber-900",  border: "border-amber-300",  dot: "bg-amber-400" },
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  checked_in: "bg-green-200 text-green-900 border-green-400",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  completed: "bg-gray-100 text-gray-800 border-gray-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-orange-100 text-orange-800 border-orange-200",
};

type ViewMode = "day" | "week" | "month";

export default function Calendar({ onOpenPatient }: { onOpenPatient?: (patientId: number) => void }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null);
  const [draggingAppointment, setDraggingAppointment] = useState<Appointment | null>(null);
  const [resizingAppointment, setResizingAppointment] = useState<{ apt: Appointment; edge: "top" | "bottom" } | null>(null);

  const [formData, setFormData] = useState({
    patientName: "",
    patientDob: "",
    patientPhone: "",
    patientEmail: "",
    appointmentDate: "",
    appointmentTime: "09:00",
    duration: "30",
    scanTypes: [] as string[],
    laterality: {} as Record<string, "unilateral" | "bilateral">,
    physicianId: "",
    sonographerId: "",
    notes: "",
    status: "scheduled",
    isInvoiced: false,
    patientId: null as number | null,
  });

  const { data: scanDurations = [] } = useQuery<ScanDurationSetting[]>({
    queryKey: ["/api/scan-durations"],
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientResults, setShowPatientResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({ firstName: "", lastName: "", dateOfBirth: "", phone: "" });

  // Calendar events state
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    color: "purple",
    recurrence: "none",
    recurrenceEndDate: "",
    notes: "",
  });

  // Hover tooltip state
  const [tooltip, setTooltip] = useState<{ apt: Appointment; x: number; y: number } | null>(null);

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
  
  const START_HOUR = 7;
  const SLOT_COUNT = 24;
  const SLOT_HEIGHT = 40;
  const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => ({
    hour: START_HOUR + Math.floor(i / 2),
    minute: (i % 2) * 30,
  }));
  
  const getAppointmentPosition = (apt: Appointment) => {
    const aptDate = new Date(apt.appointmentDate);
    const hours = getHours(aptDate);
    const minutes = getMinutes(aptDate);
    const top = ((hours - START_HOUR) * 2 + minutes / 30) * SLOT_HEIGHT;
    const height = (apt.duration / 30) * SLOT_HEIGHT;
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
    refetchInterval: 30000,
  });

  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
  });

  const { data: sonographers = [] } = useQuery<Sonographer[]>({
    queryKey: ["/api/sonographers"],
  });

  // Fetch events over a wide rolling window so recurrences are visible
  const eventsStart = subDays(startDate, 365);
  const eventsEnd = addMonths(endDate, 12);
  const { data: rawCalendarEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events", eventsStart.toISOString(), eventsEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/calendar-events?startDate=${eventsStart.toISOString()}&endDate=${eventsEnd.toISOString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch calendar events");
      return response.json();
    },
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

  const createPatientMutation = useMutation({
    mutationFn: async (data: any): Promise<Patient> => {
      const res = await apiRequest("/api/patients", "POST", data);
      return res.json();
    },
    onSuccess: (patient: Patient) => {
      handleSelectPatient(patient);
      setIsCreatingPatient(false);
      setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", phone: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Patient file created", description: `${patient.firstName} ${patient.lastName} has been registered.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create patient file.", variant: "destructive" });
    },
  });

  // Calendar event CRUD mutations
  const createEventMutation = useMutation({
    mutationFn: async (data: any): Promise<CalendarEvent> => {
      const res = await apiRequest("/api/calendar-events", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setIsEventDialogOpen(false);
      toast({ title: "Event created" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create event", variant: "destructive" }),
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }): Promise<CalendarEvent> => {
      const res = await apiRequest(`/api/calendar-events/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setIsEventDialogOpen(false);
      setEditingEvent(null);
      toast({ title: "Event updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update event", variant: "destructive" }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/calendar-events/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setViewingEvent(null);
      toast({ title: "Event deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete event", variant: "destructive" }),
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
      laterality: {},
      physicianId: "",
      sonographerId: "",
      notes: "",
      status: "scheduled",
      isInvoiced: false,
      patientId: null,
    });
    setSelectedPatient(null);
    setPatientSearch("");
    setIsCreatingPatient(false);
    setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", phone: "" });
  };

  const calcDuration = (scanTypes: string[], laterality: Record<string, "unilateral" | "bilateral">): string => {
    if (scanTypes.length === 0 || scanDurations.length === 0) return "30";
    let total = 0;
    for (const st of scanTypes) {
      const setting = scanDurations.find(s => s.scanType === st && s.isEnabled);
      if (!setting) { total += 30; continue; }
      if (setting.hasLaterality) {
        const lat = laterality[st] ?? "bilateral";
        total += lat === "unilateral"
          ? (setting.unilateralDuration ?? 30)
          : (setting.bilateralDuration ?? 45);
      } else {
        total += setting.bilateralDuration ?? 30;
      }
    }
    return String(total);
  };

  const handleScanTypeToggle = (scanType: string) => {
    setFormData(prev => {
      const nextTypes = prev.scanTypes.includes(scanType)
        ? prev.scanTypes.filter(t => t !== scanType)
        : [...prev.scanTypes, scanType];
      const nextLaterality = { ...prev.laterality };
      if (!nextTypes.includes(scanType)) delete nextLaterality[scanType];
      return {
        ...prev,
        scanTypes: nextTypes,
        laterality: nextLaterality,
        duration: calcDuration(nextTypes, nextLaterality),
      };
    });
  };

  const handleLateralityChange = (scanType: string, lat: "unilateral" | "bilateral") => {
    setFormData(prev => {
      const nextLaterality = { ...prev.laterality, [scanType]: lat };
      return {
        ...prev,
        laterality: nextLaterality,
        duration: calcDuration(prev.scanTypes, nextLaterality),
      };
    });
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

  const handleDragStart = (e: React.DragEvent, appointment: Appointment) => {
    setDraggingAppointment(appointment);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(appointment.id));
  };

  const handleDragEnd = () => {
    setDraggingAppointment(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date, targetHour: number, targetMinute: number = 0) => {
    e.preventDefault();
    if (!draggingAppointment) return;

    const newDateTime = new Date(targetDate);
    newDateTime.setHours(targetHour, targetMinute, 0, 0);

    updateMutation.mutate({
      id: draggingAppointment.id,
      data: {
        patientName: draggingAppointment.patientName,
        patientDob: draggingAppointment.patientDob,
        patientPhone: draggingAppointment.patientPhone,
        patientEmail: draggingAppointment.patientEmail,
        patientId: draggingAppointment.patientId,
        appointmentDate: newDateTime.toISOString(),
        duration: draggingAppointment.duration,
        scanType: draggingAppointment.scanType,
        physicianId: draggingAppointment.physicianId,
        sonographerId: draggingAppointment.sonographerId,
        notes: draggingAppointment.notes,
        status: draggingAppointment.status,
      },
    });

    setDraggingAppointment(null);
  };

  const handleResizeStart = (e: React.MouseEvent, apt: Appointment, edge: "top" | "bottom") => {
    e.stopPropagation();
    e.preventDefault();
    setResizingAppointment({ apt, edge });
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
    };
    
    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      
      if (!resizingAppointment) return;
      
      const container = (upEvent.target as HTMLElement).closest(".relative");
      if (!container) {
        setResizingAppointment(null);
        return;
      }
      
      const rect = container.getBoundingClientRect();
      const y = upEvent.clientY - rect.top;
      const hour = Math.floor(y / 60) + 7;
      const minutes = Math.round((y % 60) / 15) * 15;
      
      const aptDate = new Date(resizingAppointment.apt.appointmentDate);
      
      if (resizingAppointment.edge === "top") {
        const newStartTime = new Date(aptDate);
        newStartTime.setHours(hour, minutes, 0, 0);
        const endTime = new Date(aptDate.getTime() + resizingAppointment.apt.duration * 60000);
        const newDuration = Math.max(15, Math.round((endTime.getTime() - newStartTime.getTime()) / 60000));
        
        updateMutation.mutate({
          id: resizingAppointment.apt.id,
          data: {
            patientName: resizingAppointment.apt.patientName,
            patientDob: resizingAppointment.apt.patientDob,
            patientPhone: resizingAppointment.apt.patientPhone,
            patientEmail: resizingAppointment.apt.patientEmail,
            patientId: resizingAppointment.apt.patientId,
            appointmentDate: newStartTime.toISOString(),
            duration: newDuration,
            scanType: resizingAppointment.apt.scanType,
            physicianId: resizingAppointment.apt.physicianId,
            sonographerId: resizingAppointment.apt.sonographerId,
            notes: resizingAppointment.apt.notes,
            status: resizingAppointment.apt.status,
          },
        });
      } else {
        const newEndHour = hour;
        const newEndMinutes = minutes;
        const startTime = aptDate;
        const endTime = new Date(aptDate);
        endTime.setHours(newEndHour, newEndMinutes, 0, 0);
        const newDuration = Math.max(15, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
        
        updateMutation.mutate({
          id: resizingAppointment.apt.id,
          data: {
            patientName: resizingAppointment.apt.patientName,
            patientDob: resizingAppointment.apt.patientDob,
            patientPhone: resizingAppointment.apt.patientPhone,
            patientEmail: resizingAppointment.apt.patientEmail,
            patientId: resizingAppointment.apt.patientId,
            appointmentDate: resizingAppointment.apt.appointmentDate,
            duration: newDuration,
            scanType: resizingAppointment.apt.scanType,
            physicianId: resizingAppointment.apt.physicianId,
            sonographerId: resizingAppointment.apt.sonographerId,
            notes: resizingAppointment.apt.notes,
            status: resizingAppointment.apt.status,
          },
        });
      }
      
      setResizingAppointment(null);
    };
    
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
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
      laterality: {},
      physicianId: appointment.physicianId ? String(appointment.physicianId) : "",
      sonographerId: appointment.sonographerId ? String(appointment.sonographerId) : "",
      notes: appointment.notes || "",
      status: appointment.status,
      isInvoiced: appointment.isInvoiced ?? false,
      patientId: appointment.patientId || null,
    });
    // Populate the patient card from appointment data so it displays correctly when editing
    if (appointment.patientName) {
      const parts = appointment.patientName.trim().split(/\s+/);
      setSelectedPatient({
        id: appointment.patientId ?? 0,
        firstName: parts[0] || appointment.patientName,
        lastName: parts.slice(1).join(" "),
        dateOfBirth: appointment.patientDob || "",
        phone: appointment.patientPhone || null,
        email: appointment.patientEmail || null,
        urNumber: null,
        clinicId: null, gender: null, address: null, city: null,
        state: null, zipCode: null, insuranceProvider: null, insuranceId: null,
        referringPhysician: null, medicalHistory: null, allergies: null,
        notes: null, createdAt: null,
      } as Patient);
    } else {
      setSelectedPatient(null);
    }
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
      isInvoiced: formData.isInvoiced,
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

  // Expand recurring events into instances visible within [rangeStart, rangeEnd]
  const expandEvents = (events: CalendarEvent[], rangeStart: Date, rangeEnd: Date) => {
    const result: Array<CalendarEvent & { instanceStart: Date; instanceEnd: Date }> = [];
    for (const event of events) {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      const duration = eventEnd.getTime() - eventStart.getTime();
      const recEndLimit = event.recurrenceEndDate ? new Date(event.recurrenceEndDate) : addMonths(rangeEnd, 0);

      if (event.recurrence === "none") {
        if (eventStart <= rangeEnd && eventEnd >= rangeStart) {
          result.push({ ...event, instanceStart: eventStart, instanceEnd: eventEnd });
        }
      } else {
        let current = new Date(eventStart);
        while (current <= rangeEnd && current <= recEndLimit) {
          const instanceEnd = new Date(current.getTime() + duration);
          if (instanceEnd >= rangeStart) {
            result.push({ ...event, instanceStart: new Date(current), instanceEnd });
          }
          if (event.recurrence === "weekly") current = addWeeks(current, 1);
          else if (event.recurrence === "monthly") current = addMonths(current, 1);
          else break;
        }
      }
    }
    return result;
  };

  const expandedEvents = useMemo(
    () => expandEvents(rawCalendarEvents, startDate, addMonths(endDate, 0)),
    [rawCalendarEvents, startDate, endDate]
  );

  const getEventsForDate = (date: Date) =>
    expandedEvents.filter(ev => isSameDay(ev.instanceStart, date));

  const getEventPosition = (startTime: Date, endTime: Date) => {
    const sh = getHours(startTime), sm = getMinutes(startTime);
    const eh = getHours(endTime),   em = getMinutes(endTime);
    const top = ((sh - START_HOUR) * 2 + sm / 30) * SLOT_HEIGHT;
    const endTop = ((eh - START_HOUR) * 2 + em / 30) * SLOT_HEIGHT;
    return { top, height: Math.max(endTop - top, SLOT_HEIGHT) };
  };

  const openNewEventDialog = (date?: Date) => {
    setEditingEvent(null);
    setEventForm({
      title: "",
      date: date ? format(date, "yyyy-MM-dd") : format(currentDate, "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "17:00",
      color: "purple",
      recurrence: "none",
      recurrenceEndDate: "",
      notes: "",
    });
    setIsEventDialogOpen(true);
  };

  const openEditEventDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    setEventForm({
      title: event.title,
      date: format(start, "yyyy-MM-dd"),
      startTime: format(start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      color: event.color,
      recurrence: event.recurrence,
      recurrenceEndDate: event.recurrenceEndDate ? format(new Date(event.recurrenceEndDate), "yyyy-MM-dd") : "",
      notes: event.notes || "",
    });
    setViewingEvent(null);
    setIsEventDialogOpen(true);
  };

  const handleEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = new Date(`${eventForm.date}T${eventForm.startTime}:00`);
    const endTime = new Date(`${eventForm.date}T${eventForm.endTime}:00`);
    const payload = {
      title: eventForm.title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      color: eventForm.color,
      recurrence: eventForm.recurrence,
      recurrenceEndDate: eventForm.recurrenceEndDate ? new Date(`${eventForm.recurrenceEndDate}T23:59:00`).toISOString() : null,
      notes: eventForm.notes || null,
    };
    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, data: payload });
    } else {
      createEventMutation.mutate(payload);
    }
  };

  const renderCalendarDays = () => {
    const days = [];
    let day = startDate;

    while (day <= endDate) {
      const currentDay = day;
      const dayAppointments = getAppointmentsForDate(currentDay);
      const dayEvents = getEventsForDate(currentDay);
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
            {dayEvents.map((ev) => {
              const colors = EVENT_COLORS[ev.color] || EVENT_COLORS.purple;
              return (
                <div
                  key={`ev-${ev.id}-${ev.instanceStart.toISOString()}`}
                  className={`text-xs p-1 rounded truncate cursor-pointer border flex items-center gap-1 ${colors.bg} ${colors.border} ${colors.text}`}
                  onClick={(e) => { e.stopPropagation(); setViewingEvent(ev); }}
                >
                  {ev.recurrence !== "none" && <Repeat className="w-2.5 h-2.5 flex-shrink-0" />}
                  <span className="truncate">{ev.title}</span>
                </div>
              );
            })}
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
      <div className="w-full px-4 py-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appointment Calendar</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage patient bookings and appointments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openNewEventDialog()}>
              <CalendarX2 className="w-4 h-4 mr-2" />
              Add Event
            </Button>
            <Button onClick={() => { resetForm(); setEditingAppointment(null); setIsBookingDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              New Booking
            </Button>
          </div>
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
              <div className="min-h-[700px]">
                <div className="text-center font-semibold text-gray-600 bg-gray-100 p-2 border border-gray-200 mb-2">
                  {format(currentDate, "EEEE, MMMM d")}
                </div>
                <div className="flex border border-gray-200">
                  <div className="w-20 flex-shrink-0 bg-gray-50">
                    {SLOTS.map((slot, i) => (
                      <div key={i} className={`border-b ${slot.minute !== 0 ? 'border-gray-400' : 'border-gray-100'} pr-2 text-right text-sm text-gray-500 pt-1`} style={{ height: `${SLOT_HEIGHT}px` }}>
                        {slot.minute === 0 ? format(new Date().setHours(slot.hour, 0), "h a") : ""}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 relative">
                    {SLOTS.map((slot, i) => (
                      <div 
                        key={i} 
                        className={`border-b ${slot.minute !== 0 ? 'border-gray-400' : 'border-gray-100 border-dashed'} hover:bg-gray-50 cursor-pointer transition-colors ${
                          draggingAppointment ? "hover:bg-blue-100" : ""
                        }`}
                        style={{ height: `${SLOT_HEIGHT}px` }}
                        onClick={() => {
                          const clickedDate = new Date(currentDate);
                          clickedDate.setHours(slot.hour, slot.minute, 0, 0);
                          setFormData(prev => ({
                            ...prev,
                            appointmentDate: format(currentDate, "yyyy-MM-dd"),
                            appointmentTime: format(clickedDate, "HH:mm"),
                          }));
                          setEditingAppointment(null);
                          setIsBookingDialogOpen(true);
                        }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, currentDate, slot.hour, slot.minute)}
                      />
                    ))}
                    {/* Calendar events layer (behind appointments) */}
                    {getEventsForDate(currentDate).map((ev) => {
                      const { top, height } = getEventPosition(ev.instanceStart, ev.instanceEnd);
                      const colors = EVENT_COLORS[ev.color] || EVENT_COLORS.purple;
                      return (
                        <div
                          key={`ev-${ev.id}-${ev.instanceStart.toISOString()}`}
                          className={`absolute left-1 right-1 rounded border opacity-80 cursor-pointer z-0 ${colors.bg} ${colors.border}`}
                          style={{ top: `${Math.max(top, 0)}px`, height: `${height}px` }}
                          onClick={() => setViewingEvent(ev)}
                        >
                          <div className={`p-2 text-xs font-medium ${colors.text} flex items-center gap-1`}>
                            {ev.recurrence !== "none" && <Repeat className="w-3 h-3 flex-shrink-0" />}
                            <span className="truncate">{ev.title}</span>
                          </div>
                        </div>
                      );
                    })}
                    {getAppointmentsForDate(currentDate).map((apt) => {
                      const { top, height } = getAppointmentPosition(apt);
                      return (
                        <div
                          key={apt.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, apt)}
                          onDragEnd={handleDragEnd}
                          className={`absolute left-1 right-1 rounded cursor-grab active:cursor-grabbing border overflow-hidden z-10 ${
                            apt.status === "cancelled"
                              ? "bg-gray-50 text-gray-400 border-gray-200 border-l-4 border-l-red-500 opacity-75"
                              : STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled
                          } ${draggingAppointment?.id === apt.id ? "opacity-50" : ""}`}
                          style={{ top: `${top}px`, height: `${Math.max(height, 30)}px` }}
                          onClick={() => setViewingAppointment(apt)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ apt, x: rect.right + 8, y: rect.top });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-10"
                            onMouseDown={(e) => handleResizeStart(e, apt, "top")}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="p-2 pt-2 pr-6">
                            <div className={`text-sm font-medium truncate ${apt.status === "cancelled" ? "line-through" : ""}`}>{apt.patientName}</div>
                            <div className="text-xs truncate">{format(new Date(apt.appointmentDate), "h:mm a")} - {apt.scanType}</div>
                          </div>
                          {apt.isInvoiced && (
                            <div className="absolute top-1 right-1 z-10">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                            </div>
                          )}
                          <div
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-10"
                            onMouseDown={(e) => handleResizeStart(e, apt, "bottom")}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {viewMode === "week" && (
              <div className="min-h-[700px] overflow-x-auto">
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
                    {SLOTS.map((slot, i) => (
                      <div key={i} className={`border-b ${slot.minute !== 0 ? 'border-gray-400' : 'border-gray-100'} text-xs text-gray-500 text-right pr-2 pt-1`} style={{ height: `${SLOT_HEIGHT}px` }}>
                        {slot.minute === 0 ? format(new Date().setHours(slot.hour, 0), "h a") : ""}
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
                          {SLOTS.map((slot, i) => (
                            <div
                              key={i}
                              className={`border-b ${slot.minute !== 0 ? 'border-gray-400' : 'border-gray-100 border-dashed'} cursor-pointer hover:bg-gray-50 transition-colors ${
                                draggingAppointment ? "hover:bg-blue-100" : ""
                              }`}
                              style={{ height: `${SLOT_HEIGHT}px` }}
                              onClick={() => {
                                const clickedDate = new Date(weekDay);
                                clickedDate.setHours(slot.hour, slot.minute, 0, 0);
                                setSelectedDate(clickedDate);
                                setFormData(prev => ({
                                  ...prev,
                                  appointmentDate: format(clickedDate, "yyyy-MM-dd"),
                                  appointmentTime: format(clickedDate, "HH:mm"),
                                }));
                                setEditingAppointment(null);
                                setIsBookingDialogOpen(true);
                              }}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, weekDay, slot.hour, slot.minute)}
                            />
                          ))}
                          {/* Calendar events behind appointments */}
                          {getEventsForDate(weekDay).map((ev) => {
                            const { top, height } = getEventPosition(ev.instanceStart, ev.instanceEnd);
                            const colors = EVENT_COLORS[ev.color] || EVENT_COLORS.purple;
                            return (
                              <div
                                key={`ev-${ev.id}-${ev.instanceStart.toISOString()}`}
                                className={`absolute left-0 right-0 mx-0.5 rounded border opacity-80 cursor-pointer z-0 ${colors.bg} ${colors.border}`}
                                style={{ top: `${Math.max(top, 0)}px`, height: `${height}px` }}
                                onClick={(e) => { e.stopPropagation(); setViewingEvent(ev); }}
                              >
                                <div className={`p-1 text-[10px] font-medium ${colors.text} flex items-center gap-0.5`}>
                                  {ev.recurrence !== "none" && <Repeat className="w-2.5 h-2.5 flex-shrink-0" />}
                                  <span className="truncate">{ev.title}</span>
                                </div>
                              </div>
                            );
                          })}
                          {dayAppointments.map((apt) => {
                            const { top, height } = getAppointmentPosition(apt);
                            if (top < 0 || top > SLOT_COUNT * SLOT_HEIGHT) return null;
                            return (
                              <div
                                key={apt.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, apt)}
                                onDragEnd={handleDragEnd}
                                className={`absolute left-0 right-0 mx-0.5 rounded text-xs cursor-grab active:cursor-grabbing border overflow-hidden z-10 ${
                                  apt.status === "cancelled"
                                    ? "bg-gray-50 text-gray-400 border-gray-200 border-l-4 border-l-red-500 opacity-75"
                                    : STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled
                                } ${draggingAppointment?.id === apt.id ? "opacity-50" : ""}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${Math.max(height, 20)}px`,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingAppointment(apt);
                                }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltip({ apt, x: rect.right + 8, y: rect.top });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                              >
                                <div
                                  className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10 z-10"
                                  onMouseDown={(e) => handleResizeStart(e, apt, "top")}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="p-1 pt-1.5 pr-4">
                                  <div className={`font-medium truncate ${apt.status === "cancelled" ? "line-through" : ""}`}>{apt.patientName}</div>
                                  <div className="text-[10px] truncate">{format(new Date(apt.appointmentDate), "h:mm a")}</div>
                                </div>
                                {apt.isInvoiced && (
                                  <div className="absolute top-0.5 right-0.5 z-10">
                                    <DollarSign className="w-3 h-3 text-emerald-700" />
                                  </div>
                                )}
                                <div
                                  className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10 z-10"
                                  onMouseDown={(e) => handleResizeStart(e, apt, "bottom")}
                                  onClick={(e) => e.stopPropagation()}
                                />
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
                  <Label>Patient <span className="text-red-500">*</span></Label>
                  {selectedPatient ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mt-1">
                      <UserCheck className="w-5 h-5 text-green-600" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-medium text-green-800">
                          {selectedPatient.firstName} {selectedPatient.lastName}
                          {selectedPatient.urNumber && (
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {selectedPatient.urNumber}</span>
                          )}
                        </div>
                        <div className="text-sm text-green-600">
                          {selectedPatient.dateOfBirth && `DOB: ${selectedPatient.dateOfBirth}`}
                          {selectedPatient.phone && ` | ${selectedPatient.phone}`}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={handleClearPatient}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 mt-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          placeholder="Search by name..."
                          value={patientSearch}
                          onChange={(e) => { setPatientSearch(e.target.value); setShowPatientResults(true); setIsCreatingPatient(false); }}
                          onFocus={() => setShowPatientResults(true)}
                          className="pl-10"
                        />
                        {showPatientResults && patientSearch.length >= 2 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {searchedPatients.length === 0 ? (
                              <div
                                className="p-3 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer"
                                onClick={() => { setNewPatientForm(prev => ({ ...prev, firstName: patientSearch.split(" ")[0] || "", lastName: patientSearch.split(" ").slice(1).join(" ") || "" })); setIsCreatingPatient(true); setShowPatientResults(false); }}
                              >
                                <UserPlus className="w-4 h-4" />
                                No match — create new patient file for &ldquo;{patientSearch}&rdquo;
                              </div>
                            ) : (
                              <>
                                {searchedPatients.map((patient) => (
                                  <div
                                    key={patient.id}
                                    className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                    onClick={() => handleSelectPatient(patient)}
                                  >
                                    <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                                    <div className="text-sm text-gray-500">
                                      {patient.dateOfBirth && `DOB: ${patient.dateOfBirth}`}
                                      {patient.phone && ` | ${patient.phone}`}
                                    </div>
                                  </div>
                                ))}
                                <div
                                  className="p-3 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer border-t"
                                  onClick={() => { setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", phone: "" }); setIsCreatingPatient(true); setShowPatientResults(false); }}
                                >
                                  <UserPlus className="w-4 h-4" />
                                  Create new patient file
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {!isCreatingPatient && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => { setIsCreatingPatient(true); setShowPatientResults(false); }}
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Create new patient file
                        </Button>
                      )}
                      {isCreatingPatient && (
                        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
                          <p className="text-sm font-medium text-blue-800">New Patient File</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="npFirstName" className="text-xs">First Name *</Label>
                              <Input
                                id="npFirstName"
                                value={newPatientForm.firstName}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, firstName: capitalizeWords(e.target.value) }))}
                                autoCapitalize="words"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="npLastName" className="text-xs">Last Name *</Label>
                              <Input
                                id="npLastName"
                                value={newPatientForm.lastName}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, lastName: capitalizeWords(e.target.value) }))}
                                autoCapitalize="words"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="npDob" className="text-xs">Date of Birth</Label>
                              <Input
                                id="npDob"
                                type="date"
                                value={newPatientForm.dateOfBirth}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="npPhone" className="text-xs">Phone</Label>
                              <Input
                                id="npPhone"
                                value={newPatientForm.phone}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, phone: e.target.value }))}
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={!newPatientForm.firstName || !newPatientForm.lastName || createPatientMutation.isPending}
                              onClick={() => createPatientMutation.mutate({
                                firstName: newPatientForm.firstName,
                                lastName: newPatientForm.lastName,
                                dateOfBirth: newPatientForm.dateOfBirth || null,
                                phone: newPatientForm.phone || null,
                              })}
                            >
                              {createPatientMutation.isPending ? "Creating..." : "Create & Select"}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => setIsCreatingPatient(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                <div className="col-span-2">
                  <Label>Scan Type(s)</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-lg bg-gray-50 max-h-60 overflow-y-auto">
                    {CANONICAL_SCAN_TYPES.filter(ct => {
                      const setting = scanDurations.find(s => s.scanType === ct.name);
                      return setting ? setting.isEnabled : true;
                    }).map((ct) => {
                      const isChecked = formData.scanTypes.includes(ct.name);
                      const scanSetting = scanDurations.find(s => s.scanType === ct.name);
                      const showLaterality = isChecked && (scanSetting?.hasLaterality ?? ct.hasLaterality);
                      return (
                        <div key={ct.name} className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`scan-${ct.name}`}
                              checked={isChecked}
                              onCheckedChange={() => handleScanTypeToggle(ct.name)}
                            />
                            <label htmlFor={`scan-${ct.name}`} className="text-sm cursor-pointer leading-tight">
                              {ct.name}
                            </label>
                          </div>
                          {showLaterality && (
                            <div className="ml-6 flex gap-2">
                              {(["unilateral", "bilateral"] as const).map(lat => (
                                <button
                                  key={lat}
                                  type="button"
                                  onClick={() => handleLateralityChange(ct.name, lat)}
                                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                    (formData.laterality[ct.name] ?? "bilateral") === lat
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  {lat.charAt(0).toUpperCase() + lat.slice(1)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="duration"
                      type="number"
                      min={5}
                      max={480}
                      value={formData.duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500">min</span>
                    {formData.scanTypes.length > 0 && (
                      <span className="text-xs text-blue-600 ml-1">auto-calculated</span>
                    )}
                  </div>
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
                <div className="col-span-2">
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                    <Checkbox
                      id="isInvoiced"
                      checked={formData.isInvoiced}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isInvoiced: !!checked }))}
                    />
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <Label htmlFor="isInvoiced" className="cursor-pointer font-medium">
                        Invoice sent / Billing complete
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setIsBookingDialogOpen(false); resetForm(); setEditingAppointment(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !selectedPatient}>
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
                  {viewingAppointment.status === "checked_in" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      onClick={() => {
                        updateMutation.mutate({
                          id: viewingAppointment.id,
                          data: { status: "scheduled" },
                        });
                        setViewingAppointment({ ...viewingAppointment, status: "scheduled" });
                      }}
                    >
                      <Undo2 className="w-3 h-3 mr-1" />
                      Undo
                    </Button>
                  )}
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

                <div className="flex justify-end gap-2 pt-4 border-t flex-wrap">
                  {viewingAppointment.patientId && onOpenPatient && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 mr-auto"
                      onClick={() => {
                        setViewingAppointment(null);
                        onOpenPatient(viewingAppointment.patientId!);
                      }}
                    >
                      <FolderOpen className="w-4 h-4 mr-1" />
                      Open Patient File
                    </Button>
                  )}
                  {viewingAppointment.status !== "checked_in" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                      onClick={() => {
                        updateMutation.mutate({
                          id: viewingAppointment.id,
                          data: { status: "checked_in" },
                        });
                        setViewingAppointment({ ...viewingAppointment, status: "checked_in" });
                      }}
                    >
                      <UserCheck className="w-4 h-4 mr-1" />
                      Check In
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                    onClick={() => handleEditAppointment(viewingAppointment)}
                  >
                    <CalendarClock className="w-4 h-4 mr-1" />
                    Reschedule
                  </Button>
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

        {/* Event Creation / Edit Dialog */}
        <Dialog open={isEventDialogOpen} onOpenChange={(open) => { if (!open) { setIsEventDialogOpen(false); setEditingEvent(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingEvent ? "Edit Event" : "New Event"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEventSubmit} className="space-y-4">
              <div>
                <Label htmlFor="eventTitle">Title *</Label>
                <Input
                  id="eventTitle"
                  placeholder="e.g. Sam in Theatre, Amy Unavailable"
                  value={eventForm.title}
                  onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="eventDate">Date *</Label>
                <Input
                  id="eventDate"
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="eventStartTime">Start Time *</Label>
                  <Input
                    id="eventStartTime"
                    type="time"
                    value={eventForm.startTime}
                    onChange={(e) => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="eventEndTime">End Time *</Label>
                  <Input
                    id="eventEndTime"
                    type="time"
                    value={eventForm.endTime}
                    onChange={(e) => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Colour</Label>
                <div className="flex gap-2 mt-2">
                  {Object.entries(EVENT_COLORS).map(([key, colors]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEventForm(prev => ({ ...prev, color: key }))}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${colors.dot} ${
                        eventForm.color === key ? "border-gray-800 scale-110" : "border-transparent"
                      }`}
                      title={key.charAt(0).toUpperCase() + key.slice(1)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="eventRecurrence">Repeat</Label>
                <Select value={eventForm.recurrence} onValueChange={(v) => setEventForm(prev => ({ ...prev, recurrence: v }))}>
                  <SelectTrigger id="eventRecurrence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {eventForm.recurrence !== "none" && (
                <div>
                  <Label htmlFor="eventRecurrenceEnd">Repeat Until (optional)</Label>
                  <Input
                    id="eventRecurrenceEnd"
                    type="date"
                    value={eventForm.recurrenceEndDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, recurrenceEndDate: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="eventNotes">Notes</Label>
                <Textarea
                  id="eventNotes"
                  value={eventForm.notes}
                  onChange={(e) => setEventForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEventDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createEventMutation.isPending || updateEventMutation.isPending}>
                  {editingEvent ? "Save Changes" : "Create Event"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Event Viewing Dialog */}
        <Dialog open={!!viewingEvent} onOpenChange={(open) => !open && setViewingEvent(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Event Details</DialogTitle>
            </DialogHeader>
            {viewingEvent && (() => {
              const colors = EVENT_COLORS[viewingEvent.color] || EVENT_COLORS.purple;
              return (
                <div className="space-y-4">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${colors.bg} ${colors.border} border`}>
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot}`} />
                    <span className={`font-semibold ${colors.text}`}>{viewingEvent.title}</span>
                    {viewingEvent.recurrence !== "none" && (
                      <span className={`ml-auto text-xs flex items-center gap-1 ${colors.text}`}>
                        <Repeat className="w-3 h-3" />
                        {viewingEvent.recurrence === "weekly" ? "Weekly" : "Monthly"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-gray-500" />
                      <span>{format(new Date(viewingEvent.startTime), "PPP")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{format(new Date(viewingEvent.startTime), "p")} – {format(new Date(viewingEvent.endTime), "p")}</span>
                    </div>
                  </div>
                  {viewingEvent.recurrenceEndDate && (
                    <div className="text-sm text-gray-600">
                      Repeats until {format(new Date(viewingEvent.recurrenceEndDate), "PPP")}
                    </div>
                  )}
                  {viewingEvent.notes && (
                    <div className="text-sm">
                      <span className="font-medium">Notes:</span>
                      <p className="text-gray-600 mt-1">{viewingEvent.notes}</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEditEventDialog(viewingEvent)}>
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => {
                        if (confirm("Delete this event? All recurring instances will be removed.")) {
                          deleteEventMutation.mutate(viewingEvent.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Hover tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-xs pointer-events-none"
            style={{ left: Math.min(tooltip.x, window.innerWidth - 240), top: Math.max(tooltip.y, 8) }}
          >
            <div className="font-semibold text-gray-900 mb-1">{tooltip.apt.patientName}</div>
            <div className="text-gray-600 text-xs space-y-0.5">
              <div>{format(new Date(tooltip.apt.appointmentDate), "EEEE d MMM, h:mm a")} ({tooltip.apt.duration} min)</div>
              {tooltip.apt.scanType && <div>{tooltip.apt.scanType}</div>}
              {tooltip.apt.patientPhone && <div>{tooltip.apt.patientPhone}</div>}
              {tooltip.apt.notes && (
                <div className="mt-1 pt-1 border-t border-gray-100 text-gray-700 italic">
                  {tooltip.apt.notes}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
