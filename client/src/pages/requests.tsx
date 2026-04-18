import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { capitalizeWords } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, Edit, Trash2, User, Phone, Mail, Stethoscope,
  ClipboardList, Clock, CheckCircle, XCircle, AlertCircle, FileText,
  MapPin, Hash, Building2, ChevronRight, X, Printer, Globe, CalendarPlus,
  FolderOpen, CheckCheck, Send, Mailbox, ShieldCheck, ArrowUpDown
} from "lucide-react";
import { format } from "date-fns";
import type { ScanRequest, ReferringDoctor, Patient, Clinic, Physician, Sonographer } from "@shared/schema";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  routine: { label: "Routine", color: "bg-slate-100 text-slate-700" },
  urgent: { label: "Urgent", color: "bg-amber-100 text-amber-700" },
  asap: { label: "ASAP", color: "bg-orange-100 text-orange-700" },
  stat: { label: "STAT", color: "bg-red-100 text-red-700" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-blue-100 text-blue-700", icon: Clock },
  scheduled: { label: "Scheduled", color: "bg-purple-100 text-purple-700", icon: ClipboardList },
  completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-500", icon: XCircle },
};

const DELIVERY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  secure_messaging: { label: "Secure Messaging", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: ShieldCheck },
  email:            { label: "Email",            color: "bg-blue-100 text-blue-700 border-blue-200",          icon: Mail },
  fax:              { label: "Fax",              color: "bg-purple-100 text-purple-700 border-purple-200",    icon: Send },
  post:             { label: "Post",             color: "bg-amber-100 text-amber-700 border-amber-200",       icon: Mailbox },
  other:            { label: "Other",            color: "bg-slate-100 text-slate-700 border-slate-200",       icon: AlertCircle },
};

