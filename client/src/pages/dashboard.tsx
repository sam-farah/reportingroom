import { useState } from "react";
import { HeartPulse, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserPanel from "@/components/user-panel";
import AdminPanel from "@/components/admin-panel";

export default function Dashboard() {
  const [activePanel, setActivePanel] = useState<"user" | "admin">("user");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <HeartPulse className="text-[var(--medical-primary)] text-2xl mr-3" />
                <span className="text-xl font-semibold text-gray-900">JustScan</span>
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
                  User Panel
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
                  <span>Dr. Sarah Johnson</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      {activePanel === "user" ? <UserPanel /> : <AdminPanel />}
    </div>
  );
}
