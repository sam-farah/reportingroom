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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeliveryBadge } from "@/components/delivery-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Plus, Search, Edit, Trash2, User, Phone, Mail, Stethoscope,
  ClipboardList, Clock, CheckCircle, XCircle, AlertCircle, FileText,
  MapPin, Hash, Building2, ChevronRight, X, Printer, Globe, CalendarPlus,
  FolderOpen, CheckCheck, Send, Mailbox, ShieldCheck, ArrowUpDown, CalendarDays,
  UserCheck, Users, Link2, UserPlus, UserCog
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import type { ScanRequest, ReferringDoctor, Patient, Clinic, Physician, Sonographer, Appointment } from "@shared/schema";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";

// Format an ISO date string (yyyy-MM-dd or full ISO) as dd-mm-yyyy.
const fmtDate = (d?: string | null) => {
  if (!d) return "";
  try {
    const dt = d.length === 10 ? parseISO(d) : new Date(d);
    return isNaN(dt.getTime()) ? d : format(dt, "dd-MM-yyyy");
  } catch { return d; }
};
const fmtDateTime = (d?: string | Date | null) => {
  if (!d) return "";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    return isNaN(dt.getTime()) ? "" : format(dt, "dd-MM-yyyy HH:mm");
  } catch { return ""; }
};

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
  archived: { label: "Archived", color: "bg-zinc-100 text-zinc-600", icon: FolderOpen },
};

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

interface MatchAuditCandidate {
  id: number;
  urNumber: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  reasons: string[];
  score: number;
}
interface MatchAudit {
  source: string;
  isExternal: boolean;
  linkedPatient: { id: number; urNumber: string | null; firstName: string; lastName: string; dateOfBirth: string | null; phone: string | null; email: string | null } | null;
  wasAutoMatched: boolean;
  candidates: MatchAuditCandidate[];
  requestSnapshot: { patientName: string; patientDob: string | null; patientPhone: string | null; patientEmail: string | null };
}

