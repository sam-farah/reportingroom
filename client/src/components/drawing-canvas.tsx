import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Palette, Eraser, Download, RotateCcw, Type, Save } from 'lucide-react';
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size for better responsive display
    canvas.width = 600;
    canvas.height = 400;

    // Load template background
    loadTemplate();
  }, [selectedTemplate]);

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
    const margin = 50;
    
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = '20px Arial';
    ctx.fillText('LOWER LIMB ARTERIAL ULTRASOUND', margin, 30);
    
    // Patient info section
    ctx.font = '12px Arial';
    ctx.strokeRect(margin, 50, width - 2 * margin, 80);
    ctx.fillText('Patient Name: ____________________', margin + 10, 75);
    ctx.fillText('DOB: ____________', margin + 300, 75);
    ctx.fillText('Date: ____________', margin + 500, 75);
    ctx.fillText('Indication: ________________________________', margin + 10, 105);
    
    // Arterial segments
    const segmentHeight = 60;
    const segments = [
      'Aorta', 'Common Iliac', 'External Iliac', 'Common Femoral', 
      'Superficial Femoral', 'Popliteal', 'Anterior Tibial', 
      'Posterior Tibial', 'Peroneal'
    ];
    
    let yPos = 160;
    segments.forEach((segment, index) => {
      ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
      ctx.fillText(segment, margin + 10, yPos + 20);
      
      // Add measurement fields
      ctx.fillText('PSV: ______ cm/s', margin + 200, yPos + 20);
      ctx.fillText('EDV: ______ cm/s', margin + 350, yPos + 20);
      ctx.fillText('RI: ______', margin + 500, yPos + 20);
      ctx.fillText('Waveform: ____________', margin + 10, yPos + 45);
      
      yPos += segmentHeight + 5;
    });
  };

  const drawLowerLimbVenousTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const margin = 50;
    
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = '20px Arial';
    ctx.fillText('LOWER LIMB VENOUS DUPLEX', margin, 30);
    
    // Patient info section
    ctx.font = '12px Arial';
    ctx.strokeRect(margin, 50, width - 2 * margin, 80);
    ctx.fillText('Patient Name: ____________________', margin + 10, 75);
    ctx.fillText('DOB: ____________', margin + 300, 75);
    ctx.fillText('Date: ____________', margin + 500, 75);
    ctx.fillText('Indication: ________________________________', margin + 10, 105);
    
    // Venous segments
    const segmentHeight = 70;
    const segments = [
      'IVC', 'Common Iliac', 'External Iliac', 'Common Femoral', 
      'Femoral', 'Deep Femoral', 'Popliteal', 'Posterior Tibial', 
      'Peroneal', 'Great Saphenous', 'Small Saphenous'
    ];
    
    let yPos = 160;
    segments.forEach((segment, index) => {
      ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
      ctx.fillText(segment, margin + 10, yPos + 20);
      
      // Add assessment fields
      ctx.fillText('Compressibility: □ Full □ Partial □ None', margin + 200, yPos + 20);
      ctx.fillText('Flow: □ Spontaneous □ Augmented □ Absent', margin + 10, yPos + 45);
      ctx.fillText('Reflux: □ None □ <0.5s □ >0.5s', margin + 400, yPos + 45);
      
      yPos += segmentHeight + 5;
    });
  };

  const drawAortoIliacTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const margin = 50;
    
    // Title
    ctx.fillStyle = '#000000';
    ctx.font = '20px Arial';
    ctx.fillText('AORTO-ILIAC ULTRASOUND', margin, 30);
    
    // Patient info section
    ctx.font = '12px Arial';
    ctx.strokeRect(margin, 50, width - 2 * margin, 80);
    ctx.fillText('Patient Name: ____________________', margin + 10, 75);
    ctx.fillText('DOB: ____________', margin + 300, 75);
    ctx.fillText('Date: ____________', margin + 500, 75);
    ctx.fillText('Indication: ________________________________', margin + 10, 105);
    
    // Aortic segments
    const segmentHeight = 80;
    const segments = [
      'Proximal Aorta', 'Mid Aorta', 'Distal Aorta', 
      'Right Common Iliac', 'Left Common Iliac',
      'Right External Iliac', 'Left External Iliac',
      'Right Internal Iliac', 'Left Internal Iliac'
    ];
    
    let yPos = 160;
    segments.forEach((segment, index) => {
      ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
      ctx.fillText(segment, margin + 10, yPos + 20);
      
      // Add measurement fields
      ctx.fillText('Diameter: ______ cm', margin + 200, yPos + 20);
      ctx.fillText('PSV: ______ cm/s', margin + 400, yPos + 20);
      ctx.fillText('EDV: ______ cm/s', margin + 200, yPos + 45);
      ctx.fillText('Plaque: □ None □ <50% □ 50-70% □ >70%', margin + 10, yPos + 65);
      
      yPos += segmentHeight + 5;
    });
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
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || currentTool === 'text') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    } else if (currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = strokeWidth * 3;
    }

    ctx.lineCap = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
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

  return (
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

      {/* Drawing Tools */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
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
          
          <div className="flex items-center gap-1 ml-2">
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
              className="w-6 h-6 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="range"
              min="1"
              max="10"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="w-16"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={undo} className="flex-1">
            <RotateCcw className="w-3 h-3 mr-1" />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={clearCanvas} className="flex-1">
            Clear
          </Button>
          <Button onClick={saveWorksheet} className="medical-btn-primary flex-1">
            <Save className="w-3 h-3 mr-1" />
            Use
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="cursor-crosshair block bg-white w-full"
          style={{ height: '400px' }}
        />
      </div>
      
      <p className="text-xs text-gray-500 mt-2">
        Select a vascular template, draw on the worksheet, then click "Use" to process with OCR.
      </p>
    </div>
  );
}