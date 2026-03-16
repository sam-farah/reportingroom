import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react';

interface WorksheetViewerProps {
  worksheetId: number;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

export function WorksheetViewer({ worksheetId, alt = "Worksheet", className = "", containerClassName = "" }: WorksheetViewerProps) {
  const [state, setState] = useState<'loading' | 'image' | 'pdf' | 'error'>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const apiUrl = `/api/worksheets/${worksheetId}/image`;

  useEffect(() => {
    let objectUrl: string | null = null;
    setState('loading');
    setBlobUrl(null);
    setErrorMsg('');

    fetch(apiUrl, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`File not found (${res.status})`);
        const ct = res.headers.get('content-type') || '';
        const isPdf = ct.includes('pdf');
        return res.blob().then((blob) => ({ blob, isPdf }));
      })
      .then(({ blob, isPdf }) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setState(isPdf ? 'pdf' : 'image');
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Could not load worksheet');
        setState('error');
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [worksheetId]);

  if (state === 'loading') {
    return (
      <div className={`flex flex-col items-center justify-center min-h-[200px] text-gray-500 ${containerClassName}`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-2" />
        <p className="text-sm">Loading worksheet...</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center min-h-[200px] gap-3 px-4 text-center ${containerClassName}`}>
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <p className="font-medium text-gray-700">Worksheet unavailable</p>
        <p className="text-sm text-gray-500 max-w-xs">{errorMsg}</p>
        <p className="text-xs text-gray-400 max-w-xs">
          The original file may have been removed. The report content is intact and can still be edited.
        </p>
      </div>
    );
  }

  if (state === 'pdf' && blobUrl) {
    return (
      <div className={`w-full h-full flex flex-col ${containerClassName}`}>
        <div className="flex justify-end px-1 pt-1 shrink-0">
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
          >
            <ExternalLink className="w-3 h-3" />
            Open in new tab
          </a>
        </div>
        <iframe
          src={blobUrl}
          title={alt}
          className={`flex-1 border-0 rounded-lg min-h-0 ${className}`}
        />
      </div>
    );
  }

  if (state === 'image' && blobUrl) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${containerClassName}`}>
        <img
          src={blobUrl}
          alt={alt}
          className={`max-w-full max-h-full object-contain border border-gray-300 rounded-lg ${className}`}
        />
      </div>
    );
  }

  return null;
}
