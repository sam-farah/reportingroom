import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Building2, Mail, LogOut } from "lucide-react";

export default function OnboardingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Reporting Room</h1>
          <p className="text-gray-600 mt-2">
            Hi {user?.firstName || user?.email}, let's get you set up.
          </p>
        </div>

        <div className="space-y-4">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-300" onClick={() => setLocation("/register-clinic")}>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Register a New Clinic</CardTitle>
                  <CardDescription>
                    Set up your own clinic and become the owner. You can then invite your team members.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Join an Existing Clinic</CardTitle>
                  <CardDescription>
                    If your clinic owner has sent you an invitation link, click that link to join their clinic.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Ask your clinic administrator to send you an invitation link. Once you receive it, click the link to accept and join the clinic.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Button 
            variant="ghost" 
            className="text-gray-500"
            onClick={() => window.location.href = "/api/logout"}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
