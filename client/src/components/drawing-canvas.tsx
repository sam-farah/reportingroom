import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Palette, Eraser, Download, RotateCcw, Type, Save, Maximize2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DrawingCanvasProps {
  onWorksheetCreated: (imageData: string, templateName: string) => void;
}

const VASCULAR_TEMPLATES = {
  'lower-limb-arterial': {
    name: 'Lower Limb Arterial',
    background: '/api/templates/lower-limb-arterial.svg'
  },
  'lower-limb-venous': {
    name: 'Lower Limb Venous Duplex', 
    background: '/api/templates/lower-limb-venous.svg'
  },
  'aorto-iliac': {
    name: 'Aorto Iliac',
    background: '/api/templates/aorto-iliac.svg'
  }
};

export default function DrawingCanvas({ onWorksheetCreated }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser' | 'text'>('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof VASCULAR_TEMPLATES>('lower-limb-arterial');
  const [lastPath, setLastPath] = useState<ImageData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size based on fullscreen mode
    if (isFullscreen) {
      // Use larger canvas dimensions for fullscreen
      canvas.width = 1200;
      canvas.height = 800;
    } else {
      canvas.width = 600;
      canvas.height = 400;
    }

    // Load template background
    loadTemplate();
  }, [selectedTemplate, isFullscreen]);

  const loadTemplate = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw template outline
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    const template = VASCULAR_TEMPLATES[selectedTemplate];
    
    // Draw basic template structure based on type
    if (selectedTemplate === 'lower-limb-arterial') {
      drawLowerLimbArterialTemplate(ctx, canvas.width, canvas.height);
    } else if (selectedTemplate === 'lower-limb-venous') {
      drawLowerLimbVenousTemplate(ctx, canvas.width, canvas.height);
    } else if (selectedTemplate === 'aorto-iliac') {
      drawAortoIliacTemplate(ctx, canvas.width, canvas.height);
    }
  };

  const drawLowerLimbArterialTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const margin = 40;
    const scale = isFullscreen ? 1.5 : 1;
    
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.round(18 * scale)}px Arial`;
    ctx.fillText('LOWER LIMB ARTERIAL ULTRASOUND', margin, 35 * scale);
    
    // Patient info section
    ctx.font = `${Math.round(11 * scale)}px Arial`;
    ctx.strokeRect(margin, 50 * scale, width - 2 * margin, 70 * scale);
    ctx.fillText('Patient Name: ____________________', margin + 10, 75 * scale);
    ctx.fillText('DOB: ____________', margin + (280 * scale), 75 * scale);
    ctx.fillText('Date: ____________', margin + (450 * scale), 75 * scale);
    ctx.fillText('Indication: ________________________________', margin + 10, 105 * scale);
    
    // Arterial segments
    const segmentHeight = 55 * scale;
    const segments = [
      'Aorta', 'Common Iliac', 'External Iliac', 'Common Femoral', 
      'Superficial Femoral', 'Popliteal', 'Anterior Tibial', 
      'Posterior Tibial', 'Peroneal'
    ];
    
    let yPos = 140 * scale;
    segments.forEach((segment, index) => {
      ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
      ctx.fillText(segment, margin + 10, yPos + (18 * scale));
      
      // Add measurement fields
      ctx.fillText('PSV: ______ cm/s', margin + (180 * scale), yPos + (18 * scale));
      ctx.fillText('EDV: ______ cm/s', margin + (320 * scale), yPos + (18 * scale));
      ctx.fillText('RI: ______', margin + (460 * scale), yPos + (18 * scale));
      ctx.fillText('Waveform: ____________', margin + 10, yPos + (40 * scale));
      
      yPos += segmentHeight + (4 * scale);
    });
  };

  const drawLowerLimbVenousTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const margin = 40;
    const scale = isFullscreen ? 1.5 : 1;
    
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.round(18 * scale)}px Arial`;
    ctx.fillText('LOWER LIMB VENOUS DUPLEX', margin, 35 * scale);
    
    // Patient info section
    ctx.font = `${Math.round(11 * scale)}px Arial`;
    ctx.strokeRect(margin, 50 * scale, width - 2 * margin, 70 * scale);
    ctx.fillText('Patient Name: ____________________', margin + 10, 75 * scale);
    ctx.fillText('DOB: ____________', margin + (280 * scale), 75 * scale);
    ctx.fillText('Date: ____________', margin + (450 * scale), 75 * scale);
    ctx.fillText('Indication: ________________________________', margin + 10, 105 * scale);
    
    // Venous segments
    const segmentHeight = 65 * scale;
    const segments = [
      'IVC', 'Common Iliac', 'External Iliac', 'Common Femoral', 
      'Femoral', 'Deep Femoral', 'Popliteal', 'Posterior Tibial', 
      'Peroneal', 'Great Saphenous', 'Small Saphenous'
    ];
    
    let yPos = 140 * scale;
    segments.forEach((segment, index) => {
      ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
      ctx.fillText(segment, margin + 10, yPos + (18 * scale));
      
      // Add assessment fields
      ctx.fillText('Compressibility: □ Full □ Partial □ None', margin + (170 * scale), yPos + (18 * scale));
      ctx.fillText('Flow: □ Spontaneous □ Augmented □ Absent', margin + 10, yPos + (40 * scale));
      ctx.fillText('Reflux: □ None □ <0.5s □ >0.5s', margin + (350 * scale), yPos + (40 * scale));
      
      yPos += segmentHeight + (4 * scale);
    });
  };

  const drawAortoIliacTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const margin = 40;
    const scale = isFullscreen ? 1.5 : 1;
    
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.round(18 * scale)}px Arial`;
    ctx.fillText('AORTO-ILIAC ULTRASOUND', margin, 35 * scale);
    
    // Patient info section
    ctx.font = `${Math.round(11 * scale)}px Arial`;
    ctx.strokeRect(margin, 50 * scale, width - 2 * margin, 70 * scale);
    ctx.fillText('Patient Name: ____________________', margin + 10, 75 * scale);
    ctx.fillText('DOB: ____________', margin + (280 * scale), 75 * scale);
    ctx.fillText('Date: ____________', margin + (450 * scale), 75 * scale);
    ctx.fillText('Indication: ________________________________', margin + 10, 105 * scale);
    
    // Aortic segments
    const segmentHeight = 75 * scale;
    const segments = [
      'Proximal Aorta', 'Mid Aorta', 'Distal Aorta', 
      'Right Common Iliac', 'Left Common Iliac',
      'Right External Iliac', 'Left External Iliac',
      'Right Internal Iliac', 'Left Internal Iliac'
    ];
    
    let yPos = 140 * scale;
    segments.forEach((segment, index) => {
      ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
      ctx.fillText(segment, margin + 10, yPos + (18 * scale));
      
      // Add measurement fields
      ctx.fillText('Diameter: ______ cm', margin + (170 * scale), yPos + (18 * scale));
      ctx.fillText('PSV: ______ cm/s', margin + (350 * scale), yPos + (18 * scale));
      ctx.fillText('EDV: ______ cm/s', margin + (170 * scale), yPos + (40 * scale));
      ctx.fillText('Plaque: □ None □ <50% □ 50-70% □ >70%', margin + 10, yPos + (60 * scale));
      
      yPos += segmentHeight + (4 * scale);
    });
  };

  const getCanvasCoordinates = (canvas: HTMLCanvasElement, e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool === 'text') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save current state for undo
    setLastPath(ctx.getImageData(0, 0, canvas.width, canvas.height));

    setIsDrawing(true);
    const coords = getCanvasCoordinates(canvas, e);

    // Set up drawing style
    if (currentTool === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    } else if (currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = strokeWidth * 3;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || currentTool === 'text') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoordinates(canvas, e);
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  // Touch event handlers for mobile/tablet support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    startDrawing(mouseEvent as any);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    draw(mouseEvent as any);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
  };

  const clearCanvas = () => {
    loadTemplate();
  };

  const undo = () => {
    if (!lastPath) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(lastPath, 0, 0);
  };

  const saveWorksheet = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert canvas to image data
    const imageData = canvas.toDataURL('image/png');
    const templateName = VASCULAR_TEMPLATES[selectedTemplate].name;
    
    onWorksheetCreated(imageData, templateName);
    
    toast({
      title: "Worksheet Created",
      description: `${templateName} worksheet has been created successfully`,
    });
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${VASCULAR_TEMPLATES[selectedTemplate].name.replace(/\s+/g, '-')}-worksheet.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const CompactCanvas = () => (
    <div className="space-y-4">
      {/* Template Selection */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Template:</label>
        <Select value={selectedTemplate} onValueChange={(value: keyof typeof VASCULAR_TEMPLATES) => setSelectedTemplate(value)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(VASCULAR_TEMPLATES).map(([key, template]) => (
              <SelectItem key={key} value={key}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick Tools */}
      <div className="flex gap-2">
        <Button
          variant={currentTool === 'pen' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCurrentTool('pen')}
        >
          <Palette className="w-3 h-3 mr-1" />
          Pen
        </Button>
        <Button
          variant={currentTool === 'eraser' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCurrentTool('eraser')}
        >
          <Eraser className="w-3 h-3 mr-1" />
          Eraser
        </Button>
        
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Maximize2 className="w-3 h-3 mr-1" />
              Full Screen
            </Button>
          </DialogTrigger>
        </Dialog>
      </div>

      {/* Small Canvas Preview */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="cursor-crosshair block bg-white"
          style={{ width: '100%', height: '300px', touchAction: 'none' }}
        />
      </div>
      
      <p className="text-xs text-gray-500 mt-2">
        Click "Full Screen" for detailed drawing or draw directly here.
      </p>
    </div>
  );

  const FullscreenCanvas = () => (
    <div className="flex flex-col h-full">
      {/* Fullscreen Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold">Vascular Worksheet Drawing</h3>
          <Select value={selectedTemplate} onValueChange={(value: keyof typeof VASCULAR_TEMPLATES) => setSelectedTemplate(value)}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(VASCULAR_TEMPLATES).map(([key, template]) => (
                <SelectItem key={key} value={key}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button variant="outline" onClick={() => setIsFullscreen(false)}>
          <X className="w-4 h-4 mr-1" />
          Exit Fullscreen
        </Button>
      </div>

      {/* Fullscreen Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <Button
            variant={currentTool === 'pen' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCurrentTool('pen')}
          >
            <Palette className="w-4 h-4 mr-1" />
            Pen
          </Button>
          <Button
            variant={currentTool === 'eraser' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCurrentTool('eraser')}
          >
            <Eraser className="w-4 h-4 mr-1" />
            Eraser
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Color:</label>
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Size:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-sm w-8">{strokeWidth}</span>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={undo}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={clearCanvas}>
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={downloadImage}>
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
          <Button onClick={() => { saveWorksheet(); setIsFullscreen(false); }} className="medical-btn-primary">
            <Save className="w-4 h-4 mr-1" />
            Use Worksheet
          </Button>
        </div>
      </div>

      {/* Fullscreen Canvas */}
      <div className="flex-1 p-4 overflow-auto bg-gray-100">
        <div className="flex justify-center">
          <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-lg">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="cursor-crosshair block"
              style={{ 
                display: 'block', 
                touchAction: 'none',
                maxWidth: '100%',
                maxHeight: '70vh',
                width: 'auto',
                height: 'auto'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <CompactCanvas />
      
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Fullscreen Drawing Canvas</DialogTitle>
          </DialogHeader>
          <FullscreenCanvas />
        </DialogContent>
      </Dialog>
    </>
  );
}