import { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';

interface WorksheetViewerProps {
  worksheetId: number;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

export function WorksheetViewer({ worksheetId, alt = "Worksheet", className = "", containerClassName = "" }: WorksheetViewerProps) {
  const [isPdf, setIsPdf] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const url = `/api/worksheets/${worksheetId}/image`;

  useEffect(() => {
    setLoading(true);
    setError(false);
    setIsPdf(null);

    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) {
          setError(true);
          setLoading(false);
          controller.abort();
          return;
        }
        const ct = res.headers.get('content-type') || '';
        setIsPdf(ct.includes('application/pdf'));
        setLoading(false);
        controller.abort();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(true);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [worksheetId, url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${containerClassName}`}>
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-500 ${containerClassName}`}>
        <FileText className="w-16 h-16 mb-2 text-gray-300" />
        <p>Failed to load worksheet</p>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className={`w-full h-full ${containerClassName}`}>
        <iframe
          src={url}
          title={alt}
          className={`w-full h-full border-0 rounded-lg ${className}`}
          style={{ minHeight: '500px' }}
        />
      </div>
    );
  }

  return (
    <div className={`w-full h-full flex items-center justify-center ${containerClassName}`}>
      <img
        src={url}
        alt={alt}
        className={`max-w-full max-h-full object-contain border border-gray-300 rounded-lg ${className}`}
        onError={() => setError(true)}
      />
    </div>
  );
}
