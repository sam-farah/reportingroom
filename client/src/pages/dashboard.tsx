import { useState } from "react";
import { User, Settings, LogOut, FolderOpen, Users, Calendar as CalendarIcon, UserCircle, Monitor, ClipboardList, Upload, MapPin, PenLine, HelpCircle, ScanLine, BookUser, ExternalLink, Building2, Shield } from "lucide-react";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  const [dicomDialogOpen, setDicomDialogOpen] = useState(false);
  const [dicomPendingPath, setDicomPendingPath] = useState<string>("/ui/app/");
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

          {/* Primary launch button */}
          <Button
            size="lg"
            className="w-full gap-2 mb-6 h-12 text-base"
            onClick={() => { setDicomPendingPath("/ui/app/"); setDicomDialogOpen(true); }}
          >
            <ExternalLink className="w-5 h-5" />
            Open DICOM Viewer
          </Button>

          <p className="text-xs text-gray-400 text-center mt-2">
            Opens in a new browser tab. You will be asked how you are connecting.
          </p>

          {/* Connection type dialog */}
          <Dialog open={dicomDialogOpen} onOpenChange={setDicomDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-blue-600" />
                  How are you connecting?
                </DialogTitle>
                <DialogDescription>
                  Choose your current connection to reach the correct DICOM server address.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 pt-2">
                <button
                  onClick={() => {
                    window.open(`http://192.168.15.23:8042${dicomPendingPath}`, "_blank");
                    setDicomDialogOpen(false);
                  }}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 transition-colors text-left group"
                >
                  <div className="w-11 h-11 rounded-xl bg-green-100 group-hover:bg-green-200 flex items-center justify-center flex-shrink-0 transition-colors">
                    <Building2 className="w-6 h-6 text-green-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">I am on site</p>
                    <p className="text-xs text-gray-500 mt-0.5">Connected to the clinic Wi-Fi or LAN</p>
                    <code className="text-xs text-green-700 font-mono">192.168.15.23:8042</code>
                  </div>
                </button>
                <button
                  onClick={() => {
                    window.open(`http://100.108.175.83:8042/`, "_blank");
                    setDicomDialogOpen(false);
                  }}
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors text-left group"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0 transition-colors">
                    <Shield className="w-6 h-6 text-blue-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">I am connected via VPN</p>
                    <p className="text-xs text-gray-500 mt-0.5">Connected via Tailscale from outside the clinic</p>
                    <code className="text-xs text-blue-700 font-mono">100.108.175.83:8042</code>
                  </div>
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <UserPanel preLinkedPatientId={preLinkedPatientId} preLinkedPatientName={preLinkedPatientName} preLinkedExamDate={preLinkedExamDate} onPreLinkedPatientConsumed={() => { setPreLinkedPatientId(null); setPreLinkedPatientName(""); setPreLinkedExamDate(""); }} onReportGenerated={(id) => { setOpenReportId(id); setActivePanel("reporting-room"); }} />
      )}

    </div>
  );
}
