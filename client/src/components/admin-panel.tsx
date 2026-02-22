import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Upload, ChartLine, UserRound, History, Plus, Play, Edit, Trash2, Database, DollarSign, Activity, Building, TrendingUp, Users, FileText, Calendar, AlertTriangle, HardDrive, Download, RefreshCw, Palette, ExternalLink, Eye, Monitor, Image } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./file-upload";
import ClinicPage from "@/pages/physicians";
import type { TrainingPair, Physician, ReportTemplate, Clinic } from "@shared/schema";

export default function AdminPanel() {
  const { toast } = useToast();
  const [worksheetFile, setWorksheetFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [complexityLevel, setComplexityLevel] = useState("");
  
  // Physician editing state
  const [editingPhysician, setEditingPhysician] = useState<Physician | null>(null);
  const [isAddingPhysician, setIsAddingPhysician] = useState(false);
  const [physicianForm, setPhysicianForm] = useState({
    name: "",
    title: "",
    specialty: "",
    signatureUrl: ""
  });

  const { data: trainingPairs = [] } = useQuery<TrainingPair[]>({
    queryKey: ["/api/training"],
  });

  // System monitoring queries
  const { data: systemStats } = useQuery({
    queryKey: ["/api/admin/system-stats"],
  });

  const { data: clinicStats = [] } = useQuery({
    queryKey: ["/api/admin/clinic-stats"],
  });

  const { data: costProjection } = useQuery({
    queryKey: ["/api/admin/cost-projection"],
  });

  const { data: physicians = [] } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
  });

  const { data: backupInfo, refetch: refetchBackupInfo } = useQuery<{
    lastBackupDate: string | null;
    totalFilesAvailable: number;
    filesSinceLastBackup: number;
  }>({
    queryKey: ["/api/backup/info"],
  });

  const { data: templates = [] } = useQuery<ReportTemplate[]>({
    queryKey: ["/api/templates"],
  });

  const [isDownloading, setIsDownloading] = useState(false);

  // Kiosk settings state
  const kioskLogoInputRef = useRef<HTMLInputElement>(null);
  const [kioskUploadingLogo, setKioskUploadingLogo] = useState(false);
  const [kioskWelcomeText, setKioskWelcomeText] = useState("");
  const [kioskInstructions, setKioskInstructions] = useState("");
  const [kioskSuccessMessage, setKioskSuccessMessage] = useState("");
  const [kioskBackgroundColor, setKioskBackgroundColor] = useState("");
  const [kioskSettingsLoaded, setKioskSettingsLoaded] = useState(false);

  const { data: clinic } = useQuery<Clinic>({
    queryKey: ["/api/clinic"],
  });

  useEffect(() => {
    if (clinic && !kioskSettingsLoaded) {
      setKioskWelcomeText(clinic.kioskWelcomeText || "");
      setKioskInstructions(clinic.kioskInstructions || "");
      setKioskSuccessMessage(clinic.kioskSuccessMessage || "");
      setKioskBackgroundColor(clinic.kioskBackgroundColor || "");
      setKioskSettingsLoaded(true);
    }
  }, [clinic, kioskSettingsLoaded]);

  const handleKioskLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image file (JPG, PNG, GIF, WebP, or SVG)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setKioskUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await fetch('/api/upload-kiosk-logo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Upload failed');
      
      toast({ title: "Logo Uploaded", description: "Kiosk logo has been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk/settings"] });
    } catch (error) {
      toast({ title: "Upload Failed", description: "Failed to upload logo", variant: "destructive" });
    } finally {
      setKioskUploadingLogo(false);
      if (kioskLogoInputRef.current) kioskLogoInputRef.current.value = '';
    }
  };

  const saveKioskSettingsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/kiosk/settings", "PUT", {
        kioskWelcomeText,
        kioskInstructions,
        kioskSuccessMessage,
        kioskBackgroundColor,
      });
    },
    onSuccess: () => {
      toast({ title: "Settings Saved", description: "Kiosk settings have been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDownloadBackup = async (type: 'all' | 'changes') => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/backup/download?type=${type}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      a.download = type === 'all' 
        ? `patient-files-backup-${timestamp}.zip`
        : `patient-files-changes-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download Complete",
        description: type === 'all' 
          ? "All patient files have been downloaded"
          : "Changed files since last backup have been downloaded"
      });
      
      refetchBackupInfo();
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download backup",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const uploadTrainingMutation = useMutation({
    mutationFn: async () => {
      if (!worksheetFile || !reportFile || !category || !complexityLevel) {
        throw new Error("Please fill in all fields and upload both files");
      }

      const formData = new FormData();
      formData.append('worksheet', worksheetFile);
      formData.append('report', reportFile);
      formData.append('category', category);
      formData.append('complexityLevel', complexityLevel);

      const response = await fetch('/api/training', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Training Data Added",
        description: "Worksheet-report pair uploaded successfully",
      });
      setWorksheetFile(null);
      setReportFile(null);
      setCategory("");
      setComplexityLevel("");
      queryClient.invalidateQueries({ queryKey: ["/api/training"] });
    },
    onError: (error: Error) => {
      console.error('Training upload error:', error);
      
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload training data",
        variant: "destructive",
      });
    },
  });

  const handleWorksheetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image (JPG, PNG, GIF, WebP) or PDF file",
          variant: "destructive",
        });
        return;
      }
      
      setWorksheetFile(file);
    }
  };

  const handleReportUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file type
      const allowedTypes = [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 
        'image/png', 
        'image/gif', 
        'image/webp'
      ];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF, DOC, DOCX, or image file",
          variant: "destructive",
        });
        return;
      }
      
      setReportFile(file);
    }
  };

  // Physician mutations
  const createPhysicianMutation = useMutation({
    mutationFn: async (physician: typeof physicianForm) => {
      const response = await fetch('/api/physicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(physician),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Physician Added",
        description: "New physician added successfully",
      });
      setIsAddingPhysician(false);
      setPhysicianForm({ name: "", title: "", specialty: "", signatureUrl: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({
        title: "Failed to Add Physician",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePhysicianMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: typeof physicianForm }) => {
      const response = await fetch(`/api/physicians/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Physician Updated",
        description: "Physician information updated successfully",
      });
      setEditingPhysician(null);
      setPhysicianForm({ name: "", title: "", specialty: "", signatureUrl: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({
        title: "Failed to Update Physician",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePhysicianMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/physicians/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Physician Deleted",
        description: "Physician removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({
        title: "Failed to Delete Physician",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditPhysician = (physician: Physician) => {
    setEditingPhysician(physician);
    setPhysicianForm({
      name: physician.name,
      title: physician.title,
      specialty: physician.specialty,
      signatureUrl: physician.signatureUrl || ""
    });
  };

  const handleSavePhysician = () => {
    if (!physicianForm.name || !physicianForm.title || !physicianForm.specialty) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (editingPhysician) {
      updatePhysicianMutation.mutate({ id: editingPhysician.id, updates: physicianForm });
    } else {
      createPhysicianMutation.mutate(physicianForm);
    }
  };

  const handleCancelEdit = () => {
    setEditingPhysician(null);
    setIsAddingPhysician(false);
    setPhysicianForm({ name: "", title: "", specialty: "", signatureUrl: "" });
  };

  const handleDeletePhysician = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      deletePhysicianMutation.mutate(id);
    }
  };

  const handleAddTrainingPair = () => {
    console.log('Starting training upload with:', {
      worksheetFile: worksheetFile?.name,
      reportFile: reportFile?.name,
      category,
      complexityLevel
    });
    
    if (!worksheetFile || !reportFile || !category || !complexityLevel) {
      toast({
        title: "Missing Information",
        description: "Please upload both files and select category and complexity level",
        variant: "destructive",
      });
      return;
    }
    
    uploadTrainingMutation.mutate();
  };

  // Mock training progress data
  const trainingProgress = 78;
  const modelAccuracy = 94.2;
  const lastTraining = "2 hours ago";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Webmaster Admin Panel</h1>
        <p className="text-gray-600">System monitoring, cost analysis, and AI training management</p>
      </div>

      <Tabs defaultValue="monitoring" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="clinic-settings">🏥 Clinic</TabsTrigger>
          <TabsTrigger value="monitoring">System Monitoring</TabsTrigger>
          <TabsTrigger value="clinics">Clinic Analytics</TabsTrigger>
          <TabsTrigger value="costs">Cost Projection</TabsTrigger>
          <TabsTrigger value="training">🌍 Global AI Training</TabsTrigger>
          <TabsTrigger value="templates">📝 Report Templates</TabsTrigger>
          <TabsTrigger value="kiosk">🖥️ Kiosk</TabsTrigger>
          <TabsTrigger value="backup">💾 Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic-settings">
          <ClinicPage />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Database Size</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.databaseSize || '0'} GB</div>
                <p className="text-xs text-muted-foreground">+{systemStats?.monthlyGrowth || '0'}% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.activeUsers || 0}</div>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.totalReports || 0}</div>
                <p className="text-xs text-muted-foreground">{systemStats?.reportsThisMonth || 0} this month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Status</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Healthy</div>
                <p className="text-xs text-muted-foreground">Encryption: Active</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Storage Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Report Data</span>
                    <span className="text-sm font-medium">{systemStats?.reportDataSize || '0'} GB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${systemStats?.reportDataPercent || 0}%` }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Worksheet Files</span>
                    <span className="text-sm font-medium">{systemStats?.worksheetFilesSize || '0'} GB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: `${systemStats?.worksheetFilesPercent || 0}%` }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">User Data</span>
                    <span className="text-sm font-medium">{systemStats?.userDataSize || '0'} GB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-yellow-600 h-2 rounded-full" style={{ width: `${systemStats?.userDataPercent || 0}%` }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Average Response Time</span>
                  <span className="text-sm font-medium">{systemStats?.avgResponseTime || '0'}ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">API Success Rate</span>
                  <span className="text-sm font-medium text-green-600">{systemStats?.apiSuccessRate || '0'}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Encryption Overhead</span>
                  <span className="text-sm font-medium">{systemStats?.encryptionOverhead || '0'}ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Daily Backups</span>
                  <span className="text-sm font-medium text-green-600">✓ Active</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clinics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Clinics Overview</CardTitle>
              <p className="text-sm text-muted-foreground">Clinic activity and report generation statistics</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {clinicStats.length > 0 ? (
                  clinicStats.map((clinic: any) => (
                    <div key={clinic.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Building className="h-8 w-8 text-blue-600" />
                        <div>
                          <h3 className="font-medium">{clinic.name}</h3>
                          <p className="text-sm text-muted-foreground">{clinic.location}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-8 text-sm">
                        <div className="text-center">
                          <p className="font-medium">{clinic.reportsLast30Days}</p>
                          <p className="text-muted-foreground">Reports (30d)</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{clinic.activeUsers}</p>
                          <p className="text-muted-foreground">Active Users</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{clinic.lastUsed}</p>
                          <p className="text-muted-foreground">Last Active</p>
                        </div>
                        <div className="text-center">
                          <p className={`font-medium ${clinic.status === 'Active' ? 'text-green-600' : 'text-yellow-600'}`}>
                            {clinic.status}
                          </p>
                          <p className="text-muted-foreground">Status</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">No clinic data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Current Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${costProjection?.currentMonth || '0'}</div>
                <p className="text-sm text-muted-foreground">Database + Storage</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Projected Next Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${costProjection?.nextMonth || '0'}</div>
                <p className="text-sm text-muted-foreground">Based on growth trend</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Cost Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{costProjection?.alerts || 0}</div>
                <p className="text-sm text-muted-foreground">Threshold warnings</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Neon PostgreSQL</span>
                  <span className="text-sm font-medium">${costProjection?.databaseCost || '0'}/month</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">File Storage</span>
                  <span className="text-sm font-medium">${costProjection?.storageCost || '0'}/month</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">OpenAI API Usage</span>
                  <span className="text-sm font-medium">${costProjection?.aiCost || '0'}/month</span>
                </div>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between font-medium">
                  <span>Total Estimated</span>
                  <span>${costProjection?.totalEstimated || '0'}/month</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Optimization Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {costProjection?.recommendations?.map((rec: string, index: number) => (
                <div key={index} className="flex items-start space-x-2">
                  <TrendingUp className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">{rec}</span>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground">No recommendations available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Training Data Upload */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              <Brain className="medical-text-primary mr-2 inline" />
              Training Data Upload
            </h2>
            
            <div className="space-y-6">
              {/* Worksheet Upload */}
              <div>
                <Label>Worksheet (Images & PDFs)</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[var(--medical-primary)] transition-colors cursor-pointer mt-2">
                  <Upload className="text-2xl text-gray-400 mb-2 mx-auto" />
                  <p className="text-sm text-gray-600 mb-2">Upload worksheet example</p>
                  <p className="text-xs text-gray-500 mb-3">Supports: JPG, PNG, GIF, WebP, PDF</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,image/*,application/pdf"
                    onChange={(e) => setWorksheetFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="worksheet-upload"
                  />
                  <Label htmlFor="worksheet-upload" className="medical-text-primary hover:underline cursor-pointer">
                    Choose File
                  </Label>
                  {worksheetFile && (
                    <div className="mt-2 p-2 bg-gray-50 rounded border">
                      <p className="text-xs text-gray-700 font-medium">{worksheetFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(worksheetFile.size / 1024 / 1024).toFixed(2)} MB • {worksheetFile.type}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Report Upload */}
              <div>
                <Label>Corresponding Report (Images & Documents)</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[var(--medical-primary)] transition-colors cursor-pointer mt-2">
                  <Upload className="text-2xl text-gray-400 mb-2 mx-auto" />
                  <p className="text-sm text-gray-600 mb-2">Upload corresponding report</p>
                  <p className="text-xs text-gray-500 mb-3">Supports: PDF, DOC, DOCX, JPG, PNG</p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="report-upload"
                  />
                  <Label htmlFor="report-upload" className="medical-text-primary hover:underline cursor-pointer">
                    Choose File
                  </Label>
                  {reportFile && (
                    <div className="mt-2 p-2 bg-gray-50 rounded border">
                      <p className="text-xs text-gray-700 font-medium">{reportFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(reportFile.size / 1024 / 1024).toFixed(2)} MB • {reportFile.type}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Scan Type</Label>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select scan type</option>
                    <option value="Lower Limb Venous">Lower Limb Venous</option>
                    <option value="Upper Limb Venous">Upper Limb Venous</option>
                    <option value="Lower Limb Arterial">Lower Limb Arterial</option>
                    <option value="Upper Limb Arterial">Upper Limb Arterial</option>
                    <option value="Carotid Duplex">Carotid Duplex</option>
                    <option value="Vertebral Duplex">Vertebral Duplex</option>
                    <option value="Abdominal Aorta">Abdominal Aorta</option>
                    <option value="Renal Duplex">Renal Duplex</option>
                    <option value="Mesenteric Duplex">Mesenteric Duplex</option>
                    <option value="DVT Assessment">DVT Assessment</option>
                    <option value="AV Fistula/Graft">AV Fistula/Graft</option>
                    <option value="Post Endovenous Intervention">Post Endovenous Intervention</option>
                    <option value="Transcranial Doppler">Transcranial Doppler</option>
                  </select>
                </div>
                <div>
                  <Label>Clinical Finding</Label>
                  <select 
                    value={complexityLevel}
                    onChange={(e) => setComplexityLevel(e.target.value)}
                    className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select finding type</option>
                    <option value="normal">Normal Study</option>
                    <option value="abnormal">Abnormal Findings</option>
                    <option value="complex">Complex Pathology</option>
                  </select>
                </div>
              </div>

              <Button 
                onClick={handleAddTrainingPair}
                disabled={uploadTrainingMutation.isPending}
                className="w-full bg-[var(--medical-primary)] hover:bg-[var(--medical-primary)]/90"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadTrainingMutation.isPending ? "Uploading..." : "Upload Training Pair"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Training Data History */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              <Database className="medical-text-primary mr-2 inline" />
              🌍 Global Training Data History
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Scan Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Finding</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {trainingPairs.map((pair) => (
                    <tr key={pair.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900">
                        {pair.uploadedAt ? new Date(pair.uploadedAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-gray-700">{pair.category}</td>
                      <td className="py-3 px-4 text-gray-700">{pair.complexityLevel}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-[var(--medical-success)] bg-opacity-10 text-[var(--medical-success)] rounded-full text-xs">
                          Complete
                        </span>
                      </td>
                    </tr>
                  ))}
                  {trainingPairs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500">
                        No training data uploaded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Report Template Customization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-blue-900 mb-2">About Report Templates</h4>
                <p className="text-sm text-blue-800">
                  Customize how your ultrasound reports look when exported to PDF or DOCX. Configure headers, 
                  footers, clinic branding, section visibility, fonts, and colors. Templates ensure consistent 
                  professional appearance across all your reports.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Active Templates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{templates.length}</div>
                    <p className="text-xs text-muted-foreground">custom report layouts</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Default Template</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold truncate">
                      {templates.find(t => t.isDefault)?.name || 'None set'}
                    </div>
                    <p className="text-xs text-muted-foreground">used for new reports</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Template Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">PDF</span>
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">DOCX</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">export formats</p>
                  </CardContent>
                </Card>
              </div>

              {templates.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Features</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {templates.map((template) => (
                        <tr key={template.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{template.name}</div>
                            {template.description && (
                              <div className="text-xs text-gray-500">{template.description}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded ${
                              template.templateType === 'pdf' ? 'bg-blue-100 text-blue-800' :
                              template.templateType === 'docx' ? 'bg-green-100 text-green-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {template.templateType === 'both' ? 'PDF & DOCX' : template.templateType.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {template.isDefault ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded font-medium">
                                Default
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {template.showLogo && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Logo</span>}
                              {template.showHeader && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Header</span>}
                              {template.showFooter && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Footer</span>}
                              {template.showSignature && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Signature</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href="/templates">
                              <Button size="sm" variant="outline">
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <Palette className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No Templates Created</h3>
                  <p className="text-gray-500 mb-4">Create your first report template to customize how reports look</p>
                  <Link href="/templates">
                    <Button className="medical-btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Template
                    </Button>
                  </Link>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Link href="/templates">
                  <Button className="medical-btn-primary">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Full Template Editor
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kiosk" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Kiosk Logo
                </CardTitle>
                <p className="text-sm text-muted-foreground">Upload a logo to display on the patient check-in kiosk screen</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {clinic?.kioskLogoUrl ? (
                  <div className="border rounded-lg p-4 bg-gray-50 flex flex-col items-center gap-4">
                    <img
                      src={clinic.kioskLogoUrl}
                      alt="Kiosk Logo"
                      className="max-h-32 max-w-full object-contain"
                    />
                    <p className="text-sm text-muted-foreground">Current kiosk logo</p>
                  </div>
                ) : clinic?.logoUrl ? (
                  <div className="border rounded-lg p-4 bg-gray-50 flex flex-col items-center gap-4">
                    <img
                      src={clinic.logoUrl}
                      alt="Clinic Logo (fallback)"
                      className="max-h-32 max-w-full object-contain"
                    />
                    <p className="text-sm text-muted-foreground">Using clinic logo as fallback. Upload a specific kiosk logo below.</p>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No kiosk logo uploaded yet</p>
                    <p className="text-xs mt-1">Upload an image to display on the kiosk</p>
                  </div>
                )}

                <div>
                  <input
                    ref={kioskLogoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleKioskLogoUpload}
                    className="hidden"
                  />
                  <Button
                    onClick={() => kioskLogoInputRef.current?.click()}
                    disabled={kioskUploadingLogo}
                    className="w-full"
                  >
                    {kioskUploadingLogo ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    {kioskUploadingLogo ? "Uploading..." : clinic?.kioskLogoUrl ? "Change Logo" : "Upload Logo"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Live Preview
                </CardTitle>
                <p className="text-sm text-muted-foreground">Preview how the kiosk will look to patients</p>
              </CardHeader>
              <CardContent>
                <div
                  className="rounded-lg p-6 text-center border shadow-inner min-h-[280px] flex flex-col items-center justify-center"
                  style={{ background: kioskBackgroundColor || 'linear-gradient(to bottom right, #f0fdfa, #eff6ff)' }}
                >
                  {(clinic?.kioskLogoUrl || clinic?.logoUrl) && (
                    <img
                      src={clinic.kioskLogoUrl || clinic.logoUrl || ''}
                      alt="Logo Preview"
                      className="max-h-16 max-w-[200px] object-contain mb-4"
                    />
                  )}
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    {kioskWelcomeText || "Patient Check-In"}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {kioskInstructions || "Enter your name below to check in for your appointment"}
                  </p>
                  <div className="bg-white rounded-xl p-3 w-full max-w-xs border shadow-sm">
                    <span className="text-gray-400 text-sm">Type your name here...</span>
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/kiosk', '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open Kiosk in New Tab
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Kiosk Text & Appearance
              </CardTitle>
              <p className="text-sm text-muted-foreground">Customize the text and colors shown on the kiosk screen</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="kioskWelcomeText">Welcome Heading</Label>
                  <Input
                    id="kioskWelcomeText"
                    value={kioskWelcomeText}
                    onChange={(e) => setKioskWelcomeText(e.target.value)}
                    placeholder="Patient Check-In"
                  />
                  <p className="text-xs text-muted-foreground">The main heading patients see on the kiosk</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kioskBackgroundColor">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="kioskBackgroundColor"
                      value={kioskBackgroundColor}
                      onChange={(e) => setKioskBackgroundColor(e.target.value)}
                      placeholder="e.g. #f0fdfa or linear-gradient(...)"
                    />
                    <input
                      type="color"
                      value={kioskBackgroundColor.startsWith('#') ? kioskBackgroundColor : '#f0fdfa'}
                      onChange={(e) => setKioskBackgroundColor(e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">CSS color or gradient for the kiosk background</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kioskInstructions">Instructions Text</Label>
                <Textarea
                  id="kioskInstructions"
                  value={kioskInstructions}
                  onChange={(e) => setKioskInstructions(e.target.value)}
                  placeholder="Enter your name below to check in for your appointment"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">Instructions shown below the heading</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kioskSuccessMessage">Success Message</Label>
                <Textarea
                  id="kioskSuccessMessage"
                  value={kioskSuccessMessage}
                  onChange={(e) => setKioskSuccessMessage(e.target.value)}
                  placeholder="Please take a seat. We will call you shortly."
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">Message shown after a patient successfully checks in</p>
              </div>

              <Button
                onClick={() => saveKioskSettingsMutation.mutate()}
                disabled={saveKioskSettingsMutation.isPending}
                className="w-full"
                size="lg"
              >
                {saveKioskSettingsMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Save Kiosk Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Patient Files Backup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Files Available</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{backupInfo?.totalFilesAvailable || 0}</div>
                    <p className="text-xs text-muted-foreground">worksheets, reports, documents</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Files Since Last Backup</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{backupInfo?.filesSinceLastBackup || 0}</div>
                    <p className="text-xs text-muted-foreground">new or modified files</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Last Backup</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold">
                      {backupInfo?.lastBackupDate 
                        ? new Date(backupInfo.lastBackupDate).toLocaleDateString()
                        : 'Never'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {backupInfo?.lastBackupDate 
                        ? new Date(backupInfo.lastBackupDate).toLocaleTimeString()
                        : 'No backup taken yet'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => handleDownloadBackup('all')}
                  disabled={isDownloading || !backupInfo?.totalFilesAvailable}
                  className="flex-1"
                  size="lg"
                >
                  {isDownloading ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download All Files
                </Button>
                
                <Button
                  onClick={() => handleDownloadBackup('changes')}
                  disabled={isDownloading || !backupInfo?.filesSinceLastBackup}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  {isDownloading ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download Changes Only
                </Button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Backup Information</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Download All Files:</strong> Creates a complete backup of all patient files</li>
                  <li>• <strong>Download Changes Only:</strong> Downloads only files created or modified since your last backup</li>
                  <li>• Files are organized by patient name in the ZIP archive</li>
                  <li>• Includes worksheets, reports (as JSON), documents, and digital worksheets</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
