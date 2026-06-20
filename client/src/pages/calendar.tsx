import { useState, useMemo, useEffect } from "react";
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
import { ChevronLeft, ChevronRight, Plus, Clock, User, Phone, Mail, Calendar as CalendarIcon, X, Edit, Trash2, Search, UserCheck, Undo2, DollarSign, FolderOpen, UserPlus, CalendarX2, Repeat, CalendarClock, PlayCircle, FileUp, PenLine, ArrowLeft, CalendarDays, CheckCircle, Laptop, Hourglass, FileText, MoreHorizontal } from "lucide-react";
import jsPDF from "jspdf";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { capitalizeWords } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays, addMonths, subMonths, addWeeks, subWeeks, addYears, isSameMonth, isSameDay, isSameWeek, parseISO, getHours, getMinutes, subDays } from "date-fns";
import type { Appointment, Physician, Sonographer, Patient, ScanDurationSetting, CalendarEvent, ReminderLog, CalendarTask } from "@shared/schema";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Downscale + recompress an image data URL via canvas. Used to keep PDFs small
// when embedding logos/signatures (jsPDF embeds raw bytes otherwise).
async function downscaleImage(
  dataUrl: string,
  maxDim: number,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.85,
  background?: string,
): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(type, quality);
  } catch {
    return dataUrl;
  }
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDobDDMMYYYY(dob: string | null | undefined): string {
  if (!dob) return "";
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dob;
}

async function generateAttendanceCertificate(opts: {
  appointment: any;
  patient: any | null;
  clinic: any | null;
  physician: any | null;
}): Promise<{ blob: Blob; base64: string; filename: string }> {
  const { appointment, patient, clinic, physician } = opts;
  const apptDate = new Date(appointment.appointmentDate);
  const today = new Date();

  const dateLong = `${ordinalSuffix(today.getDate())} ${format(today, "MMMM yyyy")}`;
  const apptDateLong = `${ordinalSuffix(apptDate.getDate())} ${format(apptDate, "MMMM yyyy")}`;
  const generatedAt = format(today, "d MMM yyyy 'at' h:mm a");

  const fullName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : (appointment.patientName || "");
  const lastFirst = patient
    ? `${patient.lastName}, ${patient.firstName}`
    : (appointment.patientName || "");
  const dobDisplay = formatDobDDMMYYYY(patient?.dateOfBirth || appointment.patientDob);
  const phoneDisplay = patient?.phone || appointment.patientPhone || "";
  const addressLine1 = patient?.address || "";
  const cityState = [patient?.city, patient?.state, patient?.zipCode].filter(Boolean).join(" ");

  const logoRaw = clinic?.logoUrl ? await fetchAsDataUrl("/api/clinic/logo") : null;
  const sigRaw = physician?.signatureUrl ? await fetchAsDataUrl(physician.signatureUrl) : null;
  // Downscale + recompress to keep PDF small. Logo flattens onto white as JPEG.
  // Signature keeps transparency as PNG but is small in pixels.
  const logoDataUrl = logoRaw ? await downscaleImage(logoRaw, 600, "image/jpeg", 0.85, "#ffffff") : null;
  const sigDataUrl = sigRaw ? await downscaleImage(sigRaw, 500, "image/png", 0.9) : null;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageW = 210;
  const margin = 22;

  // Logo top-right
  if (logoDataUrl) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = logoDataUrl;
      });
      const targetW = 55;
      const targetH = (img.height / img.width) * targetW;
      pdf.addImage(logoDataUrl, "PNG", pageW - margin - targetW, 18, targetW, targetH);
    } catch { /* ignore */ }
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);

  let y = 70;
  pdf.text(dateLong, margin, y);
  y += 16;

  pdf.text("To Whom It May Concern,", margin, y);
  y += 12;

  pdf.text(`Re: ${lastFirst}`, margin, y);
  y += 6;
  if (dobDisplay) { pdf.text(`DOB: ${dobDisplay}`, margin, y); y += 6; }
  if (addressLine1) { pdf.text(addressLine1, margin, y); y += 6; }
  if (cityState) { pdf.text(cityState, margin, y); y += 6; }
  if (phoneDisplay) { pdf.text(`Mob: ${phoneDisplay}`, margin, y); y += 6; }

  y += 10;
  const body = `This letter is to certify that ${fullName} needed time off to attend a medical appointment on ${apptDateLong}.`;
  const bodyLines = pdf.splitTextToSize(body, pageW - margin * 2);
  pdf.text(bodyLines, margin, y);
  y += bodyLines.length * 6 + 14;

  pdf.text("Kind Regards,", margin, y);
  y += 6;

  if (sigDataUrl) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = sigDataUrl;
      });
      const sigW = 45;
      const sigH = (img.height / img.width) * sigW;
      pdf.addImage(sigDataUrl, "PNG", margin, y, sigW, sigH);
      y += sigH + 4;
    } catch { y += 18; }
  } else {
    y += 18;
  }

  if (physician?.name) { pdf.text(physician.name, margin, y); y += 6; }
  if (physician?.title) { pdf.text(physician.title, margin, y); y += 6; }

  // Clinic footer block
  const footerY = 245;
  let fy = footerY;
  if (clinic?.name) { pdf.text(clinic.name, margin, fy); fy += 6; }
  if (clinic?.phone) { pdf.text(`Ph: ${clinic.phone}`, margin, fy); fy += 6; }
  if (clinic?.fax) { pdf.text(`Fax: ${clinic.fax}`, margin, fy); fy += 6; }
  pdf.text(`Email: admin@nexusvascularimaging.com.au`, margin, fy); fy += 6;
  if (clinic?.website) { pdf.text(`Website: ${clinic.website}`, margin, fy); fy += 6; }

  // Generated timestamp footer (bottom-right, small grey)
  pdf.setFontSize(8);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`Generated: ${generatedAt}`, pageW - margin, 287, { align: "right" });

  const safeName = (fullName || "patient").replace(/[^a-z0-9]+/gi, "_");
  const filename = `Attendance_Certificate_${safeName}_${format(apptDate, "yyyy-MM-dd")}.pdf`;
  const blob = pdf.output("blob");
  const dataUri = pdf.output("datauristring");
  const base64 = dataUri.split(",")[1] || "";
  return { blob, base64, filename };
}

function parseReferralNotes(notes: string | null | undefined): { referrerName: string | null; cleanNotes: string | null } {
  if (!notes) return { referrerName: null, cleanNotes: null };
  const match = notes.match(/^\[Referral from: ([^\]]+)\]\n?/);
  if (match) {
    const referrerName = match[1];
    const cleanNotes = notes.slice(match[0].length).trim() || null;
    return { referrerName, cleanNotes };
  }
  return { referrerName: null, cleanNotes: notes };
}

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

