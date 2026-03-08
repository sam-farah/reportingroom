import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import NotFound from "@/pages/not-found";
import ClinicRegistration from "@/pages/clinic-registration";
import InvitationPage from "@/pages/invitation";
import Kiosk from "@/pages/kiosk";
import OnboardingPage from "@/pages/onboarding";
import PatientPortalInvite from "@/pages/patient-portal/invite";
import PatientPortalLogin from "@/pages/patient-portal/login";
import PatientPortalDashboard from "@/pages/patient-portal/dashboard";
import { Loader2 } from "lucide-react";

function Router() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const needsOnboarding = isAuthenticated && user && !user.clinicId;

  return (
    <Switch>
      <Route path="/kiosk" component={Kiosk} />
      <Route path="/invite/:token" component={InvitationPage} />
      
      {/* Patient Portal Routes */}
      <Route path="/patient-portal/invite/:token" component={PatientPortalInvite} />
      <Route path="/patient-portal/login" component={PatientPortalLogin} />
      <Route path="/patient-portal" component={PatientPortalDashboard} />

      {!isAuthenticated ? (
        <>
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route>{() => <LoginPage />}</Route>
        </>
      ) : needsOnboarding ? (
        <>
          <Route path="/register-clinic" component={ClinicRegistration} />
          <Route path="/" component={OnboardingPage} />
          <Route>{() => <OnboardingPage />}</Route>
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/register-clinic" component={ClinicRegistration} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
