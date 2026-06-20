import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { capitalizeWords } from "@/lib/utils";
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
import { Plus, Search, User, Phone, Mail, Calendar, FileText, ClipboardList, Edit, Trash2, ChevronLeft, MapPin, File, Clock, CheckCircle, AlertCircle, X, Upload, CreditCard, ShieldCheck, ShieldAlert, Heart, Archive, ClipboardCheck, Send, MessageSquare, Printer, CalendarDays, Layers, Download, ExternalLink, Link, Eye, Stethoscope, Loader2, Check, ArrowDownUp } from "lucide-react";
import ConsultationDialog from "@/components/consultation-dialog";
import { format } from "date-fns";
import type { Patient, Worksheet, Report, Appointment, DigitalWorksheet, PatientDocument, ReminderLog, ReportDistribution, PatientNote } from "@shared/schema";
import { WorksheetViewer } from "@/components/worksheet-viewer";

// Feature flag for the new Consultation dialog. Set to true once user has signed off on testing.
const CONSULTATIONS_ENABLED = false;

function AutoSaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-500" data-testid="autosave-status">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600" data-testid="autosave-status">
        <Check className="w-3.5 h-3.5" /> Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-600" data-testid="autosave-status">
        <AlertCircle className="w-3.5 h-3.5" /> Save failed
      </span>
    );
  }
  return null;
}

const safeDateFormat = (v: any, fmt: string, fallback: string = "—"): string => {
  if (!v) return fallback;
  try {
    let d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime()) && typeof v === "string") {
      const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(v);
      if (m) d = new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
    }
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
};

function PdfViewer({ url, title, originalName }: { url: string; title: string; originalName?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileNotFound, setFileNotFound] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    setFileNotFound(false);

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (res.status === 404) { setFileNotFound(true); throw new Error("not_found"); }
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        // Re-create blob with explicit PDF mime type so browser renders it correctly
        const pdfBlob = new Blob([blob], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(pdfBlob);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (err.message !== "not_found") setError(err.message || "Could not load PDF");
      })
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = originalName || title || "document.pdf";
    a.click();
  };

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

  if (fileNotFound) {
    return (
      <div className="w-full flex flex-col items-center justify-center bg-amber-50 border border-amber-200 rounded-lg p-8 gap-3 text-center">
        <FileText className="w-12 h-12 text-amber-400" />
        <p className="font-semibold text-amber-800">File no longer available</p>
        <p className="text-amber-700 text-sm max-w-sm">
          This document was uploaded but the file could not be found on the server. Please delete this record and re-upload the document.
        </p>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="w-full h-[300px] flex flex-col items-center justify-center bg-gray-50 rounded-lg border gap-4">
        <FileText className="w-12 h-12 text-gray-400" />
        <p className="text-gray-600 text-sm">{error || "Unable to preview this PDF"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <button
          onClick={() => window.open(blobUrl, "_blank")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in new tab
        </button>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>
      <embed
        src={blobUrl}
        type="application/pdf"
        className="w-full rounded-lg border bg-white"
        style={{ height: "calc(100vh - 16rem)", minHeight: "650px" }}
      />
    </div>
  );
}

function TransmittedPdfPreview({ distributionId, title, sentAt, pdfUrl }: { distributionId: number; title: string; sentAt?: string | null; pdfUrl: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    fetch(pdfUrl, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setBlobUrl(createdUrl);
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Could not load PDF"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [pdfUrl]);

  const openPdfInNewTab = () => {
    if (blobUrl) window.open(blobUrl, "_blank");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Send className="w-4 h-4 text-emerald-600 shrink-0" />
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{title}</h2>
          {sentAt && (
            <span className="text-xs text-gray-500 shrink-0">· Sent {safeDateFormat(sentAt, "d MMM yyyy, h:mm a")}</span>
          )}
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open PDF
        </a>
      </div>
      <div className="flex-1 bg-gray-100 dark:bg-gray-900 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
            Loading PDF...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 px-6 text-center">{error}</div>
        )}
        {!loading && !error && blobUrl && (
          <iframe
            src={blobUrl}
            title={title}
            className="w-full h-full border-0"
            data-testid="iframe-transmitted-pdf"
          />
        )}
      </div>
    </div>
  );
}

function formatDob(dob: string | null | undefined): string {
  if (!dob) return "";
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) return dob;
  // ISO YYYY-MM-DD (or with time)
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // DD-MM-YYYY → DD/MM/YYYY
  const dmy = dob.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  // D/M/YYYY (single-digit) → pad to DD/MM/YYYY
  const slashDMY = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDMY) return `${slashDMY[1].padStart(2, '0')}/${slashDMY[2].padStart(2, '0')}/${slashDMY[3]}`;
  return dob;
}