export function TasksPanel() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"active" | "done">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarTask | null>(null);
  const [text, setText] = useState("");
  const [details, setDetails] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: tasks = [] } = useQuery<CalendarTask[]>({
    queryKey: ["/api/calendar-tasks"],
  });

  const create = useMutation({
    mutationFn: (data: { text: string; details: string }) => apiRequest("/api/calendar-tasks", "POST", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/calendar-tasks"] }); closeDialog(); },
    onError: () => toast({ title: "Failed to add task", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { text?: string; details?: string | null; completed?: boolean } }) =>
      apiRequest(`/api/calendar-tasks/${id}`, "PATCH", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/calendar-tasks"] }),
    onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/calendar-tasks/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/calendar-tasks"] }),
  });

  const active = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);
  const list = tab === "active" ? active : done;

  const openNew = () => { setEditing(null); setText(""); setDetails(""); setDialogOpen(true); };
  const openEdit = (t: CalendarTask) => { setEditing(t); setText(t.text); setDetails(t.details ?? ""); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setText(""); setDetails(""); };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (editing) {
      update.mutate({ id: editing.id, data: { text: trimmed, details: details.trim() || null } }, { onSuccess: () => closeDialog() });
    } else {
      create.mutate({ text: trimmed, details: details.trim() });
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 border rounded-xl shadow-sm flex flex-col flex-1 min-h-[420px]">
        {/* Tabs */}
        <div className="flex border-b text-xs">
          <button
            onClick={() => setTab("active")}
            className={`flex-1 py-2 font-medium transition-colors ${tab === "active" ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50/50" : "text-gray-500 hover:text-gray-700"}`}
            data-testid="tab-tasks-active"
          >
            To do {active.length > 0 && <span className="ml-1 text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5">{active.length}</span>}
          </button>
          <button
            onClick={() => setTab("done")}
            className={`flex-1 py-2 font-medium transition-colors ${tab === "done" ? "text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50" : "text-gray-500 hover:text-gray-700"}`}
            data-testid="tab-tasks-done"
          >
            Done {done.length > 0 && <span className="ml-1 text-[10px] bg-emerald-600 text-white rounded-full px-1.5 py-0.5">{done.length}</span>}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          {list.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-8 px-3">
              {tab === "active" ? "No tasks yet. Tap + to add one." : "Nothing completed yet."}
            </div>
          ) : (
            <ul className="space-y-1">
              {list.map(t => {
                const expanded = expandedId === t.id;
                const hasDetails = !!(t.details && t.details.trim());
                return (
                  <li
                    key={t.id}
                    className="group rounded hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <div className="flex items-start gap-2 px-2 py-1.5">
                      <Checkbox
                        checked={!!t.completed}
                        onCheckedChange={(v) => update.mutate({ id: t.id, data: { completed: !!v } })}
                        className="mt-0.5"
                        data-testid={`checkbox-task-${t.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => hasDetails ? setExpandedId(expanded ? null : t.id) : openEdit(t)}
                        className={`flex-1 text-left text-xs leading-snug break-words ${t.completed ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-200"}`}
                        title={hasDetails ? "Click to expand" : "Click to edit"}
                        data-testid={`button-task-${t.id}`}
                      >
                        <span className="inline-flex items-start gap-1">
                          <span>{t.text}</span>
                          {hasDetails && (
                            <ChevronRight className={`w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                          )}
                        </span>
                      </button>
                      <button
                        onClick={() => openEdit(t)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-600 transition-opacity"
                        title="Edit task"
                        data-testid={`button-edit-task-${t.id}`}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove.mutate(t.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                        title="Delete task"
                        data-testid={`button-delete-task-${t.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {expanded && hasDetails && (
                      <div className="px-2 pb-2 pl-8 text-[11px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed border-l-2 border-blue-200 ml-3 mb-1">
                        {t.details}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Add bar */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-gray-500 hover:text-gray-900 h-8"
            onClick={openNew}
            data-testid="button-add-task"
          >
            <Plus className="w-4 h-4 mr-1" /> Add task
          </Button>
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="task-title">Task</Label>
              <Input
                id="task-title"
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="What needs doing?"
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
                className="mt-1"
                data-testid="input-task-title"
              />
            </div>
            <div>
              <Label htmlFor="task-details">Details (optional)</Label>
              <Textarea
                id="task-details"
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Add notes, context, links…"
                rows={5}
                className="mt-1 text-sm"
                data-testid="input-task-details"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button
                onClick={submit}
                disabled={!text.trim() || create.isPending || update.isPending}
                data-testid="button-save-task"
              >
                {create.isPending || update.isPending ? "Saving…" : editing ? "Save" : "Add task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PatientApptSearchDialog({
  open, onOpenChange, onJumpTo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJumpTo?: (date: Date, appointment: Appointment) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);

  const { data: results = [], isFetching } = useQuery<Patient[]>({
    queryKey: ["/api/patients", "search", search],
    queryFn: async () => {
      if (!search || search.length < 2) return [];
      const res = await fetch(`/api/patients?search=${encodeURIComponent(search)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: search.length >= 2,
  });

  const { data: appts = [], isLoading: apptsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/patients", selected?.id, "appointments"],
    queryFn: async () => {
      if (!selected) return [];
      const res = await fetch(`/api/patients/${selected.id}/appointments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selected,
  });

  const now = Date.now();
  const upcoming = appts
    .filter(a => a.status !== "cancelled" && new Date(a.appointmentDate).getTime() >= now - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
  const past = appts
    .filter(a => new Date(a.appointmentDate).getTime() < now - 60 * 60 * 1000)
    .sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime());

  const reset = () => { setSearch(""); setSelected(null); };

  const renderAppt = (a: Appointment, faded = false) => (
    <li key={a.id}>
      <button
        type="button"
        onClick={() => { onJumpTo?.(new Date(a.appointmentDate), a); onOpenChange(false); reset(); }}
        className={`w-full text-left p-3 rounded-lg border bg-white hover:border-blue-400 hover:bg-blue-50/50 transition-colors ${faded ? "opacity-70" : ""}`}
        data-testid={`button-appt-jump-${a.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">
              {format(new Date(a.appointmentDate), "EEE d MMM yyyy")} · {a.appointmentTime}
            </div>
            <div className="text-xs text-gray-600 mt-0.5 truncate">{a.scanType}</div>
            {a.notes && <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{a.notes}</div>}
          </div>
          <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
        </div>
      </button>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-4 h-4" /> Find Patient Appointments
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="appt-search">Search by name, UR number, phone or email</Label>
              <Input
                id="appt-search"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type at least 2 characters…"
                className="mt-1"
                data-testid="input-patient-appt-search"
              />
            </div>
            {search.length >= 2 && (
              <div className="border rounded-md max-h-72 overflow-y-auto">
                {isFetching ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Searching…</div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">No patients found.</div>
                ) : (
                  <ul className="divide-y">
                    {results.map(p => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          data-testid={`button-pick-patient-${p.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{p.firstName} {p.lastName}</div>
                              <div className="text-xs text-gray-500 truncate">
                                {p.dateOfBirth && `DOB ${p.dateOfBirth}`}
                                {p.phone && ` · ${p.phone}`}
                              </div>
                            </div>
                            {p.urNumber && <Badge variant="secondary" className="text-[10px] shrink-0">UR {p.urNumber}</Badge>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">{selected.firstName} {selected.lastName}</div>
                <div className="text-xs text-gray-600">
                  {selected.urNumber && <span>UR {selected.urNumber}</span>}
                  {selected.dateOfBirth && <span> · DOB {selected.dateOfBirth}</span>}
                  {selected.phone && <span> · {selected.phone}</span>}
                </div>
              </div>
            </div>

            {apptsLoading ? (
              <div className="text-sm text-gray-500 py-6 text-center">Loading appointments…</div>
            ) : (
              <>
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Upcoming ({upcoming.length})
                  </h3>
                  {upcoming.length === 0 ? (
                    <div className="text-sm text-gray-500 italic bg-gray-50 border border-dashed rounded-md p-4 text-center">
                      No upcoming appointments
                    </div>
                  ) : (
                    <ul className="space-y-2">{upcoming.map(a => renderAppt(a))}</ul>
                  )}
                </div>

                {past.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-3">
                      Past ({past.length})
                    </h3>
                    <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">{past.slice(0, 20).map(a => renderAppt(a, true))}</ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Calendar({ onOpenPatient, onBeginStudy }: { onOpenPatient?: (patientId: number) => void; onBeginStudy?: (patientId: number | null, patientName: string, tab?: "upload" | "draw") => void }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(() => window.innerWidth < 768 ? "day" : "week");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null);
  const [certificateDialog, setCertificateDialog] = useState<{
    appointment: Appointment;
    blob: Blob;
    base64: string;
    filename: string;
    saved: boolean;
  } | null>(null);
  const [generatingCertificate, setGeneratingCertificate] = useState(false);
  const [emailingCertificate, setEmailingCertificate] = useState(false);
  const [showBeginStudy, setShowBeginStudy] = useState(false);
  const [showIdCheck, setShowIdCheck] = useState(false);
  const [studyMode, setStudyMode] = useState<"upload" | "draw">("upload");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [desktopDatePickerOpen, setDesktopDatePickerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [bookingMode, setBookingMode] = useState<"appointment" | "event">("appointment");
  const [apptSearchOpen, setApptSearchOpen] = useState(false);

  // Keep isMobile in sync with window width and lock view mode on small screens
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setViewMode("day");
    };
    onResize(); // run once on mount
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
    referringDoctorName: "",
    referringDoctorEmail: "",
    referringDoctorFax: "",
    copyToName: "",
    copyToEmail: "",
    copyToFax: "",
    copyToRecipients: [] as { name: string; email: string; fax: string }[],
  });

  const { data: scanDurations = [] } = useQuery<ScanDurationSetting[]>({
    queryKey: ["/api/scan-durations"],
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientResults, setShowPatientResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({ firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "", address: "", city: "", state: "", zipCode: "", medicareNumber: "", medicareIrn: "", medicareExpiry: "", emergencyContactName: "", emergencyContactPhone: "" });
  const [registrationPromptPatient, setRegistrationPromptPatient] = useState<Patient | null>(null);

  // Calendar events state
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "",
    date: "",
    isAllDay: false,
    startTime: "09:00",
    endTime: "17:00",
    color: "purple",
    recurrence: "none",
    recurrenceEndDate: "",
    notes: "",
  });

  // Hover tooltip state
  const [tooltip, setTooltip] = useState<{ apt: Appointment; x: number; y: number } | null>(null);

  // Live clock tick — refreshes every 60 s so wait-time badges stay current
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data: allCalendarPatients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  // Public holidays for the visible year (and adjacent year when straddling Dec/Jan)
  const visibleYear = currentDate.getFullYear();
  const { data: holidaysThisYear = [] } = useQuery<{ date: string; name: string; region: string }[]>({
    queryKey: ["/api/public-holidays", { year: visibleYear }],
    queryFn: async () => {
      const r = await fetch(`/api/public-holidays?year=${visibleYear}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const { data: holidaysNextYear = [] } = useQuery<{ date: string; name: string; region: string }[]>({
    queryKey: ["/api/public-holidays", { year: visibleYear + 1 }],
    queryFn: async () => {
      const r = await fetch(`/api/public-holidays?year=${visibleYear + 1}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const holidayByDate = new Map<string, { name: string; region: string }[]>();
  [...holidaysThisYear, ...holidaysNextYear].forEach((h) => {
    const list = holidayByDate.get(h.date) || [];
    list.push({ name: h.name, region: h.region });
    holidayByDate.set(h.date, list);
  });
  const getHolidaysForDate = (date: Date) => holidayByDate.get(format(date, "yyyy-MM-dd")) || [];

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

  const { data: clinicData } = useQuery<{ id: number; name: string; address?: string; city?: string; state?: string; zipCode?: string; phone?: string; fax?: string; email?: string; website?: string; logoUrl?: string }>({
    queryKey: ["/api/clinic"],
  });

  const { data: sonographers = [] } = useQuery<Sonographer[]>({
    queryKey: ["/api/sonographers"],
  });

  const { data: calendarReferringDoctors = [] } = useQuery<any[]>({
    queryKey: ["/api/referring-doctors"],
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

  // Conflict-handling state for create/update
  const [conflictPrompt, setConflictPrompt] = useState<{
    conflicts: { id: number; patientName: string; appointmentDate: string; duration: number; scanType: string }[];
    mode: "create" | "update";
    data: any;
    id?: number;
  } | null>(null);

  const apptFetch = async (url: string, method: "POST" | "PUT", data: any) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (res.status === 409) {
      const body = await res.json();
      const err = new Error("appointment_conflict") as any;
      err.isConflict = true;
      err.conflicts = body.conflicts || [];
      throw err;
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `Failed (${res.status})`);
    }
    return res;
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => apptFetch("/api/appointments", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Success", description: "Appointment created successfully" });
      resetForm();
      setIsBookingDialogOpen(false);
      setConflictPrompt(null);
    },
    onError: (error: any, vars) => {
      if (error?.isConflict) {
        setConflictPrompt({ conflicts: error.conflicts, mode: "create", data: vars });
        return;
      }
      toast({ title: "Error", description: error.message || "Failed to create appointment", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => apptFetch(`/api/appointments/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Success", description: "Appointment updated successfully" });
      resetForm();
      setEditingAppointment(null);
      setIsBookingDialogOpen(false);
      setConflictPrompt(null);
    },
    onError: (error: any, vars) => {
      if (error?.isConflict) {
        setConflictPrompt({ conflicts: error.conflicts, mode: "update", data: vars.data, id: vars.id });
        return;
      }
      toast({ title: "Error", description: error.message || "Failed to update appointment", variant: "destructive" });
    },
  });

  // Quick invoice-status toggle from the appointment detail popup — updates just
  // the isInvoiced flag without opening the edit form or closing the dialog.
  const invoiceMutation = useMutation({
    mutationFn: async ({ id, isInvoiced }: { id: number; isInvoiced: boolean }) =>
      apptFetch(`/api/appointments/${id}`, "PUT", { isInvoiced }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setViewingAppointment((prev: any) =>
        prev && prev.id === vars.id ? { ...prev, isInvoiced: vars.isInvoiced } : prev,
      );
      toast({ title: vars.isInvoiced ? "Marked as invoiced" : "Marked as not invoiced" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update invoice status", variant: "destructive" });
    },
  });

  const confirmOverride = () => {
    if (!conflictPrompt) return;
    const data = { ...conflictPrompt.data, force: true };
    if (conflictPrompt.mode === "create") {
      createMutation.mutate(data);
    } else if (conflictPrompt.id != null) {
      updateMutation.mutate({ id: conflictPrompt.id, data });
    }
  };

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

  const { data: reminderLogs = [] } = useQuery<ReminderLog[]>({
    queryKey: ["/api/appointments", viewingAppointment?.id, "reminder-logs"],
    enabled: !!viewingAppointment?.id,
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/appointments/${id}/send-reminder`, "POST");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", viewingAppointment?.id, "reminder-logs"] });
      toast({ title: "Reminder sent", description: `Appointment reminder emailed to ${data.sentTo}` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send reminder", description: error.message || "Could not send reminder email", variant: "destructive" });
    },
  });

  const sendRegistrationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/patients/${id}/send-registration`, "POST");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Registration form sent", description: `Email sent to ${data.sentTo}` });
      setRegistrationPromptPatient(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to send registration", description: error.message || "Could not send registration email", variant: "destructive" });
      setRegistrationPromptPatient(null);
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
      setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "", address: "", city: "", state: "", zipCode: "", medicareNumber: "", medicareIrn: "", medicareExpiry: "", emergencyContactName: "", emergencyContactPhone: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      if (patient.email) {
        setRegistrationPromptPatient(patient);
      } else {
        toast({ title: "Patient file created", description: `${patient.firstName} ${patient.lastName} has been registered.` });
      }
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
      setIsBookingDialogOpen(false);
      setBookingMode("appointment");
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
      referringDoctorName: "",
      referringDoctorEmail: "",
      referringDoctorFax: "",
      copyToName: "",
      copyToEmail: "",
      copyToFax: "",
      copyToRecipients: [],
    });
    setSelectedPatient(null);
    setPatientSearch("");
    setIsCreatingPatient(false);
    setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "", medicareNumber: "", medicareIrn: "", medicareExpiry: "", emergencyContactName: "", emergencyContactPhone: "" });
  };

  // Strip a "(Left)" / "(Right)" / "(Bilateral)" suffix that the online referral
  // form encodes into the scan name, returning the canonical name + side.
  const parseScanWithSide = (raw: string): { canonical: string; side: "unilateral" | "bilateral" | null } => {
    const m = raw.match(/^(.*?)\s*\((Left|Right|Bilateral)\)\s*$/i);
    if (!m) return { canonical: raw, side: null };
    const tag = m[2].toLowerCase();
    return { canonical: m[1].trim(), side: tag === "bilateral" ? "bilateral" : "unilateral" };
  };

  const calcDuration = (scanTypes: string[], laterality: Record<string, "unilateral" | "bilateral">): string => {
    if (scanTypes.length === 0 || scanDurations.length === 0) return "30";
    let total = 0;
    for (const st of scanTypes) {
      const { canonical, side } = parseScanWithSide(st);
      const setting =
        scanDurations.find(s => s.scanType === st && s.isEnabled) ??
        scanDurations.find(s => s.scanType === canonical && s.isEnabled);
      if (!setting) { total += 30; continue; }
      if (setting.hasLaterality) {
        // Side encoded in the name beats the form's laterality map; fall back to the map; default bilateral.
        const lat = side ?? laterality[st] ?? laterality[canonical] ?? "bilateral";
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
      referringDoctorName: (appointment as any).referringDoctorName || "",
      referringDoctorEmail: (appointment as any).referringDoctorEmail || "",
      referringDoctorFax: (appointment as any).referringDoctorFax || "",
      copyToName: (appointment as any).copyToName || "",
      copyToEmail: (appointment as any).copyToEmail || "",
      copyToFax: (appointment as any).copyToFax || "",
      copyToRecipients: (() => {
        const arr = (appointment as any).copyToRecipients;
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.map((r: any) => ({ name: r?.name || "", email: r?.email || "", fax: r?.fax || "" }));
        }
        const ln = (appointment as any).copyToName, le = (appointment as any).copyToEmail, lf = (appointment as any).copyToFax;
        return (ln || le || lf) ? [{ name: ln || "", email: le || "", fax: lf || "" }] : [];
      })(),
    });
    // Only pre-fill selectedPatient if there's a real linked patientId
    if (appointment.patientId) {
      const existingPatient = allCalendarPatients.find(p => p.id === appointment.patientId);
      if (existingPatient) {
        setSelectedPatient(existingPatient);
      } else {
        // patientId exists but not yet loaded — build a minimal placeholder
        const parts = appointment.patientName.trim().split(/\s+/);
        setSelectedPatient({
          id: appointment.patientId,
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
      }
    } else {
      // No linked patient — clear so the form requires the user to search and link one
      setSelectedPatient(null);
      setPatientSearch(appointment.patientName || "");
    }
    setEditingAppointment(appointment);
    setViewingAppointment(null);
    setIsBookingDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.patientId) {
      toast({ title: "Patient required", description: "Please search and select a patient before saving the appointment.", variant: "destructive" });
      return;
    }
    
    const appointmentDateTime = new Date(`${formData.appointmentDate}T${formData.appointmentTime}`);

    const copyToList = (formData.copyToRecipients || [])
      .map(r => ({ name: (r.name || "").trim(), email: (r.email || "").trim(), fax: (r.fax || "").trim() }))
      .filter(r => r.name || r.email || r.fax);

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
      referringDoctorName: formData.referringDoctorName || null,
      referringDoctorEmail: formData.referringDoctorEmail || null,
      referringDoctorFax: formData.referringDoctorFax || null,
      copyToName: copyToList[0]?.name || null,
      copyToEmail: copyToList[0]?.email || null,
      copyToFax: copyToList[0]?.fax || null,
      copyToRecipients: copyToList,
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

      if (event.recurrence === "none" || !event.recurrence) {
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
          if (event.recurrence === "daily") current = addDays(current, 1);
          else if (event.recurrence === "weekly") current = addWeeks(current, 1);
          else if (event.recurrence === "fortnightly") current = addWeeks(current, 2);
          else if (event.recurrence === "monthly") current = addWeeks(current, 4);
          else if (event.recurrence === "calendar_monthly") current = addMonths(current, 1);
          else if (event.recurrence === "yearly") current = addYears(current, 1);
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

  const getEventPosition = (startTime: Date, endTime: Date, isAllDay?: boolean) => {
    if (isAllDay) return { top: 0, height: SLOT_COUNT * SLOT_HEIGHT };
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
      isAllDay: false,
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
      isAllDay: event.isAllDay ?? false,
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
    const startTime = eventForm.isAllDay
      ? new Date(`${eventForm.date}T00:00:00`)
      : new Date(`${eventForm.date}T${eventForm.startTime}:00`);
    const endTime = eventForm.isAllDay
      ? new Date(`${eventForm.date}T23:59:59`)
      : new Date(`${eventForm.date}T${eventForm.endTime}:00`);
    const payload = {
      title: eventForm.title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      isAllDay: eventForm.isAllDay,
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
          {getHolidaysForDate(currentDay).map((h, i) => (
            <div
              key={`hol-${i}`}
              className="text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded px-1 py-0.5 truncate mb-0.5"
              title={`${h.name} — public holiday (${h.region})`}
            >
              {h.name}
            </div>
          ))}
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
            {dayAppointments.slice(0, 3).map((apt) => {
              const { referrerName } = parseReferralNotes(apt.notes);
              return (
                <div
                  key={apt.id}
                  className={`text-xs p-1 rounded truncate cursor-pointer border ${STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingAppointment(apt);
                  }}
                >
                  {referrerName && <span className="inline-block bg-orange-100 text-orange-700 rounded px-0.5 mr-0.5 font-semibold" title={`Referred by ${referrerName}`}>R</span>}
                  {apt.status === "confirmed" && <CheckCircle className="w-3 h-3 text-emerald-600 inline mr-0.5 flex-shrink-0" />}
                  {format(new Date(apt.appointmentDate), "HH:mm")} - {apt.patientName}
                </div>
              );
            })}
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
        {/* Desktop header */}
        <div className="hidden md:flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appointment Calendar</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage patient bookings and appointments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setApptSearchOpen(true)} data-testid="button-open-appt-search">
              <Search className="w-4 h-4 mr-2" />
              Find Appointments
            </Button>
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

        {/* Mobile header */}
        <div className="flex md:hidden justify-between items-center mb-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Calendar</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setApptSearchOpen(true)} data-testid="button-open-appt-search-mobile">
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => openNewEventDialog()}>
              <CalendarX2 className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setEditingAppointment(null); setIsBookingDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" />
              Book
            </Button>
          </div>
        </div>

        <div className="flex gap-4 items-stretch">
          {/* Mini-calendar + Tasks sidebar — desktop only */}
          <div className="hidden md:flex flex-col gap-3 flex-shrink-0 w-[260px] self-stretch">
            <div className="bg-white dark:bg-gray-800 border rounded-xl shadow-sm p-2">
              <CalendarPicker
                mode="single"
                selected={currentDate}
                onSelect={(date) => { if (date) setCurrentDate(date); }}
                className="rounded-md p-2"
                classNames={{
                  head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.75rem]",
                  cell: "h-8 w-8 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-8 w-8 p-0 font-normal text-sm aria-selected:opacity-100 hover:bg-accent rounded-md",
                }}
              />
              <div className="px-2 pb-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setCurrentDate(new Date())}
                >
                  Today
                </Button>
              </div>
            </div>
            <TasksPanel />
          </div>

          {/* Main calendar card */}
          <div className="flex-1 min-w-0">
        <Card>
          <CardHeader className="pb-2">
            {/* Desktop card header */}
            <div className="hidden md:flex justify-between items-center">
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
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 shrink-0 text-muted-foreground" />
                {getHeaderTitle()}
              </h2>
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

            {/* Mobile card header */}
            <div className="flex md:hidden items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={navigatePrevious}>
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1 justify-center gap-2 font-semibold">
                    <CalendarDays className="w-4 h-4 shrink-0" />
                    {format(currentDate, "EEE, MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <CalendarPicker
                    mode="single"
                    selected={currentDate}
                    onSelect={(date) => {
                      if (date) { setCurrentDate(date); setDatePickerOpen(false); }
                    }}
                    initialFocus
                  />
                  <div className="p-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => { setCurrentDate(new Date()); setDatePickerOpen(false); }}
                    >
                      Today
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" onClick={navigateNext}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === "day" && (
              <div className="min-h-[700px]">
                <div className="text-center font-semibold text-gray-600 bg-gray-100 p-2 border border-gray-200 mb-2">
                  {format(currentDate, "EEEE, MMMM d")}
                </div>
                {getHolidaysForDate(currentDate).length > 0 && (
                  <div className="mb-2 space-y-1">
                    {getHolidaysForDate(currentDate).map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-1.5 text-sm"
                        title={`Public holiday — ${h.region}`}
                      >
                        <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                        <span className="font-semibold">{h.name}</span>
                        <span className="text-xs text-amber-600">Public holiday</span>
                      </div>
                    ))}
                  </div>
                )}
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
                      const { top, height } = getEventPosition(ev.instanceStart, ev.instanceEnd, ev.isAllDay);
                      const colors = EVENT_COLORS[ev.color] || EVENT_COLORS.purple;
                      return (
                        <div
                          key={`ev-${ev.id}-${ev.instanceStart.toISOString()}`}
                          className={`absolute left-1 right-1 rounded border z-0 pointer-events-none ${colors.bg} ${colors.border} ${ev.isAllDay ? "opacity-30" : "opacity-80"}`}
                          style={{ top: `${Math.max(top, 0)}px`, height: `${height}px` }}
                        >
                          <div
                            className={`p-2 text-xs font-medium ${colors.text} flex items-center gap-1 cursor-pointer pointer-events-auto`}
                            onClick={(e) => { e.stopPropagation(); setViewingEvent(ev); }}
                          >
                            {ev.recurrence !== "none" && <Repeat className="w-3 h-3 flex-shrink-0" />}
                            <span className="truncate">{ev.title}</span>
                          </div>
                        </div>
                      );
                    })}
                    {getAppointmentsForDate(currentDate).map((apt) => {
                      const { top, height } = getAppointmentPosition(apt);
                      const { referrerName: aptReferrerName } = parseReferralNotes(apt.notes);
                      return (
                        <div
                          key={apt.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, apt)}
                          onDragEnd={handleDragEnd}
                          className={`absolute rounded cursor-grab active:cursor-grabbing border overflow-hidden z-10 ${
                            apt.status === "cancelled"
                              ? "bg-gray-50 text-gray-400 border-gray-200 border-l-4 border-l-red-500 opacity-75"
                              : `left-1 right-1 ${STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled}`
                          } ${draggingAppointment?.id === apt.id ? "opacity-50" : ""}`}
                          style={{
                            top: `${top}px`,
                            height: `${Math.max(height, 30)}px`,
                            ...(apt.status === "cancelled" ? { right: "4px", width: "42%" } : {}),
                          }}
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
                          <div className="p-1 pr-6">
                            {aptReferrerName && (
                              <div className="text-xs bg-orange-100 text-orange-700 rounded px-1 py-0.5 mb-0.5 truncate font-medium">
                                ↗ {aptReferrerName}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-1">
                              <div className={`text-sm font-medium truncate flex items-center gap-1 min-w-0 ${apt.status === "cancelled" ? "line-through" : ""}`}>
                                {apt.status === "confirmed" && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                                {apt.patientName}
                              </div>
                              {apt.patientDob && (
                                <div className="text-xs text-gray-500 flex-shrink-0 font-mono">
                                  {(() => { try { const [y,m,d] = apt.patientDob.split("-"); return d && m && y ? `${d}/${m}/${y}` : apt.patientDob; } catch { return apt.patientDob; } })()}
                                </div>
                              )}
                            </div>
                            <div className="text-xs truncate">{format(new Date(apt.appointmentDate), "h:mm a")} - {apt.scanType}</div>
                          </div>
                          {apt.isInvoiced && (
                            <div className="absolute top-1 right-1 z-10">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                            </div>
                          )}
                          {apt.status === "checked_in" && (apt as any).checkedInAt && (
                            <div className="absolute bottom-1.5 right-1 z-10 flex items-center gap-0.5 bg-amber-100 text-amber-700 rounded px-1 py-0.5 text-[10px] font-mono leading-none">
                              <Hourglass className="w-2.5 h-2.5 flex-shrink-0" />
                              {Math.max(0, Math.floor((nowTick - new Date((apt as any).checkedInAt).getTime()) / 60000))}m
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
                      const dayHolidays = getHolidaysForDate(weekDay);
                      return (
                        <div key={day} className="p-2 text-center font-semibold text-gray-600 bg-gray-100 border border-gray-200">
                          <div>{day}</div>
                          <div className={`text-lg ${isSameDay(weekDay, new Date()) ? "text-blue-600 font-bold" : ""}`}>
                            {format(weekDay, "d")}
                          </div>
                          {dayHolidays.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {dayHolidays.map((h, i) => (
                                <div
                                  key={i}
                                  className="text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded px-1 py-0.5 truncate"
                                  title={`${h.name} — public holiday (${h.region})`}
                                >
                                  {h.name}
                                </div>
                              ))}
                            </div>
                          )}
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
                            const { top, height } = getEventPosition(ev.instanceStart, ev.instanceEnd, ev.isAllDay);
                            const colors = EVENT_COLORS[ev.color] || EVENT_COLORS.purple;
                            return (
                              <div
                                key={`ev-${ev.id}-${ev.instanceStart.toISOString()}`}
                                className={`absolute left-0 right-0 mx-0.5 rounded border z-0 pointer-events-none ${colors.bg} ${colors.border} ${ev.isAllDay ? "opacity-30" : "opacity-80"}`}
                                style={{ top: `${Math.max(top, 0)}px`, height: `${height}px` }}
                              >
                                <div
                                  className={`p-1 text-[10px] font-medium ${colors.text} flex items-center gap-0.5 cursor-pointer pointer-events-auto`}
                                  onClick={(e) => { e.stopPropagation(); setViewingEvent(ev); }}
                                >
                                  {ev.recurrence !== "none" && <Repeat className="w-2.5 h-2.5 flex-shrink-0" />}
                                  <span className="truncate">{ev.title}</span>
                                </div>
                              </div>
                            );
                          })}
                          {dayAppointments.map((apt) => {
                            const { top, height } = getAppointmentPosition(apt);
                            if (top < 0 || top > SLOT_COUNT * SLOT_HEIGHT) return null;
                            const { referrerName: weekReferrerName } = parseReferralNotes(apt.notes);
                            return (
                              <div
                                key={apt.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, apt)}
                                onDragEnd={handleDragEnd}
                                className={`absolute rounded text-xs cursor-grab active:cursor-grabbing border overflow-hidden z-10 ${
                                  apt.status === "cancelled"
                                    ? "bg-gray-50 text-gray-400 border-gray-200 border-l-4 border-l-red-500 opacity-75"
                                    : `left-0 right-0 mx-0.5 ${STATUS_COLORS[apt.status] || STATUS_COLORS.scheduled}`
                                } ${draggingAppointment?.id === apt.id ? "opacity-50" : ""}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${Math.max(height, 20)}px`,
                                  ...(apt.status === "cancelled" ? { right: "2px", width: "45%" } : {}),
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
                                  {weekReferrerName && (
                                    <div className="text-[10px] bg-orange-100 text-orange-700 rounded px-0.5 mb-0.5 truncate font-semibold">↗ {weekReferrerName}</div>
                                  )}
                                  <div className={`font-medium truncate flex items-center gap-0.5 ${apt.status === "cancelled" ? "line-through" : ""}`}>
                                    {apt.status === "confirmed" && <CheckCircle className="w-3 h-3 text-emerald-600 flex-shrink-0" />}
                                    {apt.patientName}
                                  </div>
                                  <div className="text-[10px] truncate">{format(new Date(apt.appointmentDate), "h:mm a")}</div>
                                </div>
                                {apt.isInvoiced && (
                                  <div className="absolute top-0.5 right-0.5 z-10">
                                    <DollarSign className="w-3 h-3 text-emerald-700" />
                                  </div>
                                )}
                                {apt.status === "checked_in" && (apt as any).checkedInAt && (
                                  <div className="absolute bottom-1 right-0.5 z-10 flex items-center gap-0.5 bg-amber-100 text-amber-700 rounded px-0.5 py-px text-[9px] font-mono leading-none">
                                    <Hourglass className="w-2 h-2 flex-shrink-0" />
                                    {Math.max(0, Math.floor((nowTick - new Date((apt as any).checkedInAt).getTime()) / 60000))}m
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
          </div> {/* end flex-1 main calendar card */}
        </div> {/* end flex sidebar+card container */}

        <PatientApptSearchDialog
          open={apptSearchOpen}
          onOpenChange={setApptSearchOpen}
          onJumpTo={(date) => {
            setCurrentDate(date);
            setSelectedDate(date);
            if (viewMode === "month") setViewMode("week");
          }}
        />

        <Dialog open={isBookingDialogOpen} onOpenChange={(open) => { setIsBookingDialogOpen(open); if (!open) { resetForm(); setEditingAppointment(null); setBookingMode("appointment"); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingAppointment ? "Edit Appointment" : bookingMode === "event" ? "New Event" : "New Appointment"}
              </DialogTitle>
            </DialogHeader>

            {/* Mode toggle — only shown when creating, not editing */}
            {!editingAppointment && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setBookingMode("appointment")}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    bookingMode === "appointment"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Patient Appointment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBookingMode("event");
                    setEventForm(prev => ({
                      ...prev,
                      date: formData.appointmentDate || format(currentDate, "yyyy-MM-dd"),
                      title: "",
                      startTime: formData.appointmentTime || "09:00",
                      endTime: "17:00",
                      color: "purple",
                      recurrence: "none",
                      recurrenceEndDate: "",
                      notes: "",
                    }));
                  }}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    bookingMode === "event"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Block / Event
                </button>
              </div>
            )}

            {/* ── Event form (inline, when in event mode) ── */}
            {bookingMode === "event" && (
              <form onSubmit={handleEventSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="inlineEventTitle">Title <span className="text-red-500">*</span></Label>
                  <Input
                    id="inlineEventTitle"
                    placeholder="e.g. Sam in Theatre, Amy Unavailable"
                    value={eventForm.title}
                    onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="inlineEventDate">Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="inlineEventDate"
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="inlineEventAllDay"
                    type="checkbox"
                    checked={eventForm.isAllDay}
                    onChange={(e) => setEventForm(prev => ({ ...prev, isAllDay: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                  />
                  <Label htmlFor="inlineEventAllDay" className="cursor-pointer select-none">All Day</Label>
                </div>
                {!eventForm.isAllDay && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="inlineEventStart">Start Time <span className="text-red-500">*</span></Label>
                      <Input
                        id="inlineEventStart"
                        type="time"
                        value={eventForm.startTime}
                        onChange={(e) => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="inlineEventEnd">End Time <span className="text-red-500">*</span></Label>
                      <Input
                        id="inlineEventEnd"
                        type="time"
                        value={eventForm.endTime}
                        onChange={(e) => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                )}
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
                  <Label htmlFor="inlineEventRecurrence">Repeat</Label>
                  <Select value={eventForm.recurrence} onValueChange={(v) => setEventForm(prev => ({ ...prev, recurrence: v }))}>
                    <SelectTrigger id="inlineEventRecurrence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Does not repeat</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="fortnightly">Every 2 weeks (fortnightly)</SelectItem>
                      <SelectItem value="monthly">Every 4 weeks</SelectItem>
                      <SelectItem value="calendar_monthly">Monthly (same date each month)</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {eventForm.recurrence !== "none" && (
                  <div>
                    <Label htmlFor="inlineEventRecurrenceEnd">Repeat Until (optional)</Label>
                    <Input
                      id="inlineEventRecurrenceEnd"
                      type="date"
                      value={eventForm.recurrenceEndDate}
                      onChange={(e) => setEventForm(prev => ({ ...prev, recurrenceEndDate: e.target.value }))}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="inlineEventNotes">Notes</Label>
                  <Textarea
                    id="inlineEventNotes"
                    value={eventForm.notes}
                    onChange={(e) => setEventForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsBookingDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createEventMutation.isPending}>
                    {createEventMutation.isPending ? "Creating..." : "Create Event"}
                  </Button>
                </div>
              </form>
            )}

            {/* ── Appointment form ── */}
            {bookingMode === "appointment" && <form onSubmit={handleSubmit} className="space-y-4">
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
                          {selectedPatient.dateOfBirth && `DOB: ${(() => { const m = selectedPatient.dateOfBirth.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : selectedPatient.dateOfBirth; })()}`}
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
                                      {patient.dateOfBirth && `DOB: ${(() => { const m = patient.dateOfBirth.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : patient.dateOfBirth; })()}`}
                                      {patient.phone && ` | ${patient.phone}`}
                                    </div>
                                  </div>
                                ))}
                                <div
                                  className="p-3 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer border-t"
                                  onClick={() => { setNewPatientForm({ firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "", medicareNumber: "", medicareIrn: "", medicareExpiry: "", emergencyContactName: "", emergencyContactPhone: "" }); setIsCreatingPatient(true); setShowPatientResults(false); }}
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
                            <div className="col-span-2">
                              <Label htmlFor="npEmail" className="text-xs">Email <span className="text-blue-400 font-normal">(needed to send registration form)</span></Label>
                              <Input
                                id="npEmail"
                                type="email"
                                value={newPatientForm.email}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, email: e.target.value }))}
                                placeholder="patient@example.com"
                                className="mt-1"
                              />
                            </div>
                            <div className="col-span-2">
                              <Label htmlFor="npAddress" className="text-xs">Street Address <span className="text-blue-400 font-normal">(optional)</span></Label>
                              <Input
                                id="npAddress"
                                value={newPatientForm.address}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="e.g. 123 Smith Street"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="npCity" className="text-xs">Suburb</Label>
                              <Input
                                id="npCity"
                                value={newPatientForm.city}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, city: capitalizeWords(e.target.value) }))}
                                autoCapitalize="words"
                                className="mt-1"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label htmlFor="npState" className="text-xs">State</Label>
                                <Input
                                  id="npState"
                                  value={newPatientForm.state}
                                  onChange={(e) => setNewPatientForm(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                                  placeholder="VIC"
                                  maxLength={3}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="npZip" className="text-xs">Postcode</Label>
                                <Input
                                  id="npZip"
                                  value={newPatientForm.zipCode}
                                  onChange={(e) => setNewPatientForm(prev => ({ ...prev, zipCode: e.target.value.replace(/\D/g, "") }))}
                                  placeholder="3000"
                                  maxLength={4}
                                  className="mt-1"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="npEcName" className="text-xs">Emergency Contact Name</Label>
                              <Input
                                id="npEcName"
                                value={newPatientForm.emergencyContactName}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, emergencyContactName: capitalizeWords(e.target.value) }))}
                                placeholder="e.g. Jane Smith"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="npEcPhone" className="text-xs">Emergency Contact Phone</Label>
                              <Input
                                id="npEcPhone"
                                value={newPatientForm.emergencyContactPhone}
                                onChange={(e) => setNewPatientForm(prev => ({ ...prev, emergencyContactPhone: e.target.value }))}
                                placeholder="e.g. 0412 345 678"
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div className="border-t border-blue-200 pt-3">
                            <p className="text-xs font-medium text-blue-700 mb-2">Medicare Details <span className="text-blue-400 font-normal">(optional)</span></p>
                            <div className="grid grid-cols-5 gap-2">
                              <div className="col-span-3">
                                <Label htmlFor="npMedicare" className="text-xs">Medicare Number</Label>
                                <Input
                                  id="npMedicare"
                                  placeholder="e.g. 2123456701"
                                  maxLength={15}
                                  value={newPatientForm.medicareNumber}
                                  onChange={(e) => setNewPatientForm(prev => ({ ...prev, medicareNumber: e.target.value.replace(/\D/g, "") }))}
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-1">
                                <Label htmlFor="npIrn" className="text-xs">IRN</Label>
                                <Input
                                  id="npIrn"
                                  placeholder="1"
                                  maxLength={2}
                                  value={newPatientForm.medicareIrn}
                                  onChange={(e) => setNewPatientForm(prev => ({ ...prev, medicareIrn: e.target.value.replace(/\D/g, "") }))}
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-1">
                                <Label htmlFor="npMedicareExpiry" className="text-xs">Expiry</Label>
                                <Input
                                  id="npMedicareExpiry"
                                  placeholder="MM/YYYY"
                                  maxLength={7}
                                  value={newPatientForm.medicareExpiry}
                                  onChange={(e) => {
                                    let val = e.target.value.replace(/[^0-9/]/g, "");
                                    if (val.length === 2 && !val.includes("/") && newPatientForm.medicareExpiry.length === 1) val += "/";
                                    setNewPatientForm(prev => ({ ...prev, medicareExpiry: val }));
                                  }}
                                  className="mt-1"
                                />
                              </div>
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
                                email: newPatientForm.email || null,
                                address: newPatientForm.address || null,
                                city: newPatientForm.city || null,
                                state: newPatientForm.state || null,
                                zipCode: newPatientForm.zipCode || null,
                                medicareNumber: newPatientForm.medicareNumber || null,
                                medicareIrn: newPatientForm.medicareIrn || null,
                                medicareExpiry: newPatientForm.medicareExpiry || null,
                                emergencyContactName: newPatientForm.emergencyContactName || null,
                                emergencyContactPhone: newPatientForm.emergencyContactPhone || null,
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
                {/* Referring Doctor */}
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold text-gray-700">Referring Doctor</Label>
                    <span className="text-xs text-gray-400">(pre-fills distribution email/fax)</span>
                  </div>
                  {calendarReferringDoctors.filter((d: any) => d.email || d.fax).length > 0 && (
                    <Select onValueChange={(value) => {
                      const doc = calendarReferringDoctors.find((d: any) => String(d.id) === value);
                      if (doc) {
                        setFormData(prev => ({
                          ...prev,
                          referringDoctorName: doc.name || "",
                          referringDoctorEmail: doc.email || "",
                          referringDoctorFax: doc.fax || "",
                        }));
                      }
                    }}>
                      <SelectTrigger className="bg-white text-sm h-9">
                        <SelectValue placeholder="Autofill from saved referring doctors…" />
                      </SelectTrigger>
                      <SelectContent>
                        {calendarReferringDoctors.filter((d: any) => d.email || d.fax).map((doc: any) => (
                          <SelectItem key={doc.id} value={String(doc.id)}>
                            {doc.name}{doc.practiceName ? ` — ${doc.practiceName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Name</Label>
                      <Input placeholder="Dr. Smith" value={formData.referringDoctorName} onChange={(e) => setFormData(prev => ({ ...prev, referringDoctorName: e.target.value }))} className="text-sm h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Email</Label>
                      <Input type="email" placeholder="dr@clinic.com" value={formData.referringDoctorEmail} onChange={(e) => setFormData(prev => ({ ...prev, referringDoctorEmail: e.target.value }))} className="text-sm h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Fax</Label>
                      <Input placeholder="03XXXXXXXX" value={formData.referringDoctorFax} onChange={(e) => setFormData(prev => ({ ...prev, referringDoctorFax: e.target.value }))} className="text-sm h-8" />
                    </div>
                  </div>
                </div>

                {/* Copy To (additional CC recipients) */}
                <div className="col-span-2 space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Copy To <span className="text-xs text-gray-400 font-normal">(optional CC recipients)</span></Label>
                  {formData.copyToRecipients.length === 0 && (
                    <p className="text-xs text-gray-400">No CC recipients added yet.</p>
                  )}
                  <div className="space-y-2">
                    {formData.copyToRecipients.map((recipient, idx) => (
                      <div key={idx} className="flex items-end gap-2">
                        <div className="grid grid-cols-3 gap-2 flex-1">
                          <div className="space-y-1">
                            {idx === 0 && <Label className="text-xs text-gray-500">Name</Label>}
                            <Input placeholder="GP / Specialist" value={recipient.name} onChange={(e) => setFormData(prev => ({ ...prev, copyToRecipients: prev.copyToRecipients.map((r, i) => i === idx ? { ...r, name: e.target.value } : r) }))} className="text-sm h-8" />
                          </div>
                          <div className="space-y-1">
                            {idx === 0 && <Label className="text-xs text-gray-500">Email</Label>}
                            <Input type="email" placeholder="cc@clinic.com" value={recipient.email} onChange={(e) => setFormData(prev => ({ ...prev, copyToRecipients: prev.copyToRecipients.map((r, i) => i === idx ? { ...r, email: e.target.value } : r) }))} className="text-sm h-8" />
                          </div>
                          <div className="space-y-1">
                            {idx === 0 && <Label className="text-xs text-gray-500">Fax</Label>}
                            <Input placeholder="03XXXXXXXX" value={recipient.fax} onChange={(e) => setFormData(prev => ({ ...prev, copyToRecipients: prev.copyToRecipients.map((r, i) => i === idx ? { ...r, fax: e.target.value } : r) }))} className="text-sm h-8" />
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500 shrink-0" onClick={() => setFormData(prev => ({ ...prev, copyToRecipients: prev.copyToRecipients.filter((_, i) => i !== idx) }))} aria-label="Remove recipient">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setFormData(prev => ({ ...prev, copyToRecipients: [...prev.copyToRecipients, { name: "", email: "", fax: "" }] }))}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add CC recipient
                  </Button>
                </div>

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
                <Button type="button" variant="outline" onClick={() => { setIsBookingDialogOpen(false); resetForm(); setEditingAppointment(null); setBookingMode("appointment"); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !formData.patientId}>
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingAppointment ? "Update" : "Create Booking"}
                </Button>
              </div>
            </form>}
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewingAppointment} onOpenChange={(open) => { if (!open) { setViewingAppointment(null); setShowBeginStudy(false); setShowIdCheck(false); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {showIdCheck ? (
                  <button
                    className="flex items-center gap-1.5 text-base font-semibold text-gray-700 hover:text-gray-900"
                    onClick={() => setShowIdCheck(false)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Patient ID Check
                  </button>
                ) : showBeginStudy ? (
                  <button
                    className="flex items-center gap-1.5 text-base font-semibold text-gray-700 hover:text-gray-900"
                    onClick={() => setShowBeginStudy(false)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Begin Study / Report
                  </button>
                ) : "Appointment Details"}
              </DialogTitle>
            </DialogHeader>
            {viewingAppointment && (
              <div className="space-y-4">

                {/* Patient ID Check panel */}
                {showIdCheck && (() => {
                  // Resolve patient record: prefer by ID, fall back to name match
                  const idCheckPatient = viewingAppointment.patientId
                    ? allCalendarPatients.find(pt => pt.id === viewingAppointment.patientId)
                    : allCalendarPatients.find(pt =>
                        `${pt.firstName} ${pt.lastName}`.toLowerCase() === (viewingAppointment.patientName || "").toLowerCase()
                      );
                  const dobRaw = idCheckPatient?.dateOfBirth || viewingAppointment.patientDob;
                  const dobDisplay = dobRaw
                    ? (() => {
                        try {
                          const [y, m, d] = dobRaw.split("-");
                          if (y && m && d) return `${d}/${m}/${y}`;
                          return dobRaw;
                        } catch { return dobRaw; }
                      })()
                    : null;
                  return (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Confirm the patient's identity before proceeding. Verify all three points match the patient in front of you.
                    </p>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">3-Point Patient ID Check</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        <div className="flex items-center gap-4 px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-blue-700">1</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Full Name</div>
                            <div className="font-semibold text-gray-900 text-base">
                              {idCheckPatient
                                ? `${idCheckPatient.firstName} ${idCheckPatient.lastName}`
                                : viewingAppointment.patientName || <span className="text-gray-400 italic">Not recorded</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-blue-700">2</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Date of Birth</div>
                            <div className="font-semibold text-gray-900 text-base">
                              {dobDisplay || <span className="text-gray-400 italic">Not recorded</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-blue-700">3</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Phone Number</div>
                            <div className="font-semibold text-gray-900 text-base">
                              {idCheckPatient?.phone || viewingAppointment.patientPhone
                                ? <span>{idCheckPatient?.phone || viewingAppointment.patientPhone}</span>
                                : <span className="text-gray-400 italic">Not recorded</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => setShowIdCheck(false)}
                      >
                        ID Doesn't Match
                      </button>
                      <button
                        className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                        onClick={() => {
                          setShowIdCheck(false);
                          setShowBeginStudy(true);
                        }}
                      >
                        Confirmed — Continue
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {/* Begin Study sub-panel */}
                {showBeginStudy && !showIdCheck && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      Choose how you'd like to start the study for <span className="font-medium text-gray-800">{viewingAppointment.patientName}</span>:
                    </p>
                    <button
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left group"
                      onClick={() => {
                        if (onBeginStudy) {
                          setViewingAppointment(null);
                          setShowBeginStudy(false);
                          setShowIdCheck(false);
                          onBeginStudy(viewingAppointment.patientId ?? null, viewingAppointment.patientName || "", "upload");
                        }
                      }}
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-700 transition-colors">
                        <FileUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-blue-900">Upload Worksheet</div>
                        <div className="text-sm text-blue-600">Upload a scanned or digital worksheet to generate a report</div>
                      </div>
                    </button>
                    <button
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-purple-300 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-colors text-left group"
                      onClick={() => {
                        if (onBeginStudy) {
                          setViewingAppointment(null);
                          setShowBeginStudy(false);
                          setShowIdCheck(false);
                          onBeginStudy(viewingAppointment.patientId ?? null, viewingAppointment.patientName || "", "draw");
                        }
                      }}
                    >
                      <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-700 transition-colors">
                        <PenLine className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-purple-900">Draw Worksheet</div>
                        <div className="text-sm text-purple-600">Draw directly in Reporting Room using templates</div>
                      </div>
                    </button>
                    <button
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition-colors text-left group"
                      onClick={() => {
                        updateMutation.mutate(
                          { id: viewingAppointment.id, data: { status: "in_progress" } },
                          {
                            onSuccess: () => {
                              toast({ title: "Scan marked as in progress", description: "Complete the report from any device when ready." });
                            },
                          }
                        );
                        setViewingAppointment(null);
                        setShowBeginStudy(false);
                        setShowIdCheck(false);
                      }}
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-700 transition-colors">
                        <Laptop className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-emerald-900">Scan in Progress — Report Later</div>
                        <div className="text-sm text-emerald-600">Mark scan as started; complete the report from another device</div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Normal appointment detail view */}
                {!showBeginStudy && (<>
                {(() => {
                  const linkedPatient = viewingAppointment.patientId
                    ? allCalendarPatients.find(pt => pt.id === viewingAppointment.patientId)
                    : allCalendarPatients.find(pt =>
                        `${pt.firstName} ${pt.lastName}`.toLowerCase() === (viewingAppointment.patientName || "").toLowerCase()
                      );
                  return (
                <div className="flex items-center gap-2 flex-wrap">
                  <User className="w-5 h-5 text-gray-500" />
                  <span className="font-semibold">{viewingAppointment.patientName}</span>
                  {linkedPatient?.urNumber && (
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-xs" data-testid="badge-ur-number">
                      UR {linkedPatient.urNumber}
                    </span>
                  )}
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
                  );
                })()}
                
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

                {(() => {
                  const { referrerName: dialogReferrerName, cleanNotes: dialogCleanNotes } = parseReferralNotes(viewingAppointment.notes);
                  return (
                    <>
                      {dialogReferrerName && (
                        <div className="text-sm bg-orange-50 border border-orange-200 rounded-md px-3 py-2 flex items-start gap-2">
                          <span className="text-orange-500 font-bold text-base leading-tight">↗</span>
                          <div>
                            <span className="font-medium text-orange-800">External Referral</span>
                            <p className="text-orange-700 text-xs mt-0.5">Referred by {dialogReferrerName}</p>
                          </div>
                        </div>
                      )}
                      {dialogCleanNotes && (
                        <div className="text-sm">
                          <span className="font-medium">Notes:</span>
                          <p className="text-gray-600 mt-1">{dialogCleanNotes}</p>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Action buttons */}
                {(() => {
                  const resolvedPatientId = viewingAppointment.patientId
                    ?? allCalendarPatients.find(pt =>
                        `${pt.firstName} ${pt.lastName}`.toLowerCase() === (viewingAppointment.patientName || "").toLowerCase()
                      )?.id ?? null;
                  return (
                    <div className="pt-4 border-t">
                      <div className="flex gap-2 flex-wrap items-center">
                        {viewingAppointment.status === "scheduled" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300"
                            onClick={() => {
                              updateMutation.mutate({ id: viewingAppointment.id, data: { status: "confirmed" } });
                              setViewingAppointment({ ...viewingAppointment, status: "confirmed" });
                            }}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Confirm
                          </Button>
                        )}
                        {viewingAppointment.status !== "checked_in" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                            onClick={() => {
                              updateMutation.mutate({ id: viewingAppointment.id, data: { status: "checked_in" } });
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
                          <Edit className="w-4 h-4 mr-1" />
                          Edit / Reschedule
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-auto" data-testid="button-more-actions">
                              <MoreHorizontal className="w-4 h-4 mr-1" />
                              More
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              disabled={!viewingAppointment.patientEmail || sendReminderMutation.isPending}
                              title={!viewingAppointment.patientEmail ? "No email address on file for this patient" : "Send appointment reminder email"}
                              onSelect={(e) => { e.preventDefault(); sendReminderMutation.mutate(viewingAppointment.id); }}
                              className="text-emerald-700 focus:text-emerald-700"
                              data-testid="menu-send-reminder"
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              {sendReminderMutation.isPending ? "Sending…" : "Send Reminder"}
                            </DropdownMenuItem>
                            {(() => {
                              const aptDate = new Date(viewingAppointment.appointmentDate);
                              const today = new Date();
                              today.setHours(23, 59, 59, 999);
                              return aptDate.getTime() <= today.getTime();
                            })() && (
                              <DropdownMenuItem
                                disabled={generatingCertificate}
                                onSelect={async (e) => {
                                  e.preventDefault();
                                  if (generatingCertificate) return;
                                  setGeneratingCertificate(true);
                                  const apt = viewingAppointment;
                                  // Patient resolution for in-memory display only (e.g. address on cert).
                                  // The actual save-to-file lookup is done server-side using apt.patientId.
                                  const resolvedPatient = apt.patientId
                                    ? allCalendarPatients.find(pt => pt.id === apt.patientId)
                                    : undefined;
                                  const physician = apt.physicianId
                                    ? physicians.find(p => p.id === apt.physicianId)
                                    : physicians[0];
                                  try {
                                    const cert = await generateAttendanceCertificate({
                                      appointment: apt,
                                      patient: resolvedPatient || null,
                                      clinic: clinicData || null,
                                      physician: physician || null,
                                    });

                                    // Save to patient file — server resolves the patient by appointment ID.
                                    let saved = false;
                                    try {
                                      const r = await fetch(`/api/appointments/${apt.id}/save-attendance-certificate`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "include",
                                        body: JSON.stringify({
                                          pdfBase64: cert.base64,
                                          filename: cert.filename,
                                          appointmentDate: format(new Date(apt.appointmentDate), "yyyy-MM-dd"),
                                        }),
                                      });
                                      if (r.ok) {
                                        saved = true;
                                      } else {
                                        const err = await r.json().catch(() => ({}));
                                        toast({
                                          title: "Could not save to patient file",
                                          description: err?.error || "Patient could not be linked to this appointment",
                                          variant: "destructive",
                                        });
                                      }
                                    } catch (saveErr: any) {
                                      toast({
                                        title: "Could not save to patient file",
                                        description: saveErr?.message || "Network error",
                                        variant: "destructive",
                                      });
                                    }

                                    setCertificateDialog({
                                      appointment: apt,
                                      blob: cert.blob,
                                      base64: cert.base64,
                                      filename: cert.filename,
                                      saved,
                                    });
                                  } catch (err: any) {
                                    toast({ title: "Error", description: err?.message || "Failed to generate certificate", variant: "destructive" });
                                  } finally {
                                    setGeneratingCertificate(false);
                                  }
                                }}
                                className="text-amber-700 focus:text-amber-700"
                                data-testid="menu-attendance-certificate"
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                {generatingCertificate ? "Generating…" : "Attendance Certificate"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                if (confirm("Are you sure you want to delete this appointment?")) {
                                  deleteMutation.mutate(viewingAppointment.id);
                                }
                              }}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              data-testid="menu-delete-appointment"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Appointment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })()}

                {/* Reminder log */}
                {(reminderLogs.length > 0 || viewingAppointment.createdAt) && (
                  <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reminder History</p>
                    {viewingAppointment.createdAt && (
                      <div className="flex items-center gap-2 text-xs pb-2 mb-1 border-b border-gray-200">
                        <CalendarClock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        <span className="text-gray-700">
                          Appointment booked {format(new Date(viewingAppointment.createdAt), "d MMM yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    )}
                    {reminderLogs.length === 0 && (
                      <p className="text-xs text-gray-400">No reminders sent yet.</p>
                    )}
                    {reminderLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span className="text-gray-700">
                            Sent {format(new Date(log.sentAt), "d MMM yyyy 'at' h:mm a")}
                          </span>
                        </div>
                        {log.openedAt ? (
                          <span className="text-emerald-600 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            Opened {format(new Date(log.openedAt), "d MMM 'at' h:mm a")}
                          </span>
                        ) : (
                          <span className="text-gray-400">Not opened yet</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Begin Study primary CTA */}
                {viewingAppointment.status !== "cancelled" && (
                  <Button
                    className="w-full medical-btn-primary gap-2 mt-2"
                    onClick={() => setShowIdCheck(true)}
                  >
                    <PlayCircle className="w-4 h-4" />
                    Begin Study / Report
                  </Button>
                )}

                {/* Open Patient File CTA — same size, below Begin Study */}
                {(() => {
                  const resolvedPatientId = viewingAppointment.patientId
                    ?? allCalendarPatients.find(pt =>
                        `${pt.firstName} ${pt.lastName}`.toLowerCase() === (viewingAppointment.patientName || "").toLowerCase()
                      )?.id ?? null;
                  return resolvedPatientId && onOpenPatient ? (
                    <Button
                      variant="outline"
                      className="w-full gap-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-300"
                      onClick={() => {
                        setViewingAppointment(null);
                        onOpenPatient(resolvedPatientId);
                      }}
                    >
                      <FolderOpen className="w-4 h-4" />
                      Open Patient File
                    </Button>
                  ) : null;
                })()}

                {/* Mark as Invoiced toggle — quick invoice status, below Open Patient File */}
                {viewingAppointment.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    className={`w-full gap-2 ${
                      viewingAppointment.isInvoiced
                        ? "text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    disabled={invoiceMutation.isPending}
                    onClick={() =>
                      invoiceMutation.mutate({
                        id: viewingAppointment.id,
                        isInvoiced: !viewingAppointment.isInvoiced,
                      })
                    }
                    data-testid="button-toggle-invoiced"
                  >
                    {viewingAppointment.isInvoiced ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <DollarSign className="w-4 h-4" />
                    )}
                    {invoiceMutation.isPending
                      ? "Saving…"
                      : viewingAppointment.isInvoiced
                        ? "Invoiced — tap to undo"
                        : "Mark as Invoiced"}
                  </Button>
                )}
                </>)}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Attendance Certificate — Download or Email */}
        <Dialog open={!!certificateDialog} onOpenChange={(open) => { if (!open) setCertificateDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-700" />
                Attendance Certificate Ready
              </DialogTitle>
            </DialogHeader>
            {certificateDialog && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Certificate generated for <strong>{certificateDialog.appointment.patientName}</strong>.
                  {certificateDialog.saved && (
                    <span className="block text-emerald-700 mt-1">✓ Saved to patient file.</span>
                  )}
                  {!certificateDialog.saved && (
                    <span className="block text-amber-700 mt-1">Note: could not save to patient file (no linked patient).</span>
                  )}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    onClick={() => {
                      const url = URL.createObjectURL(certificateDialog.blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = certificateDialog.filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                    className="w-full"
                    data-testid="button-download-certificate"
                  >
                    <FileUp className="w-4 h-4 mr-2 rotate-180" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!certificateDialog.appointment.patientEmail || emailingCertificate}
                    title={!certificateDialog.appointment.patientEmail ? "No email address on file for this patient" : "Email the certificate to the patient"}
                    onClick={async () => {
                      if (!certificateDialog) return;
                      setEmailingCertificate(true);
                      try {
                        const res = await fetch(
                          `/api/appointments/${certificateDialog.appointment.id}/email-attendance-certificate`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({
                              pdfBase64: certificateDialog.base64,
                              filename: certificateDialog.filename,
                            }),
                          },
                        );
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || "Failed to send");
                        }
                        const data = await res.json();
                        toast({ title: "Email sent", description: `Certificate emailed to ${data.sentTo}` });
                        setCertificateDialog(null);
                      } catch (err: any) {
                        toast({ title: "Email failed", description: err?.message || "Could not send email", variant: "destructive" });
                      } finally {
                        setEmailingCertificate(false);
                      }
                    }}
                    className="w-full text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    data-testid="button-email-certificate"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {emailingCertificate
                      ? "Sending…"
                      : certificateDialog.appointment.patientEmail
                        ? `Email to ${certificateDialog.appointment.patientEmail}`
                        : "Email to Patient (no email on file)"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Patient Registration Prompt Dialog */}
        <Dialog open={!!registrationPromptPatient} onOpenChange={(open) => { if (!open) setRegistrationPromptPatient(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" /> Send Registration Form?
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{registrationPromptPatient?.firstName} {registrationPromptPatient?.lastName}</span> has been added.
                Would you like to send them a registration form so they can fill in their own details?
              </p>
              <p className="text-xs text-gray-400">The form will be sent to <span className="font-medium">{registrationPromptPatient?.email}</span></p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { toast({ title: "Patient file created", description: `${registrationPromptPatient?.firstName} ${registrationPromptPatient?.lastName} has been registered.` }); setRegistrationPromptPatient(null); }}>
                Skip
              </Button>
              <Button
                size="sm"
                disabled={sendRegistrationMutation.isPending}
                onClick={() => registrationPromptPatient && sendRegistrationMutation.mutate(registrationPromptPatient.id)}
              >
                {sendRegistrationMutation.isPending ? "Sending…" : "Send Registration Form"}
              </Button>
            </div>
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
              <div className="flex items-center gap-2">
                <input
                  id="eventAllDay"
                  type="checkbox"
                  checked={eventForm.isAllDay}
                  onChange={(e) => setEventForm(prev => ({ ...prev, isAllDay: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                />
                <Label htmlFor="eventAllDay" className="cursor-pointer select-none">All Day</Label>
              </div>
              {!eventForm.isAllDay && (
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
              )}
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
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Every 2 weeks (fortnightly)</SelectItem>
                    <SelectItem value="monthly">Every 4 weeks</SelectItem>
                    <SelectItem value="calendar_monthly">Monthly (same date each month)</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
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
                    {viewingEvent.recurrence && viewingEvent.recurrence !== "none" && (
                      <span className={`ml-auto text-xs flex items-center gap-1 ${colors.text}`}>
                        <Repeat className="w-3 h-3" />
                        {{ daily: "Daily", weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Every 4 weeks", calendar_monthly: "Monthly", yearly: "Yearly" }[viewingEvent.recurrence] ?? viewingEvent.recurrence}
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
                      {viewingEvent.isAllDay
                        ? <span className="font-medium text-blue-600">All Day</span>
                        : <span>{format(new Date(viewingEvent.startTime), "p")} – {format(new Date(viewingEvent.endTime), "p")}</span>
                      }
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

        {/* Conflict warning dialog */}
        <Dialog open={!!conflictPrompt} onOpenChange={v => { if (!v) setConflictPrompt(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <CalendarX2 className="w-5 h-5" /> Time slot already booked
              </DialogTitle>
            </DialogHeader>
            {conflictPrompt && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  This time overlaps with {conflictPrompt.conflicts.length === 1 ? "an existing appointment" : `${conflictPrompt.conflicts.length} existing appointments`}:
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg divide-y divide-amber-200">
                  {conflictPrompt.conflicts.map(c => {
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
                <p className="text-xs text-gray-500">Pick a different time, or override and double-book this slot anyway.</p>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => setConflictPrompt(null)} data-testid="button-cancel-conflict">
                    Pick a different time
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmOverride}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-override-conflict"
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? "Booking…" : "Book anyway"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Hover tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-xs pointer-events-none"
            style={{ left: Math.min(tooltip.x, window.innerWidth - 240), top: Math.max(tooltip.y, 8) }}
          >
            {(() => {
              // Prefer the UR stored on the appointment; fall back to the linked patient.
              const apptUr = (tooltip.apt as any).patientUrNumber as string | null | undefined;
              const patientUr = tooltip.apt.patientId
                ? allCalendarPatients.find(p => p.id === tooltip.apt.patientId)?.urNumber
                : null;
              const ur = apptUr || patientUr;
              return (
                <div className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span>{tooltip.apt.patientName}</span>
                  {ur && (
                    <span className="text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                      UR {ur}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="text-gray-600 text-xs space-y-0.5">
              <div>{format(new Date(tooltip.apt.appointmentDate), "EEEE d MMM, h:mm a")} ({tooltip.apt.duration} min)</div>
              {tooltip.apt.scanType && <div>{tooltip.apt.scanType}</div>}
              {tooltip.apt.patientDob && <div>DOB: {(() => { try { const [y,m,d] = tooltip.apt.patientDob.split("-"); return d && m && y ? `${d}/${m}/${y}` : tooltip.apt.patientDob; } catch { return tooltip.apt.patientDob; } })()}</div>}
              {tooltip.apt.patientPhone && <div>{tooltip.apt.patientPhone}</div>}
              {(() => {
                const { referrerName: ttReferrer, cleanNotes: ttNotes } = parseReferralNotes(tooltip.apt.notes);
                return (
                  <>
                    {ttReferrer && (
                      <div className="mt-1 pt-1 border-t border-gray-100 text-orange-600 font-medium">
                        ↗ Referred by {ttReferrer}
                      </div>
                    )}
                    {ttNotes && (
                      <div className={`${ttReferrer ? "" : "mt-1 pt-1 border-t border-gray-100"} text-gray-700 italic`}>
                        {ttNotes}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
