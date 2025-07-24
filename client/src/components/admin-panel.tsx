import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Upload, ChartLine, UserRound, History, Plus, Play, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const { data: trainingPairs = [] } = useQuery<TrainingPair[]>({
    queryKey: ["/api/training"],
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
    if (file) setWorksheetFile(file);
  };

  const handleReportUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setReportFile(file);
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Training Panel</h1>
        <p className="text-gray-600">Train the AI model by uploading worksheet-report pairs</p>
      </div>

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
                <Label>Worksheet</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[var(--medical-primary)] transition-colors cursor-pointer mt-2">
                  <Upload className="text-2xl text-gray-400 mb-2 mx-auto" />
                  <p className="text-sm text-gray-600 mb-2">Upload worksheet example</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                    onChange={handleWorksheetUpload}
                    className="hidden"
                    id="worksheet-upload"
                  />
                  <Label htmlFor="worksheet-upload" className="medical-text-primary hover:underline cursor-pointer">
                    Choose File
                  </Label>
                  {worksheetFile && (
                    <p className="text-xs text-gray-600 mt-2">{worksheetFile.name}</p>
                  )}
                </div>
              </div>

              {/* Report Upload */}
              <div>
                <Label>Corresponding Report</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[var(--medical-primary)] transition-colors cursor-pointer mt-2">
                  <Upload className="text-2xl text-gray-400 mb-2 mx-auto" />
                  <p className="text-sm text-gray-600 mb-2">Upload corresponding report</p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleReportUpload}
                    className="hidden"
                    id="report-upload"
                  />
                  <Label htmlFor="report-upload" className="medical-text-primary hover:underline cursor-pointer">
                    Choose File
                  </Label>
                  {reportFile && (
                    <p className="text-xs text-gray-600 mt-2">{reportFile.name}</p>
                  )}
                </div>
              </div>

              {/* Training Metadata */}
              <div className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Abdominal">Abdominal</SelectItem>
                      <SelectItem value="Pelvic">Pelvic</SelectItem>
                      <SelectItem value="Cardiac">Cardiac</SelectItem>
                      <SelectItem value="Obstetric">Obstetric</SelectItem>
                      <SelectItem value="Vascular">Vascular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Complexity Level</Label>
                  <Select value={complexityLevel} onValueChange={setComplexityLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select complexity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Basic">Basic</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleAddTrainingPair}
                disabled={uploadTrainingMutation.isPending}
                className="w-full medical-btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                {uploadTrainingMutation.isPending ? "Uploading..." : "Add Training Pair"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Training Progress & Analytics */}
        <div className="space-y-6">
          {/* Model Training Status */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                <ChartLine className="medical-text-primary mr-2 inline" />
                Training Progress
              </h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700">Training Data Pairs</span>
                  <span className="text-sm font-medium text-gray-900">{trainingPairs.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700">Model Accuracy</span>
                  <span className="text-sm font-medium text-[var(--medical-success)]">{modelAccuracy}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700">Last Training</span>
                  <span className="text-sm font-medium text-gray-900">{lastTraining}</span>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-700">Current Training</span>
                  <span className="text-sm text-gray-600">{trainingProgress}%</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-[var(--medical-primary)] h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${trainingProgress}%` }}
                  ></div>
                </div>
              </div>

              <Button 
                onClick={handleAddTrainingPair}
                disabled={uploadTrainingMutation.isPending || !worksheetFile || !reportFile || !category || !complexityLevel}
                className="w-full mt-4 bg-[var(--medical-success)] hover:bg-[var(--medical-success)]/80 text-white disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-2" />
                {uploadTrainingMutation.isPending ? "Uploading..." : "Start Training"}
              </Button>
            </CardContent>
          </Card>

          {/* Physician Management */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                <UserRound className="medical-text-primary mr-2 inline" />
                Physician Management
              </h2>
              
              <div className="space-y-3">
                {physicians.map((physician) => (
                  <div key={physician.id} className="flex items-center justify-between p-3 medical-bg-secondary rounded-lg">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-[var(--medical-primary)] rounded-full flex items-center justify-center text-white text-sm font-medium mr-3">
                        {physician.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{physician.name}</p>
                        <p className="text-xs text-gray-600">{physician.specialty}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="medical-text-primary hover:bg-blue-50">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button variant="secondary" className="w-full mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add Physician
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Training History */}
      <div className="mt-8">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              <History className="medical-text-primary mr-2 inline" />
              Training History
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
    </div>
  );
}
