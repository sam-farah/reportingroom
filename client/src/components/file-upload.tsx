import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { CloudUpload, Upload as UploadIcon, Camera, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Worksheet } from "@shared/schema";

interface FileUploadProps {
  onFileUploaded: (worksheet: Worksheet) => void;
  accept: string;
  maxSize: number;
}

export default function FileUpload({ onFileUploaded, accept, maxSize }: FileUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>('environment');

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('worksheet', file);

      const response = await fetch('/api/worksheets/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (worksheet) => {
      setUploadProgress(0);
      onFileUploaded(worksheet);
      toast({
        title: "Upload Successful",
        description: "Worksheet uploaded successfully",
      });
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      console.error('File upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload worksheet. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`,
        variant: "destructive",
      });
      return;
    }

    // Simulate upload progress
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    uploadMutation.mutate(file);
  };

  const startCamera = async (facingMode: 'user' | 'environment' = 'environment') => {
    try {
      console.log('Starting camera with facing mode:', facingMode);
      
      // Stop existing stream if any
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode, // Use specified camera
          width: { ideal: 1080 }, // Portrait orientation - width smaller than height
          height: { ideal: 1920 }, // Portrait orientation - height larger than width
          aspectRatio: { ideal: 9/16 } // 9:16 aspect ratio for portrait
        }
      });
      
      console.log('Camera stream obtained:', mediaStream);
      setStream(mediaStream);
      setCurrentFacingMode(facingMode);
      setShowCamera(true);
      
      // Set video source after state update
      setTimeout(() => {
        if (videoRef.current && mediaStream) {
          videoRef.current.srcObject = mediaStream;
          console.log('Video source set');
        }
      }, 100);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera Access Failed",
        description: "Unable to access camera. Please check permissions or try switching cameras.",
        variant: "destructive",
      });
    }
  };

  const switchCamera = () => {
    const newFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(newFacingMode);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    console.log('Capture photo clicked');
    if (!videoRef.current || !canvasRef.current) {
      console.error('Video or canvas ref not available');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) {
      console.error('Canvas context not available');
      return;
    }

    console.log('Video dimensions:', video.videoWidth, video.videoHeight);

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas');
        return;
      }

      console.log('Photo captured, blob size:', blob.size);

      // Create a file from the blob
      const file = new File([blob], `worksheet-${Date.now()}.jpg`, {
        type: 'image/jpeg'
      });

      // Stop camera and upload the captured image
      stopCamera();
      handleFileSelect(file);
    }, 'image/jpeg', 0.8);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      {uploadMutation.isPending && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Uploading...</span>
            <span className="text-sm text-gray-500">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="w-full" />
        </div>
      )}


      
      {!showCamera ? (
        <>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-[var(--medical-primary)] bg-blue-50' : 'border-gray-300 hover:border-[var(--medical-primary)]'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
          >
            <CloudUpload className="text-4xl text-gray-400 mb-4 mx-auto" />
            <p className="text-gray-600 mb-2">Drag and drop your worksheet here</p>
            <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
            <Button className="medical-btn-primary">
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={accept}
              onChange={handleFileInputChange}
            />
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-500 mb-2">Or</div>
            <Button
              onClick={startCamera}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Take Photo with Camera
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="text-center text-gray-600 mb-4">
            <p className="text-lg font-medium">Camera Active - Portrait Mode</p>
            <p className="text-sm">Hold your device vertically and position worksheet in frame</p>
            <p className="text-xs text-gray-500 mt-1">
              Using: {currentFacingMode === 'environment' ? 'Back Camera' : 'Front Camera'}
            </p>
          </div>
          
          <div className="relative bg-black rounded-lg overflow-hidden max-w-sm mx-auto">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto max-h-[600px] object-contain"
              style={{ aspectRatio: '9/16' }}
              onLoadedMetadata={() => console.log('Video metadata loaded')}
              onError={(e) => console.error('Video error:', e)}
            />
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              <Button
                onClick={switchCamera}
                variant="secondary"
                size="sm"
                title="Switch Camera"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                onClick={stopCamera}
                variant="secondary"
                size="sm"
                title="Close Camera"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex justify-center gap-4">
            <Button
              onClick={capturePhoto}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2 px-8 py-3"
            >
              <Camera className="w-5 h-5" />
              Capture Photo
            </Button>
            <Button
              onClick={stopCamera}
              variant="outline"
              size="lg"
              className="px-8 py-3"
            >
              Cancel
            </Button>
          </div>
          
          <canvas
            ref={canvasRef}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