function DeliveryBadge({ method, note }: { method?: string | null; note?: string | null }) {
  if (!method) return null;
  const cfg = DELIVERY_CONFIG[method] ?? DELIVERY_CONFIG.other;
  const Icon = cfg.icon;
  const label = method === "other" && note ? note : cfg.label;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${cfg.color}`} title={`Preferred report delivery: ${label}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

type RequestFormData = {
  patientId: number | null;
  referringDoctorId: number | null;
  patientName: string;
  patientUrNumber: string;
  patientDob: string;
  patientPhone: string;
  patientEmail: string;
  referringDoctorName: string;
  referringDoctorProviderNumber: string;
  scanTypes: string[];
  urgency: string;
  clinicalIndication: string;
  clinicalHistory: string;
  status: string;
  notes: string;
  requestDate: string;
};

type DoctorFormData = {
  name: string;
  practiceName: string;
  providerNumber: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  notes: string;
  preferredReportDelivery: string;
  preferredReportDeliveryNote: string;
};

const blankRequest = (): RequestFormData => ({
  patientId: null,
  referringDoctorId: null,
  patientName: "",
  patientUrNumber: "",
  patientDob: "",
  patientPhone: "",
  patientEmail: "",
  referringDoctorName: "",
  referringDoctorProviderNumber: "",
  scanTypes: [],
  urgency: "routine",
  clinicalIndication: "",
  clinicalHistory: "",
  status: "pending",
  notes: "",
  requestDate: format(new Date(), "yyyy-MM-dd"),
});

const blankDoctor = (): DoctorFormData => ({
  name: "",
  practiceName: "",
  providerNumber: "",
  phone: "",
  fax: "",
  email: "",
  address: "",
  notes: "",
  preferredReportDelivery: "",
  preferredReportDeliveryNote: "",
});

export default function Requests({ onOpenPatient }: { onOpenPatient?: (patientId: number) => void } = {}) {
  const { toast } = useToast();

  // ── Requests state ────────────────────────────────────────────────
  const [requestSearch, setRequestSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ScanRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<ScanRequest | null>(null);
  const [requestForm, setRequestForm] = useState<RequestFormData>(blankRequest());

  // Patient search within request form
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [showPatientResults, setShowPatientResults] = useState(false);

  // Referring doctor search within request form
  const [doctorSearchQuery, setDoctorSearchQuery] = useState("");
  const [showDoctorResults, setShowDoctorResults] = useState(false);

  // ── Referring doctors state ───────────────────────────────────────
  const [doctorSearch, setDoctorSearch] = useState("");
  const [isDoctorOpen, setIsDoctorOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<ReferringDoctor | null>(null);
  const [doctorForm, setDoctorForm] = useState<DoctorFormData>(blankDoctor());
  const [doctorSort, setDoctorSort] = useState<{ key: "name" | "practice" | "provider" | "delivery"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [doctorDeliveryFilter, setDoctorDeliveryFilter] = useState<string>("all");

  // ── Save-to-patient state ─────────────────────────────────────────
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [savePatientSearch, setSavePatientSearch] = useState("");
  const [savedRequestIds, setSavedRequestIds] = useState<Set<number>>(new Set());

  // ── Scheduling state ──────────────────────────────────────────────
  const [schedulingRequest, setSchedulingRequest] = useState<ScanRequest | null>(null); // kept for mutation compat
  const [viewingStep, setViewingStep] = useState<"details" | "schedule">("details");
  const [scheduleForm, setScheduleForm] = useState({
    appointmentDate: format(new Date(), "yyyy-MM-dd"),
    appointmentTime: "09:00",
    duration: "30",
    physicianId: "",
    sonographerId: "",
    notes: "",
  });

  // ── Queries ───────────────────────────────────────────────────────
  const { data: clinic } = useQuery<Clinic>({
    queryKey: ["/api/clinic"],
  });

  const { data: requests = [], isLoading: reqLoading } = useQuery<ScanRequest[]>({
    queryKey: ["/api/scan-requests"],
  });

  const { data: referringDoctors = [], isLoading: docLoading } = useQuery<ReferringDoctor[]>({
    queryKey: ["/api/referring-doctors"],
  });

  const { data: patientResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", "search", patientSearchQuery],
    queryFn: async () => {
      if (!patientSearchQuery || patientSearchQuery.length < 2) return [];
      const r = await fetch(`/api/patients?search=${encodeURIComponent(patientSearchQuery)}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: patientSearchQuery.length >= 2,
  });

  const { data: doctorResults = [] } = useQuery<ReferringDoctor[]>({
    queryKey: ["/api/referring-doctors", "search", doctorSearchQuery],
    queryFn: async () => {
      if (!doctorSearchQuery || doctorSearchQuery.length < 2) return [];
      const r = await fetch(`/api/referring-doctors?search=${encodeURIComponent(doctorSearchQuery)}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: doctorSearchQuery.length >= 2,
  });

  const { data: physicians = [] } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: sonographers = [] } = useQuery<Sonographer[]>({ queryKey: ["/api/sonographers"] });

  const { data: savePatientResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", "save-search", savePatientSearch],
    queryFn: async () => {
      if (!savePatientSearch || savePatientSearch.length < 2) return [];
      const r = await fetch(`/api/patients?search=${encodeURIComponent(savePatientSearch)}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: savePatientSearch.length >= 2,
  });

  // ── Request mutations ─────────────────────────────────────────────
  const createRequest = useMutation({
    mutationFn: (data: RequestFormData) => apiRequest("/api/scan-requests", "POST", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] }); setIsRequestOpen(false); toast({ title: "Request created" }); },
    onError: () => toast({ title: "Failed to create request", variant: "destructive" }),
  });

  const updateRequest = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RequestFormData> }) => apiRequest(`/api/scan-requests/${id}`, "PUT", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] }); setIsRequestOpen(false); setEditingRequest(null); toast({ title: "Request updated" }); },
    onError: () => toast({ title: "Failed to update request", variant: "destructive" }),
  });

  const deleteRequest = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/scan-requests/${id}`, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] }); toast({ title: "Request deleted" }); },
    onError: () => toast({ title: "Failed to delete request", variant: "destructive" }),
  });

  // ── Doctor mutations ──────────────────────────────────────────────
  const createDoctor = useMutation({
    mutationFn: (data: DoctorFormData) => apiRequest("/api/referring-doctors", "POST", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referring-doctors"] }); setIsDoctorOpen(false); toast({ title: "Referring doctor saved" }); },
    onError: () => toast({ title: "Failed to save doctor", variant: "destructive" }),
  });

  const updateDoctor = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DoctorFormData> }) => apiRequest(`/api/referring-doctors/${id}`, "PUT", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referring-doctors"] }); setIsDoctorOpen(false); setEditingDoctor(null); toast({ title: "Doctor updated" }); },
    onError: () => toast({ title: "Failed to update doctor", variant: "destructive" }),
  });

  const deleteDoctor = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/referring-doctors/${id}`, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referring-doctors"] }); toast({ title: "Doctor deleted" }); },
    onError: () => toast({ title: "Failed to delete doctor", variant: "destructive" }),
  });

  const scheduleAppointment = useMutation({
    mutationFn: async ({ request, form }: { request: ScanRequest; form: typeof scheduleForm }) => {
      const [datePart] = form.appointmentDate.split("T");
      const appointmentDate = new Date(`${datePart}T${form.appointmentTime}:00`);
      const apptRes = await apiRequest("/api/appointments", "POST", {
        clinicId: request.clinicId,
        patientName: request.patientName,
        patientDob: request.patientDob || null,
        patientPhone: request.patientPhone || null,
        patientEmail: request.patientEmail || null,
        patientId: request.patientId || null,
        scanType: (request.scanTypes ?? [])[0] || "",
        appointmentDate: appointmentDate.toISOString(),
        duration: parseInt(form.duration) || 30,
        physicianId: form.physicianId ? parseInt(form.physicianId) : null,
        sonographerId: form.sonographerId ? parseInt(form.sonographerId) : null,
        notes: form.notes || null,
        status: "scheduled",
      });
      const appt = await apptRes.json();
      await apiRequest(`/api/scan-requests/${request.id}`, "PUT", {
        status: "scheduled",
        scheduledAppointmentId: appt.id,
      });
      return appt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setSchedulingRequest(null);
      setViewingRequest(null);
      setViewingStep("details");
      toast({ title: "Appointment scheduled", description: "The request has been marked as scheduled." });
    },
    onError: () => toast({ title: "Failed to schedule appointment", variant: "destructive" }),
  });

  const saveToPatientFile = useMutation({
    mutationFn: async ({ requestId, patientId }: { requestId: number; patientId: number; htmlContent?: string }) => {
      const res = await apiRequest(`/api/scan-requests/${requestId}/save-to-patient`, "POST", { patientId });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      setSavedRequestIds(prev => new Set(prev).add(variables.requestId));
      setShowPatientPicker(false);
      setSavePatientSearch("");
      toast({ title: "Saved to patient file", description: "The scan request has been added to the patient's documents." });
    },
    onError: () => toast({ title: "Failed to save to patient file", variant: "destructive" }),
  });

  // ── Helpers ───────────────────────────────────────────────────────
  const openNewRequest = () => {
    setEditingRequest(null);
    setRequestForm(blankRequest());
    setPatientSearchQuery("");
    setDoctorSearchQuery("");
    setIsRequestOpen(true);
  };

  const openEditRequest = (r: ScanRequest) => {
    setEditingRequest(r);
    setRequestForm({
      patientId: r.patientId ?? null,
      referringDoctorId: r.referringDoctorId ?? null,
      patientName: r.patientName,
      patientUrNumber: r.patientUrNumber ?? "",
      patientDob: r.patientDob ?? "",
      patientPhone: r.patientPhone ?? "",
      patientEmail: r.patientEmail ?? "",
      referringDoctorName: r.referringDoctorName ?? "",
      referringDoctorProviderNumber: r.referringDoctorProviderNumber ?? "",
      scanTypes: r.scanTypes ?? [],
      urgency: r.urgency,
      clinicalIndication: r.clinicalIndication ?? "",
      clinicalHistory: r.clinicalHistory ?? "",
      status: r.status,
      notes: r.notes ?? "",
      requestDate: r.requestDate,
    });
    setIsRequestOpen(true);
  };

  const openNewDoctor = () => { setEditingDoctor(null); setDoctorForm(blankDoctor()); setIsDoctorOpen(true); };
  const openEditDoctor = (d: ReferringDoctor) => {
    setEditingDoctor(d);
    setDoctorForm({
      name: d.name,
      practiceName: d.practiceName ?? "",
      providerNumber: d.providerNumber ?? "",
      phone: d.phone ?? "",
      fax: d.fax ?? "",
      email: d.email ?? "",
      address: d.address ?? "",
      notes: d.notes ?? "",
      preferredReportDelivery: (d as any).preferredReportDelivery ?? "",
      preferredReportDeliveryNote: (d as any).preferredReportDeliveryNote ?? "",
    });
    setIsDoctorOpen(true);
  };

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRequest) updateRequest.mutate({ id: editingRequest.id, data: requestForm });
    else createRequest.mutate(requestForm);
  };

  const handleSubmitDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDoctor) updateDoctor.mutate({ id: editingDoctor.id, data: doctorForm });
    else createDoctor.mutate(doctorForm);
  };

  const selectPatient = (p: Patient) => {
    setRequestForm(prev => ({ ...prev, patientId: p.id, patientName: `${p.firstName} ${p.lastName}`, patientUrNumber: p.urNumber ?? "", patientDob: p.dateOfBirth ?? "", patientPhone: p.phone ?? "", patientEmail: p.email ?? "" }));
    setPatientSearchQuery("");
    setShowPatientResults(false);
  };

  const clearPatient = () => {
    setRequestForm(prev => ({ ...prev, patientId: null, patientName: "", patientUrNumber: "", patientDob: "", patientPhone: "", patientEmail: "" }));
  };

  const selectDoctor = (d: ReferringDoctor) => {
    setRequestForm(prev => ({ ...prev, referringDoctorId: d.id, referringDoctorName: d.name, referringDoctorProviderNumber: d.providerNumber ?? "" }));
    setDoctorSearchQuery("");
    setShowDoctorResults(false);
  };

  const clearDoctor = () => {
    setRequestForm(prev => ({ ...prev, referringDoctorId: null, referringDoctorName: "", referringDoctorProviderNumber: "" }));
  };

  const toggleScanType = (name: string) => {
    setRequestForm(prev => ({
      ...prev,
      scanTypes: prev.scanTypes.includes(name) ? prev.scanTypes.filter(t => t !== name) : [...prev.scanTypes, name],
    }));
  };

  // ── PDF / save generation ─────────────────────────────────────────
  const buildRequestHtml = (r: ScanRequest): string => {
    const clinicName = clinic?.name || 'Nexus Vascular Imaging';
    const clinicAddress = clinic?.address || '';
    const clinicPhone = clinic?.phone || '';
    const clinicFax = clinic?.fax || '';
    const clinicEmail = clinic?.email || '';
    const logoUrl = clinic?.logoUrl || '';
    const urgCfg = URGENCY_CONFIG[r.urgency] ?? URGENCY_CONFIG.routine;
    const stsCfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;

    const urgencyColors: Record<string, string> = {
      routine: '#4b5563', urgent: '#b45309', asap: '#c2410c', stat: '#dc2626',
    };
    const urgColor = urgencyColors[r.urgency] ?? '#4b5563';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Scan Request – ${r.patientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a1a2e;
      background: #fff;
      padding: 30px 40px;
      max-width: 820px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 3px solid #0f4c75;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .clinic-logo { height: 52px; object-fit: contain; }
    .clinic-title { font-size: 20px; font-weight: 800; color: #0f4c75; letter-spacing: -0.3px; }
    .clinic-tagline { font-size: 10px; color: #1b6ca8; margin-top: 2px; letter-spacing: 0.5px; text-transform: uppercase; }
    .clinic-contact { font-size: 10px; color: #555; margin-top: 4px; line-height: 1.6; }
    .header-right { text-align: right; }
    .doc-title { font-size: 15px; font-weight: 700; color: #0f4c75; text-transform: uppercase; letter-spacing: 1px; }
    .doc-meta { margin-top: 6px; font-size: 10px; color: #555; line-height: 1.8; }
    .req-id { font-family: monospace; font-weight: 700; color: #0f4c75; }

    /* ── Urgency banner ── */
    .urgency-banner {
      background: ${r.urgency === 'stat' ? '#fef2f2' : r.urgency === 'asap' ? '#fff7ed' : r.urgency === 'urgent' ? '#fffbeb' : '#f8fafc'};
      border-left: 5px solid ${urgColor};
      padding: 8px 14px;
      margin-bottom: 20px;
      border-radius: 0 6px 6px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .urgency-label {
      font-weight: 800;
      font-size: 13px;
      color: ${urgColor};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .urgency-note { font-size: 10px; color: #555; }

    /* ── Two-column grid ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .full-col { margin-bottom: 16px; }

    /* ── Section boxes ── */
    .section-box {
      border: 1px solid #dde3ee;
      border-radius: 8px;
      overflow: hidden;
    }
    .section-head {
      background: #0f4c75;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 6px 12px;
    }
    .section-body { padding: 10px 12px; line-height: 1.8; }
    .field-row { display: flex; gap: 4px; margin-bottom: 3px; }
    .field-label { font-weight: 600; color: #374151; min-width: 110px; font-size: 10.5px; }
    .field-value { color: #111; font-size: 10.5px; }

    /* ── Scan types ── */
    .scan-grid { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
    .scan-tag {
      background: #e0f0ff;
      color: #0f4c75;
      border: 1px solid #b3d4f5;
      border-radius: 4px;
      padding: 3px 9px;
      font-size: 10px;
      font-weight: 600;
    }

    /* ── Clinical section ── */
    .clinical-text {
      padding: 10px 12px;
      font-size: 10.5px;
      line-height: 1.7;
      color: #222;
      min-height: 50px;
    }

    /* ── Signature area ── */
    .sig-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 2px solid #0f4c75;
    }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #333; width: 80%; margin: 32px auto 6px auto; }
    .sig-caption { font-size: 9.5px; color: #555; }

    /* ── Footer ── */
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #dde3ee;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #9ca3af;
    }

    @media print {
      body { padding: 15px 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      ${logoUrl ? `<img src="${logoUrl}" class="clinic-logo" alt="logo" />` : ''}
      <div>
        <div class="clinic-title">${clinicName}</div>
        <div class="clinic-tagline">Vascular Ultrasound Specialists</div>
        <div class="clinic-contact">
          ${clinicAddress ? `${clinicAddress}<br>` : ''}
          ${clinicPhone ? `Phone: ${clinicPhone}` : ''}${clinicPhone && clinicFax ? '&ensp;|&ensp;' : ''}${clinicFax ? `Fax: ${clinicFax}` : ''}<br>
          ${clinicEmail || ''}
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title">Scan Request</div>
      <div class="doc-meta">
        <span class="req-id">REQ-${String(r.id).padStart(5, '0')}</span><br>
        Date: ${r.requestDate}<br>
        Printed: ${format(new Date(), 'dd/MM/yyyy HH:mm')}<br>
        Status: <strong>${stsCfg.label}</strong>
      </div>
    </div>
  </div>

  <!-- Urgency Banner -->
  <div class="urgency-banner">
    <div class="urgency-label">⚡ ${urgCfg.label}</div>
    <div class="urgency-note">${
      r.urgency === 'stat' ? 'IMMEDIATE attention required — perform today' :
      r.urgency === 'asap' ? 'Perform as soon as possible — within 24 hours' :
      r.urgency === 'urgent' ? 'Schedule within 48–72 hours' :
      'Standard scheduling applies'
    }</div>
  </div>

  <!-- Patient + Referring Doctor -->
  <div class="two-col">
    <div class="section-box">
      <div class="section-head">Patient Information</div>
      <div class="section-body">
        <div class="field-row"><span class="field-label">Name:</span><span class="field-value"><strong>${r.patientName}</strong></span></div>
        ${r.patientUrNumber ? `<div class="field-row"><span class="field-label">UR Number:</span><span class="field-value"><strong style="color:#1d4ed8;font-family:monospace">${r.patientUrNumber}</strong></span></div>` : ''}
        ${r.patientDob ? `<div class="field-row"><span class="field-label">Date of Birth:</span><span class="field-value">${r.patientDob}</span></div>` : ''}
        ${r.patientPhone ? `<div class="field-row"><span class="field-label">Phone:</span><span class="field-value">${r.patientPhone}</span></div>` : ''}
        ${r.patientEmail ? `<div class="field-row"><span class="field-label">Email:</span><span class="field-value">${r.patientEmail}</span></div>` : ''}
      </div>
    </div>
    <div class="section-box">
      <div class="section-head">Referring Doctor</div>
      <div class="section-body">
        ${r.referringDoctorName ? `
          <div class="field-row"><span class="field-label">Name:</span><span class="field-value"><strong>${r.referringDoctorName}</strong></span></div>
          ${r.referringDoctorProviderNumber ? `<div class="field-row"><span class="field-label">Provider No.:</span><span class="field-value">${r.referringDoctorProviderNumber}</span></div>` : ''}
        ` : `<div style="color:#9ca3af;font-style:italic;padding-top:4px;">Not specified</div>`}
      </div>
    </div>
  </div>

  <!-- Scan Types -->
  ${(r.scanTypes ?? []).length > 0 ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Requested Scan Type(s)</div>
      <div class="scan-grid">
        ${(r.scanTypes ?? []).map(t => `<span class="scan-tag">${t}</span>`).join('')}
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Clinical Details -->
  ${r.clinicalIndication ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Clinical Indication</div>
      <div class="clinical-text">${r.clinicalIndication.replace(/\n/g, '<br>')}</div>
    </div>
  </div>
  ` : ''}

  ${r.clinicalHistory ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Relevant Clinical History</div>
      <div class="clinical-text">${r.clinicalHistory.replace(/\n/g, '<br>')}</div>
    </div>
  </div>
  ` : ''}

  ${r.notes ? `
  <div class="full-col">
    <div class="section-box">
      <div class="section-head">Additional Notes</div>
      <div class="clinical-text">${r.notes.replace(/\n/g, '<br>')}</div>
    </div>
  </div>
  ` : ''}

  <!-- Signature Area -->
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-caption">Referring Doctor Signature &amp; Date</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-caption">${clinicName} — Received by &amp; Date</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${clinicName} · Scan Request REQ-${String(r.id).padStart(5, '0')}</span>
    <span>Generated ${format(new Date(), 'dd/MM/yyyy')} · Reporting Room</span>
  </div>

</body>
</html>`;
  };

  const generateRequestPDF = (r: ScanRequest) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildRequestHtml(r));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  // ── Filtered lists ────────────────────────────────────────────────
  const filteredRequests = requests.filter(r => {
    const matchSearch = !requestSearch ||
      r.patientName.toLowerCase().includes(requestSearch.toLowerCase()) ||
      (r.referringDoctorName ?? "").toLowerCase().includes(requestSearch.toLowerCase()) ||
      (r.scanTypes ?? []).some(t => t.toLowerCase().includes(requestSearch.toLowerCase()));
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredDoctors = (() => {
    const q = doctorSearch.trim().toLowerCase();
    let list = referringDoctors.filter(d => {
      const matchSearch = !q ||
        d.name.toLowerCase().includes(q) ||
        (d.practiceName ?? "").toLowerCase().includes(q) ||
        (d.providerNumber ?? "").toLowerCase().includes(q) ||
        (d.email ?? "").toLowerCase().includes(q) ||
        (d.phone ?? "").toLowerCase().includes(q);
      const matchDelivery = doctorDeliveryFilter === "all" ||
        (doctorDeliveryFilter === "none" ? !((d as any).preferredReportDelivery) : (d as any).preferredReportDelivery === doctorDeliveryFilter);
      return matchSearch && matchDelivery;
    });
    const dir = doctorSort.dir === "asc" ? 1 : -1;
    const get = (d: ReferringDoctor): string => {
      switch (doctorSort.key) {
        case "practice": return (d.practiceName ?? "").toLowerCase();
        case "provider": return (d.providerNumber ?? "").toLowerCase();
        case "delivery": return ((d as any).preferredReportDelivery ?? "zzz").toLowerCase();
        default: return d.name.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  const toggleDoctorSort = (key: typeof doctorSort.key) => {
    setDoctorSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "asc" });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scan Requests</h1>
        <p className="text-gray-500 mt-1">Manage electronic referrals and referring doctors</p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-6">
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Requests
            {requests.filter(r => r.status === "pending").length > 0 && (
              <Badge className="ml-1 bg-blue-600 text-white text-xs">{requests.filter(r => r.status === "pending").length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="doctors" className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4" /> Referring Doctors
            <Badge variant="outline" className="ml-1 text-xs">{referringDoctors.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── REQUESTS TAB ── */}
        <TabsContent value="requests">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search by patient, doctor, scan type..." value={requestSearch} onChange={e => setRequestSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openNewRequest}>
              <Plus className="w-4 h-4 mr-2" /> New Request
            </Button>
          </div>

          {reqLoading ? (
            <div className="text-center py-16 text-gray-400">Loading...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">No scan requests found</p>
              <Button variant="outline" className="mt-4" onClick={openNewRequest}><Plus className="w-4 h-4 mr-2" /> Create first request</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map(r => {
                const urgCfg = URGENCY_CONFIG[r.urgency] ?? URGENCY_CONFIG.routine;
                const stsCfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                const StsIcon = stsCfg.icon;
                return (
                  <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewingRequest(r)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-gray-900">{r.patientName}</span>
                            {r.patientUrNumber && <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {r.patientUrNumber}</span>}
                            {r.patientDob && <span className="text-xs text-gray-400">DOB: {r.patientDob}</span>}
                            <Badge className={`text-xs ${urgCfg.color}`}>{urgCfg.label}</Badge>
                            <Badge className={`text-xs flex items-center gap-1 ${stsCfg.color}`}>
                              <StsIcon className="w-3 h-3" />{stsCfg.label}
                            </Badge>
                            {(r as any).source && (r as any).source !== "internal" && (
                              <Badge className="text-xs flex items-center gap-1 bg-violet-100 text-violet-700">
                                <Globe className="w-3 h-3" />
                                {(r as any).source === "web_form" ? "Web Form" : "Referrer Portal"}
                              </Badge>
                            )}
                          </div>
                          {r.referringDoctorName && (
                            <p className="text-sm text-gray-600 flex items-center gap-1.5 flex-wrap">
                              <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" />
                              {r.referringDoctorName}
                              {r.referringDoctorProviderNumber && <span className="text-gray-400">· #{r.referringDoctorProviderNumber}</span>}
                              {(() => {
                                const m = (r as any).preferredReportDelivery as string | null | undefined;
                                const n = (r as any).preferredReportDeliveryNote as string | null | undefined;
                                if (m) return <DeliveryBadge method={m} note={n} />;
                                const linked = r.referringDoctorId ? referringDoctors.find(d => d.id === r.referringDoctorId) : null;
                                const dm = (linked as any)?.preferredReportDelivery;
                                const dn = (linked as any)?.preferredReportDeliveryNote;
                                return dm ? <DeliveryBadge method={dm} note={dn} /> : null;
                              })()}
                            </p>
                          )}
                          {(r.scanTypes ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(r.scanTypes ?? []).map(t => (
                                <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          )}
                          {r.clinicalIndication && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{r.clinicalIndication}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400">{r.requestDate}</span>
                          <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openEditRequest(r); }}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={e => { e.stopPropagation(); if (confirm("Delete this request?")) deleteRequest.mutate(r.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── REFERRING DOCTORS TAB ── */}
        <TabsContent value="doctors">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search by name, practice, provider, phone, email..." value={doctorSearch} onChange={e => setDoctorSearch(e.target.value)} />
            </div>
            <Select value={doctorDeliveryFilter} onValueChange={setDoctorDeliveryFilter}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All delivery preferences</SelectItem>
                <SelectItem value="secure_messaging">Secure Messaging</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="fax">Fax</SelectItem>
                <SelectItem value="post">Post</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="none">No preference set</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openNewDoctor}>
              <Plus className="w-4 h-4 mr-2" /> Add Doctor
            </Button>
          </div>

          {docLoading ? (
            <div className="text-center py-16 text-gray-400">Loading...</div>
          ) : filteredDoctors.length === 0 ? (
            <div className="text-center py-16">
              <Stethoscope className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">{referringDoctors.length === 0 ? "No referring doctors saved yet" : "No doctors match your filters"}</p>
              {referringDoctors.length === 0 && (
                <Button variant="outline" className="mt-4" onClick={openNewDoctor}><Plus className="w-4 h-4 mr-2" /> Add first doctor</Button>
              )}
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-2">
                Showing <span className="font-semibold text-gray-700">{filteredDoctors.length}</span> of {referringDoctors.length} doctors
              </div>
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">
                          <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleDoctorSort("name")}>
                            Doctor <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </button>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">
                          <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleDoctorSort("practice")}>
                            Practice <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </button>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">
                          <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleDoctorSort("provider")}>
                            Provider # <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </button>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Contact</th>
                        <th className="text-left px-3 py-2 font-semibold">
                          <button className="inline-flex items-center gap-1 hover:text-gray-900" onClick={() => toggleDoctorSort("delivery")}>
                            Report Delivery <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </button>
                        </th>
                        <th className="text-right px-3 py-2 font-semibold w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredDoctors.map(d => {
                        const delivery = (d as any).preferredReportDelivery as string | null | undefined;
                        const deliveryNote = (d as any).preferredReportDeliveryNote as string | null | undefined;
                        return (
                          <tr key={d.id} className="hover:bg-blue-50/50 cursor-pointer" onClick={() => openEditDoctor(d)}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">{d.name}</div>
                              {d.practiceName && <div className="text-xs text-gray-500 md:hidden flex items-center gap-1"><Building2 className="w-3 h-3" />{d.practiceName}</div>}
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell text-gray-700">
                              {d.practiceName || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 hidden lg:table-cell font-mono text-xs text-gray-600">
                              {d.providerNumber || <span className="text-gray-300 font-sans">—</span>}
                            </td>
                            <td className="px-3 py-2 hidden lg:table-cell text-xs text-gray-600">
                              <div className="flex flex-col gap-0.5">
                                {d.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</span>}
                                {d.email && <span className="flex items-center gap-1 truncate max-w-[180px]"><Mail className="w-3 h-3" />{d.email}</span>}
                                {!d.phone && !d.email && <span className="text-gray-300">—</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {delivery ? (
                                <DeliveryBadge method={delivery} note={deliveryNote} />
                              ) : (
                                <span className="text-xs text-gray-400 italic">No preference</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                              <div className="inline-flex gap-0.5">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditDoctor(d)}><Edit className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => { if (confirm(`Delete ${d.name}?`)) deleteDoctor.mutate(d.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── REQUEST FORM DIALOG ── */}
      <Dialog open={isRequestOpen} onOpenChange={v => { if (!v) { setIsRequestOpen(false); setEditingRequest(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRequest ? "Edit Scan Request" : "New Scan Request"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRequest} className="space-y-6">
            {/* Patient details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><User className="w-4 h-4" /> Patient Details</h3>
              {requestForm.patientId ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <User className="w-4 h-4 text-blue-600" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-900">{requestForm.patientName}</span>
                      {requestForm.patientUrNumber && (
                        <span className="font-mono font-bold text-blue-700 bg-white border border-blue-300 px-1.5 py-0.5 rounded text-xs">UR {requestForm.patientUrNumber}</span>
                      )}
                    </div>
                    {requestForm.patientDob && <span className="text-xs text-blue-600">DOB: {requestForm.patientDob}</span>}
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={clearPatient}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ) : (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search existing patients..."
                    value={patientSearchQuery}
                    onChange={e => { setPatientSearchQuery(e.target.value); setShowPatientResults(true); }}
                    onFocus={() => setShowPatientResults(true)}
                    onBlur={() => setTimeout(() => setShowPatientResults(false), 150)}
                  />
                  {showPatientResults && patientResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {patientResults.map(p => (
                        <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-2" onMouseDown={() => selectPatient(p)}>
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium">{p.firstName} {p.lastName}</span>
                          {p.dateOfBirth && <span className="text-gray-400 text-xs">{p.dateOfBirth}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Patient Name *</Label>
                  <Input value={requestForm.patientName} autoCapitalize="words" onChange={e => setRequestForm(p => ({ ...p, patientName: capitalizeWords(e.target.value) }))} required disabled={!!requestForm.patientId} />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input type="date" value={requestForm.patientDob} onChange={e => setRequestForm(p => ({ ...p, patientDob: e.target.value }))} disabled={!!requestForm.patientId} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={requestForm.patientPhone} onChange={e => setRequestForm(p => ({ ...p, patientPhone: e.target.value }))} disabled={!!requestForm.patientId} />
                </div>
                <div className="col-span-2">
                  <Label>Email</Label>
                  <Input type="email" value={requestForm.patientEmail} onChange={e => setRequestForm(p => ({ ...p, patientEmail: e.target.value }))} disabled={!!requestForm.patientId} />
                </div>
              </div>
            </div>

            {/* Referring doctor */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Stethoscope className="w-4 h-4" /> Referring Doctor</h3>
              {requestForm.referringDoctorId ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                  <Stethoscope className="w-4 h-4 text-green-600" />
                  <div className="flex-1">
                    <span className="font-medium text-green-900">{requestForm.referringDoctorName}</span>
                    {requestForm.referringDoctorProviderNumber && <span className="text-xs text-green-600 ml-2">#{requestForm.referringDoctorProviderNumber}</span>}
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={clearDoctor}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ) : (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search saved referring doctors..."
                    value={doctorSearchQuery}
                    onChange={e => { setDoctorSearchQuery(e.target.value); setShowDoctorResults(true); }}
                    onFocus={() => setShowDoctorResults(true)}
                    onBlur={() => setTimeout(() => setShowDoctorResults(false), 150)}
                  />
                  {showDoctorResults && doctorResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {doctorResults.map(d => (
                        <button key={d.id} type="button" className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm flex items-center gap-2" onMouseDown={() => selectDoctor(d)}>
                          <Stethoscope className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium">{d.name}</span>
                          {d.providerNumber && <span className="text-gray-400 text-xs">#{d.providerNumber}</span>}
                          {d.practiceName && <span className="text-gray-400 text-xs">· {d.practiceName}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Doctor Name</Label>
                  <Input value={requestForm.referringDoctorName} autoCapitalize="words" onChange={e => setRequestForm(p => ({ ...p, referringDoctorName: capitalizeWords(e.target.value) }))} disabled={!!requestForm.referringDoctorId} />
                </div>
                <div>
                  <Label>Provider Number</Label>
                  <Input value={requestForm.referringDoctorProviderNumber} onChange={e => setRequestForm(p => ({ ...p, referringDoctorProviderNumber: e.target.value }))} disabled={!!requestForm.referringDoctorId} />
                </div>
              </div>
            </div>

            {/* Scan details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Scan Details</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <Label>Request Date *</Label>
                  <Input type="date" value={requestForm.requestDate} onChange={e => setRequestForm(p => ({ ...p, requestDate: e.target.value }))} required />
                </div>
                <div>
                  <Label>Urgency</Label>
                  <Select value={requestForm.urgency} onValueChange={v => setRequestForm(p => ({ ...p, urgency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(URGENCY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {editingRequest && (
                  <div className="col-span-2">
                    <Label>Status</Label>
                    <Select value={requestForm.status} onValueChange={v => setRequestForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Label className="mb-2 block">Scan Type(s)</Label>
              <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-gray-50 max-h-52 overflow-y-auto">
                {CANONICAL_SCAN_TYPES.map(ct => (
                  <div key={ct.name} className="flex items-center space-x-2">
                    <Checkbox
                      id={`req-scan-${ct.name}`}
                      checked={requestForm.scanTypes.includes(ct.name)}
                      onCheckedChange={() => toggleScanType(ct.name)}
                    />
                    <label htmlFor={`req-scan-${ct.name}`} className="text-sm cursor-pointer leading-tight">{ct.name}</label>
                  </div>
                ))}
              </div>
              {requestForm.scanTypes.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">{requestForm.scanTypes.length} selected: {requestForm.scanTypes.join(", ")}</p>
              )}
            </div>

            {/* Clinical details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Clinical Details</h3>
              <div className="space-y-3">
                <div>
                  <Label>Clinical Indication</Label>
                  <Textarea value={requestForm.clinicalIndication} onChange={e => setRequestForm(p => ({ ...p, clinicalIndication: e.target.value }))} rows={2} placeholder="Reason for referral..." />
                </div>
                <div>
                  <Label>Relevant Clinical History</Label>
                  <Textarea value={requestForm.clinicalHistory} onChange={e => setRequestForm(p => ({ ...p, clinicalHistory: e.target.value }))} rows={3} placeholder="Previous diagnoses, medications, relevant findings..." />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={requestForm.notes} onChange={e => setRequestForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any additional notes..." />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => { setIsRequestOpen(false); setEditingRequest(null); }}>Cancel</Button>
              <Button type="submit" disabled={createRequest.isPending || updateRequest.isPending}>
                {createRequest.isPending || updateRequest.isPending ? "Saving..." : editingRequest ? "Update Request" : "Create Request"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── REQUEST VIEW DIALOG ── */}
      <Dialog open={!!viewingRequest} onOpenChange={v => { if (!v) { setViewingRequest(null); setViewingStep("details"); setShowPatientPicker(false); setSavePatientSearch(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingStep === "schedule" ? (
                <>
                  <button
                    className="text-gray-400 hover:text-gray-600 mr-1 flex items-center gap-1 text-sm font-normal"
                    onClick={() => setViewingStep("details")}
                  >
                    ← Back
                  </button>
                  <CalendarPlus className="w-5 h-5 text-blue-600" /> Schedule Appointment
                </>
              ) : (
                <><ClipboardList className="w-5 h-5 text-blue-600" /> Scan Request Details</>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingRequest && viewingStep === "details" && (() => {
            const urgCfg = URGENCY_CONFIG[viewingRequest.urgency] ?? URGENCY_CONFIG.routine;
            const stsCfg = STATUS_CONFIG[viewingRequest.status] ?? STATUS_CONFIG.pending;
            return (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Badge className={urgCfg.color}>{urgCfg.label}</Badge>
                  <Badge className={stsCfg.color}>{stsCfg.label}</Badge>
                  <span className="text-sm text-gray-400 ml-auto">{viewingRequest.requestDate}</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Patient</p>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{viewingRequest.patientName}</p>
                    {viewingRequest.patientUrNumber && (
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {viewingRequest.patientUrNumber}</span>
                    )}
                  </div>
                  {viewingRequest.patientDob && <p className="text-sm text-gray-600">DOB: {viewingRequest.patientDob}</p>}
                  {viewingRequest.patientPhone && <p className="text-sm text-gray-600 flex items-center gap-1"><Phone className="w-3 h-3" />{viewingRequest.patientPhone}</p>}
                  {viewingRequest.patientEmail && <p className="text-sm text-gray-600 flex items-center gap-1"><Mail className="w-3 h-3" />{viewingRequest.patientEmail}</p>}
                </div>
                {viewingRequest.referringDoctorName && (() => {
                  const linkedDoctor = viewingRequest.referringDoctorId
                    ? referringDoctors.find(d => d.id === viewingRequest.referringDoctorId)
                    : null;
                  const reqDelivery = (viewingRequest as any).preferredReportDelivery as string | null | undefined;
                  const reqDeliveryNote = (viewingRequest as any).preferredReportDeliveryNote as string | null | undefined;
                  const docDelivery = (linkedDoctor as any)?.preferredReportDelivery as string | null | undefined;
                  const docDeliveryNote = (linkedDoctor as any)?.preferredReportDeliveryNote as string | null | undefined;
                  return (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Referring Doctor</p>
                      <p className="font-semibold">{viewingRequest.referringDoctorName}</p>
                      {viewingRequest.referringDoctorProviderNumber && <p className="text-sm text-gray-600">Provider #: {viewingRequest.referringDoctorProviderNumber}</p>}
                      {(reqDelivery || docDelivery) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {reqDelivery && (
                            <>
                              <span className="text-[11px] text-gray-500">On request:</span>
                              <DeliveryBadge method={reqDelivery} note={reqDeliveryNote} />
                            </>
                          )}
                          {docDelivery && docDelivery !== reqDelivery && (
                            <>
                              <span className="text-[11px] text-gray-500 ml-1">Doctor's default:</span>
                              <DeliveryBadge method={docDelivery} note={docDeliveryNote} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(viewingRequest as any).source && (viewingRequest as any).source !== "internal" && (
                  <div className="flex items-center gap-2 rounded-lg p-2.5 bg-violet-50 border border-violet-200">
                    <Globe className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-violet-700">
                        {(viewingRequest as any).source === "web_form" ? "Received via Web Referral Form" : "Received via Referrer Portal"}
                      </p>
                      {(viewingRequest as any).referrerName && (
                        <p className="text-xs text-violet-600">Submitted by: {(viewingRequest as any).referrerName}</p>
                      )}
                    </div>
                  </div>
                )}
                {(viewingRequest.scanTypes ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Scan Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(viewingRequest.scanTypes ?? []).map(t => <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{t}</span>)}
                    </div>
                  </div>
                )}
                {viewingRequest.clinicalIndication && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Clinical Indication</p>
                    <p className="text-sm text-gray-700">{viewingRequest.clinicalIndication}</p>
                  </div>
                )}
                {viewingRequest.clinicalHistory && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Clinical History</p>
                    <p className="text-sm text-gray-700">{viewingRequest.clinicalHistory}</p>
                  </div>
                )}
                {viewingRequest.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{viewingRequest.notes}</p>
                  </div>
                )}

                {/* ── Save to Patient File section ── */}
                {showPatientPicker && (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-semibold text-blue-800">Select patient to save under:</p>
                    <Input
                      placeholder="Search patients…"
                      value={savePatientSearch}
                      onChange={e => setSavePatientSearch(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    {savePatientSearch.trim().length >= 2 && (
                      <div className="max-h-36 overflow-y-auto border rounded bg-white shadow-sm">
                        {savePatientResults.length > 0 ? savePatientResults.map(p => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b last:border-0"
                            disabled={saveToPatientFile.isPending}
                            onClick={() => {
                              saveToPatientFile.mutate({
                                requestId: viewingRequest.id,
                                patientId: p.id,
                                htmlContent: buildRequestHtml(viewingRequest),
                              });
                            }}
                          >
                            <span>{p.firstName} {p.lastName}</span>
                            {p.urNumber && <span className="font-mono text-xs text-blue-600 bg-blue-50 border border-blue-200 px-1.5 rounded">UR {p.urNumber}</span>}
                          </button>
                        )) : (
                          <p className="text-sm text-gray-400 px-3 py-2">No patients found</p>
                        )}
                      </div>
                    )}
                    {savePatientSearch.trim().length > 0 && savePatientSearch.trim().length < 2 && (
                      <p className="text-xs text-gray-400">Type at least 2 characters to search</p>
                    )}
                    <Button variant="ghost" size="sm" className="text-xs text-gray-500" onClick={() => { setShowPatientPicker(false); setSavePatientSearch(""); }}>
                      Cancel
                    </Button>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t flex-wrap">
                  <Button variant="outline" onClick={() => setViewingRequest(null)}>Close</Button>
                  {viewingRequest.patientId && onOpenPatient && (
                    <Button
                      variant="outline"
                      className="text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                      onClick={() => {
                        const pid = viewingRequest.patientId!;
                        setViewingRequest(null);
                        onOpenPatient(pid);
                      }}
                    >
                      <User className="w-4 h-4 mr-2" /> View Patient File
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => generateRequestPDF(viewingRequest)}>
                    <Printer className="w-4 h-4 mr-2" /> Print PDF
                  </Button>
                  {savedRequestIds.has(viewingRequest.id) ? (
                    <Button variant="outline" disabled className="text-green-600 border-green-300">
                      <CheckCheck className="w-4 h-4 mr-2" /> Saved to File
                    </Button>
                  ) : viewingRequest.patientId ? (
                    <Button
                      variant="outline"
                      className="text-blue-700 border-blue-300 hover:bg-blue-50"
                      disabled={saveToPatientFile.isPending}
                      onClick={() => saveToPatientFile.mutate({
                        requestId: viewingRequest.id,
                        patientId: viewingRequest.patientId!,
                        htmlContent: buildRequestHtml(viewingRequest),
                      })}
                    >
                      <FolderOpen className="w-4 h-4 mr-2" />
                      {saveToPatientFile.isPending ? "Saving…" : "Save to Patient File"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="text-blue-700 border-blue-300 hover:bg-blue-50"
                      onClick={() => { setShowPatientPicker(true); setSavePatientSearch(""); }}
                    >
                      <FolderOpen className="w-4 h-4 mr-2" /> Save to Patient File
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { setViewingRequest(null); openEditRequest(viewingRequest); }}>
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  {viewingRequest.status !== "scheduled" && viewingRequest.status !== "completed" && (
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        setScheduleForm({
                          appointmentDate: format(new Date(), "yyyy-MM-dd"),
                          appointmentTime: "09:00",
                          duration: "30",
                          physicianId: "",
                          sonographerId: "",
                          notes: viewingRequest.notes || "",
                        });
                        setSchedulingRequest(viewingRequest);
                        setViewingStep("schedule");
                        requestAnimationFrame(() => {
                          const dlg = document.querySelector('[role="dialog"]');
                          if (dlg) dlg.scrollTop = 0;
                        });
                      }}
                    >
                      <CalendarPlus className="w-4 h-4 mr-2" /> Schedule Appointment
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}

          {viewingRequest && viewingStep === "schedule" && (
            <div className="space-y-4">
              {/* Patient/scan summary stays visible at top */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                <p className="font-semibold text-blue-800">{viewingRequest.patientName}</p>
                <p className="text-blue-600 text-xs">{(viewingRequest.scanTypes ?? []).join(", ")}</p>
                {viewingRequest.clinicalIndication && (
                  <p className="text-blue-600 text-xs mt-0.5 italic">{viewingRequest.clinicalIndication}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={scheduleForm.appointmentDate}
                    onChange={e => setScheduleForm(p => ({ ...p, appointmentDate: e.target.value }))}
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Time *</Label>
                  <Input
                    type="time"
                    value={scheduleForm.appointmentTime}
                    onChange={e => setScheduleForm(p => ({ ...p, appointmentTime: e.target.value }))}
                    className="mt-1"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Duration (minutes)</Label>
                <Select value={scheduleForm.duration} onValueChange={v => setScheduleForm(p => ({ ...p, duration: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["15","20","30","45","60","75","90","120"].map(d => (
                      <SelectItem key={d} value={d}>{d} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {physicians.length > 0 && (
                <div>
                  <Label className="text-xs">Physician</Label>
                  <Select
                    value={scheduleForm.physicianId || "__none"}
                    onValueChange={v => setScheduleForm(p => ({ ...p, physicianId: v === "__none" ? "" : v }))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select physician (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {physicians.map(ph => (
                        <SelectItem key={ph.id} value={String(ph.id)}>{ph.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {sonographers.length > 0 && (
                <div>
                  <Label className="text-xs">Sonographer</Label>
                  <Select
                    value={scheduleForm.sonographerId || "__none"}
                    onValueChange={v => setScheduleForm(p => ({ ...p, sonographerId: v === "__none" ? "" : v }))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select sonographer (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {sonographers.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={scheduleForm.notes}
                  onChange={e => setScheduleForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="mt-1"
                  placeholder="Optional internal notes"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => {
                  setViewingStep("details");
                  requestAnimationFrame(() => {
                    const dlg = document.querySelector('[role="dialog"]');
                    if (dlg) dlg.scrollTop = 0;
                  });
                }}>← Back</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={scheduleAppointment.isPending || !scheduleForm.appointmentDate || !scheduleForm.appointmentTime}
                  onClick={() => scheduleAppointment.mutate({ request: viewingRequest, form: scheduleForm })}
                >
                  {scheduleAppointment.isPending ? "Scheduling..." : "Confirm & Schedule"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── REFERRING DOCTOR FORM DIALOG ── */}
      <Dialog open={isDoctorOpen} onOpenChange={v => { if (!v) { setIsDoctorOpen(false); setEditingDoctor(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDoctor ? "Edit Referring Doctor" : "Add Referring Doctor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitDoctor} className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input value={doctorForm.name} onChange={e => setDoctorForm(p => ({ ...p, name: e.target.value }))} required placeholder="Dr. John Smith" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Practice / Organisation</Label>
                <Input value={doctorForm.practiceName} onChange={e => setDoctorForm(p => ({ ...p, practiceName: e.target.value }))} placeholder="City Medical Centre" />
              </div>
              <div>
                <Label>Provider Number</Label>
                <Input value={doctorForm.providerNumber} onChange={e => setDoctorForm(p => ({ ...p, providerNumber: e.target.value }))} placeholder="2029764K" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={doctorForm.phone} onChange={e => setDoctorForm(p => ({ ...p, phone: e.target.value }))} placeholder="02 9999 0000" />
              </div>
              <div>
                <Label>Fax</Label>
                <Input value={doctorForm.fax} onChange={e => setDoctorForm(p => ({ ...p, fax: e.target.value }))} placeholder="02 9999 0001" />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input type="email" value={doctorForm.email} onChange={e => setDoctorForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={doctorForm.address} onChange={e => setDoctorForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St, Sydney NSW 2000" />
              </div>
              <div className="col-span-2">
                <Label>Preferred Report Delivery</Label>
                <Select
                  value={doctorForm.preferredReportDelivery || "__none"}
                  onValueChange={v => setDoctorForm(p => ({ ...p, preferredReportDelivery: v === "__none" ? "" : v, preferredReportDeliveryNote: v === "other" ? p.preferredReportDeliveryNote : "" }))}
                >
                  <SelectTrigger><SelectValue placeholder="No preference" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No preference</SelectItem>
                    <SelectItem value="secure_messaging">Secure Messaging</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="fax">Fax</SelectItem>
                    <SelectItem value="post">Post</SelectItem>
                    <SelectItem value="other">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                {doctorForm.preferredReportDelivery === "other" && (
                  <Input
                    className="mt-2"
                    placeholder="Specify delivery method..."
                    value={doctorForm.preferredReportDeliveryNote}
                    onChange={e => setDoctorForm(p => ({ ...p, preferredReportDeliveryNote: e.target.value }))}
                  />
                )}
                <p className="text-[11px] text-gray-500 mt-1">
                  How this doctor prefers to receive completed reports. Auto-populated when they submit a request.
                </p>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={doctorForm.notes} onChange={e => setDoctorForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => { setIsDoctorOpen(false); setEditingDoctor(null); }}>Cancel</Button>
              <Button type="submit" disabled={createDoctor.isPending || updateDoctor.isPending}>
                {createDoctor.isPending || updateDoctor.isPending ? "Saving..." : editingDoctor ? "Update" : "Add Doctor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
