import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

interface WorksheetViewerProps {
  worksheetId: number;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

export function WorksheetViewer({ worksheetId, alt = "Worksheet", className = "", containerClassName = "" }: WorksheetViewerProps) {
  const [renderMode, setRenderMode] = useState<'image' | 'pdf' | 'error'>('image');
  const [imageLoaded, setImageLoaded] = useState(false);

  const url = `/api/worksheets/${worksheetId}/image`;

  if (renderMode === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-500 ${containerClassName}`}>
        <FileText className="w-16 h-16 mb-2 text-gray-300" />
        <p>Failed to load worksheet</p>
      </div>
    );
  }

  if (renderMode === 'pdf') {
    return (
      <div className={`w-full h-full ${containerClassName}`}>
        <iframe
          src={url}
          title={alt}
          className={`w-full h-full border-0 rounded-lg ${className}`}
          style={{ minHeight: '500px' }}
          onError={() => setRenderMode('error')}
        />
      </div>
    );
  }

  return (
    <div className={`w-full h-full flex items-center justify-center ${containerClassName}`}>
      {!imageLoaded && (
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 absolute" />
      )}
      <img
        src={url}
        alt={alt}
        className={`max-w-full max-h-full object-contain border border-gray-300 rounded-lg ${className}`}
        style={!imageLoaded ? { opacity: 0, position: 'absolute' } : {}}
        onLoad={() => setImageLoaded(true)}
        onError={() => setRenderMode('pdf')}
      />
    </div>
  );
}
