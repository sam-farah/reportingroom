import { useState } from "react";
import { Menu, X, User, Settings, LogOut, FolderOpen, Users, Calendar as CalendarIcon, UserCircle, Monitor, ClipboardList, Upload, FileText, MapPin, Phone } from "lucide-react";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";
import logoWithTextPath from "@assets/Screenshot 2025-07-26 201206_1753524822283.png";
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

type Panel = "user" | "admin" | "reporting-room" | "physicians" | "staff" | "calendar" | "patients" | "requests";

const NAV_ITEMS: { id: Panel; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "calendar",       label: "Calendar",     icon: CalendarIcon },
  { id: "user",           label: "Upload",        icon: Upload },
  { id: "reporting-room", label: "Reports",       icon: FolderOpen },
  { id: "patients",       label: "Patients",      icon: UserCircle },
  { id: "requests",       label: "Requests",      icon: ClipboardList },
  { id: "staff",          label: "Team",          icon: Users,    adminOnly: true },
  { id: "admin",          label: "Admin Panel",   icon: Settings },
];

const PAGE_TITLES: Record<Panel, string> = {
  "calendar":       "Calendar",
  "user":           "Report Generation",
  "reporting-room": "Reports",
  "physicians":     "Physicians",
  "staff":          "Team",
  "patients":       "Patients",
  "requests":       "Scan Requests",
  "admin":          "Admin Panel",
};

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<Panel>("user");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openPatientId, setOpenPatientId] = useState<number | null>(null);
  const [preLinkedPatientId, setPreLinkedPatientId] = useState<number | null>(null);
  const [preLinkedPatientName, setPreLinkedPatientName] = useState<string>("");

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

  const { data: kioskSettings } = useQuery<{ clinicName: string; address?: string; phone?: string }>({
    queryKey: ["/api/kiosk/settings"],
    retry: false,
  });

  const navigate = (panel: Panel) => {
    setActivePanel(panel);
    setDrawerOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top nav bar ── */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 sm:px-6">
          <div className="flex items-center h-14 gap-3">

            {/* Hamburger */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDrawerOpen(true)}
              className="flex-shrink-0 p-2"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Clinic details */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {kioskSettings?.kioskLogoUrl ? (
                <img
                  src={kioskSettings.kioskLogoUrl}
                  alt={kioskSettings.clinicName || "Clinic logo"}
                  className="h-8 w-auto max-w-[120px] object-contain flex-shrink-0"
                />
              ) : (
                <img src={logoIconPath} alt="Reporting Room" className="h-7 w-7 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-bold text-gray-900 text-sm leading-tight truncate">
                  {kioskSettings?.clinicName || "Reporting Room"}
                </div>
                {kioskSettings?.address && (
                  <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {kioskSettings.address}
                  </div>
                )}
              </div>
            </div>

            {/* Kiosk shortcut + user + logout */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open('/kiosk', '_blank')}
                className="hidden sm:flex text-gray-500"
              >
                <Monitor className="w-4 h-4 mr-1.5" />Kiosk
              </Button>

              <div className="text-right text-sm text-gray-700 hidden sm:block">
                <div className="font-medium leading-none">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}
                </div>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <Badge variant="outline" className="text-xs py-0">{roleLabel}</Badge>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-900 p-2"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Backdrop ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 transition-opacity"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Slide-out drawer ── */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <img src={logoIconPath} alt="Reporting Room" className="h-8 w-8" />
            <span className="font-bold text-gray-900 text-lg">Reporting Room</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)} className="p-1.5">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* User info */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}
              </div>
              <div className="text-xs text-gray-500 truncate">{user?.email}</div>
            </div>
            <Badge variant="outline" className="text-xs flex-shrink-0">{roleLabel}</Badge>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-0.5">
            {NAV_ITEMS.filter(item => !item.adminOnly || isOwnerOrAdmin).map(item => {
              const Icon = item.icon;
              const isActive = activePanel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm font-medium ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-blue-600" : "text-gray-500"}`} />
                  {item.label}
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Kiosk link (mobile only visible here) */}
          <div className="mt-4 pt-4 border-t border-gray-100 px-0 sm:hidden">
            <button
              onClick={() => { window.open('/kiosk', '_blank'); setDrawerOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <Monitor className="w-5 h-5 text-gray-500" />
              Kiosk
            </button>
          </div>
        </nav>

        {/* Logout at bottom */}
        <div className="px-3 py-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Page content ── */}
      {activePanel === "user" ? (
        <UserPanel preLinkedPatientId={preLinkedPatientId} preLinkedPatientName={preLinkedPatientName} onPreLinkedPatientConsumed={() => { setPreLinkedPatientId(null); setPreLinkedPatientName(""); }} />
      ) : activePanel === "reporting-room" ? (
        <ReportingRoom />
      ) : activePanel === "physicians" ? (
        <Physicians />
      ) : activePanel === "staff" && isOwnerOrAdmin ? (
        <StaffManagement />
      ) : activePanel === "calendar" ? (
        <Calendar
          onOpenPatient={(patientId) => { setOpenPatientId(patientId); setActivePanel("patients"); }}
          onBeginStudy={(patientId, patientName) => { setPreLinkedPatientId(patientId); setPreLinkedPatientName(patientName); setActivePanel("user"); }}
        />
      ) : activePanel === "patients" ? (
        <Patients initialPatientId={openPatientId ?? undefined} onPatientOpened={() => setOpenPatientId(null)} />
      ) : activePanel === "requests" ? (
        <Requests />
      ) : activePanel === "admin" ? (
        <AdminPanel />
      ) : (
        <UserPanel preLinkedPatientId={preLinkedPatientId} preLinkedPatientName={preLinkedPatientName} onPreLinkedPatientConsumed={() => { setPreLinkedPatientId(null); setPreLinkedPatientName(""); }} />
      )}

    </div>
  );
}
