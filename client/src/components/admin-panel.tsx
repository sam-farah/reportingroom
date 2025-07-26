import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Upload, ChartLine, UserRound, History, Plus, Play, Edit, Trash2, Database, DollarSign, Activity, Building, TrendingUp, Users, FileText, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./file-upload";
import type { TrainingPair, Physician } from "@shared/schema";

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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="monitoring">System Monitoring</TabsTrigger>
          <TabsTrigger value="clinics">Clinic Analytics</TabsTrigger>
          <TabsTrigger value="costs">Cost Projection</TabsTrigger>
          <TabsTrigger value="training">AI Training</TabsTrigger>
        </TabsList>

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
                  <Label>Category</Label>
                  <select className="w-full mt-1 p-2 border border-gray-300 rounded-md">
                    <option value="">Select category</option>
                    <option value="cardiac">Cardiac</option>
                    <option value="vascular">Vascular</option>
                    <option value="abdominal">Abdominal</option>
                    <option value="obstetric">Obstetric</option>
                  </select>
                </div>
                <div>
                  <Label>Complexity Level</Label>
                  <select className="w-full mt-1 p-2 border border-gray-300 rounded-md">
                    <option value="">Select complexity</option>
                    <option value="basic">Basic</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <Button className="w-full bg-[var(--medical-primary)] hover:bg-[var(--medical-primary)]/90">
                <Upload className="h-4 w-4 mr-2" />
                Upload Training Pair
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Training Data History */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              <Database className="medical-text-primary mr-2 inline" />
              Training Data History
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Category</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Complexity</th>
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
      </Tabs>
    </div>
  );
}
