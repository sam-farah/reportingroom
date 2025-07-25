import { useState } from "react";
import { HeartPulse, User, Settings, LogOut, FileText, FolderOpen, Users, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import UserPanel from "@/components/user-panel";
import AdminPanel from "@/components/admin-panel";
import Templates from "./templates";
import ReportingRoom from "./reporting-room";
import Physicians from "./physicians";
import Draw from "./draw";

export default function Dashboard() {
  const { user } = useAuth();
  const [activePanel, setActivePanel] = useState<"user" | "admin" | "templates" | "reporting-room" | "physicians" | "draw">("user");

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <HeartPulse className="text-[var(--medical-primary)] text-2xl mr-3" />
                <span className="text-xl font-semibold text-gray-900">Reporting Room</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex space-x-2">
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
                  variant={activePanel === "physicians" ? "default" : "ghost"}
                  className={activePanel === "physicians" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("physicians")}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Clinic
                </Button>
                <Button
                  variant={activePanel === "admin" ? "default" : "ghost"}
                  className={activePanel === "admin" ? "medical-btn-secondary" : ""}
                  onClick={() => setActivePanel("admin")}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Admin Panel
                </Button>
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
      ) : (
        <AdminPanel />
      )}
    </div>
  );
}