function PatientMatchAudit({ requestId, onOpenPatient, onOpenPatientDetails }: { requestId: number; onOpenPatient?: (patientId: number) => void; onOpenPatientDetails?: (patientId: number) => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<MatchAudit>({ queryKey: ["/api/scan-requests", requestId, "match-audit"] });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/scan-requests", requestId, "match-audit"] });
    queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/scan-requests", requestId] });
    queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
  };

  const linkMutation = useMutation({
    mutationFn: async (patientId: number | null) => {
      return apiRequest(`/api/scan-requests/${requestId}`, "PUT", { patientId });
    },
    onSuccess: (_, patientId) => {
      invalidateAll();
      toast({
        title: patientId === null ? "Patient unlinked" : "Patient linked",
        description: patientId === null
          ? "Scan request is no longer linked to a patient."
          : "Scan request linked and archived to the patient file.",
      });
    },
    onError: () => toast({ title: "Failed to update link", variant: "destructive" }),
  });

  const createPatientMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/scan-requests/${requestId}/create-patient`, "POST");
      return res.json() as Promise<{ patient: { id: number; urNumber: string | null; firstName: string; lastName: string } }>;
    },
    onSuccess: (result) => {
      invalidateAll();
      toast({
        title: "Patient file created",
        description: `New patient ${result.patient.firstName} ${result.patient.lastName}${result.patient.urNumber ? ` (UR ${result.patient.urNumber})` : ""} created and linked.`,
      });
    },
    onError: (err: any) => toast({
      title: "Could not create patient",
      description: err?.message || "Try again",
      variant: "destructive",
    }),
  });

  if (isLoading || !data) {
    return (
      <div className="border rounded-lg p-3 bg-gray-50 text-xs text-gray-400">Checking patient matching…</div>
    );
  }

  const { linkedPatient, wasAutoMatched, isExternal, candidates, patientLinkSource } = data as any;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className={`px-3 py-2 flex items-center gap-2 ${linkedPatient ? "bg-emerald-50 border-b border-emerald-100" : "bg-amber-50 border-b border-amber-100"}`}>
        {linkedPatient ? <UserCheck className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
        <p className={`text-xs font-semibold uppercase tracking-wide ${linkedPatient ? "text-emerald-800" : "text-amber-800"}`}>
          Patient Match Audit
        </p>
      </div>

      <div className="p-3 space-y-3 bg-white">
        {linkedPatient ? (
          <div>
            <p className="text-xs text-gray-500 mb-1">
              {patientLinkSource === "created_new"
                ? "✓ New patient file created from this request"
                : patientLinkSource === "auto_match" || wasAutoMatched
                  ? "✓ Auto-matched to existing patient (name + DOB or name + phone)"
                  : isExternal
                    ? "✓ Linked to existing patient"
                    : "✓ Linked to patient (selected when request was created)"}
            </p>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded p-2">
              <span className="font-semibold text-sm">{linkedPatient.firstName} {linkedPatient.lastName}</span>
              {linkedPatient.urNumber && (
                <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {linkedPatient.urNumber}</span>
              )}
              {linkedPatient.dateOfBirth && <span className="text-xs text-gray-600">DOB: {linkedPatient.dateOfBirth}</span>}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                disabled={linkMutation.isPending}
                onClick={() => {
                  if (confirm("Unlink this patient from the scan request?")) {
                    linkMutation.mutate(null);
                  }
                }}
                data-testid="button-unlink-patient"
              >
                <X className="w-3 h-3 mr-1" />
                Unlink
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              {isExternal
                ? "⚠ No patient linked. The system did not find a matching patient (requires exact name + DOB or name + phone). No new patient file has been created — your approval is required before one is added."
                : "⚠ No patient linked yet."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                disabled={createPatientMutation.isPending || !data.requestSnapshot.patientDob}
                onClick={() => {
                  const snap = data.requestSnapshot;
                  if (confirm(`Create a new patient file for "${snap.patientName}" (DOB ${snap.patientDob}) and link it to this request?`)) {
                    createPatientMutation.mutate();
                  }
                }}
                data-testid="button-create-patient-from-request"
              >
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                {createPatientMutation.isPending ? "Creating…" : "Create New Patient File"}
              </Button>
              {!data.requestSnapshot.patientDob && (
                <p className="text-[11px] text-amber-700 self-center">Date of birth missing — edit the request to add one before creating a patient file.</p>
              )}
            </div>
          </div>
        )}

        {linkedPatient && (onOpenPatient || onOpenPatientDetails) && (
          <div className="flex flex-col gap-1.5 items-start">
            {onOpenPatient && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onOpenPatient(linkedPatient.id)}
                data-testid="button-open-linked-patient"
              >
                <FolderOpen className="w-3 h-3 mr-1" />
                Open patient file
              </Button>
            )}
            {onOpenPatientDetails && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onOpenPatientDetails(linkedPatient.id)}
                data-testid="button-open-linked-patient-details"
              >
                <UserCog className="w-3 h-3 mr-1" />
                Open patient details
              </Button>
            )}
          </div>
        )}

        {candidates.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Possible {linkedPatient ? "alternatives" : "matches"} found
            </p>
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <div key={c.id} className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded p-2">
                  <Link2 className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.firstName} {c.lastName}</span>
                      {c.urNumber && (
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {c.urNumber}</span>
                      )}
                      {c.dateOfBirth && <span className="text-xs text-gray-500">DOB: {c.dateOfBirth}</span>}
                      {c.phone && <span className="text-xs text-gray-500">{c.phone}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.reasons.map((r) => (
                        <span key={r} className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{r}</span>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                    disabled={linkMutation.isPending}
                    onClick={() => {
                      const verb = linkedPatient ? "Re-link" : "Link";
                      if (confirm(`${verb} this scan request to ${c.firstName} ${c.lastName}${c.urNumber ? ` (UR ${c.urNumber})` : ""}?`)) {
                        linkMutation.mutate(c.id);
                      }
                    }}
                    data-testid={`button-link-candidate-${c.id}`}
                  >
                    <CheckCheck className="w-3 h-3 mr-1" />
                    {linkedPatient ? "Re-link" : "Link"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {candidates.length === 0 && !linkedPatient && (
          <p className="text-xs text-gray-400 italic">No similar patients found in your clinic.</p>
        )}
      </div>
    </div>
  );
}

export default function Requests({ onOpenPatient, onOpenPatientDetails }: { onOpenPatient?: (patientId: number) => void; onOpenPatientDetails?: (patientId: number) => void } = {}) {
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

  // ── Save-to-patient state ─────────────────────────────────────────
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [savePatientSearch, setSavePatientSearch] = useState("");
  const [savedRequestIds, setSavedRequestIds] = useState<Set<number>>(new Set());

  // ── Scheduling state ──────────────────────────────────────────────
  const [schedulingRequest, setSchedulingRequest] = useState<ScanRequest | null>(null); // kept for mutation compat
  const [viewingStep, setViewingStep] = useState<"details" | "schedule" | "scheduled">("details");
  const [editableEmail, setEditableEmail] = useState<string>("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [lastScheduledAppt, setLastScheduledAppt] = useState<{ id: number; patientEmail: string | null; patientId: number | null } | null>(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [registrationSent, setRegistrationSent] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingRegistration, setSendingRegistration] = useState(false);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    appointmentDate: format(new Date(), "yyyy-MM-dd"),
    appointmentTime: "09:00",
    duration: "30",
    physicianId: "",
    sonographerId: "",
    notes: "",
  });

  // Day's appointments for the selected booking date
  const { data: dayAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", "by-date", scheduleForm.appointmentDate],
    queryFn: async () => {
      if (!scheduleForm.appointmentDate) return [];
      const start = startOfDay(parseISO(scheduleForm.appointmentDate)).toISOString();
      const end = endOfDay(parseISO(scheduleForm.appointmentDate)).toISOString();
      const r = await fetch(`/api/appointments?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: viewingStep === "schedule" && !!scheduleForm.appointmentDate,
  });

  // Send registration form to patient on a request
  const sendRegistrationMutation = useMutation({
    mutationFn: async (patientId: number) => {
      const res = await apiRequest(`/api/patients/${patientId}/send-registration`, "POST");
      return res.json();
    },
    onSuccess: () => toast({ title: "Registration form sent", description: "The patient will receive an email shortly." }),
    onError: (err: any) => toast({ title: "Failed to send", description: err?.message || "Could not send registration email", variant: "destructive" }),
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

  const setRequestStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest(`/api/scan-requests/${id}`, "PUT", { status }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
      const label = STATUS_CONFIG[vars.status]?.label ?? vars.status;
      toast({ title: `Marked as ${label}` });
      setViewingRequest(null);
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  // Conflict-handling state for the schedule flow
  const [pendingConflict, setPendingConflict] = useState<{
    conflicts: { id: number; patientName: string; appointmentDate: string; duration: number; scanType: string }[];
    request: ScanRequest;
    form: typeof scheduleForm;
  } | null>(null);

  const scheduleAppointment = useMutation({
    mutationFn: async ({ request, form, force }: { request: ScanRequest; form: typeof scheduleForm; force?: boolean }) => {
      const [datePart] = form.appointmentDate.split("T");
      const appointmentDate = new Date(`${datePart}T${form.appointmentTime}:00`);
      const body = {
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
        force: !!force,
      };
      const apptRes = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (apptRes.status === 409) {
        const conflictBody = await apptRes.json();
        const err = new Error("appointment_conflict") as any;
        err.conflicts = conflictBody.conflicts || [];
        err.isConflict = true;
        throw err;
      }
      if (!apptRes.ok) {
        const txt = await apptRes.text();
        throw new Error(txt || `Failed (${apptRes.status})`);
      }
      const appt = await apptRes.json();
      await apiRequest(`/api/scan-requests/${request.id}`, "PUT", {
        status: "scheduled",
        scheduledAppointmentId: appt.id,
      });
      return appt;
    },
    onSuccess: (appt: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setSchedulingRequest(null);
      setPendingConflict(null);
      setLastScheduledAppt({
        id: appt.id,
        patientEmail: appt.patientEmail ?? vars.request.patientEmail ?? null,
        patientId: appt.patientId ?? vars.request.patientId ?? null,
      });
      setReminderSent(false);
      setRegistrationSent(false);
      setViewingStep("scheduled");
      toast({ title: "Appointment scheduled", description: "The request has been marked as scheduled." });
    },
    onError: (err: any, vars) => {
      if (err?.isConflict) {
        setPendingConflict({ conflicts: err.conflicts, request: vars.request, form: vars.form });
        return;
      }
      toast({ title: "Failed to schedule appointment", variant: "destructive" });
    },
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

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRequest) updateRequest.mutate({ id: editingRequest.id, data: requestForm });
    else createRequest.mutate(requestForm);
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
    const matchStatus =
      statusFilter === "all"
        ? r.status !== "archived"
        : r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scan Requests</h1>
        <p className="text-gray-500 mt-1">Manage electronic referrals</p>
      </div>

      <div>
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
                            {r.patientDob && <span className="text-xs text-gray-400">DOB: {fmtDate(r.patientDob)}</span>}
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
                          <div className="flex flex-col items-end leading-tight">
                            <span className="text-xs text-gray-500">{fmtDate(r.requestDate)}</span>
                            {r.createdAt && (
                              <span className="text-[10px] text-gray-400">Received {fmtDateTime(r.createdAt)}</span>
                            )}
                          </div>
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
        </div>


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
      <Dialog open={!!viewingRequest} onOpenChange={v => { if (!v) { setViewingRequest(null); setViewingStep("details"); setShowPatientPicker(false); setSavePatientSearch(""); setLastScheduledAppt(null); setReminderSent(false); setRegistrationSent(false); setEditableEmail(""); } }}>
        <DialogContent className={`${viewingStep === "schedule" ? "max-w-[1400px] w-[95vw]" : viewingStep === "scheduled" ? "max-w-2xl" : "max-w-5xl w-[95vw]"} max-h-[92vh] overflow-y-auto transition-all`}>
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
              ) : viewingStep === "scheduled" ? (
                <><CalendarPlus className="w-5 h-5 text-green-600" /> Appointment Booked</>
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
                  <div className="ml-auto text-right leading-tight">
                    <div className="text-sm text-gray-500">{fmtDate(viewingRequest.requestDate)}</div>
                    {viewingRequest.createdAt && (
                      <div className="text-[11px] text-gray-400">Received {fmtDateTime(viewingRequest.createdAt)}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
                  {/* ── LEFT: Scan details / clinical info ── */}
                  <div className="space-y-3 lg:border-r lg:pr-5">
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Patient</p>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{viewingRequest.patientName}</p>
                    {viewingRequest.patientUrNumber && (
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {viewingRequest.patientUrNumber}</span>
                    )}
                  </div>
                  {viewingRequest.patientDob && <p className="text-sm text-gray-600">DOB: {fmtDate(viewingRequest.patientDob)}</p>}
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
                  const docEmail = (viewingRequest as any).referringDoctorEmail as string | null | undefined;
                  const effectiveDelivery = reqDelivery || docDelivery;
                  const effectiveDeliveryNote = reqDelivery ? reqDeliveryNote : docDeliveryNote;
                  const deliverySource = reqDelivery ? "On this request" : docDelivery ? "Doctor's saved default" : null;
                  return (
                    <>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Referring Doctor</p>
                        <p className="font-semibold">{viewingRequest.referringDoctorName}</p>
                        {viewingRequest.referringDoctorProviderNumber && <p className="text-sm text-gray-600">Provider #: {viewingRequest.referringDoctorProviderNumber}</p>}
                        {docEmail && (
                          <p className="text-sm text-gray-600 flex items-center gap-1" data-testid="text-referring-doctor-email">
                            <Mail className="w-3 h-3" />{docEmail}
                          </p>
                        )}
                      </div>
                      {effectiveDelivery && (
                        <div
                          className="rounded-lg p-3 space-y-2 border border-blue-200 bg-blue-50"
                          data-testid="block-preferred-delivery"
                        >
                          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Preferred Report Delivery</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <DeliveryBadge method={effectiveDelivery} note={effectiveDeliveryNote} />
                            {deliverySource && (
                              <span className="text-[11px] text-blue-700/70">({deliverySource})</span>
                            )}
                          </div>
                          {effectiveDelivery === "other" && effectiveDeliveryNote && (
                            <p className="text-xs text-blue-900/80">Details: {effectiveDeliveryNote}</p>
                          )}
                          {reqDelivery && docDelivery && docDelivery !== reqDelivery && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-blue-200">
                              <span className="text-[11px] text-gray-500">Doctor's saved default:</span>
                              <DeliveryBadge method={docDelivery} note={docDeliveryNote} />
                            </div>
                          )}
                        </div>
                      )}
                    </>
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
                  </div>

                  {/* ── RIGHT: Patient match / linking ── */}
                  <div className="space-y-3">
                    <PatientMatchAudit requestId={viewingRequest.id} onOpenPatient={onOpenPatient} onOpenPatientDetails={onOpenPatientDetails} />
                  </div>
                </div>

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
                  <Button variant="outline" onClick={() => { setViewingRequest(null); openEditRequest(viewingRequest); }}>
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  {viewingRequest.status !== "completed" && viewingRequest.status !== "archived" && (
                    <Button
                      variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      disabled={setRequestStatus.isPending}
                      onClick={() => {
                        if (confirm("Mark this study as completed?")) {
                          setRequestStatus.mutate({ id: viewingRequest.id, status: "completed" });
                        }
                      }}
                      data-testid="button-mark-completed"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> Mark Completed
                    </Button>
                  )}
                  {viewingRequest.status !== "archived" && (
                    <Button
                      variant="outline"
                      className="text-zinc-700 border-zinc-300 hover:bg-zinc-50"
                      disabled={setRequestStatus.isPending}
                      onClick={() => {
                        if (confirm("Archive this scan request? It will be hidden from active lists but remains accessible via filters.")) {
                          setRequestStatus.mutate({ id: viewingRequest.id, status: "archived" });
                        }
                      }}
                      data-testid="button-archive-request"
                    >
                      <FolderOpen className="w-4 h-4 mr-2" /> Archive
                    </Button>
                  )}
                  {viewingRequest.status !== "scheduled" && viewingRequest.status !== "completed" && viewingRequest.status !== "archived" && (
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

          {viewingRequest && viewingStep === "schedule" && (() => {
            const urgCfg = URGENCY_CONFIG[viewingRequest.urgency] ?? URGENCY_CONFIG.routine;
            const selectedDate = scheduleForm.appointmentDate ? parseISO(scheduleForm.appointmentDate) : new Date();
            const sortedDayAppts = [...dayAppointments]
              .filter(a => a.status !== "cancelled")
              .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
            return (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
                {/* ── LEFT: Patient / request summary ── */}
                <div className="space-y-3 lg:border-r lg:pr-5">
                  <div className="flex gap-2 flex-wrap">
                    <Badge className={urgCfg.color}>{urgCfg.label}</Badge>
                    <div className="ml-auto text-right leading-tight">
                      <div className="text-xs text-gray-500">{fmtDate(viewingRequest.requestDate)}</div>
                      {viewingRequest.createdAt && (
                        <div className="text-[10px] text-gray-400">Received {fmtDateTime(viewingRequest.createdAt)}</div>
                      )}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                    <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Patient</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-blue-900">{viewingRequest.patientName}</p>
                      {viewingRequest.patientUrNumber && (
                        <span className="font-mono font-bold text-blue-700 bg-white border border-blue-200 px-1.5 py-0.5 rounded text-xs">UR {viewingRequest.patientUrNumber}</span>
                      )}
                    </div>
                    {viewingRequest.patientDob && <p className="text-xs text-blue-700">DOB: {fmtDate(viewingRequest.patientDob)}</p>}
                    {viewingRequest.patientPhone && <p className="text-xs text-blue-700 flex items-center gap-1"><Phone className="w-3 h-3" />{viewingRequest.patientPhone}</p>}
                    {viewingRequest.patientEmail ? (
                      <p className="text-xs text-blue-700 flex items-center gap-1"><Mail className="w-3 h-3" />{viewingRequest.patientEmail}</p>
                    ) : (
                      <div className="pt-1.5 mt-1.5 border-t border-blue-200 space-y-1">
                        <Label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1">
                          <Mail className="w-3 h-3" /> Add patient email (optional)
                        </Label>
                        <div className="flex gap-1.5">
                          <Input
                            type="email"
                            placeholder="patient@example.com"
                            value={editableEmail}
                            onChange={e => setEditableEmail(e.target.value)}
                            className="h-7 text-xs flex-1 bg-white"
                            data-testid="input-add-patient-email"
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={savingEmail || !editableEmail.includes("@")}
                            onClick={async () => {
                              if (!viewingRequest || !editableEmail.includes("@")) return;
                              setSavingEmail(true);
                              try {
                                await apiRequest(`/api/scan-requests/${viewingRequest.id}`, "PUT", { patientEmail: editableEmail });
                                if (viewingRequest.patientId) {
                                  await apiRequest(`/api/patients/${viewingRequest.patientId}`, "PUT", { email: editableEmail });
                                  queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
                                }
                                queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
                                // Patch local viewing copy so the rest of the dialog (and the schedule mutation) sees the new email
                                setViewingRequest({ ...viewingRequest, patientEmail: editableEmail });
                                toast({ title: "Email saved", description: viewingRequest.patientId ? "Updated on the request and the patient file." : "Saved on this request." });
                                setEditableEmail("");
                              } catch (err: any) {
                                toast({ title: "Failed to save email", description: err?.message || "Try again", variant: "destructive" });
                              } finally {
                                setSavingEmail(false);
                              }
                            }}
                            data-testid="button-save-patient-email"
                          >
                            {savingEmail ? "…" : "Save"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-blue-600/80">Needed to send reminders and registration link.</p>
                      </div>
                    )}
                  </div>

                  {viewingRequest.referringDoctorName && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-0.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Referring Doctor</p>
                      <p className="text-sm font-medium">{viewingRequest.referringDoctorName}</p>
                      {viewingRequest.referringDoctorProviderNumber && <p className="text-xs text-gray-500">Provider #: {viewingRequest.referringDoctorProviderNumber}</p>}
                    </div>
                  )}

                  {(viewingRequest.scanTypes ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Scan Types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(viewingRequest.scanTypes ?? []).map(t => <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{t}</span>)}
                      </div>
                    </div>
                  )}
                  {viewingRequest.clinicalIndication && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Clinical Indication</p>
                      <p className="text-xs text-gray-700">{viewingRequest.clinicalIndication}</p>
                    </div>
                  )}
                  {viewingRequest.clinicalHistory && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Clinical History</p>
                      <p className="text-xs text-gray-700">{viewingRequest.clinicalHistory}</p>
                    </div>
                  )}
                  {viewingRequest.notes && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-xs text-gray-700">{viewingRequest.notes}</p>
                    </div>
                  )}

                  {viewingRequest.patientId && viewingRequest.patientEmail && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-blue-700 border-blue-300 hover:bg-blue-50"
                      disabled={sendRegistrationMutation.isPending}
                      onClick={() => sendRegistrationMutation.mutate(viewingRequest.patientId!)}
                      data-testid="button-send-registration-schedule"
                    >
                      <Mail className="w-3.5 h-3.5 mr-1.5" />
                      {sendRegistrationMutation.isPending ? "Sending…" : "Email Registration Form"}
                    </Button>
                  )}
                </div>

                {/* ── RIGHT: Calendar booking ── */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <CalendarDays className="w-4 h-4 text-blue-600" />
                    Pick a date &amp; time
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-3">
                    {/* Visual calendar picker */}
                    <div className="border rounded-lg p-1.5 bg-white self-start">
                      <CalendarPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => d && setScheduleForm(p => ({ ...p, appointmentDate: format(d, "yyyy-MM-dd") }))}
                        weekStartsOn={1}
                      />
                    </div>

                    {/* Full day-view timeline */}
                    <div className="border rounded-lg bg-white flex flex-col">
                      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between rounded-t-lg">
                        <p className="text-sm font-semibold text-gray-700">
                          {format(selectedDate, "EEEE d MMM yyyy")}
                        </p>
                        <span className="text-xs text-gray-500">{sortedDayAppts.length} booked · click a slot to set time</span>
                      </div>
                      {(() => {
                        const startHour = 7;
                        const endHour = 19;
                        const pxPerMin = 1.2; // 72px / hour
                        const totalMinutes = (endHour - startHour) * 60;
                        const heightPx = totalMinutes * pxPerMin;
                        const slotMinutes = 15;
                        const selTimeParts = scheduleForm.appointmentTime?.split(":") ?? [];
                        const selStartMin = selTimeParts.length === 2
                          ? (parseInt(selTimeParts[0]) - startHour) * 60 + parseInt(selTimeParts[1])
                          : -1;
                        const selDuration = parseInt(scheduleForm.duration || "30");
                        return (
                          <div
                            className="relative overflow-y-auto"
                            style={{ maxHeight: "560px" }}
                          >
                            <div
                              className="relative group/timeline"
                              style={{ height: `${heightPx}px` }}
                              onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                const min = Math.max(0, Math.min(totalMinutes - 1, Math.floor(y / pxPerMin / slotMinutes) * slotMinutes));
                                setHoverMin(min);
                              }}
                              onMouseLeave={() => setHoverMin(null)}
                              onClick={(e) => {
                                // Click anywhere on the timeline body to set time at the snapped slot
                                const rect = e.currentTarget.getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                const min = Math.max(0, Math.min(totalMinutes - 1, Math.floor(y / pxPerMin / slotMinutes) * slotMinutes));
                                const hr = startHour + Math.floor(min / 60);
                                const mm = min % 60;
                                setScheduleForm(p => ({
                                  ...p,
                                  appointmentTime: `${String(hr).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
                                }));
                              }}
                            >
                              {/* Hour rows */}
                              {Array.from({ length: endHour - startHour }).map((_, i) => {
                                const hr = startHour + i;
                                return (
                                  <div
                                    key={hr}
                                    className="absolute left-0 right-0 border-t border-gray-200 flex pointer-events-none"
                                    style={{ top: `${i * 60 * pxPerMin}px`, height: `${60 * pxPerMin}px` }}
                                  >
                                    <div className="w-14 flex-shrink-0 text-[11px] font-mono text-gray-500 pl-2 pt-0.5">
                                      {String(hr).padStart(2, "0")}:00
                                    </div>
                                    <div className="flex-1 border-l border-gray-100" />
                                  </div>
                                );
                              })}
                              {/* Bottom border */}
                              <div className="absolute left-0 right-0 border-t border-gray-200 pointer-events-none" style={{ top: `${heightPx}px` }} />

                              {/* Hover ghost — sticks to mouse, snapped to 15-min */}
                              {hoverMin !== null && (
                                <div
                                  className="absolute right-1 left-16 bg-gray-100/70 border border-dashed border-gray-400 rounded text-[10px] text-gray-600 px-2 py-0.5 pointer-events-none z-20"
                                  style={{
                                    top: `${hoverMin * pxPerMin}px`,
                                    height: `${Math.max(selDuration * pxPerMin, 16)}px`,
                                  }}
                                >
                                  {`${String(startHour + Math.floor(hoverMin / 60)).padStart(2, "0")}:${String(hoverMin % 60).padStart(2, "0")} · ${selDuration}m`}
                                </div>
                              )}

                              {/* Existing appointments */}
                              {sortedDayAppts.map(a => {
                                const t = new Date(a.appointmentDate);
                                const minsFromStart = (t.getHours() - startHour) * 60 + t.getMinutes();
                                if (minsFromStart < 0 || minsFromStart >= totalMinutes) return null;
                                const top = minsFromStart * pxPerMin;
                                const h = Math.max((a.duration || 30) * pxPerMin, 18);
                                return (
                                  <div
                                    key={a.id}
                                    className="absolute right-1 left-16 bg-blue-100 border border-blue-300 rounded px-2 py-0.5 text-xs overflow-hidden shadow-sm"
                                    style={{ top: `${top}px`, height: `${h}px` }}
                                    title={`${format(t, "HH:mm")} · ${a.patientName} · ${a.duration}m${a.scanType ? " · " + a.scanType : ""}`}
                                  >
                                    <div className="font-semibold text-blue-900 truncate leading-tight">
                                      {format(t, "HH:mm")} {a.patientName}
                                    </div>
                                    {h > 28 && (
                                      <div className="text-[10px] text-blue-700 truncate leading-tight">
                                        {a.duration}m {a.scanType ? "· " + a.scanType : ""}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Selected slot — subtle line indicator on the left edge */}
                              {selStartMin >= 0 && selStartMin < totalMinutes && (
                                <div
                                  className="absolute left-14 w-1 bg-green-500 rounded pointer-events-none z-10"
                                  style={{
                                    top: `${selStartMin * pxPerMin}px`,
                                    height: `${Math.max(selDuration * pxPerMin, 12)}px`,
                                  }}
                                  title={`Selected: ${scheduleForm.appointmentTime} · ${selDuration}m`}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                  </div>

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

                  <div className="flex justify-end gap-2 pt-3 border-t">
                    <Button variant="outline" onClick={() => {
                      setViewingStep("details");
                      requestAnimationFrame(() => {
                        const dlg = document.querySelector('[role="dialog"]');
                        if (dlg) dlg.scrollTop = 0;
                      });
                    }}>← Back to details</Button>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={scheduleAppointment.isPending || !scheduleForm.appointmentDate || !scheduleForm.appointmentTime}
                      onClick={() => scheduleAppointment.mutate({ request: viewingRequest, form: scheduleForm })}
                      data-testid="button-confirm-schedule"
                    >
                      {scheduleAppointment.isPending ? "Scheduling..." : "Confirm & Schedule"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {viewingRequest && viewingStep === "scheduled" && lastScheduledAppt && (() => {
            const apptDate = scheduleForm.appointmentDate && scheduleForm.appointmentTime
              ? new Date(`${scheduleForm.appointmentDate}T${scheduleForm.appointmentTime}:00`)
              : null;
            const email = lastScheduledAppt.patientEmail || viewingRequest.patientEmail || "";
            const hasEmail = !!email && email.includes("@");
            return (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0 font-bold">✓</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900">Appointment scheduled</h3>
                    <p className="text-sm text-green-800 mt-0.5">
                      <strong>{viewingRequest.patientName}</strong>
                      {apptDate && <> · {format(apptDate, "EEE d MMM yyyy 'at' HH:mm")}</>}
                      {scheduleForm.duration && <> · {scheduleForm.duration} min</>}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Send to the patient</p>

                  {!hasEmail && (
                    <div className="border rounded-lg p-3 bg-amber-50 border-amber-200 space-y-2">
                      <p className="text-xs text-amber-800">
                        <strong>No email on file.</strong> Add the patient's email so we can send the reminder and registration link.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="patient@example.com"
                          value={editableEmail}
                          onChange={e => setEditableEmail(e.target.value)}
                          className="h-8 text-sm flex-1 bg-white"
                          data-testid="input-scheduled-add-email"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingEmail || !editableEmail.includes("@")}
                          onClick={async () => {
                            if (!editableEmail.includes("@")) return;
                            setSavingEmail(true);
                            try {
                              // Update appointment so reminder uses it
                              await apiRequest(`/api/appointments/${lastScheduledAppt.id}`, "PUT", { patientEmail: editableEmail, force: true });
                              // Update request
                              await apiRequest(`/api/scan-requests/${viewingRequest.id}`, "PUT", { patientEmail: editableEmail });
                              // Update or create patient
                              let patientId = lastScheduledAppt.patientId;
                              if (patientId) {
                                await apiRequest(`/api/patients/${patientId}`, "PUT", { email: editableEmail });
                              } else {
                                const nameParts = (viewingRequest.patientName || "").trim().split(/\s+/);
                                const firstName = nameParts[0] || viewingRequest.patientName || "Patient";
                                const lastName = nameParts.slice(1).join(" ") || "—";
                                const created = await (await apiRequest(`/api/patients`, "POST", {
                                  firstName, lastName,
                                  dateOfBirth: viewingRequest.patientDob || null,
                                  phone: viewingRequest.patientPhone || null,
                                  email: editableEmail,
                                  urNumber: viewingRequest.patientUrNumber || null,
                                })).json();
                                patientId = created?.id ?? null;
                                if (patientId) {
                                  await apiRequest(`/api/scan-requests/${viewingRequest.id}`, "PUT", { patientId });
                                  await apiRequest(`/api/appointments/${lastScheduledAppt.id}`, "PUT", { patientId, force: true });
                                }
                              }
                              setLastScheduledAppt({ ...lastScheduledAppt, patientEmail: editableEmail, patientId });
                              setViewingRequest({ ...viewingRequest, patientEmail: editableEmail, patientId: patientId ?? viewingRequest.patientId });
                              queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
                              toast({ title: "Email saved", description: "You can now send reminders and the registration link." });
                              setEditableEmail("");
                            } catch (err: any) {
                              toast({ title: "Failed to save email", description: err?.message || "Try again", variant: "destructive" });
                            } finally {
                              setSavingEmail(false);
                            }
                          }}
                          data-testid="button-scheduled-save-email"
                        >
                          {savingEmail ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {hasEmail && (
                    <p className="text-xs text-gray-500">Sending to <strong className="text-gray-700">{email}</strong></p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Reminder */}
                    <div className={`border rounded-lg p-4 ${reminderSent ? "bg-green-50 border-green-200" : "bg-white"}`}>
                      <div className="flex items-start gap-2 mb-2">
                        <Mail className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">Appointment reminder</h4>
                          <p className="text-xs text-gray-500 mt-0.5">Date, time, location and prep instructions for the {(viewingRequest.scanTypes ?? [])[0] || "scan"}.</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        variant={reminderSent ? "outline" : "default"}
                        disabled={!hasEmail || sendingReminder || reminderSent}
                        onClick={async () => {
                          setSendingReminder(true);
                          try {
                            const res = await fetch(`/api/appointments/${lastScheduledAppt.id}/send-reminder`, { method: "POST", credentials: "include" });
                            if (!res.ok) {
                              const txt = await res.text();
                              throw new Error(txt || `Failed (${res.status})`);
                            }
                            setReminderSent(true);
                            toast({ title: "Reminder sent", description: `Sent to ${email}` });
                          } catch (err: any) {
                            toast({ title: "Failed to send reminder", description: err?.message || "Try again", variant: "destructive" });
                          } finally {
                            setSendingReminder(false);
                          }
                        }}
                        data-testid="button-send-appt-reminder"
                      >
                        {reminderSent ? "✓ Reminder sent" : sendingReminder ? "Sending…" : "Send reminder"}
                      </Button>
                    </div>

                    {/* Registration link */}
                    <div className={`border rounded-lg p-4 ${registrationSent ? "bg-green-50 border-green-200" : "bg-white"}`}>
                      <div className="flex items-start gap-2 mb-2">
                        <Mail className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">Registration link</h4>
                          <p className="text-xs text-gray-500 mt-0.5">Lets the patient fill in DOB, address, Medicare card and history. Saves straight onto the patient file.</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        variant={registrationSent ? "outline" : "default"}
                        disabled={!hasEmail || sendingRegistration || registrationSent}
                        onClick={async () => {
                          setSendingRegistration(true);
                          try {
                            // Ensure a patient record exists so registration data has somewhere to land
                            let patientId = lastScheduledAppt.patientId;
                            if (!patientId) {
                              const nameParts = (viewingRequest.patientName || "").trim().split(/\s+/);
                              const firstName = nameParts[0] || viewingRequest.patientName || "Patient";
                              const lastName = nameParts.slice(1).join(" ") || "—";
                              const created = await (await apiRequest(`/api/patients`, "POST", {
                                firstName, lastName,
                                dateOfBirth: viewingRequest.patientDob || null,
                                phone: viewingRequest.patientPhone || null,
                                email: email,
                                urNumber: viewingRequest.patientUrNumber || null,
                              })).json();
                              patientId = created?.id;
                              if (patientId) {
                                await apiRequest(`/api/scan-requests/${viewingRequest.id}`, "PUT", { patientId });
                                await apiRequest(`/api/appointments/${lastScheduledAppt.id}`, "PUT", { patientId, force: true });
                                setLastScheduledAppt({ ...lastScheduledAppt, patientId });
                                queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
                              }
                            }
                            if (!patientId) throw new Error("Could not create patient record");
                            const res = await fetch(`/api/patients/${patientId}/send-registration`, { method: "POST", credentials: "include" });
                            if (!res.ok) {
                              const txt = await res.text();
                              throw new Error(txt || `Failed (${res.status})`);
                            }
                            setRegistrationSent(true);
                            toast({ title: "Registration link sent", description: `Sent to ${email}` });
                          } catch (err: any) {
                            toast({ title: "Failed to send registration link", description: err?.message || "Try again", variant: "destructive" });
                          } finally {
                            setSendingRegistration(false);
                          }
                        }}
                        data-testid="button-send-registration-link"
                      >
                        {registrationSent ? "✓ Registration sent" : sendingRegistration ? "Sending…" : "Send registration link"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t">
                  <Button
                    onClick={() => {
                      setViewingRequest(null);
                      setViewingStep("details");
                      setLastScheduledAppt(null);
                      setReminderSent(false);
                      setRegistrationSent(false);
                      setEditableEmail("");
                    }}
                    data-testid="button-done-scheduled"
                  >
                    Done
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── CONFLICT WARNING DIALOG ── */}
      <Dialog open={!!pendingConflict} onOpenChange={v => { if (!v) setPendingConflict(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-5 h-5" /> Time slot already booked
            </DialogTitle>
          </DialogHeader>
          {pendingConflict && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                The time you picked overlaps with {pendingConflict.conflicts.length === 1 ? "an existing appointment" : `${pendingConflict.conflicts.length} existing appointments`}:
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg divide-y divide-amber-200">
                {pendingConflict.conflicts.map(c => {
                  const t = new Date(c.appointmentDate);
                  return (
                    <div key={c.id} className="p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-amber-800">{format(t, "HH:mm")}</span>
                        <span className="font-medium text-amber-900">{c.patientName}</span>
                        <span className="text-xs text-amber-600 ml-auto">{c.duration}m</span>
                      </div>
                      {c.scanType && <p className="text-xs text-amber-700 mt-0.5">{c.scanType}</p>}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">
                Pick a different time, or override and double-book this slot anyway.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setPendingConflict(null)} data-testid="button-pick-different-time">
                  Pick a different time
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => scheduleAppointment.mutate({ request: pendingConflict.request, form: pendingConflict.form, force: true })}
                  disabled={scheduleAppointment.isPending}
                  data-testid="button-override-conflict"
                >
                  {scheduleAppointment.isPending ? "Booking…" : "Book anyway"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
