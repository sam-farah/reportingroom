import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Palette, Save, RotateCcw, Download, Eraser, PenTool, Type, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { WorksheetTemplate, DigitalWorksheet, Physician, Sonographer } from "@shared/schema";

interface DrawingTool {
  type: 'pen' | 'eraser' | 'text';
  color: string;
  size: number;
}

interface AnnotationData {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export default function Draw() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorksheetTemplate | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showWorksheetDialog, setShowWorksheetDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentTool, setCurrentTool] = useState<DrawingTool>({
    type: 'pen',
    color: '#000000',
    size: 2
  });
  const [annotations, setAnnotations] = useState<AnnotationData[]>([]);
  const [patientInfo, setPatientInfo] = useState({
    patientName: '',
    patientDob: '',
    examDate: new Date().toISOString().split('T')[0],
    studyType: ''
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastPointer, setLastPointer] = useState<{x: number, y: number} | null>(null);

  // Fetch worksheet templates
  const { data: worksheetTemplates } = useQuery({
    queryKey: ["/api/worksheet-templates"],
    retry: false,
  });

  // Fetch physicians for report generation
  const { data: physicians } = useQuery({
    queryKey: ["/api/physicians"],
    retry: false,
  });

  // Fetch sonographers
  const { data: sonographers } = useQuery({
    queryKey: ["/api/sonographers"],
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/digital-worksheets", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Worksheet Saved",
        description: "Your digital worksheet has been saved successfully",
      });
      setShowSaveDialog(false);
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
        title: "Save Failed",
        description: error.message || "Failed to save worksheet",
        variant: "destructive",
      });
    },
  });

  // Initialize canvas when template is selected
  useEffect(() => {
    if (selectedTemplate && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = selectedTemplate.imageUrl;
    }
  }, [selectedTemplate]);

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
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const addTextAnnotation = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool.type !== 'text' || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const text = prompt("Enter text:");
    if (!text) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.font = `${currentTool.size * 8}px Arial`;
    ctx.fillStyle = currentTool.color;
    ctx.fillText(text, x, y);
    
    setAnnotations(prev => [...prev, {
      x,
      y,
      text,
      fontSize: currentTool.size * 8,
      color: currentTool.color
    }]);
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
      ctx.drawImage(img, 0, 0);
    };
    img.src = selectedTemplate.imageUrl;
    
    setAnnotations([]);
  };

  const saveWorksheet = () => {
    if (!canvasRef.current || !selectedTemplate) return;
    
    const canvas = canvasRef.current;
    const drawingData = canvas.toDataURL();
    
    saveMutation.mutate({
      templateId: selectedTemplate.id,
      patientName: patientInfo.patientName,
      patientDob: patientInfo.patientDob,
      examDate: patientInfo.examDate,
      studyType: patientInfo.studyType,
      drawingData,
      annotations: JSON.stringify(annotations),
      completedAt: new Date().toISOString()
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

  if (!selectedTemplate) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Digital Worksheet Drawing</h1>
            <p className="text-gray-600 mt-1">Select a worksheet template to start drawing</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {worksheetTemplates && Array.isArray(worksheetTemplates) && worksheetTemplates.map((template: WorksheetTemplate) => (
            <Card 
              key={template.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedTemplate(template)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <p className="text-sm text-gray-600">{template.description}</p>
                <p className="text-xs text-gray-500 capitalize">{template.category}</p>
              </CardHeader>
              <CardContent>
                <img 
                  src={template.imageUrl} 
                  alt={template.name}
                  className="w-full h-48 object-contain border rounded"
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {(!worksheetTemplates || !Array.isArray(worksheetTemplates) || worksheetTemplates.length === 0) && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Worksheet Templates Available</h3>
            <p className="text-gray-500 mb-4">Upload worksheet templates in the Templates section to start drawing</p>
            <Button onClick={() => window.location.href = '/templates'} variant="outline">
              Go to Templates
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'container mx-auto p-6'}`}>
      <div className={`flex items-center justify-between ${isFullscreen ? 'p-4 bg-gray-50 border-b' : 'mb-6'}`}>
        <div>
          <h1 className={`${isFullscreen ? 'text-xl' : 'text-3xl'} font-bold text-gray-900`}>
            Drawing: {selectedTemplate.name}
          </h1>
          {!isFullscreen && (
            <Button 
              variant="ghost" 
              onClick={() => setSelectedTemplate(null)}
              className="text-blue-600 hover:text-blue-800 px-0"
            >
              ← Back to Templates
            </Button>
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
            onClick={() => setShowSaveDialog(true)} 
            disabled={saveMutation.isPending}
            size={isFullscreen ? "sm" : "default"}
          >
            <Save className="w-4 h-4 mr-2" />
            Save
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
          <CardHeader>
            <CardTitle className="text-lg">Drawing Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <div className={`border rounded-lg overflow-auto ${isFullscreen ? 'w-full h-full' : 'max-h-[600px]'}`}>
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                onClick={addTextAnnotation}
                className="cursor-crosshair"
                style={{ 
                  display: 'block', 
                  maxWidth: '100%',
                  touchAction: 'none' // Enable stylus/touch drawing
                }}
              />
            </div>
          </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Digital Worksheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Patient Name</Label>
              <Input
                value={patientInfo.patientName}
                onChange={(e) => setPatientInfo(prev => ({ ...prev, patientName: e.target.value }))}
                placeholder="Enter patient name"
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
            <div className="flex gap-2 pt-4">
              <Button onClick={saveWorksheet} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Worksheet"}
              </Button>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}