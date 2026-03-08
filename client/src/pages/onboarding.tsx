import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Mail, LogOut } from "lucide-react";

export default function OnboardingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", "POST");
      queryClient.clear();
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Reporting Room</h1>
          <p className="text-gray-600 mt-2">
            Hi {user?.firstName || user?.email}, your account isn't linked to a clinic yet.
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Waiting for an Invitation</CardTitle>
                <CardDescription>
                  Access to Reporting Room is by invitation only.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Ask your clinic administrator to send you an invitation link. Once you receive it, click the link to join your clinic and get full access.
            </p>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button
            variant="ghost"
            className="text-gray-500"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
