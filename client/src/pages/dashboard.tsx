import { useState } from "react";
import { User, Settings, LogOut, FolderOpen, Users, Calendar as CalendarIcon, UserCircle, Monitor, ClipboardList, Upload, MapPin, PenLine, HelpCircle, ScanLine, BookUser, ExternalLink, Wifi, Search, Eye, LayoutGrid } from "lucide-react";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import UserPanel from "@/components/user-panel";
import AdminPanel from "@/components/admin-panel";
import ReportingRoom from "./reporting-room";
import Physicians from "./physicians";
import StaffManagement from "./staff-management";
import Calendar from "./calendar";
import Patients from "./patients";
import Requests from "./requests";
import Contacts from "./contacts";
import Draw from "./draw";
import Templates from "./templates";
import HelpCentre from "./help-centre";

type Panel = "user" | "admin" | "reporting-room" | "physicians" | "staff" | "calendar" | "patients" | "requests" | "contacts" | "draw" | "templates" | "help" | "dicom";

const NAV_ITEMS: { id: Panel; label: string; icon: React.ElementType; adminOnly?: boolean; comingSoon?: boolean }[] = [
  { id: "calendar",       label: "Calendar",  icon: CalendarIcon },
  { id: "user",           label: "Upload",    icon: Upload },
  { id: "draw",           label: "Draw",      icon: PenLine },
  { id: "reporting-room", label: "Reports",   icon: FolderOpen },
  { id: "patients",       label: "Patients",  icon: UserCircle },
  { id: "requests",       label: "Requests",  icon: ClipboardList },
  { id: "contacts",       label: "Contacts",  icon: BookUser },
  { id: "dicom",          label: "DICOM",     icon: ScanLine },
  { id: "staff",          label: "Team",      icon: Users, adminOnly: true },
  { id: "admin",          label: "Admin",     icon: Settings },
  { id: "help",           label: "Help",      icon: HelpCircle, comingSoon: true },
];

