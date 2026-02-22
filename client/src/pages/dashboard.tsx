import { useState } from "react";
import { HeartPulse, User, Settings, LogOut, FileText, FolderOpen, Users, PenTool, Calendar as CalendarIcon, UserCircle, Monitor } from "lucide-react";
import logoIconPath from "@assets/Screenshot 2025-07-26 201200_1753524822284.png";
import logoWithTextPath from "@assets/Screenshot 2025-07-26 201206_1753524822283.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import UserPanel from "@/components/user-panel";
import AdminPanel from "@/components/admin-panel";
import Templates from "./templates";
import ReportingRoom from "./reporting-room";
import Physicians from "./physicians";
import StaffManagement from "./staff-management";
import Draw from "./draw";
import Calendar from "./calendar";
import Patients from "./patients";

export default function Dashboard() {
  const { user } = useAuth();
  const [activePanel, setActivePanel] = useState<"user" | "admin" | "templates" | "reporting-room" | "physicians" | "staff" | "draw" | "calendar" | "patients">("user");

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
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
                  variant={activePanel === "draw" ? "default" : "ghost"}
                  className={activePanel === "draw" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("draw")}
                >
                  <PenTool className="w-4 h-4 mr-2" />
                  Draw
                </Button>
                <Button
                  variant={activePanel === "templates" ? "default" : "ghost"}
                  className={activePanel === "templates" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("templates")}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Templates
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

                {/* Admin Panel - Only visible to webmaster */}
                {user?.email === "contact@samfarah.com" && (
                  <Button
                    variant={activePanel === "admin" ? "default" : "ghost"}
                    className={activePanel === "admin" ? "medical-btn-secondary" : ""}
                    onClick={() => setActivePanel("admin")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Admin Panel
                  </Button>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-700">
                  <span>{user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}</span>
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

      {/* Main Content */}
      {activePanel === "user" ? (
        <UserPanel />
      ) : activePanel === "draw" ? (
        <Draw />
      ) : activePanel === "templates" ? (
        <Templates />
      ) : activePanel === "reporting-room" ? (
        <ReportingRoom />
      ) : activePanel === "physicians" ? (
        <Physicians />
      ) : activePanel === "staff" ? (
        <StaffManagement />
      ) : activePanel === "calendar" ? (
        <Calendar />
      ) : activePanel === "patients" ? (
        <Patients />
      ) : activePanel === "admin" && user?.email === "contact@samfarah.com" ? (
        <AdminPanel />
      ) : (
        <UserPanel />
      )}

      {/* Logo with text in bottom right */}
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
