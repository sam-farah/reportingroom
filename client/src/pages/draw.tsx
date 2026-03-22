import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, RotateCcw, Download, Eraser, PenTool, Type, FileText, Undo, Highlighter, Minus, Search, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { WorksheetTemplate, DigitalWorksheet, Sonographer, Patient } from "@shared/schema";

interface DrawingTool {
  type: 'pen' | 'eraser' | 'text' | 'highlighter' | 'whiteout';
  color: string;
  size: number;
  opacity?: number;
}

export default function Draw({ preLinkedPatientId, preLinkedPatientName, onPreLinkedPatientConsumed }: {
  preLinkedPatientId?: number | null;
  preLinkedPatientName?: string;
  onPreLinkedPatientConsumed?: () => void;
} = {}) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorksheetTemplate | null>(null);
  const [currentWorksheet, setCurrentWorksheet] = useState<DigitalWorksheet | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [showCreateDraftDialog, setShowCreateDraftDialog] = useState(false);
  const [templateImage, setTemplateImage] = useState<HTMLImageElement | null>(null);
  const [pendingPoints, setPendingPoints] = useState<{x: number, y: number}[]>([]);
  const [currentTool, setCurrentTool] = useState<DrawingTool>({
    type: 'pen',
    color: '#000000',
    size: 2,
    opacity: 1.0
  });
  
  // Pen colors
  const penColors = [
    '#000000', // Black
    '#dc2626', // Red
    '#2563eb', // Blue
    '#16a34a', // Green
    '#ca8a04', // Yellow/Gold
    '#9333ea', // Purple
    '#ea580c', // Orange
    '#be123c', // Dark Red
  ];

  // Highlighter colors
  const highlighterColors = [
    '#ffeb3b', // Yellow
    '#4caf50', // Green
    '#2196f3', // Blue
    '#ff9800', // Orange
    '#e91e63'  // Pink
  ];
  const [patientInfo, setPatientInfo] = useState({
    patientName: '',
    patientDob: '',
    examDate: new Date().toISOString().split('T')[0],
    studyType: '',
    sonographerId: '',
    patientId: null as number | null
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientResults, setShowPatientResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // When arriving from the calendar with a pre-linked patient, fetch and pre-fill
  useEffect(() => {
    if (!preLinkedPatientId) return;
    fetch(`/api/patients/${preLinkedPatientId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((patient: Patient | null) => {
        if (!patient) return;
        setSelectedPatient(patient);
        setPatientInfo(prev => ({
          ...prev,
          patientName: `${patient.firstName} ${patient.lastName}`,
          patientDob: patient.dateOfBirth || "",
          patientId: patient.id,
        }));
      });
    onPreLinkedPatientConsumed?.();
  }, [preLinkedPatientId]);

  const { data: searchedPatients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", "search", patientSearch],
    queryFn: async () => {
      if (!patientSearch || patientSearch.length < 2) return [];
      const response = await fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: patientSearch.length >= 2,
  });

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientInfo(prev => ({
      ...prev,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientDob: patient.dateOfBirth,
      patientId: patient.id,
    }));
    setPatientSearch("");
    setShowPatientResults(false);
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
    setPatientInfo(prev => ({
      ...prev,
      patientName: "",
      patientDob: "",
      patientId: null,
    }));
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastPointer, setLastPointer] = useState<{x: number, y: number} | null>(null);
  const [drawingHistory, setDrawingHistory] = useState<string[]>([]);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  // Fetch worksheet templates
  const { data: worksheetTemplates } = useQuery({
    queryKey: ["/api/worksheet-templates"],
    retry: false,
  });

  // Fetch sonographers
  const { data: sonographers } = useQuery({
    queryKey: ["/api/sonographers"],
    retry: false,
  });

  const createWorksheetMutation = useMutation({
    mutationFn: async (data: any): Promise<DigitalWorksheet> => {
      const response = await apiRequest("/api/digital-worksheets", "POST", data);
      return await response.json();
    },
    onSuccess: (worksheet: DigitalWorksheet) => {
      setCurrentWorksheet(worksheet);
      setShowPatientDialog(false);
      toast({
        title: "Patient Session Started",
        description: "Drawing session created for " + patientInfo.patientName,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Failed to Start Session",
        description: error.message || "Failed to create drawing session",
        variant: "destructive",
      });
    },
  });

  const updateWorksheetMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/digital-worksheets/${currentWorksheet?.id}`, "PUT", data);
      return await response.json();
    },
    onSuccess: () => {
      // Auto-save successful (silent)
    },
    onError: (error: Error) => {
      console.error("Auto-save failed:", error);
    },
  });

  const createDraftReportMutation = useMutation({
    mutationFn: async () => {
      // Save current canvas state before creating report (simplified)
      if (canvasRef.current && currentWorksheet) {
        try {
          const canvasData = canvasRef.current.toDataURL('image/jpeg', 0.8);
          // Direct API call instead of using mutation to avoid hanging
          await apiRequest(`/api/digital-worksheets/${currentWorksheet.id}`, "PUT", {
            drawingData: canvasData,
            drawingHistory: JSON.stringify(drawingHistory.slice(-5)),
          });
        } catch (saveError) {
          console.warn("Failed to save canvas before creating draft:", saveError);
          // Continue with draft creation even if save fails
        }
      }
      
      // Create draft report with timeout
      const response = await Promise.race([
        apiRequest(`/api/digital-worksheets/${currentWorksheet?.id}/create-draft-report`, "POST", {}),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ]) as Response;
      
      return await response.json();
    },
    onSuccess: () => {
      // Exit component fullscreen mode
      setIsFullscreen(false);
      
      // Exit browser fullscreen if active
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      }
      
      toast({
        title: "Draft Report Created",
        description: "Your drawing has been saved as a draft report",
      });
      setCurrentWorksheet(null);
      setSelectedTemplate(null);
      setShowCreateDraftDialog(false);
      
      // Small delay to ensure fullscreen exit completes before navigation
      setTimeout(() => {
        window.location.href = "/reporting-room";
      }, 100);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Failed to Create Draft",
        description: error.message || "Failed to create draft report",
        variant: "destructive",
      });
    },
  });

  // Auto-enter fullscreen when template is selected
  useEffect(() => {
    if (selectedTemplate && currentWorksheet && !isFullscreen) {
      // Set fullscreen state immediately to show fullscreen UI
      setIsFullscreen(true);
      
      const enterFullscreen = async () => {
        try {
          await document.documentElement.requestFullscreen();
        } catch (error) {
          console.warn("Could not enter fullscreen automatically. Browser requires user interaction.", error);
          // Continue with fullscreen UI even if browser fullscreen fails
        }
      };
      
      // Try to enter browser fullscreen, but don't depend on it
      enterFullscreen();
    }
  }, [selectedTemplate, currentWorksheet]);

  // Initialize canvas when template is selected and worksheet is created
  useEffect(() => {
    if (selectedTemplate && currentWorksheet && canvasRef.current) {
      const loadTemplate = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
          // Calculate dimensions to fit the available space
          const containerWidth = isFullscreen ? window.innerWidth - 280 : canvas.parentElement?.clientWidth || 800;
          const containerHeight = isFullscreen ? window.innerHeight - 120 : 600;
          
          const scale = Math.min(
            containerWidth / img.width,
            containerHeight / img.height
          );
          
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          
          // Clear and draw template
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Store template image for eraser functionality
          setTemplateImage(img);
          
          // Save initial state to history
          const initialState = canvas.toDataURL();
          setDrawingHistory([initialState]);
          
          console.log(`Template loaded: ${canvas.width}x${canvas.height}, Fullscreen: ${isFullscreen}`);
        };
        img.src = selectedTemplate.imageUrl;
      };

      // Load template immediately
      loadTemplate();
      
      // Also reload when window resizes (for fullscreen transitions)
      const handleResize = () => {
        setTimeout(loadTemplate, 100);
      };
      
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [selectedTemplate, currentWorksheet, isFullscreen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || currentTool.type === 'text') return;
    
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setLastPointer({x, y});
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    if (currentTool.type === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentTool.color;
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = 1.0;
    } else if (currentTool.type === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = currentTool.color;
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = currentTool.opacity || 0.4;
    } else if (currentTool.type === 'whiteout') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = 1.0;
    } else if (currentTool.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = 1.0;
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Throttle drawing for performance - only every few pixels
    if (lastPointer && Math.abs(x - lastPointer.x) < 2 && Math.abs(y - lastPointer.y) < 2) {
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Simple line drawing for better performance
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    setLastPointer({x, y});
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPointer(null);
    
    // For eraser, restore template underneath erased areas
    if (currentTool.type === 'eraser' && canvasRef.current && templateImage) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw template underneath using destination-over
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    
    // Reset canvas context to avoid tool interference  
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      }
    }
    
    // Add to history for undo functionality (lightweight)
    if (currentWorksheet && canvasRef.current) {
      const canvas = canvasRef.current;
      const drawingData = canvas.toDataURL('image/jpeg', 0.8); // Compressed for history
      
      setDrawingHistory(prev => [...prev, drawingData].slice(-5)); // Reduced to 5 states for performance
      
      // Auto-save with longer debounce and compression
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        const compressedData = canvas.toDataURL('image/jpeg', 0.6); // More compression
        updateWorksheetMutation.mutate({
          drawingData: compressedData,
          drawingHistory: JSON.stringify(drawingHistory.slice(-5)), // Keep only last 5 states
        });
      }, 10000); // Increased to 10 seconds to reduce API calls
      setAutoSaveTimer(timer);
    }
  };

  const undoLastAction = () => {
    if (drawingHistory.length <= 1 || !canvasRef.current || !templateImage) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Remove last state and restore previous one
    const newHistory = drawingHistory.slice(0, -1);
    setDrawingHistory(newHistory);
    
    // Always restore from the previous state in history
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = newHistory[newHistory.length - 1];
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !selectedTemplate || !templateImage) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear everything and redraw the template
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
    
    // Reset history to just the original template
    const resetState = canvas.toDataURL();
    setDrawingHistory([resetState]);
  };

  const createPatientWorksheet = () => {
    if (!selectedTemplate || !patientInfo.patientName || !patientInfo.sonographerId) {
      toast({
        title: "Missing Information",
        description: "Please fill in patient name and select a sonographer",
        variant: "destructive",
      });
      return;
    }

    createWorksheetMutation.mutate({
      templateId: selectedTemplate.id,
      patientName: patientInfo.patientName,
      patientDob: patientInfo.patientDob,
      examDate: patientInfo.examDate,
      studyType: patientInfo.studyType,
      sonographerId: parseInt(patientInfo.sonographerId),
      patientId: patientInfo.patientId,
      drawingData: '', // Will be set after canvas initialization
    });
  };

  const exportWorksheet = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `worksheet-${patientInfo.patientName || 'untitled'}-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Template selection UI (when no template is selected)
  if (!selectedTemplate || !currentWorksheet) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Digital Drawing</h1>
            <p className="text-gray-600 mt-1">Select a worksheet template to start a patient session</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(worksheetTemplates as WorksheetTemplate[] || []).map((template: WorksheetTemplate) => (
            <Card 
              key={template.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => {
                setSelectedTemplate(template);
                setShowPatientDialog(true);
              }}
            >
              <CardContent className="p-4">
                <div className="aspect-[4/3] bg-gray-100 rounded-lg mb-3 overflow-hidden">
                  <img 
                    src={template.imageUrl} 
                    alt={template.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <h3 className="font-semibold text-lg mb-1">{template.name}</h3>
                <p className="text-gray-600 text-sm mb-2">{template.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {template.category}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {(!worksheetTemplates || !Array.isArray(worksheetTemplates) || worksheetTemplates.length === 0) && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Worksheet Templates Available</h3>
            <p className="text-gray-500 mb-4">Upload worksheet templates in the Templates section to start drawing</p>
          </div>
        )}

        {/* Patient Session Creation Dialog */}
        <Dialog open={showPatientDialog} onOpenChange={(open) => {
          setShowPatientDialog(open);
          if (!open) {
            setSelectedPatient(null);
            setPatientSearch("");
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Start Patient Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Search Existing Patient</Label>
                {selectedPatient ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <UserCheck className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                      <div className="font-medium text-green-800">
                        {selectedPatient.firstName} {selectedPatient.lastName}
                      </div>
                      <div className="text-sm text-green-600">
                        DOB: {selectedPatient.dateOfBirth}
                        {selectedPatient.phone && ` | ${selectedPatient.phone}`}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={handleClearPatient}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Type patient name to search..."
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setShowPatientResults(true);
                      }}
                      onFocus={() => setShowPatientResults(true)}
                      className="pl-10"
                    />
                    {showPatientResults && patientSearch.length >= 2 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {searchedPatients.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">No patients found</div>
                        ) : (
                          searchedPatients.map((patient) => (
                            <div
                              key={patient.id}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                              onClick={() => handleSelectPatient(patient)}
                            >
                              <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                              <div className="text-sm text-gray-500">
                                DOB: {patient.dateOfBirth}
                                {patient.phone && ` | ${patient.phone}`}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500">Search for existing patient or enter details manually below</p>
              </div>
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input
                  value={patientInfo.patientName}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, patientName: e.target.value, patientId: null }))}
                  placeholder="Enter patient name"
                  required
                  disabled={!!selectedPatient}
                />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={patientInfo.patientDob}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, patientDob: e.target.value }))}
                  disabled={!!selectedPatient}
                />
              </div>
              <div className="space-y-2">
                <Label>Exam Date</Label>
                <Input
                  type="date"
                  value={patientInfo.examDate}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, examDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Study Type</Label>
                <Input
                  value={patientInfo.studyType}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, studyType: e.target.value }))}
                  placeholder="e.g., Carotid Duplex, Venous Study"
                />
              </div>
              <div className="space-y-2">
                <Label>Sonographer *</Label>
                <Select 
                  value={patientInfo.sonographerId} 
                  onValueChange={(value) => setPatientInfo(prev => ({ ...prev, sonographerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sonographer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sonographers as Sonographer[] || []).map((sonographer: Sonographer) => (
                      <SelectItem key={sonographer.id} value={sonographer.id.toString()}>
                        {sonographer.name} ({sonographer.initials})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowPatientDialog(false);
                    setSelectedTemplate(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={createPatientWorksheet}
                  disabled={createWorksheetMutation.isPending}
                  className="flex-1"
                >
                  {createWorksheetMutation.isPending ? "Creating..." : "Start Session"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Drawing interface (when patient session is active)
  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'container mx-auto p-6'}`}>
      <div className={`flex items-center justify-between ${isFullscreen ? 'p-4 bg-gray-50 border-b' : 'mb-6'}`}>
        <div>
          <h1 className={`${isFullscreen ? 'text-xl' : 'text-3xl'} font-bold text-gray-900`}>
            Drawing: {selectedTemplate.name} - {currentWorksheet.patientName}
          </h1>
          {!isFullscreen && (
            <p className="text-sm text-gray-600">
              Session started • Auto-saving enabled
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={toggleFullscreen} 
            variant="outline"
            size={isFullscreen ? "sm" : "default"}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
          <Button 
            onClick={undoLastAction}
            disabled={drawingHistory.length <= 1}
            variant="outline"
            size={isFullscreen ? "sm" : "default"}
          >
            <Undo className="w-4 h-4 mr-2" />
            Undo
          </Button>
          <Button 
            onClick={() => setShowCreateDraftDialog(true)}
            size={isFullscreen ? "sm" : "default"}
          >
            Create Draft Report
          </Button>
          <Button 
            onClick={exportWorksheet} 
            variant="outline"
            size={isFullscreen ? "sm" : "default"}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className={`${isFullscreen ? 'flex h-full' : 'grid grid-cols-1 lg:grid-cols-4 gap-6'}`}>
        {/* Drawing Tools */}
        <div className={`${isFullscreen ? 'w-64 border-r bg-gray-50 p-4 overflow-y-auto' : ''}`}>
          <Card className={`${isFullscreen ? 'border-0 shadow-none bg-transparent' : 'lg:col-span-1'}`}>
            <CardHeader className={isFullscreen ? 'px-0 pb-2' : ''}>
              <CardTitle className={`${isFullscreen ? 'text-base' : 'text-lg'}`}>Drawing Tools</CardTitle>
            </CardHeader>
            <CardContent className={`${isFullscreen ? 'px-0' : ''} space-y-4`}>
              {/* Tool Selection */}
              <div className="space-y-2">
                <Label>Tool</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={currentTool.type === 'pen' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'pen', opacity: 1.0 }))}
                  >
                    <PenTool className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'highlighter' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ 
                      ...prev, 
                      type: 'highlighter', 
                      color: highlighterColors[0],
                      opacity: 0.4,
                      size: 8
                    }))}
                  >
                    <Highlighter className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'whiteout' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ 
                      ...prev, 
                      type: 'whiteout',
                      color: '#ffffff',
                      opacity: 1.0,
                      size: 8
                    }))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'eraser' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ 
                      ...prev, 
                      type: 'eraser', 
                      opacity: 1.0,
                      size: 20
                    }))}
                  >
                    <Eraser className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'text' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'text', opacity: 1.0 }))}
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Highlighter Colors */}
              {currentTool.type === 'highlighter' && (
                <div className="space-y-2">
                  <Label>Highlighter Colors</Label>
                  <div className="flex gap-2">
                    {highlighterColors.map((color, index) => (
                      <button
                        key={index}
                        className={`w-8 h-8 rounded border-2 transition-all ${
                          currentTool.color === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentTool(prev => ({ ...prev, color }))}
                        title={`Highlighter color ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Opacity Slider for Highlighter */}
              {currentTool.type === 'highlighter' && (
                <div className="space-y-2">
                  <Label>Opacity: {Math.round((currentTool.opacity || 0.4) * 100)}%</Label>
                  <Slider
                    value={[(currentTool.opacity || 0.4) * 100]}
                    onValueChange={(values) => setCurrentTool(prev => ({ ...prev, opacity: values[0] / 100 }))}
                    min={10}
                    max={80}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}

              {/* Pen Colors */}
              {currentTool.type === 'pen' && (
                <div className="space-y-2">
                  <Label>Pen Colors</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {penColors.map((color, index) => (
                      <button
                        key={index}
                        className={`w-8 h-8 rounded border-2 transition-all ${
                          currentTool.color === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentTool(prev => ({ ...prev, color }))}
                        title={`Pen color ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Color Selection for Text */}
              {currentTool.type === 'text' && (
                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {penColors.map((color, index) => (
                      <button
                        key={index}
                        className={`w-8 h-8 rounded border-2 transition-all ${
                          currentTool.color === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentTool(prev => ({ ...prev, color }))}
                        title={`Text color ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Size Selection */}
              {currentTool.type !== 'whiteout' && (
                <div className="space-y-2">
                  <Label>
                    Size: {currentTool.size}px
                    {currentTool.type === 'eraser' && ' (removes drawn content)'}
                  </Label>
                  <Slider
                    value={[currentTool.size]}
                    onValueChange={(value) => setCurrentTool(prev => ({ ...prev, size: value[0] }))}
                    max={currentTool.type === 'highlighter' ? 15 : currentTool.type === 'eraser' ? 25 : 20}
                    min={currentTool.type === 'highlighter' ? 5 : currentTool.type === 'eraser' ? 5 : 1}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}
              
              {/* Tool Information */}
              {currentTool.type === 'whiteout' && (
                <div className="space-y-2">
                  <Label>White-out Tool</Label>
                  <p className="text-sm text-gray-500">Covers content with white paint (8px)</p>
                </div>
              )}
              
              {currentTool.type === 'eraser' && (
                <div className="space-y-2">
                  <Label>Eraser Tool</Label>
                  <p className="text-sm text-gray-500">Completely removes drawn content (transparent)</p>
                </div>
              )}

              {/* Clear Canvas */}
              <Button onClick={clearCanvas} variant="outline" className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Clear Drawing
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Canvas Area */}
        <div className={`${isFullscreen ? 'flex-1 flex items-center justify-center bg-white p-4' : ''}`}>
          <Card className={`${isFullscreen ? 'border-0 shadow-none w-full h-full' : 'lg:col-span-3'}`}>
            <CardContent className={`${isFullscreen ? 'p-0 h-full flex items-center justify-center' : 'p-4'}`}>
              <div className={`border rounded-lg ${isFullscreen ? 'w-full h-full flex items-center justify-center' : 'max-h-[600px] overflow-auto'}`}>
                <canvas
                  ref={canvasRef}
                  className={currentTool.type === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair'}
                  style={{ 
                    maxWidth: isFullscreen ? 'calc(100vw - 320px)' : '100%',
                    maxHeight: isFullscreen ? 'calc(100vh - 140px)' : '600px',
                    touchAction: 'none', // Enable stylus/touch drawing
                    objectFit: 'contain'
                  }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerLeave={stopDrawing}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Draft Report Dialog */}
      <Dialog open={showCreateDraftDialog} onOpenChange={setShowCreateDraftDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Draft Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will save your drawing as a draft report and make it available in the Reports section for further editing and completion.
            </p>
            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowCreateDraftDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => createDraftReportMutation.mutate()}
                disabled={createDraftReportMutation.isPending}
                className="flex-1"
              >
                {createDraftReportMutation.isPending ? "Creating..." : "Create Draft"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}