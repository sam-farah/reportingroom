import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, LogOut, FileText, ImageIcon, ShieldCheck, ChevronRight, Download } from "lucide-react";
import { format } from "date-fns";
import { Report, Worksheet } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PortalMe {
  id: number;
  patientId: number;
  clinicId: number;
  email: string;
  patientName: string;
  patientFirstName: string;
  clinicName: string;
  clinicLogoUrl: string | null;
}

export default function PatientPortalDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: me, isLoading: isLoadingMe, error: authError } = useQuery<PortalMe>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: reports, isLoading: isLoadingReports } = useQuery<Report[]>({
    queryKey: ["/api/portal/reports"],
    enabled: !!me,
  });

  const { data: worksheets, isLoading: isLoadingWorksheets } = useQuery<Worksheet[]>({
    queryKey: ["/api/portal/worksheets"],
    enabled: !!me,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/portal/logout", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
      setLocation("/patient-portal/login");
    },
  });

  useEffect(() => {
    if (!isLoadingMe && (authError || !me)) {
      setLocation("/patient-portal/login");
    }
  }, [isLoadingMe, authError, me, setLocation]);

  if (isLoadingMe || (!me && !authError)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!me) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 sticky top-0 z-10">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {me.clinicLogoUrl ? (
              <img
                src={me.clinicLogoUrl}
                alt={me.clinicName}
                className="h-10 max-w-[140px] object-contain"
              />
            ) : (
              <div className="bg-blue-600 p-2 rounded-lg">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            )}
            {!me.clinicLogoUrl && (
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
                  Patient Portal
                </h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                  Secure Access
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-slate-900">{me.patientName}</p>
              <p className="text-xs text-slate-500">{me.clinicName}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-slate-600 border-slate-200"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-grow">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Welcome, {me.patientFirstName}</h2>
          <p className="text-slate-600 mt-1">
            Access your medical reports and scan worksheets securely.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Reports Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold">Your Reports</h3>
              <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-100">
                {reports?.length || 0}
              </Badge>
            </div>

            {isLoadingReports ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse h-24 bg-slate-100" />
                ))}
              </div>
            ) : reports && reports.length > 0 ? (
              <div className="space-y-3">
                {reports.map((report) => (
                  <Dialog key={report.id}>
                    <DialogTrigger asChild>
                      <Card className="hover:border-blue-300 transition-colors cursor-pointer group shadow-sm border-slate-200">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900">{report.studyType}</p>
                              {report.isFinalized && (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none px-1.5 py-0 text-[10px]">
                                  Finalized
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-500">
                              Date: {report.examDate ? format(new Date(report.examDate), 'MMMM d, yyyy') : 'N/A'}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0">
                      <DialogHeader className="p-6 pb-2 border-b">
                        <DialogTitle className="text-2xl font-bold text-slate-900 flex justify-between items-center">
                          <span>{report.studyType} Report</span>
                          <span className="text-sm font-normal text-slate-500">
                            {format(new Date(report.examDate), 'MMM d, yyyy')}
                          </span>
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="flex-grow p-6">
                        <div className="space-y-8 pb-8">
                          <div className="grid md:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <div>
                              <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Patient</p>
                              <p className="font-semibold text-slate-900">{report.patientName}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">DOB</p>
                              <p className="font-semibold text-slate-900">{report.patientDob}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Study Date</p>
                              <p className="font-semibold text-slate-900">{report.examDate ? format(new Date(report.examDate), 'MMM d, yyyy') : 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Indication</p>
                              <p className="font-semibold text-slate-900">{report.indication}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <h4 className="text-lg font-bold text-slate-900 mb-2 border-l-4 border-blue-600 pl-3">Findings</h4>
                              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-base">
                                {report.findings}
                              </div>
                            </div>

                            <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100">
                              <h4 className="text-lg font-bold text-blue-900 mb-2">Impression</h4>
                              <div className="text-slate-800 whitespace-pre-wrap leading-relaxed font-medium">
                                {report.impression}
                              </div>
                            </div>
                          </div>

                          <div className="pt-8 border-t text-sm text-slate-500 flex flex-col md:flex-row justify-between gap-4">
                            <div>
                              <p className="font-semibold text-slate-900">Finalized On</p>
                              <p>{report.finalizedAt ? format(new Date(report.finalizedAt), 'MMMM d, yyyy') : 'N/A'}</p>
                            </div>
                            <div className="md:text-right">
                              <p className="font-semibold text-slate-900">Clinic</p>
                              <p>{me.clinicName}</p>
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            ) : (
              <Card className="border-dashed bg-transparent border-slate-300">
                <CardContent className="p-8 text-center text-slate-500">
                  <p>No finalized reports available yet.</p>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Worksheets Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold">Your Worksheets</h3>
              <Badge variant="outline" className="ml-2 bg-slate-100 text-slate-600 border-slate-200">
                {worksheets?.length || 0}
              </Badge>
            </div>

            {isLoadingWorksheets ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse h-24 bg-slate-100" />
                ))}
              </div>
            ) : worksheets && worksheets.length > 0 ? (
              <div className="space-y-3">
                {worksheets.map((worksheet) => {
                  const ws = worksheet as any;
                  const title = ws.originalName || ws.studyType || 'Worksheet';
                  const dateStr = (() => {
                    const d = ws.uploadedAt || ws.createdAt;
                    return d ? format(new Date(d), 'MMM d, yyyy') : null;
                  })();
                  const isDigital = ws.type === 'digital';
                  const isPdf = !isDigital && ws.fileUrl?.toLowerCase().includes('.pdf');

                  return (
                    <Dialog key={worksheet.id}>
                      <DialogTrigger asChild>
                        <Card className="hover:border-blue-300 transition-colors cursor-pointer group shadow-sm border-slate-200">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="bg-blue-50 p-2 rounded-lg">
                                <ImageIcon className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{title}</p>
                                {dateStr && (
                                  <p className="text-sm text-slate-500">Date: {dateStr}</p>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                          </CardContent>
                        </Card>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
                        <DialogHeader className="p-6 pb-3 border-b flex-shrink-0">
                          <DialogTitle className="text-xl font-bold text-slate-900 flex justify-between items-center">
                            <span>{title}</span>
                            {dateStr && (
                              <span className="text-sm font-normal text-slate-500">{dateStr}</span>
                            )}
                          </DialogTitle>
                          {ws.studyType && ws.originalName && (
                            <p className="text-sm text-slate-500 mt-1">{ws.studyType}</p>
                          )}
                        </DialogHeader>
                        <div className="flex-grow overflow-auto p-4">
                          {isDigital && ws.drawingData ? (
                            <img
                              src={ws.drawingData}
                              alt={title}
                              className="w-full h-auto rounded-lg border border-slate-200"
                            />
                          ) : isPdf ? (
                            <iframe
                              src={ws.fileUrl}
                              title={title}
                              className="w-full h-[60vh] rounded-lg border border-slate-200"
                            />
                          ) : ws.fileUrl ? (
                            <img
                              src={ws.fileUrl}
                              alt={title}
                              className="w-full h-auto rounded-lg border border-slate-200"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-40 text-slate-400">
                              No preview available
                            </div>
                          )}
                        </div>
                        {!isDigital && ws.fileUrl && (
                          <div className="p-4 border-t flex-shrink-0">
                            <Button variant="outline" size="sm" asChild>
                              <a href={ws.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="w-4 h-4 mr-2" />
                                Download Original
                              </a>
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed bg-transparent border-slate-300">
                <CardContent className="p-8 text-center text-slate-500">
                  <p>No worksheets available yet.</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-xs font-medium">
          <p>© {new Date().getFullYear()} {me.clinicName}. All Rights Reserved.</p>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <p>Your data is encrypted and secure.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
