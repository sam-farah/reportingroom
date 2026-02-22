import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import ClinicRegistration from "@/pages/clinic-registration";
import InvitationPage from "@/pages/invitation";
import Kiosk from "@/pages/kiosk";
import OnboardingPage from "@/pages/onboarding";

function Router() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const needsOnboarding = isAuthenticated && user && !user.clinicId;

  return (
    <Switch>
      <Route path="/kiosk" component={Kiosk} />
      <Route path="/invite/:token" component={InvitationPage} />
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/register-clinic" component={ClinicRegistration} />
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
