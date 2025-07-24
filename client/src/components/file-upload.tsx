import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { CloudUpload, Upload as UploadIcon } from "lucide-react";
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
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('worksheet', file);

      const response = await fetch('/api/worksheets/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
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
    onError: () => {
      setUploadProgress(0);
      toast({
        title: "Upload Failed",
        description: "Failed to upload worksheet. Please try again.",
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
    <div>
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

      {uploadMutation.isPending && (
        <div className="mt-4">
          <Progress value={uploadProgress} className="mb-2" />
          <p className="text-sm text-gray-600">Processing worksheet...</p>
        </div>
      )}
    </div>
  );
}
