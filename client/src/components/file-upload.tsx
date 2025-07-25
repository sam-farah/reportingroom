import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { CloudUpload, Upload as UploadIcon, Camera, X } from "lucide-react";
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

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile devices
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setShowCamera(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera Access Failed",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) return;

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
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-auto max-h-96 object-contain"
            />
            <Button
              onClick={stopCamera}
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex justify-center gap-4">
            <Button
              onClick={capturePhoto}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Capture Photo
            </Button>
            <Button
              onClick={stopCamera}
              variant="outline"
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