export default function Patients({ initialPatientId, initialEditPatientId, onPatientOpened }: { initialPatientId?: number; initialEditPatientId?: number; onPatientOpened?: () => void } = {}) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<{ type: 'report' | 'worksheet' | 'digitalWorksheet' | 'appointment' | 'document' | 'note' | 'transmittedPdf'; id: number; meta?: { title?: string; sentAt?: string | null } } | null>(null);
  const [showPatientInfo, setShowPatientInfo] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showConsultationDialog, setShowConsultationDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "ur_asc" | "ur_desc" | "recent" | "oldest" | "updated" | "dob_youngest" | "dob_oldest">("name_asc");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female" | "other">("all");
  const [contactFilter, setContactFilter] = useState<"all" | "has_phone" | "has_email" | "has_medicare" | "missing_contact">("all");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [archiveModal, setArchiveModal] = useState<{ patient: Patient; mode: "archive" | "restore" } | null>(null);
  const [archivePassword, setArchivePassword] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedSnapshotRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const autoSaveDirtyRef = useRef(false);
  const latestFormDataRef = useRef<any>(null);
  const performAutoSaveRef = useRef<() => void>(() => {});
  const saveNowBeaconRef = useRef<() => void>(() => {});
  // The exact form body the keepalive beacon last sent — used only to avoid
  // firing duplicate identical writes when several unload triggers fire for the
  // same event. It never stands in for the confirmed-saved baseline.
  const lastBeaconBodyRef = useRef<string | null>(null);
  // The JSON body of the autosave PUT that is currently in flight (null when
  // none). Lets the unload beacon tell whether the user has typed something
  // NEWER than the in-flight request, so it only re-sends genuinely newer edits.
  const inFlightBodyRef = useRef<string | null>(null);
  // The form values as they were when the edit dialog opened — used by the
  // "Discard changes" button to revert any auto-saved edits back to original.
  const originalFormDataRef = useRef<any>(null);
  // When "Discard changes" is pressed while an auto-save is in flight, the
  // original values are stashed here and written once that save completes — so
  // the revert can never be overtaken by the in-flight edit.
  const pendingDiscardRef = useRef<any>(null);

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
    medicareNumber: "",
    medicareIrn: "",
    medicareExpiry: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    referringPhysician: "",
    medicalHistory: "",
    allergies: "",
    notes: "",
  });
  // Always keep a ref to the freshest form values so the single-flight
  // auto-save logic can re-read the latest state inside async callbacks.
  latestFormDataRef.current = formData;

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients", searchQuery],
    queryFn: async () => {
      const url = searchQuery ? `/api/patients?search=${encodeURIComponent(searchQuery)}` : "/api/patients";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    },
  });

  useEffect(() => {
    if (initialPatientId && patients.length > 0) {
      const match = patients.find(p => p.id === initialPatientId);
      if (match) {
        setSelectedPatient(match);
        onPatientOpened?.();
      }
    }
  }, [patients, initialPatientId]);

  useEffect(() => {
    if (initialEditPatientId && patients.length > 0) {
      const match = patients.find(p => p.id === initialEditPatientId);
      if (match) {
        handleEdit(match);
        onPatientOpened?.();
      }
    }
     
  }, [patients, initialEditPatientId]);

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

  const { data: patientNotes = [] } = useQuery<PatientNote[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "notes"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/notes`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch notes");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  const { data: patientReminderLogs = [] } = useQuery<ReminderLog[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "reminder-logs"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const response = await fetch(`/api/patients/${selectedPatient.id}/reminder-logs`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch reminder logs");
      return response.json();
    },
    enabled: !!selectedPatient,
  });

  // Transmitted reports (distributions with a stored PDF) for this patient
  type TransmittedReport = {
    distributionId: number;
    reportId: number;
    studyType: string;
    examDate: string | null;
    patientName: string;
    sentAt: string;
    method: string;
    recipientName: string | null;
    confirmedBy: string | null;
    hasPdf: boolean;
  };
  const { data: transmittedReports = [] } = useQuery<TransmittedReport[]>({
    queryKey: ["/api/patients", selectedPatient?.id, "transmitted-reports"],
    queryFn: async () => {
      if (!selectedPatient) return [];
      const res = await fetch(`/api/patients/${selectedPatient.id}/transmitted-reports`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPatient,
  });

  const selectedReportId = selectedDocument?.type === 'report' ? selectedDocument.id : null;
  const { data: reportDistributions = [] } = useQuery<ReportDistribution[]>({
    queryKey: ["/api/reports", selectedReportId, "distributions"],
    queryFn: async () => {
      if (!selectedReportId) return [];
      const response = await fetch(`/api/reports/${selectedReportId}/distributions`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedReportId,
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

  const { data: registrationStatus, refetch: refetchRegistrationStatus } = useQuery<{
    status: "none" | "pending" | "completed";
    expiresAt?: string;
    completedAt?: string;
    isExpired?: boolean;
    token?: string;
  }>({
    queryKey: ["/api/patients", selectedPatient?.id, "registration-status"],
    queryFn: async () => {
      if (!selectedPatient) return { status: "none" };
      const r = await fetch(`/api/patients/${selectedPatient.id}/registration-status`, { credentials: "include" });
      if (!r.ok) return { status: "none" };
      return r.json();
    },
    enabled: !!selectedPatient,
  });

  const sendRegistrationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      const res = await apiRequest(`/api/patients/${selectedPatient.id}/send-registration`, "POST");
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchRegistrationStatus();
      toast({ title: "Registration form sent", description: `Email sent to ${data?.sentTo}` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send", description: error.message || "Could not send registration email", variant: "destructive" });
    },
  });

  const copyRegistrationLinkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      const res = await fetch(`/api/patients/${selectedPatient.id}/generate-registration-link`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate link");
      return res.json();
    },
    onSuccess: async (data: any) => {
      await navigator.clipboard.writeText(data.registrationUrl);
      refetchRegistrationStatus();
      toast({ title: "Link copied!", description: "Registration link copied to clipboard — valid for 7 days." });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Could not generate link", variant: "destructive" });
    },
  });

  const { data: clinicData } = useQuery<{ id: number; name: string; address?: string; phone?: string; logoUrl?: string }>({
    queryKey: ["/api/clinic"],
  });

  const labelImageFile = async (
    file: File,
    patient: Patient,
    title: string,
    documentDate: string,
  ): Promise<File> => {
    if (!file.type.startsWith("image/")) return file;
    try {
      const fileDataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.readAsDataURL(file);
      });
      const wsImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = fileDataUrl;
      });

      let logoImg: HTMLImageElement | null = null;
      if (clinicData?.logoUrl) {
        try {
          const logoRes = await fetch("/api/clinic/logo", { credentials: "include" });
          if (logoRes.ok) {
            const logoBlob = await logoRes.blob();
            const logoDataUrl = await new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onloadend = () => resolve(r.result as string);
              r.readAsDataURL(logoBlob);
            });
            logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = logoDataUrl;
            });
          }
        } catch { /* logo optional */ }
      }

      const DPI = 200;
      const A4_W = Math.round((210 / 25.4) * DPI);
      const A4_H = Math.round((297 / 25.4) * DPI);
      const HEADER_HEIGHT = Math.round(A4_H * 0.11);
      const PADDING = Math.round(A4_W * 0.025);

      const canvas = document.createElement("canvas");
      canvas.width = A4_W;
      canvas.height = A4_H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_W, A4_H);

      const primaryColor = "#0066cc";
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = Math.round(A4_W * 0.003);
      ctx.beginPath();
      ctx.moveTo(0, HEADER_HEIGHT);
      ctx.lineTo(A4_W, HEADER_HEIGHT);
      ctx.stroke();

      let textStartX = PADDING;
      if (logoImg) {
        const logoMaxH = HEADER_HEIGHT - PADDING * 2;
        const logoMaxW = Math.round(A4_W * 0.2);
        const scale = Math.min(logoMaxW / logoImg.width, logoMaxH / logoImg.height, 1);
        const logoW = logoImg.width * scale;
        const logoH = logoImg.height * scale;
        const logoY = (HEADER_HEIGHT - logoH) / 2;
        ctx.drawImage(logoImg, PADDING, logoY, logoW, logoH);
        textStartX = PADDING + logoW + Math.round(A4_W * 0.015);
      }

      const fmtDate = (d: string) => {
        if (!d) return "";
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d;
        return format(dt, "dd/MM/yyyy");
      };
      const patientName = `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim();
      const lines = [
        `Patient: ${patientName}`,
        patient.dateOfBirth ? `DOB: ${fmtDate(patient.dateOfBirth as any)}` : null,
        (patient as any).urNumber ? `UR: ${(patient as any).urNumber}` : null,
        (patient as any).medicareNumber ? `Medicare: ${(patient as any).medicareNumber}` : null,
        (patient as any).phone ? `Phone: ${(patient as any).phone}` : null,
        `Document: ${title}`,
        `Date: ${fmtDate(documentDate)}`,
      ].filter(Boolean) as string[];

      const infoFontSize = Math.round(A4_W * 0.0135);
      ctx.fillStyle = "#333333";
      ctx.font = `${infoFontSize}px Arial, sans-serif`;
      const colW = (A4_W - textStartX - PADDING) / 2;
      const half = Math.ceil(lines.length / 2);
      const leftLines = lines.slice(0, half);
      const rightLines = lines.slice(half);
      const lineH = infoFontSize + Math.round(infoFontSize * 0.45);
      const textY = (HEADER_HEIGHT - half * lineH) / 2 + infoFontSize;
      leftLines.forEach((line, i) => ctx.fillText(line, textStartX, textY + i * lineH));
      rightLines.forEach((line, i) => ctx.fillText(line, textStartX + colW, textY + i * lineH));

      const wsAreaH = A4_H - HEADER_HEIGHT;
      const wsScale = Math.min(A4_W / wsImg.width, wsAreaH / wsImg.height);
      const wsDrawW = wsImg.width * wsScale;
      const wsDrawH = wsImg.height * wsScale;
      const wsX = (A4_W - wsDrawW) / 2;
      const wsY = HEADER_HEIGHT + (wsAreaH - wsDrawH) / 2;
      ctx.drawImage(wsImg, wsX, wsY, wsDrawW, wsDrawH);

      const blob: Blob | null = await new Promise((resolve) => {
        try { canvas.toBlob((b) => resolve(b), "image/jpeg", 0.93); }
        catch { resolve(null); }
      });
      if (!blob) return file;
      const baseName = file.name.replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}-labelled.jpg`, { type: "image/jpeg" });
    } catch {
      return file;
    }
  };

  const finalizeReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const response = await apiRequest(`/api/reports/${reportId}/finalize`, "POST");
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Report finalised", description: "The report has been electronically signed." });
    },
    onError: (error: any) => {
      toast({ title: "Could not finalise", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ file, title, documentDate }: { file: File; title: string; documentDate: string }) => {
      const finalFile = selectedPatient
        ? await labelImageFile(file, selectedPatient, title, documentDate)
        : file;
      const formData = new FormData();
      formData.append("file", finalFile);
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
      const res = await apiRequest(`/api/patients/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: (updatedPatient: Patient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/digital-worksheets"] });
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

  // Silent auto-save used while editing an existing patient — persists changes
  // without closing the dialog or showing a success toast, so accidentally
  // clicking outside the popup or navigating away never loses an edit.
  // Writes are single-flight (one PUT at a time) and the "saved" baseline only
  // advances once the server confirms, so a stale request can never overwrite a
  // newer one and a failed save is never mistaken for a successful one.
  const autoSaveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any; snapshot: string }) => {
      const res = await apiRequest(`/api/patients/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: (updatedPatient: Patient, variables: { id: number; data: any; snapshot: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      savedSnapshotRef.current = variables.snapshot;
      autoSaveInFlightRef.current = false;
      inFlightBodyRef.current = null;
      if (selectedPatient && updatedPatient && selectedPatient.id === updatedPatient.id) {
        setSelectedPatient(updatedPatient);
      }
      // A discard was requested while this save was in flight — write the
      // original values back now so the revert lands after (and wins over) this
      // edit, instead of re-saving newer changes.
      if (pendingDiscardRef.current) {
        const original = pendingDiscardRef.current;
        pendingDiscardRef.current = null;
        autoSaveDirtyRef.current = false;
        discardMutation.mutate({ id: variables.id, data: original });
        return;
      }
      // If the user kept editing while this save was in flight, persist the
      // newer state immediately; otherwise we're caught up.
      if (autoSaveDirtyRef.current) {
        autoSaveDirtyRef.current = false;
        performAutoSaveRef.current();
      } else {
        setAutoSaveStatus("saved");
      }
    },
    onError: (_err: unknown, variables: { id: number; data: any; snapshot: string }) => {
      autoSaveInFlightRef.current = false;
      inFlightBodyRef.current = null;
      // If a discard was requested while this (now-failed) save was in flight,
      // still attempt the revert — earlier saves may have persisted edits.
      if (pendingDiscardRef.current) {
        const original = pendingDiscardRef.current;
        pendingDiscardRef.current = null;
        autoSaveDirtyRef.current = false;
        discardMutation.mutate({ id: variables.id, data: original });
        return;
      }
      // Leave the baseline snapshot untouched so the change is still considered
      // unsaved and will be retried on the next edit or on dialog close.
      setAutoSaveStatus("error");
    },
  });

  // Writes the original (pre-edit) values back to the server when the user
  // presses "Discard changes". Kept separate from the auto-save mutation so it
  // never participates in the debounce / single-flight loop. All revert toasts
  // go through these callbacks so we never claim success before the server acks.
  const discardMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/patients/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: (updatedPatient: Patient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      if (selectedPatient && updatedPatient && selectedPatient.id === updatedPatient.id) {
        setSelectedPatient(updatedPatient);
      }
      toast({
        title: "Changes discarded",
        description: "The record was restored to how it was when you opened it.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Couldn't discard changes",
        description: "Your edits may still be saved. Please reopen the patient and try again.",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, mode, password, reason }: { id: number; mode: "archive" | "restore"; password: string; reason?: string }) => {
      const res = await apiRequest(
        `/api/patients/${id}/${mode === "archive" ? "archive" : "unarchive"}`,
        "POST",
        mode === "archive" ? { password, reason } : { password },
      );
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: vars.mode === "archive" ? "Patient archived" : "Patient restored",
        description: vars.mode === "archive"
          ? "The patient file has been moved to archives."
          : "The patient has been restored to active records.",
      });
      setArchiveModal(null);
      setArchivePassword("");
      setArchiveReason("");
      setIsDialogOpen(false);
      setEditingPatient(null);
      setSelectedPatient(null);
    },
    onError: (error: any) => {
      toast({ title: "Could not complete", description: error?.message || "Failed", variant: "destructive" });
    },
    onSettled: () => setArchiveSubmitting(false),
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

  const verifyMedicareMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "verify" | "unverify" }) => {
      const res = await apiRequest(`/api/patients/${id}/verify-medicare`, "POST", { action });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      if (data?.patient) setSelectedPatient(data.patient);
      toast({ title: "Medicare status updated", description: data?.note || "Status saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update Medicare status", variant: "destructive" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest(`/api/patients/${selectedPatient!.id}/notes`, "POST", { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "notes"] });
      setNewNoteContent("");
      setIsAddingNote(false);
      setShowNotesDialog(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to save note", variant: "destructive" }),
  });

  const archiveReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const res = await apiRequest(`/api/reports/${reportId}/archive`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "reports"] });
      toast({ title: "Archived", description: "Report moved to archive." });
    },
    onError: () => toast({ title: "Error", description: "Failed to archive report", variant: "destructive" }),
  });

  const unarchiveReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const res = await apiRequest(`/api/reports/${reportId}/unarchive`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, "reports"] });
      toast({ title: "Restored", description: "Report moved back to active." });
    },
    onError: () => toast({ title: "Error", description: "Failed to unarchive report", variant: "destructive" }),
  });

  const makeArchiveMutation = (endpoint: string, invalidateKey: string, action: 'archive' | 'unarchive') =>
    useMutation({
      mutationFn: async (id: number) => {
        const res = await apiRequest(`/api/${endpoint}/${id}/${action}`, "POST");
        return res.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/patients", selectedPatient?.id, invalidateKey] });
        toast({ title: action === 'archive' ? "Archived" : "Restored", description: action === 'archive' ? "Moved to archive." : "Moved back to active." });
      },
      onError: () => toast({ title: "Error", description: `Failed to ${action} item`, variant: "destructive" }),
    });

  const archiveWorksheetMutation = makeArchiveMutation("worksheets", "worksheets", "archive");
  const unarchiveWorksheetMutation = makeArchiveMutation("worksheets", "worksheets", "unarchive");
  const archiveDigitalWorksheetMutation = makeArchiveMutation("digital-worksheets", "digital-worksheets", "archive");
  const unarchiveDigitalWorksheetMutation = makeArchiveMutation("digital-worksheets", "digital-worksheets", "unarchive");
  const archiveDocumentMutation = makeArchiveMutation("patient-documents", "documents", "archive");
  const unarchiveDocumentMutation = makeArchiveMutation("patient-documents", "documents", "unarchive");

  const [historyTab, setHistoryTab] = useState<'active' | 'archived' | 'completed' | 'finalized'>('active');
  const [docSortOrder, setDocSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [docCategoryFilter, setDocCategoryFilter] = useState<'all' | 'clinical' | 'non-clinical'>('all');

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
      medicareNumber: "",
      medicareIrn: "",
      medicareExpiry: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
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
      medicareNumber: patient.medicareNumber || "",
      medicareIrn: patient.medicareIrn || "",
      medicareExpiry: patient.medicareExpiry || "",
      emergencyContactName: patient.emergencyContactName || "",
      emergencyContactPhone: patient.emergencyContactPhone || "",
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

  // Whenever the edit dialog opens for an existing patient, capture a baseline
  // snapshot so we only auto-save genuine changes. Reset everything on close.
  useEffect(() => {
    autoSaveDirtyRef.current = false;
    if (isDialogOpen && editingPatient) {
      savedSnapshotRef.current = JSON.stringify(formData);
      originalFormDataRef.current = { ...formData };
      setAutoSaveStatus("idle");
    } else {
      savedSnapshotRef.current = null;
      originalFormDataRef.current = null;
      setAutoSaveStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen, editingPatient?.id]);

  // Core single-flight save: fires at most one PUT at a time. If a save is
  // already in flight, it marks the form dirty so the in-flight save's success
  // handler re-runs with the newest values (preventing out-of-order overwrites).
  const performAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (!editingPatient || savedSnapshotRef.current === null) return;
    const data = latestFormDataRef.current;
    const current = JSON.stringify(data);
    if (current === savedSnapshotRef.current) return;
    // Don't try to save while a required identity field is blank — the row
    // would be left in an invalid state.
    if (!data.firstName || !data.lastName || !data.dateOfBirth) return;
    if (autoSaveInFlightRef.current) {
      autoSaveDirtyRef.current = true;
      return;
    }
    autoSaveInFlightRef.current = true;
    inFlightBodyRef.current = current;
    setAutoSaveStatus("saving");
    autoSaveMutation.mutate({ id: editingPatient.id, data: { ...data }, snapshot: current });
  };
  performAutoSaveRef.current = performAutoSave;

  // Debounced auto-save: persist edits ~1s after the user stops typing.
  useEffect(() => {
    if (!isDialogOpen || !editingPatient || savedSnapshotRef.current === null) return;
    const current = JSON.stringify(formData);
    if (current === savedSnapshotRef.current) return;
    if (!formData.firstName || !formData.lastName || !formData.dateOfBirth) return;
    setAutoSaveStatus("saving");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSaveRef.current();
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, isDialogOpen, editingPatient?.id]);

  // Immediately persist any pending changes — used when the dialog is about to
  // close (clicking outside / Cancel) so the last edit is never lost to the
  // debounce window.
  const flushAutoSave = () => {
    performAutoSaveRef.current();
  };

  // Best-effort immediate save for when the whole page is going away — a browser
  // refresh/close or this component unmounting (e.g. switching panels). Radix
  // never fires onOpenChange on unmount, so the normal flush above can't run;
  // here we send a keepalive PUT directly so an in-progress edit still lands.
  //
  // Concurrency: if an autosave PUT is already in flight AND it is carrying the
  // exact latest data, we bail — that request already covers it, so we never
  // duplicate a write. We only send while in flight when the user has typed
  // something NEWER than the in-flight request, so those last keystrokes aren't
  // lost on navigate-away. (With last-write-wins and no version column, the
  // older in-flight write could in theory still land after this newer one; that
  // residual ordering risk needs server-side optimistic concurrency to fully
  // close and is intentionally out of scope here.) It also does NOT advance
  // savedSnapshotRef — a keepalive write can't be ack'd, so the change stays
  // "unsaved" and the normal retry path remains valid.
  const saveNowBeacon = () => {
    if (!editingPatient || savedSnapshotRef.current === null) return;
    const data = latestFormDataRef.current;
    if (!data) return;
    const current = JSON.stringify(data);
    if (current === savedSnapshotRef.current) return;
    if (current === lastBeaconBodyRef.current) return;
    if (autoSaveInFlightRef.current && current === inFlightBodyRef.current) return;
    if (!data.firstName || !data.lastName || !data.dateOfBirth) return;
    // Dedupe identical sends from multiple unload triggers — not a saved marker.
    lastBeaconBodyRef.current = current;
    try {
      fetch(`/api/patients/${editingPatient.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: current,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* page is unloading — nothing more we can do */
    }
  };
  saveNowBeaconRef.current = saveNowBeacon;

  // Flush any pending edit when the page unloads, the tab is hidden, or this
  // component unmounts (e.g. switching panels). Covers the "navigated away and
  // lost my edit" case that onOpenChange can't catch. When the tab is merely
  // hidden the page isn't unloading, so we use the normal single-flight mutation
  // (ordered, snapshot-advances-on-ack); for real unload/unmount we use the
  // keepalive beacon as a best-effort last resort.
  useEffect(() => {
    const onBeforeUnload = () => saveNowBeaconRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") performAutoSaveRef.current();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      saveNowBeaconRef.current();
    };
  }, []);

  // Revert any auto-saved edits back to the values the record had when the
  // dialog opened, then close. Either writes the original values immediately or
  // defers to the in-flight auto-save's completion so the revert always wins.
  const handleDiscardChanges = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSaveDirtyRef.current = false;
    const original = originalFormDataRef.current;
    let revertDispatched = false;
    if (editingPatient && original) {
      const originalJson = JSON.stringify(original);
      const changed = savedSnapshotRef.current !== null && savedSnapshotRef.current !== originalJson;
      if (changed) {
        if (autoSaveInFlightRef.current) {
          // An auto-save is mid-request: stash the original so it's written
          // back once that save resolves (see autoSaveMutation success/error).
          pendingDiscardRef.current = { ...original };
        } else {
          discardMutation.mutate({ id: editingPatient.id, data: { ...original } });
        }
        // The "Changes discarded" / failure toast is shown by the mutation
        // callbacks once the server confirms, so we don't claim success early.
        revertDispatched = true;
      }
    }
    if (!revertDispatched) {
      // Nothing was persisted yet — there's nothing to revert on the server, so
      // confirm immediately as we drop the unsaved edits.
      toast({
        title: "Changes discarded",
        description: "Your unsaved edits were discarded.",
      });
    }
    // Close directly (not via onOpenChange) so we don't flush/re-save the edits
    // we just reverted. Reset form state ourselves to mirror a normal close.
    setIsDialogOpen(false);
    resetForm();
    setEditingPatient(null);
  };

  // Combine all documents into a single list for EMR-style view
  const allDocuments = [
    ...patientReports.map(r => ({
      type: 'report' as const,
      id: r.id,
      title: r.studyType || 'Report',
      date: r.examDate || (r.generatedAt ? format(new Date(r.generatedAt), "yyyy-MM-dd") : ''),
      ts: (r.generatedAt as any) || r.examDate || '',
      status: r.isFinalized ? 'finalized' : r.isDraft ? 'draft' : 'pending',
      isAmended: r.isAmended,
      isArchived: (r as any).isArchived ?? false,
      data: r,
    })),
    ...patientWorksheets
      // Hide internal labelled-XXX worksheets — they're auto-generated header-stamped
      // copies of the original upload, not separate worksheets the user uploaded.
      // The original worksheet viewer already substitutes the labelled file on display.
      .filter(w => {
        const isLabelledByName = (w.originalName || '').toLowerCase().startsWith('labelled-');
        const isReferencedAsLabelled = patientReports.some(r => (r as any).labelledWorksheetId === w.id);
        return !isLabelledByName && !isReferencedAsLabelled;
      })
      .map(w => ({
      type: 'worksheet' as const,
      id: w.id,
      title: w.originalName || 'Worksheet',
      date: w.uploadedAt ? format(new Date(w.uploadedAt), "yyyy-MM-dd") : '',
      ts: (w.uploadedAt as any) || '',
      status: w.ocrProcessed ? 'processed' : 'pending',
      isAmended: false,
      isArchived: (w as any).isArchived ?? false,
      data: w,
    })),
    ...patientDigitalWorksheets.map(dw => ({
      type: 'digitalWorksheet' as const,
      id: dw.id,
      title: dw.patientName ? `${dw.studyType || 'Drawing'} - ${dw.patientName}` : (dw.studyType || 'Digital Worksheet'),
      date: dw.createdAt ? format(new Date(dw.createdAt), "yyyy-MM-dd") : '',
      ts: (dw.createdAt as any) || '',
      status: dw.isDraft ? 'draft' : 'completed',
      isAmended: false,
      isArchived: (dw as any).isArchived ?? false,
      data: dw,
    })),
    ...patientAppointments.map(a => ({
      type: 'appointment' as const,
      id: a.id,
      title: a.scanType || 'Appointment',
      date: a.appointmentDate ? format(new Date(a.appointmentDate), "yyyy-MM-dd") : '',
      ts: (a.appointmentDate as any) || '',
      status: a.status || 'scheduled',
      isAmended: false,
      isArchived: false,
      data: a,
    })),
    ...patientDocuments.map(d => ({
      type: 'document' as const,
      id: d.id,
      title: d.title || 'Document',
      date: d.documentDate || '',
      ts: ((d as any).createdAt as any) || d.documentDate || '',
      status: 'uploaded',
      isAmended: false,
      isArchived: (d as any).isArchived ?? false,
      data: d,
    })),
    ...patientNotes.map(n => ({
      type: 'note' as const,
      id: n.id,
      title: n.content.length > 60 ? n.content.slice(0, 60) + '…' : n.content,
      date: n.createdAt ? format(new Date(n.createdAt), "yyyy-MM-dd") : '',
      ts: (n.createdAt as any) || '',
      status: n.type || 'note',
      isAmended: false,
      isArchived: false,
      data: n,
    })),
  ].sort((a, b) => {
    const ta = new Date((a.ts as any) || a.date).getTime() || 0;
    const tb = new Date((b.ts as any) || b.date).getTime() || 0;
    return docSortOrder === 'newest' ? tb - ta : ta - tb;
  });

  // Clinical documentation vs non-clinical (appointments, notes, etc.)
  const CLINICAL_DOC_TYPES = ['report', 'worksheet', 'digitalWorksheet', 'document'];
  const matchesDocCategory = (type: string) => {
    if (docCategoryFilter === 'all') return true;
    const isClinical = CLINICAL_DOC_TYPES.includes(type);
    return docCategoryFilter === 'clinical' ? isClinical : !isClinical;
  };

  const activeDocuments = allDocuments.filter(d => !d.isArchived && matchesDocCategory(d.type));
  const archivedDocuments = allDocuments.filter(d => d.isArchived && matchesDocCategory(d.type));

  // Display a yyyy-MM-dd (or ISO) date string as dd-MM-yyyy (Australian).
  // The underlying doc.date stays yyyy-MM-dd so sorting and visit-grouping keep working.
  const displayDocDate = (d: string) => {
    if (!d) return '';
    const parts = d.slice(0, 10).split('-');
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : d;
  };

  // Show the time of day for an item, but only when the source value actually
  // carries a time component (ISO timestamps include 'T'); date-only strings show nothing.
  const displayDocTime = (raw: any) => {
    if (!raw) return '';
    const s = raw instanceof Date ? raw.toISOString() : String(raw);
    if (!s.includes('T') && !s.includes(':')) return '';
    const dt = new Date(raw);
    return isNaN(dt.getTime()) ? '' : format(dt, 'h:mm a');
  };

  // Visit grouping: find examDates where 2+ non-archived reports exist (same-day multi-scan visits)
  const visitMap = new Map<string, number[]>(); // examDate → [reportIds]
  patientReports.forEach(r => {
    if (!(r as any).isArchived && r.examDate) {
      const ids = visitMap.get(r.examDate) || [];
      ids.push(r.id);
      visitMap.set(r.examDate, ids);
    }
  });
  const multiScanDates = new Set(
    Array.from(visitMap.entries())
      .filter(([, ids]) => ids.length >= 2)
      .map(([date]) => date)
  );

  // IDs of the first report (in current sort order) for each multi-scan visit date.
  // Computed from the ordered REPORT subset only, so interleaving non-report items
  // (worksheets, notes, etc.) under timestamp sorting don't produce duplicate visit headers.
  const firstReportOfVisitIds = new Set<number>();
  {
    const headed = new Set<string>();
    for (const d of activeDocuments) {
      if (d.type === 'report' && d.date && multiScanDates.has(d.date) && !headed.has(d.date)) {
        firstReportOfVisitIds.add(d.id);
        headed.add(d.date);
      }
    }
  }

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
    if (selectedDocument.type === 'note') {
      return patientNotes.find(n => n.id === selectedDocument.id);
    }
    return null;
  };

  const renderDocumentPreview = () => {
    if (selectedDocument?.type === 'transmittedPdf') {
      const title = selectedDocument.meta?.title || 'Transmitted Report';
      const sentAt = selectedDocument.meta?.sentAt;
      const pdfUrl = `/api/distributions/${selectedDocument.id}/pdf`;
      return (
        <TransmittedPdfPreview
          distributionId={selectedDocument.id}
          title={title}
          sentAt={sentAt}
          pdfUrl={pdfUrl}
        />
      );
    }
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
      const visitSiblings = patientReports.filter(r =>
        r.examDate === report.examDate &&
        r.id !== report.id &&
        !(r as any).isArchived
      );
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
            <div className="border-b pb-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{report.studyType}</h2>
                  <p className="text-gray-600">Exam Date: {formatDob(report.examDate)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {report.isFinalized && <Badge className="bg-green-600">Finalized</Badge>}
                  {(report as any).isSonographerComplete && <Badge className="bg-teal-600">Sono Complete</Badge>}
                  {report.isAmended && <Badge variant="secondary">Amended</Badge>}
                  {report.isDraft && <Badge variant="outline">Draft</Badge>}
                  {(report as any).isArchived && <Badge variant="outline" className="text-gray-500 border-gray-400">Archived</Badge>}
                  {!report.isFinalized && !(report as any).isArchived && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (confirm("Finalise this report? Once finalised it can only be changed via an Amendment.")) {
                          finalizeReportMutation.mutate(report.id);
                        }
                      }}
                      disabled={finalizeReportMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      {finalizeReportMutation.isPending ? "Finalising…" : "Finalise Report"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {visitSiblings.length > 0 && (
              <div className="mb-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">
                    Same-day visit — {visitSiblings.length + 1} scans on {report.examDate}
                  </span>
                </div>
                <p className="text-xs text-teal-600 dark:text-teal-400 mb-2">Other scans completed during this visit:</p>
                <div className="flex flex-wrap gap-2">
                  {visitSiblings.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedDocument({ type: 'report', id: s.id })}
                      className="text-xs px-2.5 py-1 bg-white dark:bg-teal-800 hover:bg-teal-100 dark:hover:bg-teal-700 text-teal-800 dark:text-teal-200 rounded border border-teal-300 dark:border-teal-600 transition-colors flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      {s.studyType}
                      {s.isFinalized && <CheckCircle className="w-3 h-3 text-green-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Patient Information</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <p><strong>Name:</strong> {report.patientName}</p>
                  <p><strong>DOB:</strong> {formatDob(report.patientDob)}</p>
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

              {/* Sonographer workflow status */}
              {((report as any).isSonographerComplete || (report as any).isArchived) && (
                <div className="border-t pt-4 mt-2 space-y-1">
                  {(report as any).isSonographerComplete && (report as any).sonographerCompletedAt && (
                    <div className="flex items-center gap-2 text-sm text-teal-700">
                      <ClipboardCheck className="w-4 h-4 shrink-0" />
                      <span>Sonographer marked complete by <strong>{(report as any).sonographerCompletedBy}</strong> on {format(new Date((report as any).sonographerCompletedAt), "PPP")}</span>
                    </div>
                  )}
                  {(report as any).isArchived && (report as any).archivedAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Archive className="w-4 h-4 shrink-0" />
                      <span>Workflow archived on {format(new Date((report as any).archivedAt), "PPP")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Distribution history */}
              <div className="border-t pt-4 mt-2">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Distribution History
                </h3>
                {reportDistributions.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Not yet distributed</p>
                ) : (
                  <div className="space-y-2">
                    {reportDistributions.map((dist: ReportDistribution) => (
                      <div key={dist.id} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-sm">
                        <div className="mt-0.5 shrink-0">
                          {dist.method === 'email' ? (
                            <Mail className="w-4 h-4 text-blue-500" />
                          ) : dist.method === 'fax' ? (
                            <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          ) : (
                            <FileText className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 dark:text-gray-200">
                            {dist.method === 'email' ? 'Emailed' : dist.method === 'fax' ? 'Faxed' : 'Copy/HTML'}
                            {dist.recipientName && <span className="ml-1">to {dist.recipientName}</span>}
                            {dist.recipientEmail && <span className="text-gray-500 ml-1">({dist.recipientEmail})</span>}
                          </div>
                          {(dist as any).worksheetIncluded && (
                            <div className="text-xs text-teal-600 mt-0.5">+ Worksheet attached</div>
                          )}
                          {dist.notes && <div className="text-gray-500 text-xs mt-0.5">{dist.notes}</div>}
                          <div className="text-xs text-gray-400 mt-1">
                            {dist.sentAt ? format(new Date(dist.sentAt), "d MMM yyyy, h:mm a") : ''}
                            {dist.confirmedBy && <span className="ml-2">· sent by {dist.confirmedBy}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              <p className="text-gray-600">Uploaded: {worksheet.uploadedAt ? format(new Date(worksheet.uploadedAt), "dd/MM/yyyy") : 'N/A'}</p>
            </div>
            <div className="space-y-4">
              <Badge variant={worksheet.ocrProcessed ? "default" : "secondary"}>
                {worksheet.ocrProcessed ? "OCR Processed" : "Pending Processing"}
              </Badge>
              {worksheet.filename && (() => {
                // Prefer the labelled copy if any of this patient's reports
                // links to a labelled worksheet for this original.
                const linkedReport = (patientReports as any[]).find(
                  (r) => r.worksheetId === worksheet.id && r.labelledWorksheetId
                );
                const displayId = linkedReport?.labelledWorksheetId ?? worksheet.id;
                return (
                  <div className="mt-4" style={{ minHeight: '400px' }}>
                    <WorksheetViewer 
                      worksheetId={displayId} 
                      alt={worksheet.originalName}
                    />
                  </div>
                );
              })()}
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
                  <p className="text-gray-600">Created: {digitalWorksheet.createdAt ? format(new Date(digitalWorksheet.createdAt), "dd/MM/yyyy") : 'N/A'}</p>
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
                  {digitalWorksheet.patientDob && <p><strong>DOB:</strong> {formatDob(digitalWorksheet.patientDob)}</p>}
                  <p><strong>Exam Date:</strong> {formatDob(digitalWorksheet.examDate)}</p>
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
      const isHtml = patientDoc.originalName?.match(/\.html?$/i);
      
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
                <PdfViewer url={patientDoc.fileUrl} title={patientDoc.title} originalName={patientDoc.originalName || undefined} />
              )}
              {isHtml && (
                <iframe
                  key={`html-${patientDoc.id}`}
                  src={patientDoc.fileUrl}
                  title={patientDoc.title}
                  className="w-full rounded-lg border shadow bg-white"
                  style={{ height: '70vh', minHeight: 500 }}
                  sandbox="allow-same-origin"
                />
              )}
              {!isImage && !isPdf && !isHtml && (
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

    if (selectedDocument?.type === 'note') {
      const note = doc as PatientNote;
      return (
        <div className="h-full overflow-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-xl mx-auto mt-8 shadow-sm border">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${note.type === 'fax' ? 'bg-teal-100 text-teal-600' : note.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                {note.type === 'fax' ? <Printer className="w-5 h-5" /> : note.type === 'email' ? <Mail className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="font-semibold text-gray-800 dark:text-gray-200 capitalize">{note.type === 'note' ? 'Manual Note' : note.type === 'fax' ? 'Fax Activity' : note.type === 'email' ? 'Email Activity' : 'System Note'}</h2>
                <p className="text-xs text-gray-400">{note.createdAt ? format(new Date(note.createdAt), "d MMM yyyy, h:mm a") : ''}</p>
              </div>
            </div>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>
          </div>
        </div>
      );
    }

    return null;
  };

  if (selectedPatient) {
    return (
      <div className="h-[calc(100vh-5.5rem)] flex flex-col bg-gray-100 dark:bg-gray-900">
        {/* Patient Header Bar */}
        <div className="bg-white dark:bg-gray-800 border-b shadow-sm px-3 py-2 md:px-4 md:py-3">
          {/* Mobile header */}
          <div className="flex md:hidden items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="sm" className="shrink-0 px-2"
                onClick={() => {
                  if (mobileShowDetail) {
                    setMobileShowDetail(false);
                  } else {
                    setSelectedPatient(null);
                    setSelectedDocument(null);
                  }
                }}
              >
                <ChevronLeft className="w-4 h-4" />
                {mobileShowDetail ? "Docs" : "Back"}
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-base truncate">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                  {selectedPatient.urNumber && (
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0 rounded text-xs shrink-0">UR {selectedPatient.urNumber}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">DOB: {formatDob(selectedPatient.dateOfBirth)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="px-2" onClick={() => setShowPatientInfo(true)}>
                <User className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {/* Desktop header */}
          <div className="hidden md:flex items-center justify-between">
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
                    <span>DOB: {formatDob(selectedPatient.dateOfBirth)}</span>
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
              <Button variant="outline" size="sm" onClick={() => setIsUploadDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-1" />
                Upload
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowNotesDialog(true)}>
                <MessageSquare className="w-4 h-4 mr-1" />
                Add Note
              </Button>
              {/* Add Consultation — fully built, currently disabled while in testing. Flip CONSULTATIONS_ENABLED to true to enable. */}
              <Button
                variant="outline"
                size="sm"
                disabled={!CONSULTATIONS_ENABLED}
                onClick={() => setShowConsultationDialog(true)}
                title={CONSULTATIONS_ENABLED ? "Add a consultation note" : "Coming soon — currently being tested"}
                data-testid="button-add-consultation"
              >
                <Stethoscope className="w-4 h-4 mr-1" />
                Add Consultation
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - EMR Style Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Document List (hidden on mobile when detail is showing) */}
          <div className={`${mobileShowDetail ? 'hidden' : 'flex'} md:flex w-full md:w-[28rem] bg-white dark:bg-gray-800 border-r flex-col`}>
            <div className="p-3 border-b bg-gray-50 dark:bg-gray-700 flex flex-col gap-2">
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setHistoryTab('active')}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${historyTab === 'active' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Active ({activeDocuments.length})
                </button>
                <button
                  onClick={() => setHistoryTab('archived')}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${historyTab === 'archived' ? 'bg-gray-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Archive className="w-3 h-3" />
                  Archived {archivedDocuments.length > 0 && `(${archivedDocuments.length})`}
                </button>
                <button
                  onClick={() => setHistoryTab('completed')}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${historyTab === 'completed' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <CheckCircle className="w-3 h-3" />
                  Sent {transmittedReports.length > 0 && `(${transmittedReports.length})`}
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={docCategoryFilter} onValueChange={(v) => setDocCategoryFilter(v as any)}>
                  <SelectTrigger
                    className="h-8 w-[180px] text-xs font-medium border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 flex-shrink-0"
                    data-testid="select-patient-file-category"
                  >
                    <Layers className="w-3.5 h-3.5 mr-1 shrink-0" />
                    <span className="text-gray-500 mr-1">Show:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All entries</SelectItem>
                    <SelectItem value="clinical">Clinical documentation</SelectItem>
                    <SelectItem value="non-clinical">Non-clinical</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={docSortOrder} onValueChange={(v) => setDocSortOrder(v as any)}>
                  <SelectTrigger
                    className="h-8 w-[150px] text-xs font-medium border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 flex-shrink-0"
                    data-testid="select-patient-file-sort"
                  >
                    <ArrowDownUp className="w-3.5 h-3.5 mr-1 shrink-0" />
                    <span className="text-gray-500 mr-1">Sort:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {historyTab === 'finalized' ? (
                (() => {
                  const finalisedReports = patientReports
                    .filter(r => r.isFinalized && !(r as any).isArchived)
                    .sort((a, b) => {
                      const da = new Date(a.finalizedAt || a.examDate || 0).getTime();
                      const db = new Date(b.finalizedAt || b.examDate || 0).getTime();
                      return db - da;
                    });
                  if (finalisedReports.length === 0) {
                    return (
                      <div className="p-4 text-center text-gray-500">
                        <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No finalised reports yet</p>
                        <p className="text-xs text-gray-400 mt-1">Reports appear here once a doctor finalises them</p>
                      </div>
                    );
                  }
                  return (
                    <div className="divide-y">
                      {finalisedReports.map((r) => {
                        const isSelected = selectedDocument?.type === 'report' && selectedDocument?.id === r.id;
                        return (
                          <div
                            key={r.id}
                            onClick={() => { setSelectedDocument({ type: 'report', id: r.id }); setMobileShowDetail(true); }}
                            className={`p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-violet-50 dark:bg-violet-900/30 border-l-4 border-violet-500'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded bg-violet-100 text-violet-600 flex-shrink-0">
                                <ClipboardCheck className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{r.studyType || "Report"}</div>
                                <div className="text-xs text-gray-500">
                                  {safeDateFormat(r.examDate, "d MMM yyyy")}
                                  {r.finalizedAt && ` · Finalised ${safeDateFormat(r.finalizedAt, "d MMM yyyy")}`}
                                </div>
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-violet-700 border-violet-300 bg-violet-50">
                                    finalised
                                  </Badge>
                                  {r.isAmended && (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-700 border-amber-300 bg-amber-50">
                                      amended
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : historyTab === 'completed' ? (
                transmittedReports.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No transmitted reports yet</p>
                    <p className="text-xs text-gray-400 mt-1">PDFs sent via email, fax, or copy HTML appear here</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {transmittedReports.map((tr) => {
                      const isSelected = tr.hasPdf
                        ? selectedDocument?.type === 'transmittedPdf' && selectedDocument?.id === tr.distributionId
                        : selectedDocument?.type === 'report' && selectedDocument?.id === tr.reportId;
                      return (
                        <div
                          key={tr.distributionId}
                          onClick={() => {
                            if (tr.hasPdf) {
                              setSelectedDocument({
                                type: 'transmittedPdf',
                                id: tr.distributionId,
                                meta: { title: tr.studyType || 'Transmitted Report', sentAt: tr.sentAt },
                              });
                            } else {
                              setSelectedDocument({ type: 'report', id: tr.reportId });
                            }
                          }}
                          className={`p-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-500'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded bg-emerald-100 text-emerald-600 flex-shrink-0">
                              <Send className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{tr.studyType || "Report"}</div>
                              <div className="text-xs text-gray-500">
                                {safeDateFormat(tr.examDate, "d MMM yyyy")} · Sent {safeDateFormat(tr.sentAt, "d MMM yyyy")}
                              </div>
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <Badge variant="outline" className="text-xs px-1.5 py-0 text-emerald-700 border-emerald-300 bg-emerald-50">
                                  {tr.method === "copy_html" ? "copy" : tr.method}
                                </Badge>
                                {tr.recipientName && (
                                  <span className="text-xs text-gray-500 truncate">→ {tr.recipientName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : historyTab === 'active' ? (
                activeDocuments.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No documents found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {activeDocuments.flatMap((doc, index) => {
                      const isMultiReport = doc.type === 'report' && doc.date && multiScanDates.has(doc.date);
                      const isFirstOfVisit = isMultiReport && firstReportOfVisitIds.has(doc.id);
                      const isSelected = selectedDocument?.type === doc.type && selectedDocument?.id === doc.id;

                      const row = (
                        <div
                          key={`${doc.type}-${doc.id}`}
                          className={`group p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                            isMultiReport ? 'pl-5' : ''
                          } ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500'
                              : isMultiReport
                              ? 'border-l-4 border-teal-200 dark:border-teal-700'
                              : ''
                          }`}
                          onClick={() => { setSelectedDocument({ type: doc.type, id: doc.id }); setMobileShowDetail(true); }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded ${
                              doc.type === 'report' ? 'bg-green-100 text-green-600' :
                              doc.type === 'worksheet' ? 'bg-purple-100 text-purple-600' :
                              doc.type === 'digitalWorksheet' ? 'bg-orange-100 text-orange-600' :
                              doc.type === 'document' ? 'bg-yellow-100 text-yellow-600' :
                              doc.type === 'note' ? 'bg-gray-100 text-gray-500' :
                              'bg-blue-100 text-blue-600'
                            }`}>
                              {doc.type === 'report' ? <FileText className="w-4 h-4" /> :
                               doc.type === 'worksheet' ? <ClipboardList className="w-4 h-4" /> :
                               doc.type === 'digitalWorksheet' ? <ClipboardList className="w-4 h-4" /> :
                               doc.type === 'document' ? <File className="w-4 h-4" /> :
                               doc.type === 'note' ? <MessageSquare className="w-4 h-4" /> :
                               <Calendar className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{doc.title}</div>
                              <div className="text-xs text-gray-500">
                                {displayDocDate(doc.date)}
                                {displayDocTime((doc as any).ts) && <span className="text-gray-400"> · {displayDocTime((doc as any).ts)}</span>}
                              </div>
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
                            {doc.type !== 'appointment' && doc.type !== 'note' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (doc.type === 'report') archiveReportMutation.mutate(doc.id);
                                  else if (doc.type === 'worksheet') archiveWorksheetMutation.mutate(doc.id);
                                  else if (doc.type === 'digitalWorksheet') archiveDigitalWorksheetMutation.mutate(doc.id);
                                  else if (doc.type === 'document') archiveDocumentMutation.mutate(doc.id);
                                }}
                                className="ml-1 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors flex-shrink-0"
                                title="Archive"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );

                      if (isFirstOfVisit) {
                        const visitCount = visitMap.get(doc.date)?.length ?? 2;
                        const visitHeader = (
                          <div key={`visit-header-${doc.date}-${doc.id}`} className="px-3 py-1.5 bg-teal-50 dark:bg-teal-900/30 flex items-center gap-2 border-l-4 border-teal-400">
                            <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                            <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                              Same-day visit &middot; {displayDocDate(doc.date)} &middot; {visitCount} scans
                            </span>
                          </div>
                        );
                        return [visitHeader, row];
                      }

                      return [row];
                    })}
                  </div>
                )
              ) : (
                archivedDocuments.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Archive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No archived documents</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {archivedDocuments.map((doc) => (
                      <div
                        key={`${doc.type}-${doc.id}`}
                        className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors opacity-70 ${
                          selectedDocument?.type === doc.type && selectedDocument?.id === doc.id
                            ? 'bg-gray-100 dark:bg-gray-700 border-l-4 border-gray-400'
                            : ''
                        }`}
                        onClick={() => { setSelectedDocument({ type: doc.type, id: doc.id }); setMobileShowDetail(true); }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded bg-gray-100 text-gray-500">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate text-gray-600">{doc.title}</div>
                            <div className="text-xs text-gray-400">
                              {displayDocDate(doc.date)}
                              {displayDocTime((doc as any).ts) && <span> · {displayDocTime((doc as any).ts)}</span>}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="text-xs px-1.5 py-0 text-gray-400 border-gray-300">
                                archived
                              </Badge>
                            </div>
                          </div>
                          {doc.type !== 'appointment' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (doc.type === 'report') unarchiveReportMutation.mutate(doc.id);
                                else if (doc.type === 'worksheet') unarchiveWorksheetMutation.mutate(doc.id);
                                else if (doc.type === 'digitalWorksheet') unarchiveDigitalWorksheetMutation.mutate(doc.id);
                                else if (doc.type === 'document') unarchiveDocumentMutation.mutate(doc.id);
                              }}
                              className="ml-1 p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                              title="Restore"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Reminder History */}
            {patientReminderLogs.length > 0 && (
              <div className="border-t px-3 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reminder History</p>
                <div className="space-y-2">
                  {patientReminderLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="text-gray-700">
                          {log.sentAt ? format(new Date(log.sentAt), "d MMM yyyy, h:mm a") : "—"}
                        </span>
                      </div>
                      {log.openedAt ? (
                        <span className="text-emerald-600 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Opened
                        </span>
                      ) : (
                        <span className="text-gray-400">Not opened</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Consultation Dialog (currently disabled in UI via feature flag) */}
          {selectedPatient && (
            <ConsultationDialog
              open={showConsultationDialog}
              onOpenChange={setShowConsultationDialog}
              patientId={selectedPatient.id}
              patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
            />
          )}

          {/* Notes Dialog */}
          <Dialog open={showNotesDialog} onOpenChange={(open) => { setShowNotesDialog(open); if (!open) { setIsAddingNote(false); setNewNoteContent(""); } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  Add Note
                  {selectedPatient && <span className="text-gray-400 font-normal text-sm">— {selectedPatient.firstName} {selectedPatient.lastName}</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="pt-2">
                <textarea
                  className="w-full text-sm border rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  rows={6}
                  placeholder="Type your note..."
                  value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2 mt-3 justify-end">
                  <button
                    className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                    onClick={() => { setShowNotesDialog(false); setNewNoteContent(""); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="text-sm bg-blue-600 text-white rounded-lg px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50 font-medium"
                    disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                    onClick={() => createNoteMutation.mutate(newNoteContent.trim())}
                  >
                    {createNoteMutation.isPending ? "Saving..." : "Save Note"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Right Panel - Document Preview (hidden on mobile when list is showing) */}
          <div className={`${mobileShowDetail ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-900`}>
            <div className="flex-1 p-3 md:p-4 overflow-auto">
              {renderDocumentPreview()}
            </div>
          </div>
        </div>

        {/* Patient Info Modal */}
        <Dialog open={showPatientInfo} onOpenChange={setShowPatientInfo}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Patient Details
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pb-2">

              {/* Name + identifiers */}
              <div>
                <h3 className="text-xl font-semibold">{selectedPatient.firstName} {selectedPatient.lastName}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selectedPatient.urNumber && (
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-sm">UR {selectedPatient.urNumber}</span>
                  )}
                  {!selectedPatient.isActive && <Badge variant="secondary">Inactive</Badge>}
                  {registrationStatus?.status === "completed" && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs">
                      <CheckCircle className="w-3 h-3" />
                      Registration completed
                      {registrationStatus.completedAt && <span className="font-normal text-emerald-500"> · {new Date(registrationStatus.completedAt).toLocaleDateString('en-AU')}</span>}
                    </Badge>
                  )}
                  {registrationStatus?.status === "pending" && !registrationStatus.isExpired && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-xs">
                      <Clock className="w-3 h-3" />
                      Awaiting registration
                    </Badge>
                  )}
                </div>
              </div>

              {/* Personal */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Personal
                </div>
                <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Date of Birth</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{formatDob(selectedPatient.dateOfBirth) || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Gender</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.gender || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Contact
                </div>
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-x-6">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Phone</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.phone || <span className="italic text-gray-300">—</span>}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Email</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200 break-all">{selectedPatient.email || <span className="italic text-gray-300">—</span>}</div>
                    </div>
                  </div>
                  {/* Portal + registration actions */}
                  <div className="pt-1 flex flex-wrap gap-2">
                    {portalStatus?.hasPortalAccess && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs">
                        <CheckCircle className="w-3 h-3" /> Portal Access Active
                      </Badge>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => invitePortalMutation.mutate()} disabled={invitePortalMutation.isPending || !selectedPatient.email}>
                      <Mail className="w-3 h-3" />
                      {portalStatus?.hasPortalAccess ? "Resend Portal Invite" : portalStatus?.invitePending ? "Resend Portal Invitation" : "Invite to Patient Portal"}
                      {invitePortalMutation.isPending && <Clock className="w-3 h-3 animate-spin" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => sendRegistrationMutation.mutate()} disabled={sendRegistrationMutation.isPending || !selectedPatient.email} title={!selectedPatient.email ? "No email address on file" : undefined}>
                      <ClipboardList className="w-3 h-3" />
                      {sendRegistrationMutation.isPending ? "Sending…" : registrationStatus?.status === "completed" ? "Re-send Form" : "Send Registration Form"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => copyRegistrationLinkMutation.mutate()} disabled={copyRegistrationLinkMutation.isPending} title="Generate a registration link to copy and share via SMS or WhatsApp">
                      <Link className="w-3 h-3" />
                      {copyRegistrationLinkMutation.isPending ? "Generating…" : "Copy Form Link"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Address
                </div>
                <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-3">
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400 mb-0.5">Street Address</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.address || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">City / Suburb</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.city || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">State</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.state || <span className="italic text-gray-300">—</span>}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Postcode</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.zipCode || <span className="italic text-gray-300">—</span>}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="border rounded-lg overflow-hidden border-red-100 dark:border-red-900/30">
                <div className="bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-500 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5" /> Emergency Contact
                </div>
                <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Name</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.emergencyContactName || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Phone</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.emergencyContactPhone || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                </div>
              </div>

              {/* Medicare */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Medicare</span>
                  {selectedPatient.medicareNumber && (
                    selectedPatient.medicareVerifiedStatus === "verified" ? (
                      <div className="flex items-center gap-1">
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1 normal-case font-normal tracking-normal">
                          <ShieldCheck className="w-3 h-3" /> Verified
                        </Badge>
                        <Button size="sm" variant="ghost" className="h-5 text-xs text-gray-400 px-1 normal-case font-normal tracking-normal" onClick={() => verifyMedicareMutation.mutate({ id: selectedPatient.id, action: "unverify" })} disabled={verifyMedicareMutation.isPending}>
                          Unverify
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50 normal-case font-normal tracking-normal" onClick={() => verifyMedicareMutation.mutate({ id: selectedPatient.id, action: "verify" })} disabled={verifyMedicareMutation.isPending}>
                        <ShieldAlert className="w-3 h-3" /> Mark Verified
                      </Button>
                    )
                  )}
                </div>
                <div className="p-3 grid grid-cols-3 gap-x-6 gap-y-3">
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400 mb-0.5">Medicare Number</div>
                    <div className="text-sm font-mono tracking-wider text-gray-800 dark:text-gray-200">
                      {selectedPatient.medicareNumber || <span className="italic text-gray-300 font-sans tracking-normal">—</span>}
                      {selectedPatient.medicareNumber && selectedPatient.medicareIrn && <span className="text-gray-400"> / {selectedPatient.medicareIrn}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Expiry</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.medicareExpiry || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                  {selectedPatient.medicareVerifiedAt && (
                    <div className="col-span-3 text-xs text-green-600">Verified {format(new Date(selectedPatient.medicareVerifiedAt), "d MMM yyyy")}</div>
                  )}
                </div>
              </div>

              {/* Medical */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Medical
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Allergies</div>
                    <div className={`text-sm ${selectedPatient.allergies ? "text-red-600 font-medium" : "italic text-gray-300"}`}>{selectedPatient.allergies || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Medical History</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{selectedPatient.medicalHistory || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Referring Physician</div>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.referringPhysician || <span className="italic text-gray-300">—</span>}</div>
                  </div>
                </div>
              </div>

              {/* Insurance */}
              {(selectedPatient.insuranceProvider || selectedPatient.insuranceId) && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Insurance</div>
                  <div className="p-3 grid grid-cols-2 gap-x-6">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Provider</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.insuranceProvider || <span className="italic text-gray-300">—</span>}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">Policy ID</div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">{selectedPatient.insuranceId || <span className="italic text-gray-300">—</span>}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedPatient.notes && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</div>
                  <div className="p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedPatient.notes}</div>
                </div>
              )}

            </div>

            <div className="pt-4 border-t mt-2 sticky bottom-0 bg-white dark:bg-gray-950 pb-1">
              <Button
                className="w-full gap-2"
                onClick={() => { setShowPatientInfo(false); handleEdit(selectedPatient); }}
              >
                <Edit className="w-4 h-4" /> Edit Patient
              </Button>
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
                <Label>File</Label>
                <div
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file) setUploadFile(file);
                  }}
                  className={`mt-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-5 cursor-pointer transition-colors ${uploadFile ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/40"}`}
                  onClick={() => document.getElementById("docFile")?.click()}
                >
                  <Upload className="w-6 h-6 text-gray-400" />
                  {uploadFile ? (
                    <span className="text-sm font-medium text-blue-700 text-center break-all">{uploadFile.name}</span>
                  ) : (
                    <>
                      <span className="text-sm text-gray-600">Drag and drop a file here, or <span className="text-blue-600 font-medium">browse</span></span>
                      <span className="text-xs text-gray-400">Images or PDF</span>
                    </>
                  )}
                  <input
                    id="docFile"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
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

        {/* Edit Patient Dialog — available in the detail view */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) flushAutoSave(); setIsDialogOpen(open); if (!open) { resetForm(); setEditingPatient(null); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPatient ? "Edit Patient" : "Add New Patient"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex-1">
                  <Label htmlFor="urNumber2" className="text-blue-800 font-semibold">UR Number</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="urNumber2"
                      autoComplete="off"
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
                  <Label>First Name *</Label>
                  <Input value={formData.firstName} autoComplete="off" autoCapitalize="words" onChange={(e) => setFormData(prev => ({ ...prev, firstName: capitalizeWords(e.target.value) }))} required />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input value={formData.lastName} autoComplete="off" autoCapitalize="words" onChange={(e) => setFormData(prev => ({ ...prev, lastName: capitalizeWords(e.target.value) }))} required />
                </div>
                <div>
                  <Label>Date of Birth *</Label>
                  <Input type="date" autoComplete="off" value={formData.dateOfBirth} onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))} required />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input autoComplete="off" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" autoComplete="off" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Emergency Contact Name</Label>
                  <Input autoComplete="off" value={formData.emergencyContactName} onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactName: capitalizeWords(e.target.value) }))} placeholder="e.g. Jane Smith" />
                </div>
                <div>
                  <Label>Emergency Contact Phone</Label>
                  <Input autoComplete="off" value={formData.emergencyContactPhone} onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactPhone: e.target.value }))} placeholder="e.g. 0412 345 678" />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input autoComplete="off" value={formData.address} onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input autoComplete="off" value={formData.city} onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input autoComplete="off" value={formData.state} onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))} />
                </div>
                <div>
                  <Label>Zip Code</Label>
                  <Input autoComplete="off" value={formData.zipCode} onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 mb-2 mt-1">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-gray-700">Medicare Details *</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div>
                      <Label>Medicare Number *</Label>
                      <Input autoComplete="off" value={formData.medicareNumber} onChange={(e) => setFormData(prev => ({ ...prev, medicareNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="1234567890" maxLength={10} required />
                    </div>
                    <div>
                      <Label>IRN *</Label>
                      <Input autoComplete="off" value={formData.medicareIrn} onChange={(e) => setFormData(prev => ({ ...prev, medicareIrn: e.target.value.replace(/\D/g, "").slice(0, 1) }))} placeholder="1" maxLength={1} required />
                    </div>
                    <div>
                      <Label>Expiry (MM/YYYY) *</Label>
                      <Input autoComplete="off" value={formData.medicareExpiry} onChange={(e) => { let v = e.target.value.replace(/[^\d/]/g, ""); if (v.length === 2 && !v.includes("/")) v = v + "/"; setFormData(prev => ({ ...prev, medicareExpiry: v.slice(0, 7) })); }} placeholder="01/2028" maxLength={7} required />
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Referring Physician *</Label>
                  <Input autoComplete="off" value={formData.referringPhysician} onChange={(e) => setFormData(prev => ({ ...prev, referringPhysician: e.target.value }))} required />
                </div>
                <div className="col-span-2">
                  <Label>Allergies</Label>
                  <Input autoComplete="off" value={formData.allergies} onChange={(e) => setFormData(prev => ({ ...prev, allergies: e.target.value }))} placeholder="List any known allergies" />
                </div>
                <div className="col-span-2">
                  <Label>Medical History</Label>
                  <Textarea value={formData.medicalHistory} onChange={(e) => setFormData(prev => ({ ...prev, medicalHistory: e.target.value }))} rows={3} />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-2 pt-2 border-t">
                <div>
                  {editingPatient && editingPatient.isActive !== false && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-red-700 border-red-300 hover:bg-red-50"
                      onClick={() => {
                        setArchivePassword("");
                        setArchiveReason("");
                        setArchiveModal({ patient: editingPatient, mode: "archive" });
                      }}
                      data-testid="button-archive-patient"
                    >
                      <Archive className="w-4 h-4 mr-2" /> Archive Patient
                    </Button>
                  )}
                  {editingPatient && editingPatient.isActive === false && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      onClick={() => {
                        setArchivePassword("");
                        setArchiveReason("");
                        setArchiveModal({ patient: editingPatient, mode: "restore" });
                      }}
                      data-testid="button-restore-patient"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> Restore Patient
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {editingPatient && <AutoSaveIndicator status={autoSaveStatus} />}
                  {editingPatient && (
                    <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={handleDiscardChanges}>
                      Discard changes
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={() => { flushAutoSave(); setIsDialogOpen(false); resetForm(); setEditingPatient(null); }}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingPatient ? "Update" : "Add Patient"}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Archive / Restore confirmation with password */}
        <Dialog open={!!archiveModal} onOpenChange={(open) => { if (!open) { setArchiveModal(null); setArchivePassword(""); setArchiveReason(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {archiveModal?.mode === "archive" ? "Archive patient file" : "Restore patient file"}
              </DialogTitle>
            </DialogHeader>
            {archiveModal && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!archivePassword) return;
                  setArchiveSubmitting(true);
                  archiveMutation.mutate({
                    id: archiveModal.patient.id,
                    mode: archiveModal.mode,
                    password: archivePassword,
                    reason: archiveReason,
                  });
                }}
                className="space-y-4"
              >
                <div className={`text-sm rounded-md p-3 border ${archiveModal.mode === "archive" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
                  {archiveModal.mode === "archive" ? (
                    <>You're about to archive <strong>{archiveModal.patient.firstName} {archiveModal.patient.lastName}</strong>. The file will be hidden from the active patient list but can still be searched in the Archived tab and restored at any time.</>
                  ) : (
                    <>You're about to restore <strong>{archiveModal.patient.firstName} {archiveModal.patient.lastName}</strong> back to the active patient list.</>
                  )}
                </div>

                {archiveModal.mode === "archive" && (
                  <div>
                    <Label htmlFor="archive-reason">Reason (optional)</Label>
                    <Select value={archiveReason} onValueChange={setArchiveReason}>
                      <SelectTrigger className="mt-1" data-testid="select-archive-reason">
                        <SelectValue placeholder="Select a reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Test patient">Test patient</SelectItem>
                        <SelectItem value="Deceased">Deceased</SelectItem>
                        <SelectItem value="Duplicate record">Duplicate record</SelectItem>
                        <SelectItem value="Patient transferred care">Patient transferred care</SelectItem>
                        <SelectItem value="Inactive / no longer attending">Inactive / no longer attending</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="archive-password">Confirm with your password</Label>
                  <Input
                    id="archive-password"
                    type="password"
                    autoComplete="current-password"
                    className="mt-1"
                    value={archivePassword}
                    onChange={(e) => setArchivePassword(e.target.value)}
                    placeholder="Your account password"
                    autoFocus
                    data-testid="input-archive-password"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setArchiveModal(null); setArchivePassword(""); setArchiveReason(""); }}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!archivePassword || archiveSubmitting || archiveMutation.isPending}
                    className={archiveModal.mode === "archive" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                    data-testid="button-confirm-archive"
                  >
                    {archiveSubmitting || archiveMutation.isPending
                      ? "Working..."
                      : archiveModal.mode === "archive" ? "Archive Patient" : "Restore Patient"}
                  </Button>
                </div>
              </form>
            )}
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

        {(() => {
          const activeCount = patients.filter(p => p.isActive !== false).length;
          const archivedCount = patients.filter(p => p.isActive === false).length;
          return (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setViewMode("active")}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${viewMode === "active" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
                data-testid="tab-active-patients"
              >
                Active
                <span className={`px-1.5 py-0 rounded text-xs font-mono ${viewMode === "active" ? "bg-white/20" : "bg-gray-100"}`}>{activeCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("archived")}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${viewMode === "archived" ? "bg-gray-600 text-white border-gray-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
                data-testid="tab-archived-patients"
              >
                <Archive className="w-3.5 h-3.5" />
                Archived
                <span className={`px-1.5 py-0 rounded text-xs font-mono ${viewMode === "archived" ? "bg-white/20" : "bg-gray-100"}`}>{archivedCount}</span>
              </button>
            </div>
          );
        })()}

        <Card className="mb-6">
          <CardContent className="pt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder={viewMode === "archived" ? "Search archived patients..." : "Search patients by name, phone, or email..."}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Select value={sortBy} onValueChange={(v) => { setSortBy(v as any); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[210px] text-sm font-medium border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100" data-testid="select-patient-sort">
                    <ArrowDownUp className="w-4 h-4 mr-1.5 shrink-0" />
                    <span className="text-gray-500 mr-1">Sort:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                    <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                    <SelectItem value="ur_asc">UR (low–high)</SelectItem>
                    <SelectItem value="ur_desc">UR (high–low)</SelectItem>
                    <SelectItem value="recent">Date added (newest first)</SelectItem>
                    <SelectItem value="oldest">Date added (oldest first)</SelectItem>
                    <SelectItem value="updated">Recently updated</SelectItem>
                    <SelectItem value="dob_youngest">DOB (youngest first)</SelectItem>
                    <SelectItem value="dob_oldest">DOB (oldest first)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500">Gender</Label>
                <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v as any); setPage(1); }}>
                  <SelectTrigger className="h-8 w-[120px] text-sm" data-testid="select-patient-gender-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500">Contact</Label>
                <Select value={contactFilter} onValueChange={(v) => { setContactFilter(v as any); setPage(1); }}>
                  <SelectTrigger className="h-8 w-[170px] text-sm" data-testid="select-patient-contact-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="has_phone">Has phone</SelectItem>
                    <SelectItem value="has_email">Has email</SelectItem>
                    <SelectItem value="has_medicare">Has Medicare no.</SelectItem>
                    <SelectItem value="missing_contact">Missing phone & email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <Label className="text-xs text-gray-500">Per page</Label>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-8 w-[80px] text-sm" data-testid="select-patient-page-size"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                {(genderFilter !== "all" || contactFilter !== "all" || sortBy !== "name_asc") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-gray-500"
                    onClick={() => { setGenderFilter("all"); setContactFilter("all"); setSortBy("name_asc"); setPage(1); }}
                    data-testid="button-reset-patient-filters"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {(() => {
          const dobToDate = (s?: string | null): number => {
            if (!s) return 0;
            const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).getTime();
            const dmy = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
            if (dmy) return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}`).getTime();
            const t = new Date(s).getTime();
            return isNaN(t) ? 0 : t;
          };
          const urNum = (p: Patient): number => {
            const n = parseInt((p.urNumber || "").replace(/\D/g, ""), 10);
            return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
          };
          const tsMs = (d?: Date | string | null): number => {
            if (!d) return 0;
            const t = new Date(d as any).getTime();
            return isNaN(t) ? 0 : t;
          };
          const passesViewMode = (p: Patient) => viewMode === "archived" ? p.isActive === false : p.isActive !== false;
          const passesGender = (p: Patient) => genderFilter === "all" || (p.gender || "").toLowerCase() === genderFilter;
          const passesContact = (p: Patient) => {
            switch (contactFilter) {
              case "has_phone": return !!p.phone;
              case "has_email": return !!p.email;
              case "has_medicare": return !!(p as any).medicareNumber;
              case "missing_contact": return !p.phone && !p.email;
              default: return true;
            }
          };
          const filtered = patients.filter(p => passesViewMode(p) && passesGender(p) && passesContact(p));
          const sorted = [...filtered].sort((a, b) => {
            switch (sortBy) {
              case "name_asc":  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
              case "name_desc": return `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`);
              case "ur_asc":    return urNum(a) - urNum(b);
              case "ur_desc":   return urNum(b) - urNum(a);
              case "recent":    return tsMs(b.createdAt) - tsMs(a.createdAt) || (b.id || 0) - (a.id || 0);
              case "oldest":    return tsMs(a.createdAt) - tsMs(b.createdAt) || (a.id || 0) - (b.id || 0);
              case "updated":   return tsMs(b.updatedAt) - tsMs(a.updatedAt) || (b.id || 0) - (a.id || 0);
              case "dob_youngest": return dobToDate(b.dateOfBirth) - dobToDate(a.dateOfBirth);
              case "dob_oldest":   return dobToDate(a.dateOfBirth) - dobToDate(b.dateOfBirth);
              default: return 0;
            }
          });
          const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
          const currentPage = Math.min(page, totalPages);
          const start = (currentPage - 1) * pageSize;
          const pageItems = sorted.slice(start, start + pageSize);

          if (isLoading) {
            return (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            );
          }
          if (patients.length === 0) {
            return (
              <Card>
                <CardContent className="py-12 text-center">
                  <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No patients found</h3>
                  <p className="text-gray-600 mt-1">Add your first patient to get started</p>
                </CardContent>
              </Card>
            );
          }
          if (filtered.length === 0) {
            return (
              <Card>
                <CardContent className="py-12 text-center">
                  <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No patients match these filters</h3>
                  <p className="text-gray-600 mt-1">Try clearing the filters or adjusting the search.</p>
                </CardContent>
              </Card>
            );
          }

          return (
            <>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2 px-1">
                <span data-testid="text-patient-count">
                  Showing <strong>{start + 1}–{Math.min(start + pageSize, sorted.length)}</strong> of <strong>{sorted.length}</strong> {viewMode === "archived" ? "archived" : "active"} patients
                </span>
              </div>
              <div className="grid gap-4">
                {pageItems.map((patient) => (
              <Card 
                key={patient.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedPatient(patient)}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-base md:text-lg truncate">{patient.firstName} {patient.lastName}</div>
                        <div className="text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {patient.urNumber && (
                            <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0 rounded text-xs">UR {patient.urNumber}</span>
                          )}
                          <span>DOB: {formatDob(patient.dateOfBirth)}</span>
                          {patient.phone && <span className="hidden sm:inline">{patient.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-blue-700 border-blue-300 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPatient(patient);
                        setFormData({
                          urNumber: patient.urNumber || "",
                          firstName: patient.firstName || "",
                          lastName: patient.lastName || "",
                          dateOfBirth: patient.dateOfBirth || "",
                          gender: patient.gender || "",
                          phone: patient.phone || "",
                          email: patient.email || "",
                          address: patient.address || "",
                          medicareNumber: (patient as any).medicareNumber || "",
                          medicareIrn: (patient as any).medicareIrn || "",
                          medicareExpiry: (patient as any).medicareExpiry || "",
                          emergencyContact: (patient as any).emergencyContact || "",
                          emergencyPhone: (patient as any).emergencyPhone || "",
                          medicalHistory: (patient as any).medicalHistory || "",
                          allergies: (patient as any).allergies || "",
                          medications: (patient as any).medications || "",
                          notes: (patient as any).notes || "",
                        } as any);
                        setIsDialogOpen(true);
                      }}
                      data-testid={`button-view-details-${patient.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1.5" /> View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                    data-testid="button-patients-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-gray-500" data-testid="text-patients-page-indicator">
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                    data-testid="button-patients-next-page"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          );
        })()}

        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) flushAutoSave(); setIsDialogOpen(open); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPatient ? "Edit Patient" : "Add New Patient"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {/* UR Number */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex-1">
                  <Label htmlFor="urNumber" className="text-blue-800 font-semibold">UR Number</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="urNumber"
                      autoComplete="off"
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
                    autoComplete="off"
                    value={formData.firstName}
                    autoCapitalize="words"
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: capitalizeWords(e.target.value) }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    autoComplete="off"
                    value={formData.lastName}
                    autoCapitalize="words"
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: capitalizeWords(e.target.value) }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    autoComplete="off"
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
                    autoComplete="off"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="off"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    autoComplete="off"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    autoComplete="off"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    autoComplete="off"
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="zipCode">Zip Code</Label>
                  <Input
                    id="zipCode"
                    autoComplete="off"
                    value={formData.zipCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 mb-2 mt-1">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-gray-700">Medicare Details *</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div>
                      <Label htmlFor="medicareNumber">Medicare Number *</Label>
                      <Input
                        id="medicareNumber"
                        autoComplete="off"
                        value={formData.medicareNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, medicareNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                        placeholder="1234567890"
                        maxLength={10}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="medicareIrn">IRN *</Label>
                      <Input
                        id="medicareIrn"
                        autoComplete="off"
                        value={formData.medicareIrn}
                        onChange={(e) => setFormData(prev => ({ ...prev, medicareIrn: e.target.value.replace(/\D/g, "").slice(0, 1) }))}
                        placeholder="1"
                        maxLength={1}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="medicareExpiry">Expiry (MM/YYYY) *</Label>
                      <Input
                        id="medicareExpiry"
                        autoComplete="off"
                        value={formData.medicareExpiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/[^\d/]/g, "");
                          if (v.length === 2 && !v.includes("/")) v = v + "/";
                          setFormData(prev => ({ ...prev, medicareExpiry: v.slice(0, 7) }));
                        }}
                        placeholder="01/2028"
                        maxLength={7}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="referringPhysician">Referring Physician *</Label>
                  <Input
                    id="referringPhysician"
                    autoComplete="off"
                    value={formData.referringPhysician}
                    onChange={(e) => setFormData(prev => ({ ...prev, referringPhysician: e.target.value }))}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="allergies">Allergies</Label>
                  <Input
                    id="allergies"
                    autoComplete="off"
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
              <div className="flex items-center justify-end gap-3">
                {editingPatient && <AutoSaveIndicator status={autoSaveStatus} />}
                {editingPatient && (
                  <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={handleDiscardChanges}>
                    Discard changes
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => { flushAutoSave(); setIsDialogOpen(false); resetForm(); setEditingPatient(null); }}>
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
