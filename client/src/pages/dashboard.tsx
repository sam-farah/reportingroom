import { useState } from "react";
import { HeartPulse, User, Settings, LogOut, FolderOpen, Users, Calendar as CalendarIcon, UserCircle, Monitor, ClipboardList } from "lucide-react";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";
import logoWithTextPath from "@assets/Screenshot 2025-07-26 201206_1753524822283.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import UserPanel from "@/components/user-panel";
import AdminPanel from "@/components/admin-panel";
import ReportingRoom from "./reporting-room";
import Physicians from "./physicians";
import StaffManagement from "./staff-management";
import Calendar from "./calendar";
import Patients from "./patients";
import Requests from "./requests";

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<"user" | "admin" | "reporting-room" | "physicians" | "staff" | "calendar" | "patients" | "requests">("user");

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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <div className="flex-shrink-0">
              <img 
                src={logoIconPath} 
                alt="Reporting Room" 
                className="h-8 w-8"
              />
            </div>
            
            <div className="flex items-center flex-1 justify-end gap-2 overflow-x-auto">
              <div className="flex space-x-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => window.open('/kiosk', '_blank')}
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  Kiosk
                </Button>
                <Button
                  variant={activePanel === "calendar" ? "default" : "ghost"}
                  className={activePanel === "calendar" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("calendar")}
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Calendar
                </Button>
                <Button
                  variant={activePanel === "user" ? "default" : "ghost"}
                  className={activePanel === "user" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("user")}
                >
                  <User className="w-4 h-4 mr-2" />
                  Upload
                </Button>
                <Button
                  variant={activePanel === "reporting-room" ? "default" : "ghost"}
                  className={activePanel === "reporting-room" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("reporting-room")}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Reports
                </Button>
                <Button
                  variant={activePanel === "patients" ? "default" : "ghost"}
                  className={activePanel === "patients" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("patients")}
                >
                  <UserCircle className="w-4 h-4 mr-2" />
                  Patients
                </Button>
                <Button
                  variant={activePanel === "requests" ? "default" : "ghost"}
                  className={activePanel === "requests" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("requests")}
                >
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Requests
                </Button>

                {isOwnerOrAdmin && (
                  <>
                    <Button
                      variant={activePanel === "staff" ? "default" : "ghost"}
                      className={activePanel === "staff" ? "medical-btn-secondary" : ""}
                      onClick={() => setActivePanel("staff")}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Team
                    </Button>
                    <Button
                      variant={activePanel === "admin" ? "default" : "ghost"}
                      className={activePanel === "admin" ? "medical-btn-secondary" : ""}
                      onClick={() => setActivePanel("admin")}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  </>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <span>{user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}</span>
                    <Badge variant="outline" className="text-xs">{roleLabel}</Badge>
                  </div>
                  {user?.email && user?.firstName && (
                    <div className="text-xs text-gray-500">{user.email}</div>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {activePanel === "user" ? (
        <UserPanel />
      ) : activePanel === "reporting-room" ? (
        <ReportingRoom />
      ) : activePanel === "physicians" ? (
        <Physicians />
      ) : activePanel === "staff" && isOwnerOrAdmin ? (
        <StaffManagement />
      ) : activePanel === "calendar" ? (
        <Calendar />
      ) : activePanel === "patients" ? (
        <Patients />
      ) : activePanel === "requests" ? (
        <Requests />
      ) : activePanel === "admin" && isOwnerOrAdmin ? (
        <AdminPanel />
      ) : (
        <UserPanel />
      )}

      <div className="fixed bottom-4 right-4 z-10">
        <img 
          src={logoWithTextPath} 
          alt="Reporting Room" 
          className="h-12 w-auto opacity-80 hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
  );
}