const PAGE_TITLES: Record<Panel, string> = {
  "calendar":       "Calendar",
  "user":           "Report Generation",
  "draw":           "Draw Worksheet",
  "reporting-room": "Reports",
  "physicians":     "Physicians",
  "staff":          "Team",
  "patients":       "Patients",
  "requests":       "Scan Requests",
  "contacts":       "Contacts",
  "templates":      "Templates",
  "admin":          "Admin Panel",
  "help":           "Help Centre",
  "dicom":          "DICOM Viewer",
};

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<Panel>("calendar");
  const [openPatientId, setOpenPatientId] = useState<number | null>(null);
  const [preLinkedPatientId, setPreLinkedPatientId] = useState<number | null>(null);
  const [preLinkedPatientName, setPreLinkedPatientName] = useState<string>("");
  const [preLinkedExamDate, setPreLinkedExamDate] = useState<string>("");
  const [preLinkedTab, setPreLinkedTab] = useState<"upload" | "draw">("upload");
  const [openReportId, setOpenReportId] = useState<number | null>(null);

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", "POST");
      queryClient.clear();
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  const isOwnerOrAdmin = user?.role === 'clinic_owner' || user?.role === 'admin';
  const roleLabel = user?.role === 'clinic_owner' ? 'Owner' : user?.role === 'admin' ? 'Admin' : 'Staff';

  const { data: kioskSettings } = useQuery<{ clinicName: string; address?: string; phone?: string; kioskLogoUrl?: string }>({
    queryKey: ["/api/kiosk/settings"],
    retry: false,
  });

  const { data: scanRequests } = useQuery<{ status: string }[]>({
    queryKey: ["/api/scan-requests"],
    retry: false,
  });
  const pendingRequestsCount = (scanRequests ?? []).filter(r => r.status === "pending").length;

  const visibleNav = NAV_ITEMS.filter(item => !item.adminOnly || isOwnerOrAdmin);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">

        {/* Row 1: logo / clinic name / user / logout */}
        <div className="px-4 flex items-center h-12 gap-3">
          {/* Logo + clinic name */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {kioskSettings?.kioskLogoUrl ? (
              <img src={kioskSettings.kioskLogoUrl} alt={kioskSettings.clinicName || "Clinic"} className="h-7 w-auto max-w-[100px] object-contain flex-shrink-0" />
            ) : (
              <img src={logoIconPath} alt="Reporting Room" className="h-6 w-6 flex-shrink-0" />
            )}
            <span className="font-bold text-gray-900 text-sm truncate">
              {kioskSettings?.clinicName || "Reporting Room"}
            </span>
            {kioskSettings?.address && (
              <span className="text-xs text-gray-400 truncate hidden md:block flex items-center gap-0.5">
                <MapPin className="w-3 h-3 inline mr-0.5" />{kioskSettings.address}
              </span>
            )}
          </div>

          {/* Kiosk + user info + logout */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('/kiosk', '_blank')}
              className="hidden sm:flex text-gray-500 text-xs px-2 py-1 h-7"
              title="Open kiosk"
            >
              <Monitor className="w-3.5 h-3.5 mr-1" />Kiosk
            </Button>

            <div className="hidden sm:flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-gray-800 leading-none">
                  {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email}
                </div>
                <Badge variant="outline" className="text-[10px] py-0 px-1 h-4 mt-0.5">{roleLabel}</Badge>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-500 p-1.5 h-7 w-7"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: icon nav */}
        <div className="border-t border-gray-100 overflow-x-auto scrollbar-none">
          <div className="flex items-stretch px-2 min-w-max">
            {visibleNav.map(item => {
              const Icon = item.icon;
              const isActive = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => !item.comingSoon && setActivePanel(item.id)}
                  title={item.comingSoon ? `${item.label} (coming soon)` : item.label}
                  className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 text-[10px] font-medium transition-colors border-b-2 ${
                    item.comingSoon
                      ? "text-gray-300 border-transparent cursor-default"
                      : isActive
                        ? "text-blue-600 border-blue-600 bg-blue-50/60"
                        : "text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <span className="relative inline-flex">
                    <Icon className={`w-5 h-5 ${isActive ? "text-blue-600" : item.comingSoon ? "text-gray-300" : "text-gray-500"}`} />
                    {item.id === "requests" && pendingRequestsCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {pendingRequestsCount > 99 ? "99+" : pendingRequestsCount}
                      </span>
                    )}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      {activePanel === "user" ? (
        <UserPanel preLinkedPatientId={preLinkedPatientId} preLinkedPatientName={preLinkedPatientName} preLinkedExamDate={preLinkedExamDate} onPreLinkedPatientConsumed={() => { setPreLinkedPatientId(null); setPreLinkedPatientName(""); setPreLinkedExamDate(""); setPreLinkedTab("upload"); }} defaultTab={preLinkedTab} onReportGenerated={(id) => { setOpenReportId(id); setActivePanel("reporting-room"); }} />
      ) : activePanel === "draw" ? (
        <Draw preLinkedPatientId={preLinkedPatientId} preLinkedPatientName={preLinkedPatientName} onPreLinkedPatientConsumed={() => { setPreLinkedPatientId(null); setPreLinkedPatientName(""); setPreLinkedTab("upload"); }} onDraftCreated={(reportId) => { setOpenReportId(reportId); setActivePanel("reporting-room"); }} />
      ) : activePanel === "reporting-room" ? (
        <ReportingRoom
          initialOpenReportId={openReportId}
          onReportOpened={() => setOpenReportId(null)}
          onStartAnotherScan={({ patientId, patientName, examDate }) => {
            setPreLinkedPatientId(patientId);
            setPreLinkedPatientName(patientName);
            setPreLinkedExamDate(examDate);
            setPreLinkedTab("upload");
            setOpenReportId(null);
            setActivePanel("user");
          }}
        />
      ) : activePanel === "physicians" ? (
        <Physicians />
      ) : activePanel === "staff" && isOwnerOrAdmin ? (
        <StaffManagement />
      ) : activePanel === "calendar" ? (
        <Calendar
          onOpenPatient={(patientId) => { setOpenPatientId(patientId); setActivePanel("patients"); }}
          onBeginStudy={(patientId, patientName, tab) => { setPreLinkedPatientId(patientId); setPreLinkedPatientName(patientName); setPreLinkedTab(tab ?? "upload"); setActivePanel(tab === "draw" ? "draw" : "user"); }}
        />
      ) : activePanel === "patients" ? (
        <Patients initialPatientId={openPatientId ?? undefined} onPatientOpened={() => setOpenPatientId(null)} />
      ) : activePanel === "requests" ? (
        <Requests />
      ) : activePanel === "contacts" ? (
        <Contacts />
      ) : activePanel === "templates" ? (
        <Templates />
      ) : activePanel === "admin" ? (
        <AdminPanel onNavigateToTemplates={() => setActivePanel("templates")} />
      ) : activePanel === "help" ? (
        <HelpCentre />
      ) : activePanel === "dicom" ? (
        <div className="p-8 max-w-2xl mx-auto w-full" style={{ paddingTop: "48px" }}>
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md flex-shrink-0">
              <ScanLine className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">DICOM Viewer</h2>
              <p className="text-sm text-gray-500">Orthanc — Nexus Vascular Imaging</p>
            </div>
          </div>

          {/* VPN notice */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <Wifi className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Tailscale VPN required.</span>{" "}
              Connect to Tailscale before opening the viewer. Address:{" "}
              <code className="font-mono bg-amber-100 px-1 rounded text-amber-900">100.108.175.83:8042</code>
            </p>
          </div>

          {/* Primary launch button */}
          <Button
            size="lg"
            className="w-full gap-2 mb-6 h-12 text-base"
            onClick={() => window.open("http://100.108.175.83:8042/ui/app/", "_blank")}
          >
            <ExternalLink className="w-5 h-5" />
            Open DICOM Viewer
          </Button>

          {/* Quick links */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Access</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => window.open("http://100.108.175.83:8042/ui/app/", "_blank")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors text-center group"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                <Eye className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-700">OHIF Viewer</span>
              <span className="text-xs text-gray-400">Browse &amp; view studies</span>
            </button>
            <button
              onClick={() => window.open("http://100.108.175.83:8042/app/explorer.html", "_blank")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors text-center group"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
                <Search className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-gray-700">Orthanc Explorer</span>
              <span className="text-xs text-gray-400">Manage studies</span>
            </button>
            <button
              onClick={() => window.open("http://100.108.175.83:8042/", "_blank")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors text-center group"
            >
              <div className="w-9 h-9 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
                <LayoutGrid className="w-5 h-5 text-gray-600" />
              </div>
              <span className="text-xs font-medium text-gray-700">REST API</span>
              <span className="text-xs text-gray-400">Orthanc index</span>
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center mt-6">
            Opens in a new browser tab. HTTP access is required — the viewer cannot be embedded inline.
          </p>
        </div>
      ) : (
        <UserPanel preLinkedPatientId={preLinkedPatientId} preLinkedPatientName={preLinkedPatientName} preLinkedExamDate={preLinkedExamDate} onPreLinkedPatientConsumed={() => { setPreLinkedPatientId(null); setPreLinkedPatientName(""); setPreLinkedExamDate(""); }} onReportGenerated={(id) => { setOpenReportId(id); setActivePanel("reporting-room"); }} />
      )}

    </div>
  );
}
