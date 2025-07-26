import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, RotateCcw, Download, Eraser, PenTool, Type, FileText, Undo } from "lucide-react";
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
import type { WorksheetTemplate, DigitalWorksheet, Sonographer } from "@shared/schema";

interface DrawingTool {
  type: 'pen' | 'eraser' | 'text';
  color: string;
  size: number;
}

export default function Draw() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorksheetTemplate | null>(null);
  const [currentWorksheet, setCurrentWorksheet] = useState<DigitalWorksheet | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [showCreateDraftDialog, setShowCreateDraftDialog] = useState(false);
  const [currentTool, setCurrentTool] = useState<DrawingTool>({
    type: 'pen',
    color: '#000000',
    size: 2
  });
  const [patientInfo, setPatientInfo] = useState({
    patientName: '',
    patientDob: '',
    examDate: new Date().toISOString().split('T')[0],
    studyType: '',
    sonographerId: ''
  });
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
      const response = await apiRequest(`/api/digital-worksheets/${currentWorksheet?.id}/create-draft-report`, "POST", {});
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Draft Report Created",
        description: "Your drawing has been saved as a draft report",
      });
      setCurrentWorksheet(null);
      setSelectedTemplate(null);
      // Navigate to reports page
      window.location.href = "/reporting-room";
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

  // Initialize canvas when template is selected and worksheet is created
  useEffect(() => {
    if (selectedTemplate && currentWorksheet && canvasRef.current) {
      const canvas = canvasRef.current;
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
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Save initial state to history
        const initialState = canvas.toDataURL();
        setDrawingHistory([initialState]);
      };
      img.src = selectedTemplate.imageUrl;
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
    } else if (currentTool.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = currentTool.size;
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
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Smooth line drawing for stylus
    if (lastPointer) {
      const midX = (lastPointer.x + x) / 2;
      const midY = (lastPointer.y + y) / 2;
      ctx.quadraticCurveTo(lastPointer.x, lastPointer.y, midX, midY);
    } else {
      ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    setLastPointer({x, y});
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPointer(null);
    
    // Auto-save after drawing
    if (currentWorksheet && canvasRef.current) {
      const canvas = canvasRef.current;
      const drawingData = canvas.toDataURL();
      
      // Add to history for undo functionality
      setDrawingHistory(prev => [...prev, drawingData].slice(-10)); // Keep last 10 states
      
      // Auto-save with debounce
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        updateWorksheetMutation.mutate({
          drawingData,
          drawingHistory: JSON.stringify(drawingHistory),
        });
      }, 1000);
      setAutoSaveTimer(timer);
    }
  };

  const undoLastAction = () => {
    if (drawingHistory.length <= 1 || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Remove last state and restore previous one
    const newHistory = drawingHistory.slice(0, -1);
    setDrawingHistory(newHistory);
    
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = newHistory[newHistory.length - 1];
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !selectedTemplate) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reload the original template
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Reset history to just the original template
      const resetState = canvas.toDataURL();
      setDrawingHistory([resetState]);
    };
    img.src = selectedTemplate.imageUrl;
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
        <Dialog open={showPatientDialog} onOpenChange={setShowPatientDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Start Patient Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input
                  value={patientInfo.patientName}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, patientName: e.target.value }))}
                  placeholder="Enter patient name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={patientInfo.patientDob}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, patientDob: e.target.value }))}
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={currentTool.type === 'pen' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'pen' }))}
                  >
                    <PenTool className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'eraser' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'eraser' }))}
                  >
                    <Eraser className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'text' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'text' }))}
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Color Selection */}
              {currentTool.type !== 'eraser' && (
                <div className="space-y-2">
                  <Label>Color</Label>
                  <input
                    type="color"
                    value={currentTool.color}
                    onChange={(e) => setCurrentTool(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full h-10 rounded border"
                  />
                </div>
              )}

              {/* Size Selection */}
              <div className="space-y-2">
                <Label>Size: {currentTool.size}px</Label>
                <Slider
                  value={[currentTool.size]}
                  onValueChange={(value) => setCurrentTool(prev => ({ ...prev, size: value[0] }))}
                  max={20}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

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
                  className="cursor-crosshair"
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