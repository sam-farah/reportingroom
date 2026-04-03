import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, LogOut, FileText, ImageIcon, ShieldCheck, ChevronRight, Download, ExternalLink, Send } from "lucide-react";
import { format } from "date-fns";
import { Report, Worksheet } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TransmittedReport {
  distributionId: number;
  reportId: number;
  studyType: string;
  examDate: string | null;
  sentAt: string;
  method: string;
  recipientName: string | null;
  hasPdf: boolean;
}

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

  const { data: transmittedReports = [], isLoading: isLoadingTransmitted } = useQuery<TransmittedReport[]>({
    queryKey: ["/api/portal/transmitted-reports"],
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

  if (!me) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-3 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
            {me.clinicLogoUrl ? (
              <img
                src={me.clinicLogoUrl}
                alt={me.clinicName}
                className="h-9 max-w-[120px] object-contain flex-shrink-0"
              />
            ) : (
              <>
                <div className="bg-blue-600 p-2 rounded-lg flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
                    Patient Portal
                  </h1>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    Secure Access
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:block text-right mr-2">
              <p className="text-sm font-semibold text-slate-900 truncate max-w-[140px]">{me.patientName}</p>
              <p className="text-xs text-slate-500 truncate max-w-[140px]">{me.clinicName}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-slate-600 border-slate-200"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <LogOut className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 sm:py-8 flex-grow">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Welcome, {me.patientFirstName}</h2>
          <p className="text-slate-500 mt-1 text-sm">
            Access your medical reports and scan worksheets securely.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 sm:gap-8">
          {/* Reports Section — shows transmitted PDFs as primary; raw report text as fallback */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <FileText className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-bold">Your Reports</h3>
              <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-700 border-blue-100 text-xs">
                {transmittedReports.length > 0 ? transmittedReports.length : (reports?.length || 0)}
              </Badge>
            </div>

            {isLoadingTransmitted || isLoadingReports ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse h-20 bg-slate-100" />
                ))}
              </div>
            ) : transmittedReports.length > 0 ? (
              <div className="space-y-3">
                {transmittedReports.map((tr) => (
                  <Card key={tr.distributionId} className="shadow-sm border-slate-200">
                    <CardContent className="p-4 flex items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900 text-sm truncate">{tr.studyType || "Report"}</p>
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none px-1.5 py-0 text-[10px] flex-shrink-0">
                            <Send className="w-2.5 h-2.5 mr-1" />
                            Sent
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {tr.examDate ? format(new Date(tr.examDate), 'MMM d, yyyy') : ''}
                          {tr.examDate && ' · '}
                          Dispatched {format(new Date(tr.sentAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                      {tr.hasPdf ? (
                        <a
                          href={`/api/portal/distributions/${tr.distributionId}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View PDF
                        </a>
                      ) : (
                        <span className="flex-shrink-0 text-xs text-slate-400 italic">no PDF</span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : reports && reports.length > 0 ? (
              <div className="space-y-3">
                {reports.map((report) => (
                  <Dialog key={report.id}>
                    <DialogTrigger asChild>
                      <Card className="hover:border-blue-300 transition-colors cursor-pointer group shadow-sm border-slate-200 active:scale-[0.99]">
                        <CardContent className="p-4 flex items-center justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-900 text-sm truncate">{report.studyType}</p>
                              {report.isFinalized && (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none px-1.5 py-0 text-[10px] flex-shrink-0">
                                  Finalized
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {report.examDate ? format(new Date(report.examDate), 'MMM d, yyyy') : 'N/A'}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                        </CardContent>
                      </Card>
                    </DialogTrigger>
                    <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
                      <DialogHeader className="px-5 py-4 border-b flex-shrink-0">
                        <DialogTitle className="text-base sm:text-xl font-bold text-slate-900 pr-6">
                          {report.studyType} Report
                          {report.examDate && (
                            <span className="block text-xs sm:text-sm font-normal text-slate-500 mt-0.5">
                              {format(new Date(report.examDate), 'MMMM d, yyyy')}
                            </span>
                          )}
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="flex-grow">
                        <div className="px-5 py-4 space-y-5 pb-8">
                          <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <div>
                              <p className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">Patient</p>
                              <p className="font-semibold text-slate-900 text-sm">{report.patientName}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">DOB</p>
                              <p className="font-semibold text-slate-900 text-sm">{report.patientDob}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">Study Date</p>
                              <p className="font-semibold text-slate-900 text-sm">
                                {report.examDate ? format(new Date(report.examDate), 'MMM d, yyyy') : 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">Indication</p>
                              <p className="font-semibold text-slate-900 text-sm">{report.indication}</p>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-base font-bold text-slate-900 mb-2 border-l-4 border-blue-600 pl-3">Findings</h4>
                              <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">{report.findings}</div>
                            </div>
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                              <h4 className="text-base font-bold text-blue-900 mb-2">Impression</h4>
                              <div className="text-slate-800 whitespace-pre-wrap leading-relaxed font-medium text-sm">{report.impression}</div>
                            </div>
                          </div>
                          <div className="pt-4 border-t text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">Finalized On</p>
                              <p>{report.finalizedAt ? format(new Date(report.finalizedAt), 'MMMM d, yyyy') : 'N/A'}</p>
                            </div>
                            <div className="sm:text-right">
                              <p className="font-semibold text-slate-900 text-sm">Clinic</p>
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
                <CardContent className="p-6 text-center text-slate-500 text-sm">
                  No reports available yet.
                </CardContent>
              </Card>
            )}
          </section>

          {/* Worksheets Section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-bold">Your Worksheets</h3>
              <Badge variant="outline" className="ml-1 bg-slate-100 text-slate-600 border-slate-200 text-xs">
                {worksheets?.length || 0}
              </Badge>
            </div>

            {isLoadingWorksheets ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse h-20 bg-slate-100" />
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
                    <Dialog key={`${ws.type}-${worksheet.id}`}>
                      <DialogTrigger asChild>
                        <Card className="hover:border-blue-300 transition-colors cursor-pointer group shadow-sm border-slate-200 active:scale-[0.99]">
                          <CardContent className="p-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="bg-blue-50 p-2 rounded-lg flex-shrink-0">
                                <ImageIcon className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 text-sm truncate">{title}</p>
                                {dateStr && (
                                  <p className="text-xs text-slate-500">{dateStr}</p>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                          </CardContent>
                        </Card>
                      </DialogTrigger>
                      <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
                        <DialogHeader className="px-5 py-4 border-b flex-shrink-0">
                          <DialogTitle className="text-base sm:text-xl font-bold text-slate-900 pr-6">
                            {title}
                            {dateStr && (
                              <span className="block text-xs sm:text-sm font-normal text-slate-500 mt-0.5">{dateStr}</span>
                            )}
                          </DialogTitle>
                          {ws.studyType && ws.originalName && (
                            <p className="text-xs text-slate-500 mt-0.5">{ws.studyType}</p>
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
                            <div className="space-y-3">
                              <iframe
                                src={ws.fileUrl}
                                title={title}
                                className="w-full h-[55vh] rounded-lg border border-slate-200 hidden sm:block"
                              />
                              <div className="sm:hidden text-center py-6 text-slate-500 text-sm bg-slate-50 rounded-lg border border-slate-200">
                                <p className="mb-3">PDF preview not available on mobile.</p>
                                <Button variant="outline" size="sm" asChild>
                                  <a href={ws.fileUrl} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4 mr-2" />
                                    Open PDF
                                  </a>
                                </Button>
                              </div>
                            </div>
                          ) : ws.fileUrl ? (
                            <img
                              src={ws.fileUrl}
                              alt={title}
                              className="w-full h-auto rounded-lg border border-slate-200"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                              No preview available
                            </div>
                          )}
                        </div>
                        {!isDigital && ws.fileUrl && (
                          <div className="px-5 py-3 border-t flex-shrink-0">
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
                <CardContent className="p-6 text-center text-slate-500 text-sm">
                  No worksheets available yet.
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-5 mt-auto">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-400 text-xs font-medium text-center">
          <p>© {new Date().getFullYear()} {me.clinicName}. All Rights Reserved.</p>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <p>Your data is encrypted and secure.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
