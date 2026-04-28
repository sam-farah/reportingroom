import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Upload, ChartLine, UserRound, History, Plus, Play, Edit, Trash2, Database, DollarSign, Activity, Building, TrendingUp, Users, FileText, Calendar, AlertTriangle, HardDrive, Download, RefreshCw, Palette, ExternalLink, Eye, Monitor, Image, CheckCircle, Loader2, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
import type { TrainingPair, Physician, ReportTemplate, Clinic, ScanTypeContentTemplate, WorksheetTemplate, BugReport } from "@shared/schema";
import { CANONICAL_SCAN_TYPES } from "@shared/schema";
import ScanDurationsTab from "./scan-durations-tab";

export default function AdminPanel({ onNavigateToTemplates }: { onNavigateToTemplates?: () => void }) {
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
  const { data: systemStats } = useQuery<{
    databaseSize: string; monthlyGrowth: string; activeUsers: number;
    totalReports: number; reportsThisMonth: number; reportDataSize: string;
    reportDataPercent: number; worksheetFilesSize: string; worksheetFilesPercent: number;
    userDataSize: string; userDataPercent: number; avgResponseTime: number;
    apiSuccessRate: number; encryptionOverhead: number;
  }>({
    queryKey: ["/api/admin/system-stats"],
  });

  const { data: clinicStats = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/clinic-stats"],
  });

  const { data: costProjection } = useQuery<{
    currentMonth: string; nextMonth: string; alerts: number;
    databaseCost: string; storageCost: string; aiCost: string;
    totalEstimated: string; recommendations: string[];
  }>({
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

  // Dictation vocabulary state
  const [newVocabWord, setNewVocabWord] = useState("");
  const { data: vocabData } = useQuery<{ words: string[] }>({
    queryKey: ["/api/clinic/dictation-vocabulary"],
  });
  const vocabWords = vocabData?.words ?? [];
  const saveVocabMutation = useMutation({
    mutationFn: (words: string[]) => apiRequest("/api/clinic/dictation-vocabulary", "PUT", { words }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/dictation-vocabulary"] });
      toast({ title: "Vocabulary saved", description: "Custom words updated for voice dictation." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // Reminder instructions state
  const [reminderInstructionsText, setReminderInstructionsText] = useState<string | null>(null);
  const { data: clinicInfoForReminder } = useQuery<any>({
    queryKey: ["/api/clinic"],
  });
  // Sync textarea with fetched clinic data
  const resolvedReminderInstructions = reminderInstructionsText ?? (clinicInfoForReminder?.reminderInstructions ?? "");
  const saveReminderMutation = useMutation({
    mutationFn: (instructions: string) => apiRequest("/api/clinic/reminder-instructions", "PUT", { instructions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      toast({ title: "Saved", description: "Default reminder instructions updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // Per-scan-type prep instructions state
  const { data: scanPrepRows = [] } = useQuery<{ id: number; scanType: string; instructions: string }[]>({
    queryKey: ["/api/scan-prep-instructions"],
  });
  const [editingScanType, setEditingScanType] = useState<string | null>(null);
  const [scanPrepDraft, setScanPrepDraft] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newScanType, setNewScanType] = useState("");
  const [newScanPrepDraft, setNewScanPrepDraft] = useState("");
  const saveScanPrepMutation = useMutation({
    mutationFn: ({ scanType, instructions }: { scanType: string; instructions: string }) =>
      apiRequest("/api/scan-prep-instructions", "PUT", { scanType, instructions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-prep-instructions"] });
      setEditingScanType(null);
      setAddingNew(false);
      setNewScanType("");
      setNewScanPrepDraft("");
      toast({ title: "Saved", description: "Scan-specific instructions updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });
  const deleteScanPrepMutation = useMutation({
    mutationFn: (scanType: string) =>
      apiRequest("/api/scan-prep-instructions", "PUT", { scanType, instructions: "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-prep-instructions"] });
      toast({ title: "Deleted", description: "Scan-specific instructions removed." });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  // Content Templates state
  const [selectedScanType, setSelectedScanType] = useState<string>("");
  const [ctIndication, setCtIndication] = useState("");
  const [ctFindings, setCtFindings] = useState("");
  const [ctImpression, setCtImpression] = useState("");
  const [showAddCustomType, setShowAddCustomType] = useState(false);
  const [newCustomTypeName, setNewCustomTypeName] = useState("");

  const { data: contentTemplates = [] } = useQuery<ScanTypeContentTemplate[]>({
    queryKey: ["/api/content-templates"],
  });

  // Blank worksheet templates state
  const [wsName, setWsName] = useState("");
  const [wsDescription, setWsDescription] = useState("");
  const [wsCategory, setWsCategory] = useState("");
  const [wsFile, setWsFile] = useState<File | null>(null);
  const [wsUploading, setWsUploading] = useState(false);
  const wsFileRef = useRef<HTMLInputElement>(null);

  const { data: blankWorksheets = [], refetch: refetchBlankWorksheets } = useQuery<WorksheetTemplate[]>({
    queryKey: ["/api/worksheet-templates"],
  });

  const deleteBlankWorksheetMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/worksheet-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worksheet-templates"] });
      toast({ title: "Deleted", description: "Blank worksheet removed." });
    },
  });

  const updateBlankWorksheetMutation = useMutation({
    mutationFn: (vars: { id: number; patch: Partial<{ name: string; description: string; category: string; isPinned: boolean }> }) =>
      apiRequest(`/api/worksheet-templates/${vars.id}`, "PATCH", vars.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worksheet-templates"] });
    },
  });

  const [editingWorksheet, setEditingWorksheet] = useState<WorksheetTemplate | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "" });

  const handleUploadBlankWorksheet = async () => {
    if (!wsFile || !wsName || !wsCategory) return;
    setWsUploading(true);
    try {
      const formData = new FormData();
      formData.append("worksheetFile", wsFile);
      formData.append("name", wsName);
      formData.append("description", wsDescription);
      formData.append("category", wsCategory);
      const res = await fetch("/api/worksheet-templates", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/worksheet-templates"] });
      setWsName(""); setWsDescription(""); setWsCategory(""); setWsFile(null);
      if (wsFileRef.current) wsFileRef.current.value = "";
      toast({ title: "Uploaded", description: `"${wsName}" added as a blank worksheet.` });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the worksheet.", variant: "destructive" });
    } finally {
      setWsUploading(false);
    }
  };

  const saveTemplateMutation = useMutation({
    mutationFn: (data: { scanType: string; indicationTemplate: string; findingsTemplate: string; impressionTemplate: string }) =>
      apiRequest(`/api/content-templates/${encodeURIComponent(data.scanType)}`, "PUT", {
        indicationTemplate: data.indicationTemplate,
        findingsTemplate: data.findingsTemplate,
        impressionTemplate: data.impressionTemplate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-templates"] });
      toast({ title: "Template saved", description: "Content template updated successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save template.", variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (scanType: string) => apiRequest(`/api/content-templates/${encodeURIComponent(scanType)}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-templates"] });
      setCtIndication(""); setCtFindings(""); setCtImpression("");
      toast({ title: "Template cleared", description: "Content template removed." });
    },
    onError: () => toast({ title: "Error", description: "Failed to clear template.", variant: "destructive" }),
  });

  // Kiosk settings state
  const kioskLogoInputRef = useRef<HTMLInputElement>(null);
  const [kioskUploadingLogo, setKioskUploadingLogo] = useState(false);
  const [kioskWelcomeText, setKioskWelcomeText] = useState("");
  const [kioskInstructions, setKioskInstructions] = useState("");
  const [kioskSuccessMessage, setKioskSuccessMessage] = useState("");
  const [kioskBackgroundColor, setKioskBackgroundColor] = useState("");
  const [kioskConsentText, setKioskConsentText] = useState("");
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
      setKioskConsentText((clinic as any).kioskConsentText || "");
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
        kioskConsentText,
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

      <Tabs defaultValue="monitoring" orientation="vertical" className="flex gap-6 items-start">
        {/* Left sidebar nav */}
        <TabsList className="flex flex-col w-52 flex-shrink-0 h-auto bg-muted rounded-xl p-2 gap-0.5" style={{ height: 'auto' }}>
          <TabsTrigger value="clinic-settings" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🏥 Clinic Settings</TabsTrigger>
          <TabsTrigger value="scan-durations" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">⏱️ Scan Durations</TabsTrigger>
          <TabsTrigger value="monitoring" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">📊 System Monitoring</TabsTrigger>
          <TabsTrigger value="wait-analytics" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">⏳ Wait Analytics</TabsTrigger>
          <TabsTrigger value="clinics" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🏢 Clinic Analytics</TabsTrigger>
          <TabsTrigger value="costs" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">💰 Cost Projection</TabsTrigger>
          <TabsTrigger value="training" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🌍 Global AI Training</TabsTrigger>
          <TabsTrigger value="content-templates" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">📋 Content Templates</TabsTrigger>
          <TabsTrigger value="templates" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🎨 Report Design</TabsTrigger>
          <TabsTrigger value="blank-worksheets" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🗂️ Blank Worksheets</TabsTrigger>
          <TabsTrigger value="kiosk" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🖥️ Kiosk</TabsTrigger>
          <TabsTrigger value="referral-system" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🔗 Referral System</TabsTrigger>
          <TabsTrigger value="backup" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">💾 Backup</TabsTrigger>
          <TabsTrigger value="bug-reports" className="w-full justify-start gap-2 px-3 py-2.5 text-sm">🐛 Bug Reports</TabsTrigger>
        </TabsList>

        {/* Right content area */}
        <div className="flex-1 min-w-0">

        <TabsContent value="clinic-settings" className="space-y-6">
          <ClinicPage />

          {/* Dictation Vocabulary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span>🎤</span> Voice Dictation — Custom Vocabulary
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Add specialist terms, drug names, or anatomical phrases that the speech recognition should know. These words are passed to Whisper to improve transcription accuracy for your clinic's specific terminology.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Word list */}
              <div className="flex flex-wrap gap-2 min-h-[40px]">
                {vocabWords.length === 0 && (
                  <span className="text-sm text-muted-foreground italic">No custom words yet.</span>
                )}
                {vocabWords.map((word, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-full px-3 py-1">
                    {word}
                    <button
                      onClick={() => saveVocabMutation.mutate(vocabWords.filter((_, idx) => idx !== i))}
                      className="ml-1 text-blue-400 hover:text-blue-700 transition-colors"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Add word input */}
              <div className="flex gap-2">
                <input
                  value={newVocabWord}
                  onChange={(e) => setNewVocabWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newVocabWord.trim()) {
                      const word = newVocabWord.trim();
                      if (!vocabWords.includes(word)) {
                        saveVocabMutation.mutate([...vocabWords, word]);
                      }
                      setNewVocabWord("");
                    }
                  }}
                  placeholder="e.g. saphenofemoral junction, endovenous ablation, Valsalva…"
                  className="flex-1 text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const word = newVocabWord.trim();
                    if (word && !vocabWords.includes(word)) {
                      saveVocabMutation.mutate([...vocabWords, word]);
                    }
                    setNewVocabWord("");
                  }}
                  disabled={!newVocabWord.trim() || saveVocabMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Press Enter or click Add. Each entry can be a single word or a multi-word phrase.</p>
            </CardContent>
          </Card>

          {/* Per-Scan-Type Preparation Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span>📋</span> Appointment Reminder — Per-Scan-Type Preparation Instructions
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Set specific preparation instructions for each scan type. When a reminder email is sent, these instructions take priority over the default instructions below. Leave a scan type unconfigured to fall back to the default.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Configured scan types list */}
              {scanPrepRows.length === 0 && !addingNew && (
                <p className="text-sm text-muted-foreground italic">No scan-specific instructions configured yet.</p>
              )}
              {scanPrepRows.map((row) => (
                <div key={row.scanType} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{row.scanType}</span>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingScanType(row.scanType);
                          setScanPrepDraft(row.instructions);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteScanPrepMutation.mutate(row.scanType)}
                        disabled={deleteScanPrepMutation.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  {editingScanType === row.scanType ? (
                    <div className="space-y-2">
                      <textarea
                        value={scanPrepDraft}
                        onChange={(e) => setScanPrepDraft(e.target.value)}
                        rows={4}
                        className="w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setEditingScanType(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          onClick={() => saveScanPrepMutation.mutate({ scanType: row.scanType, instructions: scanPrepDraft })}
                          disabled={saveScanPrepMutation.isPending}
                        >
                          {saveScanPrepMutation.isPending ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-3">{row.instructions}</p>
                  )}
                </div>
              ))}

              {/* Add new scan type */}
              {addingNew ? (
                <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                  <Select value={newScanType} onValueChange={setNewScanType}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select a scan type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CANONICAL_SCAN_TYPES
                        .filter((st) => !scanPrepRows.some((r) => r.scanType === st.name))
                        .map((st) => (
                          <SelectItem key={st.name} value={st.name}>{st.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <textarea
                    value={newScanPrepDraft}
                    onChange={(e) => setNewScanPrepDraft(e.target.value)}
                    placeholder={"e.g.\n• Please fast for 4 hours before your appointment.\n• Wear comfortable, loose-fitting clothing."}
                    rows={4}
                    className="w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewScanType(""); setNewScanPrepDraft(""); }}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!newScanType || !newScanPrepDraft.trim()) return;
                        saveScanPrepMutation.mutate({ scanType: newScanType, instructions: newScanPrepDraft.trim() });
                      }}
                      disabled={saveScanPrepMutation.isPending || !newScanType || !newScanPrepDraft.trim()}
                    >
                      {saveScanPrepMutation.isPending ? "Saving…" : "Add Instructions"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddingNew(true)}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Scan-Type Instructions
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Default / Fallback Appointment Reminder Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span>📧</span> Appointment Reminder — Default Preparation Instructions
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                These instructions are used as a fallback in reminder emails when no scan-specific instructions are configured above. Leave blank to omit this section from the email.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={resolvedReminderInstructions}
                onChange={(e) => setReminderInstructionsText(e.target.value)}
                placeholder={"e.g.\n• Please fast for 4 hours before your ultrasound.\n• Wear comfortable, loose-fitting clothing.\n• Drink 1 litre of water 1 hour before your appointment and do not empty your bladder."}
                rows={6}
                className="w-full text-sm border rounded-md px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => saveReminderMutation.mutate(resolvedReminderInstructions)}
                  disabled={saveReminderMutation.isPending}
                >
                  {saveReminderMutation.isPending ? "Saving…" : "Save Default Instructions"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan-durations">
          <ScanDurationsTab />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Database Size</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.databaseSize || '0 B'}</div>
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
                    <span className="text-sm font-medium">{systemStats?.reportDataSize || '0 B'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${systemStats?.reportDataPercent || 0}%` }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Worksheet Files</span>
                    <span className="text-sm font-medium">{systemStats?.worksheetFilesSize || '0 B'}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: `${systemStats?.worksheetFilesPercent || 0}%` }}></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">User Data</span>
                    <span className="text-sm font-medium">{systemStats?.userDataSize || '0 B'}</span>
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
                  <span className="text-sm font-medium">{systemStats?.avgResponseTime ? (typeof systemStats.avgResponseTime === 'number' ? `${systemStats.avgResponseTime}ms` : systemStats.avgResponseTime) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">API Success Rate</span>
                  <span className="text-sm font-medium text-green-600">{systemStats?.apiSuccessRate ? (typeof systemStats.apiSuccessRate === 'number' ? `${systemStats.apiSuccessRate}%` : systemStats.apiSuccessRate) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Encryption Overhead</span>
                  <span className="text-sm font-medium">{systemStats?.encryptionOverhead ? (typeof systemStats.encryptionOverhead === 'number' ? `${systemStats.encryptionOverhead}ms` : systemStats.encryptionOverhead) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Daily Backups</span>
                  <span className="text-sm font-medium text-green-600">✓ Active</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="wait-analytics" className="space-y-6">
          <WaitAnalyticsPanel />
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

        {/* AI Training Audit — distributed reports auto-added to training */}
        <TrainingAuditCard />

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
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Source</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {trainingPairs.map((pair) => (
                    <tr key={pair.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`row-training-pair-${pair.id}`}>
                      <td className="py-3 px-4 text-gray-900">
                        {pair.uploadedAt ? new Date(pair.uploadedAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-gray-700">{pair.category}</td>
                      <td className="py-3 px-4 text-gray-700">{pair.complexityLevel}</td>
                      <td className="py-3 px-4">
                        {pair.autoImported ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                            Auto from Report #{pair.sourceReportId}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                            Manual upload
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-[var(--medical-success)] bg-opacity-10 text-[var(--medical-success)] rounded-full text-xs">
                          Complete
                        </span>
                      </td>
                    </tr>
                  ))}
                  {trainingPairs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
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

        <TabsContent value="content-templates" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Content Templates</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Define default indication, findings, and impression text for each scan type. The AI will use these as a baseline when generating reports, filling in patient-specific values from the worksheet.
            </p>
          </div>
          <div className="flex gap-4" style={{ minHeight: 500 }}>
            {/* Scan type list */}
            <div className="w-56 flex-shrink-0 border rounded-lg overflow-hidden flex flex-col">
              <div className="bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between flex-shrink-0">
                <span>Scan Types</span>
                <button
                  onClick={() => { setShowAddCustomType(true); setNewCustomTypeName(""); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Add custom scan type"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Inline new custom type input */}
              {showAddCustomType && (
                <div className="px-2 py-2 border-b bg-blue-50 flex gap-1 flex-shrink-0">
                  <input
                    autoFocus
                    value={newCustomTypeName}
                    onChange={(e) => setNewCustomTypeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCustomTypeName.trim()) {
                        const name = newCustomTypeName.trim();
                        setSelectedScanType(name);
                        const existing = contentTemplates.find(ct => ct.scanType === name);
                        setCtIndication(existing?.indicationTemplate || "");
                        setCtFindings(existing?.findingsTemplate || "");
                        setCtImpression(existing?.impressionTemplate || "");
                        setShowAddCustomType(false);
                        setNewCustomTypeName("");
                      }
                      if (e.key === 'Escape') { setShowAddCustomType(false); setNewCustomTypeName(""); }
                    }}
                    placeholder="Type name, press Enter"
                    className="flex-1 text-xs border border-blue-300 rounded px-2 py-1 outline-none bg-white"
                  />
                  <button
                    onClick={() => {
                      if (!newCustomTypeName.trim()) return;
                      const name = newCustomTypeName.trim();
                      setSelectedScanType(name);
                      const existing = contentTemplates.find(ct => ct.scanType === name);
                      setCtIndication(existing?.indicationTemplate || "");
                      setCtFindings(existing?.findingsTemplate || "");
                      setCtImpression(existing?.impressionTemplate || "");
                      setShowAddCustomType(false);
                      setNewCustomTypeName("");
                    }}
                    className="text-blue-600 hover:text-blue-800 px-1"
                    title="Confirm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setShowAddCustomType(false); setNewCustomTypeName(""); }}
                    className="text-gray-400 hover:text-gray-600 px-1"
                    title="Cancel"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                </div>
              )}

              <div className="overflow-y-auto flex-1">
                {/* Custom types that have been saved (not in canonical list) */}
                {contentTemplates
                  .filter(ct => !CANONICAL_SCAN_TYPES.some(s => s.name === ct.scanType))
                  .map((ct) => {
                    const isActive = selectedScanType === ct.scanType;
                    return (
                      <button
                        key={ct.scanType}
                        onClick={() => {
                          setSelectedScanType(ct.scanType);
                          setCtIndication(ct.indicationTemplate || "");
                          setCtFindings(ct.findingsTemplate || "");
                          setCtImpression(ct.impressionTemplate || "");
                        }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 border-b transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-500" />
                        <span className="truncate">{ct.scanType}</span>
                        <span className="ml-auto text-xs opacity-60 flex-shrink-0">custom</span>
                      </button>
                    );
                  })}

                {/* Canonical scan types */}
                {CANONICAL_SCAN_TYPES.map((st) => {
                  const hasTemplate = contentTemplates.some(ct => ct.scanType === st.name);
                  const isActive = selectedScanType === st.name;
                  return (
                    <button
                      key={st.name}
                      onClick={() => {
                        setSelectedScanType(st.name);
                        const existing = contentTemplates.find(ct => ct.scanType === st.name);
                        setCtIndication(existing?.indicationTemplate || "");
                        setCtFindings(existing?.findingsTemplate || "");
                        setCtImpression(existing?.impressionTemplate || "");
                      }}
                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 border-b last:border-b-0 transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasTemplate ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                      <span className="truncate">{st.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1">
              {!selectedScanType ? (
                <div className="flex items-center justify-center h-full text-muted-foreground border rounded-lg bg-muted/30">
                  <div className="text-center">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Select a scan type to edit its template</p>
                    <p className="text-xs mt-1 opacity-70">Green dots indicate scan types with saved templates</p>
                  </div>
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{selectedScanType}</span>
                      {contentTemplates.some(ct => ct.scanType === selectedScanType) && (
                        <span className="text-xs font-normal px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Template saved</span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Use placeholders like <code className="bg-muted px-1 rounded">{"[Patient Name]"}</code>, <code className="bg-muted px-1 rounded">{"[side]"}</code> for dynamic values.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Indication</Label>
                      <Textarea
                        value={ctIndication}
                        onChange={(e) => setCtIndication(e.target.value)}
                        placeholder="e.g. Assess for deep vein thrombosis. Clinical indication: leg swelling and pain."
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Findings</Label>
                      <Textarea
                        value={ctFindings}
                        onChange={(e) => setCtFindings(e.target.value)}
                        placeholder="e.g. The common femoral vein, femoral vein and popliteal vein are fully compressible with normal triphasic waveforms. No intraluminal thrombus identified..."
                        rows={7}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impression</Label>
                      <Textarea
                        value={ctImpression}
                        onChange={(e) => setCtImpression(e.target.value)}
                        placeholder="e.g. No evidence of deep vein thrombosis in the [side] lower limb."
                        rows={3}
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={() => saveTemplateMutation.mutate({
                          scanType: selectedScanType,
                          indicationTemplate: ctIndication,
                          findingsTemplate: ctFindings,
                          impressionTemplate: ctImpression,
                        })}
                        disabled={saveTemplateMutation.isPending}
                        size="sm"
                      >
                        {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
                      </Button>
                      {contentTemplates.some(ct => ct.scanType === selectedScanType) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteTemplateMutation.mutate(selectedScanType)}
                          disabled={deleteTemplateMutation.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          {deleteTemplateMutation.isPending ? "Clearing..." : "Clear Template"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
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
                            <Button size="sm" variant="outline" onClick={() => onNavigateToTemplates?.()}>
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
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
                  <Button className="medical-btn-primary" onClick={() => onNavigateToTemplates?.()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Template
                  </Button>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button className="medical-btn-primary" onClick={() => onNavigateToTemplates?.()}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Full Template Editor
                </Button>
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
              <div className="space-y-2">
                <Label htmlFor="kioskConsentText">Patient Consent Wording</Label>
                <Textarea
                  id="kioskConsentText"
                  value={kioskConsentText}
                  onChange={(e) => setKioskConsentText(e.target.value)}
                  placeholder="e.g. I consent to the ultrasound examination being performed today. I understand the procedure has been explained to me, and I am free to ask questions or withdraw consent at any time."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  Shown on the kiosk after check-in. The patient must read and sign before check-in completes.
                  Leave blank to skip the consent step entirely.
                </p>
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

        {/* ── Blank Worksheets ── */}
        <TabsContent value="blank-worksheets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5 text-blue-600" />
                Upload Blank Worksheet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="wsName">Name *</Label>
                  <Input id="wsName" placeholder="e.g. Lower Limb Venous" value={wsName} onChange={e => setWsName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wsCategory">Category *</Label>
                  <Select value={wsCategory} onValueChange={setWsCategory}>
                    <SelectTrigger id="wsCategory">
                      <SelectValue placeholder="Select category…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vascular">Vascular</SelectItem>
                      <SelectItem value="Venous">Venous</SelectItem>
                      <SelectItem value="Arterial">Arterial</SelectItem>
                      <SelectItem value="Cardiac">Cardiac</SelectItem>
                      <SelectItem value="Abdominal">Abdominal</SelectItem>
                      <SelectItem value="Renal">Renal</SelectItem>
                      <SelectItem value="Obstetric">Obstetric</SelectItem>
                      <SelectItem value="Musculoskeletal">Musculoskeletal</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="wsDesc">Description</Label>
                <Input id="wsDesc" placeholder="Optional description" value={wsDescription} onChange={e => setWsDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Worksheet Image *</Label>
                <input
                  ref={wsFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setWsFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                {wsFile && <p className="text-xs text-gray-500 mt-1">{wsFile.name} ({(wsFile.size / 1024).toFixed(0)} KB)</p>}
              </div>
              <Button
                onClick={handleUploadBlankWorksheet}
                disabled={!wsName || !wsCategory || !wsFile || wsUploading}
                className="medical-btn-primary"
              >
                {wsUploading ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />Upload Worksheet</>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Saved Blank Worksheets
                <span className="ml-auto text-sm font-normal text-gray-500">{blankWorksheets.length} worksheet{blankWorksheets.length !== 1 ? "s" : ""}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {blankWorksheets.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Image className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No blank worksheets uploaded yet.</p>
                  <p className="text-xs mt-1">Upload one above to make it available in the Draw section.</p>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...blankWorksheets]
                    .sort((a, b) => {
                      const ap = (a as any).isPinned ? 1 : 0;
                      const bp = (b as any).isPinned ? 1 : 0;
                      if (ap !== bp) return bp - ap;
                      return (a.name || '').localeCompare(b.name || '');
                    })
                    .map((ws) => {
                      const pinned = !!(ws as any).isPinned;
                      return (
                        <div
                          key={ws.id}
                          className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${pinned ? 'ring-2 ring-amber-300 bg-amber-50/40' : ''}`}
                        >
                          <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden relative">
                            <img src={ws.imageUrl} alt={ws.name} className="w-full h-full object-contain" />
                            <button
                              type="button"
                              title={pinned ? 'Unpin from favourites' : 'Pin as favourite'}
                              onClick={() => updateBlankWorksheetMutation.mutate({ id: ws.id, patch: { isPinned: !pinned } })}
                              className={`absolute top-2 right-2 rounded-full p-1.5 shadow-sm border transition-colors ${
                                pinned
                                  ? 'bg-amber-400 border-amber-500 text-white hover:bg-amber-500'
                                  : 'bg-white/90 border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300'
                              }`}
                            >
                              <Star className={`w-3.5 h-3.5 ${pinned ? 'fill-white' : ''}`} />
                            </button>
                          </div>
                          <div className="p-3">
                            <p className="font-semibold text-sm text-gray-900 truncate flex items-center gap-1.5">
                              {pinned && <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />}
                              <span className="truncate">{ws.name}</span>
                            </p>
                            {ws.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{ws.description}</p>}
                            <div className="flex items-center justify-between mt-2 gap-1">
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full truncate">{ws.category}</span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-gray-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => {
                                    setEditingWorksheet(ws);
                                    setEditForm({
                                      name: ws.name || '',
                                      description: ws.description || '',
                                      category: ws.category || '',
                                    });
                                  }}
                                  title="Edit"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                                  onClick={() => {
                                    if (confirm(`Remove "${ws.name}"?`)) deleteBlankWorksheetMutation.mutate(ws.id);
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <Dialog open={!!editingWorksheet} onOpenChange={(o) => { if (!o) setEditingWorksheet(null); }}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Edit Blank Worksheet</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="text-sm font-medium">Name</label>
                        <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Description</label>
                        <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Category</label>
                        <Input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. vascular" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-3">
                      <Button variant="outline" onClick={() => setEditingWorksheet(null)}>Cancel</Button>
                      <Button
                        onClick={async () => {
                          if (!editingWorksheet) return;
                          if (!editForm.name.trim() || !editForm.category.trim()) {
                            toast({ title: 'Name and category are required', variant: 'destructive' });
                            return;
                          }
                          await updateBlankWorksheetMutation.mutateAsync({
                            id: editingWorksheet.id,
                            patch: {
                              name: editForm.name.trim(),
                              description: editForm.description.trim(),
                              category: editForm.category.trim(),
                            },
                          });
                          toast({ title: 'Updated', description: 'Worksheet details saved.' });
                          setEditingWorksheet(null);
                        }}
                        disabled={updateBlankWorksheetMutation.isPending}
                      >
                        {updateBlankWorksheetMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referral-system" className="space-y-6">
          <ReferralSystemTab />
        </TabsContent>

        <TabsContent value="bug-reports" className="space-y-6">
          <BugReportsTab />
        </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}

function ReferralSystemTab() {
  const { toast } = useToast();
  const [showAddReferrer, setShowAddReferrer] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", password: "", practiceName: "" });
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: embedConfig } = useQuery<{ baseUrl: string; clinicId: number }>({
    queryKey: ["/api/admin/embed-config"],
  });

  const { data: referrers = [], refetch: refetchReferrers } = useQuery<any[]>({
    queryKey: ["/api/admin/referrers"],
  });

  const referralFormUrl = embedConfig ? `${embedConfig.baseUrl}/referral-form/${embedConfig.clinicId}` : "";
  const portalUrl = embedConfig ? `${embedConfig.baseUrl}/referrer-portal` : "";

  const iframeSnippet = (url: string, height = "700") =>
    `<iframe\n  src="${url}"\n  width="100%"\n  height="${height}"\n  frameborder="0"\n  style="border-radius:8px;"\n  allow="clipboard-write"\n></iframe>`;

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const createReferrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await apiRequest("/api/admin/referrers", "POST", addForm);
      const data = await r.json();
      if (!r.ok) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Referrer account created", description: `${addForm.firstName} ${addForm.lastName} can now log in at /referrer-portal` });
      setShowAddReferrer(false);
      setAddForm({ firstName: "", lastName: "", email: "", password: "", practiceName: "" });
      refetchReferrers();
    } catch { toast({ title: "Error", description: "Failed to create account", variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const toggleReferrer = async (id: string) => {
    await apiRequest(`/api/admin/referrers/${id}/status`, "PATCH", {});
    refetchReferrers();
  };

  const deleteReferrer = async (id: string, name: string) => {
    if (!confirm(`Delete referrer account for ${name}? This cannot be undone.`)) return;
    await apiRequest(`/api/admin/referrers/${id}`, "DELETE", {});
    refetchReferrers();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Referral System</h2>
        <p className="text-sm text-gray-500 mt-0.5">Embed referral tools on your website and manage referrer portal accounts.</p>
      </div>

      {/* Embed codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-blue-600" />
              Public Referral Form
            </CardTitle>
            <p className="text-xs text-gray-500">Embed this on your website so any GP can submit a referral without logging in.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Direct URL</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={referralFormUrl} className="font-mono text-xs bg-gray-50" />
                <Button size="sm" variant="outline" onClick={() => copy(referralFormUrl, "form-url")}>
                  {copiedKey === "form-url" ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <ExternalLink className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(referralFormUrl, "_blank")}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Embed Code</Label>
              <pre className="text-xs bg-gray-900 text-green-400 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                {iframeSnippet(referralFormUrl, "780")}
              </pre>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => copy(iframeSnippet(referralFormUrl, "780"), "form-embed")}>
                {copiedKey === "form-embed" ? "Copied!" : "Copy Embed Code"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-600" />
              Referrer Portal
            </CardTitle>
            <p className="text-xs text-gray-500">Password-protected portal for registered referrers to book appointments and track referrals.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Direct URL</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={portalUrl} className="font-mono text-xs bg-gray-50" />
                <Button size="sm" variant="outline" onClick={() => copy(portalUrl, "portal-url")}>
                  {copiedKey === "portal-url" ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <ExternalLink className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(portalUrl, "_blank")}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Embed Code</Label>
              <pre className="text-xs bg-gray-900 text-green-400 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                {iframeSnippet(portalUrl, "700")}
              </pre>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => copy(iframeSnippet(portalUrl, "700"), "portal-embed")}>
                {copiedKey === "portal-embed" ? "Copied!" : "Copy Embed Code"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referrer account management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserRound className="w-4 h-4 text-blue-600" />
                Referrer Accounts
              </CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Manage portal login accounts for referring doctors and practices.</p>
            </div>
            <Button size="sm" onClick={() => setShowAddReferrer(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Referrer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddReferrer && (
            <form onSubmit={createReferrer} className="border rounded-lg p-4 bg-blue-50 space-y-3 mb-4">
              <p className="text-sm font-medium text-gray-700">Create Referrer Account</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">First Name *</Label>
                  <Input required value={addForm.firstName} onChange={(e) => setAddForm((p) => ({ ...p, firstName: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Last Name *</Label>
                  <Input required value={addForm.lastName} onChange={(e) => setAddForm((p) => ({ ...p, lastName: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input required type="email" value={addForm.email} onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Practice Name</Label>
                <Input value={addForm.practiceName} onChange={(e) => setAddForm((p) => ({ ...p, practiceName: e.target.value }))} className="mt-1" placeholder="e.g. City Medical Centre" />
              </div>
              <div>
                <Label className="text-xs">Password *</Label>
                <Input required type="password" value={addForm.password} onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))} className="mt-1" placeholder="Temporary password" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddReferrer(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Create Account
                </Button>
              </div>
            </form>
          )}

          {referrers.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <UserRound className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No referrer accounts yet.</p>
              <p className="text-xs mt-1">Add referrer accounts so GPs and practices can log in to the portal.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {referrers.map((ref: any) => (
                <div key={ref.id} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800">{ref.firstName} {ref.lastName}</p>
                    <p className="text-xs text-gray-500">{ref.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ref.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                      {ref.isActive ? "Active" : "Disabled"}
                    </span>
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => toggleReferrer(ref.id)}>
                      {ref.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 h-7 px-2" onClick={() => deleteReferrer(ref.id, `${ref.firstName} ${ref.lastName}`)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BugReportsTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({ text: "", priority: "medium", category: "" });

  const { data: bugs = [], isLoading } = useQuery<BugReport[]>({
    queryKey: ["/api/bug-reports"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const firstLine = data.text.split("\n")[0].trim().slice(0, 120) || "Bug report";
      const res = await apiRequest("/api/bug-reports", "POST", {
        title: firstLine,
        description: data.text.trim(),
        priority: data.priority,
        category: data.category || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bug-reports"] });
      setForm({ text: "", priority: "medium", category: "" });
      setShowForm(false);
      toast({ title: "Bug reported", description: "Your bug report has been saved." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save bug report.", variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest(`/api/bug-reports/${id}`, "PATCH", { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bug-reports"] }),
    onError: () => toast({ title: "Error", description: "Failed to update status.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/bug-reports/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bug-reports"] }),
    onError: () => toast({ title: "Error", description: "Failed to delete bug report.", variant: "destructive" }),
  });

  const CATEGORIES = ["UI/Display", "OCR / AI", "Reports", "Calendar", "Admin", "Patients", "Auth / Login", "DICOM", "Other"];

  const PRIORITY_STYLES: Record<string, string> = {
    low: "bg-gray-100 text-gray-600",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-red-100 text-red-700",
  };

  const STATUS_STYLES: Record<string, string> = {
    open: "bg-orange-100 text-orange-700",
    in_progress: "bg-blue-100 text-blue-700",
    resolved: "bg-green-100 text-green-700",
  };

  const STATUS_LABELS: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
  };

  const filtered = statusFilter === "all" ? bugs : bugs.filter((b) => b.status === statusFilter);

  const counts = {
    all: bugs.length,
    open: bugs.filter((b) => b.status === "open").length,
    in_progress: bugs.filter((b) => b.status === "in_progress").length,
    resolved: bugs.filter((b) => b.status === "resolved").length,
  };

  return (
    <div className="space-y-4">
      <ChangelogCard />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">🐛 Bug Reports</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Log issues you find so they can be reviewed and fixed.</p>
            </div>
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="w-4 h-4 mr-1" /> Report a Bug
            </Button>
          </div>
        </CardHeader>

        {showForm && (
          <CardContent className="border-t pt-4">
            <div className="space-y-3 max-w-xl">
              <Textarea
                autoFocus
                rows={4}
                placeholder="Describe the bug — what happened, where, and any steps to reproduce..."
                value={form.text}
                onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={createMutation.isPending || !form.text.trim()}
                  onClick={() => createMutation.mutate(form)}
                >
                  {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Submit
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "open", "in_progress", "resolved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]} ({counts[s]})
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{statusFilter === "all" ? "No bug reports yet." : `No ${STATUS_LABELS[statusFilter].toLowerCase()} bugs.`}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((bug) => {
                const isResolved = bug.status === "resolved";
                return (
                  <div key={bug.id} className={`border rounded-lg p-4 transition-all ${isResolved ? "bg-gray-50 opacity-60" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[bug.status ?? "open"]}`}>
                            {STATUS_LABELS[bug.status ?? "open"]}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[bug.priority ?? "medium"]}`}>
                            {(bug.priority ?? "medium").charAt(0).toUpperCase() + (bug.priority ?? "medium").slice(1)} priority
                          </span>
                          {bug.category && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                              {bug.category}
                            </span>
                          )}
                        </div>
                        <p className={`font-medium text-sm ${isResolved ? "line-through text-gray-400" : "text-gray-900"}`}>{bug.title}</p>
                        <p className={`text-xs mt-1 whitespace-pre-wrap ${isResolved ? "text-gray-400" : "text-gray-600"}`}>{bug.description}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          Reported by {bug.reportedByName ?? "Unknown"} · {bug.createdAt ? new Date(bug.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : ""}
                          {isResolved && (bug as any).resolvedAt && (
                            <span className="ml-2 text-green-600 font-medium">
                              ✓ Resolved {new Date((bug as any).resolvedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Select
                          value={bug.status ?? "open"}
                          onValueChange={(v) => updateStatus.mutate({ id: bug.id, status: v })}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-red-400 hover:text-red-600 hover:bg-red-50 text-xs"
                          onClick={() => {
                            if (confirm("Delete this bug report?")) deleteMutation.mutate(bug.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WaitAnalyticsPanel() {
  const { data, isLoading } = useQuery<{
    allTime: { avgWait: number | null; minWait: number | null; maxWait: number | null; sampleCount: number };
    today: { checkins: number; currentlyWaiting: number; avgCurrentWait: number | null };
  }>({
    queryKey: ["/api/appointments/wait-metrics"],
    refetchInterval: 60000,
  });

  const fmt = (v: number | null) => v === null ? "—" : `${v} min`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Wait Time Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tracks the time from patient check-in to study commencement. Data is captured automatically when patients check in via the kiosk and when a study is marked as started.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading metrics…</div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-700">{data?.today.checkins ?? "—"}</div>
                  <div className="text-xs text-blue-500 mt-1 font-medium uppercase tracking-wide">Check-ins today</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-amber-700">{data?.today.currentlyWaiting ?? "—"}</div>
                  <div className="text-xs text-amber-500 mt-1 font-medium uppercase tracking-wide">Currently waiting</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-orange-700">{fmt(data?.today.avgCurrentWait ?? null)}</div>
                  <div className="text-xs text-orange-500 mt-1 font-medium uppercase tracking-wide">Avg current wait</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">All-Time (check-in → study started)</CardTitle>
              <p className="text-xs text-muted-foreground">{data?.allTime.sampleCount ?? 0} completed sessions with wait data</p>
            </CardHeader>
            <CardContent>
              {(data?.allTime.sampleCount ?? 0) === 0 ? (
                <p className="text-sm text-gray-400 italic">No completed sessions with wait data yet. Wait times will appear here once patients have checked in via the kiosk and their study has commenced.</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-green-700">{fmt(data?.allTime.avgWait ?? null)}</div>
                    <div className="text-xs text-green-600 mt-1 font-medium uppercase tracking-wide">Average wait</div>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-teal-700">{fmt(data?.allTime.minWait ?? null)}</div>
                    <div className="text-xs text-teal-600 mt-1 font-medium uppercase tracking-wide">Shortest wait</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-red-700">{fmt(data?.allTime.maxWait ?? null)}</div>
                    <div className="text-xs text-red-500 mt-1 font-medium uppercase tracking-wide">Longest wait</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Static changelog — update this list when shipping notable fixes/features.
// Newest entries first. Keep descriptions plain-English for end users.
const CHANGELOG: { date: string; tag: "Fix" | "New" | "Improve"; title: string; detail: string }[] = [
  {
    date: "28 Apr 2026",
    tag: "Fix",
    title: "CC recipients now reliably included when distributing a report by email",
    detail:
      "When sending a report by email from the Distribute dialog, addresses entered in the CC field are now properly validated and confirmed:\n\n• Each CC address is checked for a valid email format before sending — if anything looks wrong (typo, missing domain) you'll get a clear error so you can fix it instead of the email going out without that recipient.\n• Every CC recipient is now logged as its own entry in the Distribution History at the bottom of the Distribute dialog, with a note saying it was sent as a CC alongside the primary recipient. Previously only the primary recipient was recorded so it looked like the CC didn't go out.\n• The success toast now lists the CC addresses too (e.g. \"Report sent to dr.smith@…  — CC: receptionist@…\") so you have immediate confirmation.",
  },
  {
    date: "28 Apr 2026",
    tag: "Improve",
    title: "Click any report card to open it — finalised reports open read-only",
    detail:
      "You can now click anywhere on a report card in the Reports view to open it, not just the Edit button. If the report is still a draft it opens in the usual editor. If it has already been finalised, it opens in a read-only viewer with a green banner showing the signing date — all the fields are locked so you can't accidentally change a signed report.\n\nFrom the read-only viewer you can still Close, Export PDF, or Distribute. To make changes, click the orange Amend button — that takes you into the existing amendment flow where you must provide a reason, which is captured in the audit trail as before.",
  },
  {
    date: "23 Apr 2026",
    tag: "New",
    title: "Reports tab now shows a badge for outstanding work",
    detail:
      "An amber badge sits on the Reports tab in the top navigation showing how many reports still need to be finalised or distributed (archived reports are excluded). The number updates automatically as you sign off reports and send them out, so at a glance you know how much is still on your plate.",
  },
  {
    date: "23 Apr 2026",
    tag: "Improve",
    title: "Click a patient's name in Reports to open their file",
    detail:
      "Patient names on each report card in the Reports view (active and archived) are now clickable links. One click jumps you straight into that patient's file in the Patients tab — handy for checking history, allergies or previous studies without losing your place.",
  },
  {
    date: "20 Apr 2026",
    tag: "Fix",
    title: "Attendance certificate now reliably saves to the patient file",
    detail:
      "Previously, generating an attendance certificate sometimes failed silently to save to the patient file even when the appointment was clearly linked to a patient. Patient lookup happened on the browser using the loaded patient list and stumbled on small differences like extra spaces in names.\n\nNow:\n\n• The PDF is sent straight to the server, which uses the appointment's actual linked patient from the database — no more guesswork.\n• If the appointment has no linked patient, the server falls back to a name + DOB match within your clinic.\n• If linking still fails, you'll now see a clear toast explaining why instead of the action silently doing nothing.",
  },
  {
    date: "20 Apr 2026",
    tag: "Improve",
    title: "Appointment More menu — clicks now register correctly",
    detail:
      "The More menu in the appointment detail dialog (Send Reminder, Attendance Certificate, Delete) was using a popover that sometimes let clicks fall through to the buttons underneath. It's now built on a proper menu component, so each item activates exactly the action you click.",
  },
  {
    date: "20 Apr 2026",
    tag: "Improve",
    title: "Distribute Report dialog — wider layout with patient file on the right",
    detail:
      "The Distribute Report dialog now opens at almost full screen width and shows a condensed patient file on the right-hand side so you can see critical information at a glance before sending a report out.\n\nThe right panel surfaces:\n\n• UR number, name, DOB, gender and phone in the header.\n• Allergies highlighted in red — flagged at the top so they're impossible to miss.\n• Medical history and general patient notes.\n• Referring physician and emergency contact.\n• The five most recent patient notes, appointments and documents on file.\n\nIf the report isn't linked to a patient (e.g. quick one-off reports), the panel shows a friendly note instead.",
  },
  {
    date: "20 Apr 2026",
    tag: "New",
    title: "Kiosk consent form with on-screen signature",
    detail:
      "Patients checking in via the kiosk are now asked to read and sign a clinic consent form before check-in completes.\n\nHow it works:\n\n• Admin → Clinic Settings has a new \"Kiosk Consent Wording\" textarea where you write the consent text patients will see.\n• At the kiosk, after the patient confirms their details, the consent screen appears full-screen with the wording in a scrollable panel and a signature pad below it.\n• When they sign and tap Confirm, the system generates a tidy A4 PDF (with your clinic logo, the patient's name + UR number, the consent text, the signature image and the date) and saves it straight to the patient's file under Documents.\n• Check-in only completes once consent is captured, so you have a signed record on file for every visit.",
  },
  {
    date: "20 Apr 2026",
    tag: "Improve",
    title: "Cleaner appointment dialog with a tidier action menu",
    detail:
      "The appointment detail dialog has been cleaned up. Edit and Reschedule used to be two separate buttons that did the same thing — they're now a single Edit / Reschedule button.\n\nLess-frequent actions (Send Reminder, Attendance Certificate, Delete) are tucked away under a \"More\" menu, with Delete separated by a divider so it's harder to hit by accident.",
  },
  {
    date: "20 Apr 2026",
    tag: "New",
    title: "Attendance certificates — auto-saved to file, downloadable, emailable",
    detail:
      "Generating an attendance certificate from the calendar is now a one-stop action.\n\nWhen you click Attendance Certificate on an appointment:\n\n• The certificate is generated as a clean A4 PDF using the new wording (\"…needed time off to attend a medical appointment on <date>.\") with your clinic email in the footer and a faint Generated timestamp.\n• It's automatically saved to the patient's file under Documents — no extra step.\n• A small dialog then offers two buttons: Download PDF and Email to <patientEmail> (the email button is disabled if no email is on file).\n• Clicking Email sends the PDF straight to the patient via email.",
  },
  {
    date: "19 Apr 2026",
    tag: "New",
    title: "Notice Board — internal announcements with attachments",
    detail:
      "There's a new Notice Board for internal clinic-wide announcements. The Megaphone icon now lives in the top header (next to Kiosk) and shows an amber notification badge with a pulsing ring whenever there are pinned posts or notices from the last 7 days.\n\nWhat you can do:\n\n• Post notices in five categories — General, Important, Policy, Maintenance, Social — each with its own colour and icon.\n• Pin a notice to the top so it stays visible until unpinned.\n• Filter by category with live counts.\n• Comment on any notice (threaded replies). Edit/delete is restricted to the original author for both posts and comments.\n• Attach files (images, PDFs — up to 10MB each) to a notice. Images render as a thumbnail grid, other files as a downloadable list. Authors can add or remove attachments any time after posting.\n\nAll notices are scoped to your clinic only — staff at other clinics don't see them.",
  },
  {
    date: "19 Apr 2026",
    tag: "New",
    title: "Patient match audit & one-click linking on Scan Requests",
    detail:
      "The Scan Request detail view now opens in a wider, side-by-side layout. The left side shows the request itself (patient, referrer, scan types, clinical info, notes). The right side is a new Patient Match panel that tells you exactly what happened with patient linking and lets you fix it on the spot:\n\n• If the request is already linked to a patient, you'll see them with their UR number and an Unlink option.\n• Possible matches in your clinic are listed with the reasons they're considered a match (exact name, similar name, DOB, phone, email). One click on Link / Re-link attaches the request to that patient.\n• If nothing matches, you can create a new patient file straight from the request — the patient is created with a fresh UR number and the request is linked to them.\n\nWhenever a request is linked to a patient — by auto-match, by clicking Link, or by creating a new patient — the request is now automatically saved to that patient's file. The old \"Save to Patient File\" button has been removed because it's no longer needed.\n\nImportant for external referrals: requests that come in from the Web Referral Form or the Referrer Portal will never silently create a new patient file. They wait for your approval in this audit panel before any new patient record is added — so referring doctors can't add patients to your system without you signing off.\n\nThere are also two new actions in the footer: Mark Completed (sets the request status to completed) and Archive (hides it from active lists).",
  },
  {
    date: "19 Apr 2026",
    tag: "New",
    title: "Send reminders & registration link straight after booking from a Request",
    detail:
      "When you schedule an appointment from the Requests page, the dialog now stays open and shows a confirmation step with two one-click actions:\n\n• Send appointment reminder — emails the patient with date, time, location and the prep instructions for the scan.\n• Send registration link — emails the patient a secure link to fill in their details (DOB, address, Medicare card, history). Anything they submit lands straight on their patient file.\n\nIf the referring doctor didn't include the patient's email, you can now add it inline (both on the patient summary panel during booking, and again on the confirmation step). Saving the email updates the request, the appointment, and the patient file all at once. If the request wasn't linked to an existing patient, sending the registration link will auto-create the patient record so future scans, reports and bookings stay tied together.",
  },
  {
    date: "18 Apr 2026",
    tag: "Fix",
    title: "Dictation: mic now properly released, plus pause and mic switch",
    detail:
      "Two fixes for the dictate-into-a-field feature:\n\n1) When you click \"Stop & Transcribe\", the microphone is now fully released straight away — the browser tab will no longer keep showing the red \"mic in use\" indicator while the transcription is processing.\n\n2) The microphone selector is now shown first instead of the recorder auto-starting, so you can choose your preferred mic before clicking Start. There's also a new Pause button while recording, and you can switch to a different mic at any time (changing the mic during a recording resets it so the new device is used cleanly).",
  },
  {
    date: "18 Apr 2026",
    tag: "Fix",
    title: "Double-booking protection on the calendar",
    detail:
      "The system would previously let you schedule two patients on top of each other without any warning. Now, whenever you create or edit an appointment — from the calendar, from the booking dialog, or by scheduling off a scan request — the server checks for time overlaps with other appointments in your clinic.\n\nIf the slot you picked clashes with one or more existing appointments, a warning popup appears showing exactly which patients are already booked at that time, with their start time, scan type, and duration. You can then either pick a different time, or click \"Book anyway\" to override and double-book deliberately. Cancelled appointments are ignored.",
  },
  {
    date: "18 Apr 2026",
    tag: "Improve",
    title: "Side-by-side scheduling from Scan Requests",
    detail:
      "Scheduling an appointment off a scan request used to take you through a single-column wizard that hid the patient's details. Now, when you click \"Schedule Appointment\" on a request, the popup expands to show two panels side by side: the patient and request summary stays on the left so you can keep referring to it, and a calendar booking panel slides in on the right.\n\nThe right panel has a visual month calendar — click a date to switch — plus a live preview of every appointment already booked on the chosen day, so you can see what's free at a glance. Pick a time, duration, physician, and sonographer, then hit Confirm & Schedule. There's also a new \"Email Registration Form\" button on the left panel: if the patient is on file with an email address, you can re-send them the patient registration form straight from this screen.",
  },
  {
    date: "18 Apr 2026",
    tag: "New",
    title: "To-do list on the calendar page",
    detail:
      "A shared task list now sits in the calendar sidebar, directly under the mini date picker, and stretches the full height of the calendar. It has two tabs — \"To do\" for active items and \"Done\" for completed ones — with a count badge on each.\n\nClick the + button at the bottom to open a popup where you can enter a short task title and a longer details/notes field. Each task in the list shows just the title; if there are extra details, a small chevron appears — click the task to expand it inline and read the full notes. Hover any row to reveal Edit and Delete buttons. Tick the checkbox to mark a task done (it slides over to the Done tab). The list is shared across everyone in the clinic.",
  },
  {
    date: "18 Apr 2026",
    tag: "Improve",
    title: "Referring doctors consolidated under Contacts",
    detail:
      "The Referring Doctors directory used to live in two places — under Scan Requests and under Contacts. That was confusing and meant you could never quite tell which list was authoritative. The directory now lives in a single home: the Contacts page.\n\nThe Contacts page has been upgraded to use the new sortable, filterable table layout (sort by name, practice, provider number, or delivery preference; filter by delivery method; search across name / practice / provider / phone / email). The Preferred Report Delivery setting is also editable directly from the Contacts edit dialog. The redundant tab on the Scan Requests page has been removed.",
  },
  {
    date: "18 Apr 2026",
    tag: "Improve",
    title: "Voice dictation: pro-grade level meter and clearer mic picker",
    detail:
      "The dictation interface has been redesigned. The plain red/blue progress bar is replaced with a proper studio-style level meter — animated frequency bars on a dark panel, colour zones (green / amber / red), a peak-hold marker, and a flashing CLIP warning when the input is too hot.\n\nLive status text now tells you what is actually happening: \"Live\", \"Too loud — back off the mic\", or \"No audio detected — check your mic\". A numeric percentage and peak reading sit alongside.\n\nThe microphone picker is now always visible (no more hidden settings cog), with a Refresh button to detect newly plugged-in headsets. In the popup dictation modal, the meter runs as a live preview before you hit Start — switch microphones in the dropdown and you'll see the bars react immediately, so you can confirm the right device is picking up your voice.",
  },
  {
    date: "18 Apr 2026",
    tag: "New",
    title: "Preferred report-delivery method on every referring doctor",
    detail:
      "Each referring doctor now has a \"Preferred Report Delivery\" setting (Secure Messaging, Email, Fax, Post, or Other). It is captured automatically the first time a doctor submits a request through the public web referral form — whatever they choose under \"Method to receive results\" is saved as their default for next time.\n\nThe preference shows up as a colour-coded badge in the Requests list, the Request details dialog, and the Referring Doctors list, so whoever is sending the report can see at a glance how this doctor wants it delivered. You can also set or change it manually any time from the doctor's edit screen.",
  },
  {
    date: "18 Apr 2026",
    tag: "Improve",
    title: "Referring Doctors tab now scales to thousands of records",
    detail:
      "Replaced the old card grid with a dense, sortable, filterable table. You can sort by name, practice, provider number, or delivery preference, filter by delivery method, and search across name / practice / provider / phone / email. The new layout shows many more doctors per screen and stays responsive even with very large directories. Click any row to edit the doctor.",
  },
  {
    date: "18 Apr 2026",
    tag: "New",
    title: "Archive (and restore) patient files — with password protection",
    detail:
      "You can now archive a patient's file from the Edit Patient screen. Archived files are hidden from the main Patients list but remain fully searchable under a new \"Archived\" tab. Use this for test patients, deceased patients, duplicates, or anyone no longer attending.\n\nFor safety, every archive or restore now requires you to type your account password before it goes through. You can also pick a reason (Test patient / Deceased / Duplicate / Transferred / Inactive / Other) which is stored on the record for audit purposes.\n\nThe Patients screen header now shows a live count of Active vs Archived patients.",
  },
  {
    date: "18 Apr 2026",
    tag: "New",
    title: "\"View Details\" button on each patient row",
    detail:
      "Each patient card on the main Patients list now has a \"View Details\" button on the right. Clicking it opens the full edit dialog showing DOB, address, phone, email, Medicare details, emergency contact, medical history, allergies, medications and notes — without having to first open the file.",
  },
  {
    date: "18 Apr 2026",
    tag: "Improve",
    title: "Bigger PDF previews in the patient file",
    detail:
      "When you open a saved PDF document inside a patient's file (e.g. a scan request, referral letter, etc.), the PDF preview now expands to fill the available height of the screen instead of being stuck in a small fixed window.",
  },
  {
    date: "18 Apr 2026",
    tag: "Fix",
    title: "Top navigation stays visible when viewing a patient file",
    detail:
      "Previously, opening a patient file would push the top navigation bar (Calendar, Upload, Reports, Patients, etc.) off-screen, requiring a scroll to get back to it. The patient view now fits inside the area below the nav so you can switch panels at any time.",
  },
  {
    date: "17 Apr 2026",
    tag: "New",
    title: "\"View Patient File\" button on scan requests",
    detail:
      "When viewing a scan request that's linked to a patient, a new \"View Patient File\" button now opens the patient's full record in one click — including their reports, worksheets, appointments, documents and notes. The button only appears once a patient is linked to the request.",
  },
  {
    date: "17 Apr 2026",
    tag: "New",
    title: "Web referrals are now auto-saved to the patient's file",
    detail:
      "When a referral comes in via the website (public form or referrer portal), the system now tries to match the patient to an existing record. If a match is found, a nicely formatted copy of the request — same layout as the printed PDF — is automatically saved into that patient's documents (titled \"Scan Request REQ-XXXXX\") and synced to their folder on disk. No clicks required.\n\nIf no patient match is found, the request still lands in your Pending queue as before. The moment a staff member links it to a patient (via the \"Save to patient file\" button or by editing the request and choosing a patient), the document is auto-created at that point.\n\nDuplicate-protection: if a request is already filed for a patient, it won't create a second copy.",
  },
  {
    date: "17 Apr 2026",
    tag: "Fix",
    title: "Reports no longer show jumbled/encrypted text",
    detail:
      "Fixed an issue where some reports displayed long encrypted strings (e.g. \"U2FsdGVkX1+...\") in the patient name, findings and impression fields. The data was always safe in the database — the live app was running an older version that didn't translate it back to readable text.",
  },
  {
    date: "17 Apr 2026",
    tag: "Improve",
    title: "Clearer warning if a report ever fails to decrypt",
    detail:
      "If a report's encrypted data can't be unlocked for any reason, fields now show a clear \"[ENCRYPTED — KEY MISMATCH]\" marker instead of raw gibberish, so it's instantly obvious something is wrong.",
  },
  {
    date: "17 Apr 2026",
    tag: "Fix",
    title: "Wait-time stats on the dashboard",
    detail:
      "The patient wait-time metrics endpoint was throwing an error and returning no data. Now correctly calculates average, current and today's wait times per clinic.",
  },
  {
    date: "16 Apr 2026",
    tag: "Fix",
    title: "Voice transcription no longer hangs the app",
    detail:
      "If voice dictation got stuck (slow network, missing microphone, etc.), users could be trapped on the recording screen. The Close and Cancel buttons are now always available, and transcription requests time out cleanly after 30 seconds.",
  },
  {
    date: "16 Apr 2026",
    tag: "Fix",
    title: "Save no longer freezes when worksheet labelling stalls",
    detail:
      "Saving a report with worksheet labelling enabled could hang indefinitely if image processing got stuck. Saves now proceed within 10 seconds even if the labelled copy can't be generated.",
  },
  {
    date: "16 Apr 2026",
    tag: "Fix",
    title: "Exit button works in fullscreen reporting",
    detail:
      "The confirmation prompt when exiting a report in fullscreen mode was hidden behind the editor. It now appears correctly on top.",
  },
  {
    date: "15 Apr 2026",
    tag: "New",
    title: "Referring doctor & Copy-To auto-fill on Distribute",
    detail:
      "When distributing a report for a patient, the referring doctor and Copy-To details from their most recent appointment now auto-populate the email To, Name, Fax and CC fields.",
  },
  {
    date: "15 Apr 2026",
    tag: "New",
    title: "Referring Doctor & Copy-To fields in calendar bookings",
    detail:
      "The booking form now captures referring doctor and Copy-To recipient details, with autofill from your saved referring doctors directory.",
  },
  {
    date: "14 Apr 2026",
    tag: "Improve",
    title: "Wait-time tracking for patients",
    detail:
      "Patient check-in and study-start times are now tracked, with live amber hourglass badges on the calendar showing how long each patient has been waiting.",
  },
  {
    date: "14 Apr 2026",
    tag: "Improve",
    title: "Distribute dialog reliability",
    detail:
      "Doctor selection in the Distribute dialog now uses a reliable dropdown (replacing the old combobox that occasionally failed to register selections). The HTML preview is also generated lazily to speed up the dialog.",
  },
];

export function ChangelogCard() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? CHANGELOG : CHANGELOG.slice(0, 3);

  const tagStyles: Record<string, string> = {
    Fix: "bg-rose-100 text-rose-700 border-rose-200",
    New: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Improve: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">📝 What's New</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Recent fixes and improvements to Reporting Room.</p>
          </div>
          {CHANGELOG.length > 3 && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show less" : `Show all (${CHANGELOG.length})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="border-t pt-4">
        <ul className="space-y-5">
          {visible.map((entry, idx) => (
            <li key={idx} className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <div className="flex-shrink-0 sm:w-28 text-sm font-medium text-gray-500 pt-0.5">{entry.date}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${tagStyles[entry.tag]}`}>
                    {entry.tag.toUpperCase()}
                  </span>
                  <span className="font-semibold text-base">{entry.title}</span>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 mt-1.5 leading-relaxed space-y-2">
                  {entry.detail.split("\n\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

interface TrainingAuditEntry {
  id: number;
  reportId: number;
  method: string;
  recipientName: string | null;
  recipientEmail: string | null;
  sentAt: string;
  trainingPairId: number | null;
  addedToTrainingAt: string | null;
}

interface TrainingAuditResponse {
  totalDistributions: number;
  trainedCount: number;
  untrainedCount: number;
  distributions: TrainingAuditEntry[];
}

function TrainingAuditCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<TrainingAuditResponse>({
    queryKey: ["/api/training-audit"],
  });

  const retry = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/training-audit/retry");
      return r.json();
    },
    onSuccess: (result: { attempted: number; trained: number; failed: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-audit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/training-pairs"] });
      toast({
        title: "Retry complete",
        description: result.attempted === 0
          ? "Nothing pending — everything is already trained."
          : `Trained ${result.trained} of ${result.attempted}${result.failed ? ` (${result.failed} failed)` : ""}.`,
      });
    },
    onError: () => toast({ title: "Retry failed", variant: "destructive" }),
  });

  const distributions = (data?.distributions || []).slice().sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
  );

  return (
    <Card data-testid="card-training-audit">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Database className="medical-text-primary mr-2 inline" />
            AI Training Audit
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            data-testid="button-retry-training"
          >
            {retry.isPending ? "Retrying…" : "Retry pending"}
          </Button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Every report you distribute is automatically added to the AI training set so it learns your house style. A self-healing background sweep runs every minute to catch anything the live hook missed, and you can force a retry here.
        </p>

        {isLoading ? (
          <div className="text-sm text-gray-500 py-4">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Total distributions</div>
                <div className="text-2xl font-semibold" data-testid="text-total-distributions">{data?.totalDistributions ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3">
                <div className="text-xs text-emerald-700">Added to training</div>
                <div className="text-2xl font-semibold text-emerald-700" data-testid="text-trained-count">{data?.trainedCount ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3">
                <div className="text-xs text-amber-700">Not yet trained</div>
                <div className="text-2xl font-semibold text-amber-700" data-testid="text-untrained-count">{data?.untrainedCount ?? 0}</div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Sent</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Report</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Method</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Recipient</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Training</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((d) => (
                    <tr key={d.id} className="border-b hover:bg-gray-50" data-testid={`row-distribution-${d.id}`}>
                      <td className="py-2 px-3 text-gray-700 whitespace-nowrap">
                        {new Date(d.sentAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-gray-700">#{d.reportId}</td>
                      <td className="py-2 px-3 text-gray-700 capitalize">{d.method.replace("_", " ")}</td>
                      <td className="py-2 px-3 text-gray-700">
                        {d.recipientName || d.recipientEmail || "—"}
                      </td>
                      <td className="py-2 px-3">
                        {d.trainingPairId ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs"
                            title={d.addedToTrainingAt ? `Added ${new Date(d.addedToTrainingAt).toLocaleString()}` : ""}
                          >
                            ✓ Trained (pair #{d.trainingPairId})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {distributions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No distributions yet. The AI will start learning as soon as you distribute your first report.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
