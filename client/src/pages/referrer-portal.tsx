import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, LogOut, Calendar, ClipboardList, Plus, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { format, addDays, startOfWeek, addWeeks, subWeeks, parseISO, isSameDay, isToday } from "date-fns";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";

type UserInfo = { id: string; firstName: string | null; lastName: string | null; email: string; role: string };
type ClinicInfo = { name: string; logoUrl: string | null; phone: string | null };
type BusySlot = { id: number; startTime: string; endTime: string; scanType: string };
type CalendarEvent = { id: number; title: string; startTime: string; endTime: string; color: string };
type ScanRequest = { id: number; patientName: string; scanTypes: string[]; status: string; urgency: string; requestDate: string; createdAt: string };

const HOURS = Array.from({ length: 11 }, (_, i) => i + 7); // 7am–5pm
const SLOT_H = 56;

function timeToFrac(timeStr: string): number {
  const d = new Date(timeStr);
  return (d.getHours() + d.getMinutes() / 60 - 7) / 11;
}

export default function ReferrerPortal() {
  const [authState, setAuthState] = useState<"loading" | "login" | "portal">("loading");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<"calendar" | "referrals">("calendar");
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
    const fri = addDays(mon, 4);
    // If the entire Mon–Fri week is in the past (e.g. on weekends), show next week
    if (fri < new Date()) return addWeeks(mon, 1);
    return mon;
  });
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [myRequests, setMyRequests] = useState<ScanRequest[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ date: Date; hour: number } | null>(null);
  const [bookForm, setBookForm] = useState({ patientName: "", patientDob: "", patientPhone: "", patientEmail: "", scanType: "", clinicalIndication: "", notes: "" });
  const [booking, setBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Check auth
  useEffect(() => {
    fetch("/api/referrer/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) { setAuthState("login"); return; }
        const data = await r.json();
        setUser(data.user);
        setClinic(data.clinic);
        document.title = data.clinic?.name || "Referrer Portal";
        setAuthState("portal");
      })
      .catch(() => setAuthState("login"));
  }, []);

  const loadCalendar = useCallback(async () => {
    setLoadingCal(true);
    try {
      const [calRes, reqRes] = await Promise.all([
        fetch("/api/referrer/calendar", { credentials: "include" }),
        fetch("/api/referrer/requests", { credentials: "include" }),
      ]);
      if (calRes.ok) {
        const data = await calRes.json();
        setBusySlots(data.appointments || []);
        setCalEvents(data.events || []);
      }
      if (reqRes.ok) setMyRequests(await reqRes.json());
    } catch {}
    setLoadingCal(false);
  }, []);

  useEffect(() => {
    if (authState === "portal") loadCalendar();
  }, [authState, loadCalendar]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(loginForm),
      });
      const data = await r.json();
      if (!r.ok) { setLoginError(data.message || "Invalid credentials"); return; }
      if (data.role !== "referrer") { setLoginError("This portal is for referrers only. Please use the main login."); return; }
      setUser(data);
      // Re-fetch clinic info
      const meRes = await fetch("/api/referrer/me", { credentials: "include" });
      if (meRes.ok) {
        const me = await meRes.json();
        setClinic(me.clinic);
        document.title = me.clinic?.name || "Referrer Portal";
      }
      setAuthState("portal");
    } catch { setLoginError("Connection error. Please try again."); }
    finally { setLoggingIn(false); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null); setClinic(null); setAuthState("login");
  };

  const openBooking = (date: Date, hour: number) => {
    setBookingSlot({ date, hour });
    setBookForm({ patientName: "", patientDob: "", patientPhone: "", patientEmail: "", scanType: "", clinicalIndication: "", notes: "" });
    setBookingSuccess(false);
    setBookingOpen(true);
  };

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot || !bookForm.patientName || !bookForm.scanType) return;
    setBooking(true);
    try {
      const start = new Date(bookingSlot.date);
      start.setHours(bookingSlot.hour, 0, 0, 0);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const r = await fetch("/api/referrer/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...bookForm, startTime: start.toISOString(), endTime: end.toISOString() }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || "Failed to book"); return; }
      setBookingSuccess(true);
      loadCalendar();
    } catch { alert("Connection error"); }
    finally { setBooking(false); }
  };

  const downloadICS = () => {
    if (!bookingSlot) return;
    const start = new Date(bookingSlot.date);
    start.setHours(bookingSlot.hour, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const uid = `booking-${Date.now()}@reportingroom`;
    const summary = `${bookForm.scanType} — ${bookForm.patientName}`;
    const description = [
      bookForm.clinicalIndication ? `Indication: ${bookForm.clinicalIndication}` : "",
      bookForm.notes ? `Notes: ${bookForm.notes}` : "",
      clinic?.name ? `Clinic: ${clinic.name}` : "",
    ].filter(Boolean).join("\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Reporting Room//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${summary}`,
      description ? `DESCRIPTION:${description}` : "",
      clinic?.name ? `LOCATION:${clinic.name}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointment-${format(start, "yyyy-MM-dd")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const getSlotEvents = (day: Date, hour: number) => {
    const hourStart = new Date(day); hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(day); hourEnd.setHours(hour, 59, 59, 0);
    return busySlots.filter((s) => {
      const st = new Date(s.startTime), en = new Date(s.endTime);
      return isSameDay(st, day) && st < hourEnd && en > hourStart;
    });
  };

  const isCellBusy = (day: Date, hour: number) => getSlotEvents(day, hour).length > 0;

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    scheduled: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-600",
  };

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (authState === "login") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Referrer Portal</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Sign in with your referrer account</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={login} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" required value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" autoComplete="email" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" required value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} className="mt-1" autoComplete="current-password" />
              </div>
              {loginError && <p className="text-sm text-red-500">{loginError}</p>}
              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Portal header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {clinic?.logoUrl && <img src={clinic.logoUrl} alt="" className="h-8 object-contain" />}
          <div>
            <span className="font-semibold text-gray-800 text-sm">{clinic?.name || "Referrer Portal"}</span>
            <p className="text-xs text-gray-500">{user?.firstName} {user?.lastName}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="text-gray-500 gap-1.5">
          <LogOut className="w-4 h-4" /> Sign out
        </Button>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b px-4 flex gap-0">
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "calendar" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <Calendar className="w-4 h-4" /> Book Appointment
        </button>
        <button
          onClick={() => setActiveTab("referrals")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "referrals" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          <ClipboardList className="w-4 h-4" /> My Referrals
          {myRequests.filter((r) => r.status === "pending").length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs rounded-full px-1.5 py-0.5">{myRequests.filter((r) => r.status === "pending").length}</span>
          )}
        </button>
      </div>

      <div className="p-4 max-w-5xl mx-auto">
        {activeTab === "calendar" && (
          <div className="space-y-3">
            {/* Week navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => subWeeks(w, 1))}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}><ChevronRight className="w-4 h-4" /></Button>
              </div>
              <span className="text-sm font-medium text-gray-700">
                {format(weekStart, "d MMM")} – {format(addDays(weekStart, 4), "d MMM yyyy")}
              </span>
              <Button size="sm" onClick={() => openBooking(new Date(), new Date().getHours())} className="gap-1.5">
                <Plus className="w-4 h-4" /> Book
              </Button>
            </div>

            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Click any free slot to book. Grey slots are already taken.
            </p>

            {loadingCal ? (
              <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : (
              <div className="bg-white rounded-lg border overflow-x-auto">
                {/* Header row */}
                <div className="grid border-b" style={{ gridTemplateColumns: "60px repeat(5, 1fr)" }}>
                  <div className="p-2" />
                  {weekDays.map((day) => (
                    <div key={day.toISOString()} className={`p-2 text-center border-l ${isToday(day) ? "bg-blue-50" : ""}`}>
                      <div className="text-xs font-medium text-gray-500">{format(day, "EEE")}</div>
                      <div className={`text-lg font-bold ${isToday(day) ? "text-blue-600" : "text-gray-800"}`}>{format(day, "d")}</div>
                    </div>
                  ))}
                </div>
                {/* Time rows */}
                {HOURS.map((hour) => (
                  <div key={hour} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "60px repeat(5, 1fr)" }}>
                    <div className="p-2 text-right text-xs text-gray-400 pr-3 pt-1.5">{format(new Date().setHours(hour, 0), "h a")}</div>
                    {weekDays.map((day) => {
                      const busy = isCellBusy(day, hour);
                      const isPast = new Date(day).setHours(hour + 1, 0) < Date.now();
                      return (
                        <div
                          key={day.toISOString()}
                          style={{ height: `${SLOT_H}px` }}
                          className={`border-l transition-colors ${
                            busy ? "bg-gray-100 cursor-default" :
                            isPast ? "bg-gray-50 cursor-default" :
                            "hover:bg-blue-50 cursor-pointer active:bg-blue-100"
                          }`}
                          onClick={() => !busy && !isPast && openBooking(day, hour)}
                        >
                          {busy && (
                            <div className="h-full flex items-center justify-center">
                              <span className="text-xs text-gray-400 font-medium">Booked</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "referrals" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">My Submitted Referrals</h2>
            {myRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No referrals submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myRequests.slice().reverse().map((req) => (
                  <Card key={req.id} className="border-0 shadow-sm">
                    <CardContent className="p-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{req.patientName}</p>
                        <p className="text-sm text-gray-500">{req.scanTypes.join(", ")}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Submitted {format(new Date(req.createdAt), "d MMM yyyy")}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${statusColors[req.status] || "bg-gray-100 text-gray-600"}`}>
                        {req.status}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking dialog */}
      <Dialog open={bookingOpen} onOpenChange={(o) => { if (!o) setBookingOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bookingSuccess ? "Booking Confirmed" : `Book Appointment${bookingSlot ? ` — ${format(bookingSlot.date, "EEE d MMM")} at ${format(new Date().setHours(bookingSlot.hour, 0), "h:mm a")}` : ""}`}
            </DialogTitle>
          </DialogHeader>
          {bookingSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="text-gray-700 font-medium">Appointment booked successfully.</p>
                {bookingSlot && (
                  <p className="text-sm text-blue-700 font-medium mt-1">
                    {format(bookingSlot.date, "EEEE d MMMM yyyy")} at {format(new Date().setHours(bookingSlot.hour, 0), "h:mm a")}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">The clinic team will contact the patient to confirm.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={downloadICS} variant="outline" className="gap-2">
                  <Calendar className="w-4 h-4" /> Add to My Calendar (.ics)
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setBookingOpen(false); setActiveTab("calendar"); }}>
                    View Calendar
                  </Button>
                  <Button className="flex-1" onClick={() => { setBookingOpen(false); setActiveTab("referrals"); }}>
                    View Referrals
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submitBooking} className="space-y-4 mt-1">
              <div>
                <Label className="text-sm">Patient Full Name *</Label>
                <Input required value={bookForm.patientName} onChange={(e) => setBookForm((p) => ({ ...p, patientName: e.target.value }))} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Date of Birth</Label>
                  <Input type="date" value={bookForm.patientDob} onChange={(e) => setBookForm((p) => ({ ...p, patientDob: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Phone</Label>
                  <Input type="tel" value={bookForm.patientPhone} onChange={(e) => setBookForm((p) => ({ ...p, patientPhone: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Scan Type *</Label>
                <Select value={bookForm.scanType} onValueChange={(v) => setBookForm((p) => ({ ...p, scanType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select scan type" /></SelectTrigger>
                  <SelectContent>
                    {CANONICAL_SCAN_TYPES.map((st) => (
                      <SelectItem key={st.name} value={st.name}>{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Clinical Indication</Label>
                <Textarea value={bookForm.clinicalIndication} onChange={(e) => setBookForm((p) => ({ ...p, clinicalIndication: e.target.value }))} rows={2} className="mt-1" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setBookingOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={booking || !bookForm.patientName || !bookForm.scanType}>
                  {booking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirm Booking
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
