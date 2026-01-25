import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import Templates from "@/pages/templates";
import ReportingRoom from "@/pages/reporting-room";
import Physicians from "@/pages/physicians";
import Draw from "@/pages/draw";
import ClinicRegistration from "@/pages/clinic-registration";
import StaffManagement from "@/pages/staff-management";
import InvitationPage from "@/pages/invitation";
import Calendar from "@/pages/calendar";
import Patients from "@/pages/patients";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/register-clinic" component={ClinicRegistration} />
          <Route path="/invite/:token" component={InvitationPage} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/templates" component={Templates} />
          <Route path="/reporting-room" component={ReportingRoom} />
          <Route path="/physicians" component={Physicians} />
          <Route path="/staff" component={StaffManagement} />
          <Route path="/draw" component={Draw} />
          <Route path="/calendar" component={Calendar} />
          <Route path="/patients" component={Patients} />
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
