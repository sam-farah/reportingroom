import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, RotateCcw, Download, Eraser, PenTool, Type, FileText, Undo, Highlighter, Minus, Search, UserCheck, X } from "lucide-react";
import { resolveUrl, loadImageElement } from "@/lib/api";
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
import { isPencilKitAvailable, presentPencilCanvas, addPencilAutosaveListener } from "@/lib/pencilkit";
import type { WorksheetTemplate, DigitalWorksheet, Sonographer, Patient } from "@shared/schema";

interface DrawingTool {
  type: 'pen' | 'eraser' | 'text' | 'highlighter' | 'whiteout';
  color: string;
  size: number;
  opacity?: number;
}

export default function Draw({ preLinkedPatientId, preLinkedPatientName, onPreLinkedPatientConsumed, onDraftCreated }: {
  preLinkedPatientId?: number | null;
  preLinkedPatientName?: string;
  onPreLinkedPatientConsumed?: () => void;
  onDraftCreated?: (reportId: number) => void;
} = {}) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorksheetTemplate | null>(null);
  const [currentWorksheet, setCurrentWorksheet] = useState<DigitalWorksheet | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState<{ cssX: number; cssY: number; canvasX: number; canvasY: number } | null>(null);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [showCreateDraftDialog, setShowCreateDraftDialog] = useState(false);
  const [templateImage, setTemplateImage] = useState<HTMLImageElement | null>(null);
  const [pencilKitPending, setPencilKitPending] = useState(false);
  const hasPencilKit = isPencilKitAvailable();
  const [pendingPoints, setPendingPoints] = useState<{x: number, y: number}[]>([]);
  // Pinch-to-zoom state for the canvas (custom, since viewport meta blocks native pinch)
  const [zoom, setZoom] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    distance: number;
    midX: number;
    midY: number;
    startScale: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const [currentTool, setCurrentTool] = useState<DrawingTool>({
    type: 'pen',
    color: '#000000',
    size: 2,
    opacity: 1.0
  });
  
  // Pen colors
  const penColors = [
    '#000000', // Black
    '#dc2626', // Red
    '#2563eb', // Blue
    '#16a34a', // Green
    '#ca8a04', // Yellow/Gold
    '#9333ea', // Purple
    '#ea580c', // Orange
    '#be123c', // Dark Red
  ];

  // Highlighter colors
  const highlighterColors = [
    '#ffeb3b', // Yellow
    '#4caf50', // Green
    '#2196f3', // Blue
    '#ff9800', // Orange
    '#e91e63'  // Pink
  ];
  const [patientInfo, setPatientInfo] = useState({
    patientName: '',
    patientDob: '',
    examDate: new Date().toISOString().split('T')[0],
    studyType: '',
    sonographerId: '',
    patientId: null as number | null
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientResults, setShowPatientResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // When arriving from the calendar with a pre-linked patient, fetch and pre-fill
  useEffect(() => {
    if (!preLinkedPatientId) return;
    fetch(`/api/patients/${preLinkedPatientId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((patient: Patient | null) => {
        if (!patient) return;
        setSelectedPatient(patient);
        setPatientInfo(prev => ({
          ...prev,
          patientName: `${patient.firstName} ${patient.lastName}`,
          patientDob: patient.dateOfBirth || "",
          patientId: patient.id,
        }));
        onPreLinkedPatientConsumed?.();
      });
  }, [preLinkedPatientId]);

  const { data: searchedPatients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", "search", patientSearch],
    queryFn: async () => {
      if (!patientSearch || patientSearch.length < 2) return [];
      const response = await fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: patientSearch.length >= 2,
  });

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientInfo(prev => ({
      ...prev,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientDob: patient.dateOfBirth,
      patientId: patient.id,
    }));
    setPatientSearch("");
    setShowPatientResults(false);
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
    setPatientInfo(prev => ({
      ...prev,
      patientName: "",
      patientDob: "",
      patientId: null,
    }));
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastPointer, setLastPointer] = useState<{x: number, y: number} | null>(null);
  const [drawingHistory, setDrawingHistory] = useState<string[]>([]);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  // High-frequency drawing refs — these are read/written every pointermove so
  // they MUST NOT be React state (state updates would re-render the whole page
  // on every Pencil sample, killing performance).
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const prevPointRef = useRef<{ x: number; y: number } | null>(null);
  const cachedRectRef = useRef<DOMRect | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  // Native Apple Pencil auto-launch bookkeeping (iPad app only)
  const autoOpenedPencilKitRef = useRef(false);
  const pencilKitBusyRef = useRef(false);
  const [templateReadyKey, setTemplateReadyKey] = useState(0);

  // Autosave / resume bookkeeping. currentWorksheetIdRef mirrors
  // currentWorksheet.id so async callbacks (native autosave events, page-hide
  // flushes) never PUT to a stale or missing worksheet id.
  const currentWorksheetIdRef = useRef<number | null>(null);
  // When resuming an interrupted session, holds the server-saved drawing to
  // paint over the template once the canvas is (re)built.
  const pendingRestoreRef = useRef<{ worksheetId: number; drawingData: string } | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);

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

  useEffect(() => {
    currentWorksheetIdRef.current = currentWorksheet?.id ?? null;
  }, [currentWorksheet?.id]);

  // The user's own unfinished drawing session from the last 24h (if any) —
  // lets a sonographer pick up where they left off after an accidental exit.
  const { data: resumableWorksheet } = useQuery<DigitalWorksheet | null>({
    queryKey: ["/api/digital-worksheets/resumable"],
    queryFn: async () => {
      const res = await fetch(resolveUrl("/api/digital-worksheets/resumable"), { credentials: "include" });
      if (!res.ok) return null; // older servers lack this route — just skip the banner
      return await res.json();
    },
    enabled: !currentWorksheet,
    staleTime: 30_000,
    retry: false,
  });

  const createWorksheetMutation = useMutation({
    mutationFn: async (data: any): Promise<DigitalWorksheet> => {
      const response = await apiRequest("/api/digital-worksheets", "POST", data);
      return await response.json();
    },
    onSuccess: (worksheet: DigitalWorksheet) => {
      pendingRestoreRef.current = null; // brand-new session — nothing to restore
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

  // Serialize every worksheet PUT (10s debounced auto-save, native autosave
  // snapshots, visibility flush, final Done save) through a single chain so an
  // older in-flight save can never land after — and overwrite — a newer one.
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const queueWorksheetSave = useCallback((worksheetId: number, payload: Record<string, unknown>) => {
    const next = saveChainRef.current.then(() =>
      apiRequest(`/api/digital-worksheets/${worksheetId}`, "PUT", payload).catch((e) => {
        console.warn("Worksheet save failed:", e);
      })
    );
    saveChainRef.current = next;
    return next;
  }, []);
  // True while the native Apple Pencil sheet is up — the native layer owns
  // autosave then, so the (stale) web canvas must not be flushed over it.
  const nativeSessionActiveRef = useRef(false);

  const updateWorksheetMutation = useMutation({
    mutationFn: async (data: any) => {
      // Guard against stale auto-saves firing after the session ended —
      // without this the request goes to /api/digital-worksheets/undefined.
      if (!currentWorksheet?.id) return null;
      await queueWorksheetSave(currentWorksheet.id, data);
      return null;
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
      const worksheetId = currentWorksheet?.id;
      if (!worksheetId) {
        // Previously this silently POSTed to .../undefined and nothing happened.
        throw new Error("No active worksheet session. Please select a scan type and start a session, then try again.");
      }
      // Save the authoritative drawing state before creating the report —
      // canvasStateForSave lets a pending native snapshot (e.g. after a
      // failed preview import) win over a stale web canvas.
      const canvasData = canvasStateForSave(worksheetId);
      if (canvasData) {
        try {
          // Awaits the whole save chain, so any in-flight autosave snapshot
          // lands first and this final state wins.
          await queueWorksheetSave(worksheetId, {
            drawingData: canvasData,
            drawingHistory: JSON.stringify(drawingHistory.slice(-5)),
          });
        } catch (saveError) {
          console.warn("Failed to save canvas before creating draft:", saveError);
          // Continue with draft creation even if save fails
        }
      }
      
      // Create draft report with timeout
      const response = await Promise.race([
        apiRequest(`/api/digital-worksheets/${worksheetId}/create-draft-report`, "POST", {}),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ]) as Response;
      
      return await response.json();
    },
    onSuccess: (report: any) => {
      // Exit component fullscreen mode
      setIsFullscreen(false);
      
      // Exit browser fullscreen if active
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      }
      
      toast({
        title: "Draft Report Created",
        description: "Your drawing has been saved as a draft report",
      });
      setCurrentWorksheet(null);
      setSelectedTemplate(null);
      setShowCreateDraftDialog(false);
      pendingRestoreRef.current = null;
      
      // Navigate to the reporting room panel via callback (no full-page reload)
      setTimeout(() => {
        if (onDraftCreated && report?.id) {
          onDraftCreated(report.id);
        }
      }, 100);
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

  // Auto-enter fullscreen when template is selected
  useEffect(() => {
    if (selectedTemplate && currentWorksheet && !isFullscreen) {
      // Set fullscreen state immediately to show fullscreen UI
      setIsFullscreen(true);
      
      const enterFullscreen = async () => {
        try {
          await document.documentElement.requestFullscreen();
        } catch (error) {
          console.warn("Could not enter fullscreen automatically. Browser requires user interaction.", error);
          // Continue with fullscreen UI even if browser fullscreen fails
        }
      };
      
      // Try to enter browser fullscreen, but don't depend on it
      enterFullscreen();
    }
  }, [selectedTemplate, currentWorksheet]);

  // Initialize canvas when template is selected and worksheet is created
  useEffect(() => {
    if (selectedTemplate && currentWorksheet && canvasRef.current) {
      const loadTemplate = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        try {
          // Load via fetch -> data URL (NOT a raw cross-origin <img>) so the
          // canvas is never tainted. A tainted canvas makes toDataURL() throw
          // "The operation is insecure", which broke Apple Pencil on the iPad
          // app where the worksheet template is served from a different origin.
          const img = await loadImageElement(selectedTemplate.imageUrl);

          // Calculate dimensions to fit the available space
          const containerWidth = isFullscreen ? window.innerWidth - 280 : canvas.parentElement?.clientWidth || 800;
          const containerHeight = isFullscreen ? window.innerHeight - 120 : 600;
          
          const scale = Math.min(
            containerWidth / img.width,
            containerHeight / img.height
          );
          
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          
          // Clear and draw template
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // When resuming an interrupted session, paint the autosaved drawing
          // over the template. The saved image already includes the template
          // and shares its aspect ratio, so it maps onto the full canvas rect.
          const restore = pendingRestoreRef.current;
          if (restore && restore.worksheetId === currentWorksheet?.id && restore.drawingData) {
            try {
              const savedImg = new Image();
              // onload/onerror instead of decode() — decode() is flaky on
              // WebKit with multi-MB data URLs.
              await new Promise<void>((resolve, reject) => {
                savedImg.onload = () => resolve();
                savedImg.onerror = () => reject(new Error('restore decode failed'));
                savedImg.src = restore.drawingData; // data URL — never taints the canvas
              });
              ctx.drawImage(savedImg, 0, 0, canvas.width, canvas.height);
            } catch (e) {
              console.warn("Could not restore autosaved drawing:", e);
            }
          }

          // Store template image for eraser functionality
          setTemplateImage(img);
          
          // Save initial state to history
          const initialState = canvas.toDataURL();
          setDrawingHistory([initialState]);
          
          // Signal that the template is on the canvas (drives the iPad
          // auto-launch of the Apple Pencil surface).
          setTemplateReadyKey(k => k + 1);
          
          console.log(`Template loaded: ${canvas.width}x${canvas.height}, Fullscreen: ${isFullscreen}`);
        } catch (err) {
          console.error('Failed to load template image', err);
        }
      };

      // Load template immediately
      loadTemplate();
      
      // Also reload when window resizes (for fullscreen transitions)
      const handleResize = () => {
        setTimeout(loadTemplate, 100);
      };
      
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [selectedTemplate, currentWorksheet, isFullscreen]);

  const commitText = useCallback((text: string) => {
    if (!text.trim() || !canvasRef.current) { setTextInput(null); return; }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || !textInput) { setTextInput(null); return; }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = currentTool.color;
    ctx.font = `bold ${currentTool.size}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    // Placing text mutates the web canvas — it is authoritative now.
    pendingRestoreRef.current = null;
    ctx.fillText(text, textInput.canvasX, textInput.canvasY);
    setTextInput(null);
    // Save to history
    if (currentWorksheet) {
      const drawingData = canvas.toDataURL('image/jpeg', 0.8);
      setDrawingHistory(prev => [...prev.slice(-19), drawingData]);
    }
  }, [textInput, currentTool, currentWorksheet]);

  // Auto-focus text input when it appears
  useEffect(() => {
    if (textInput) {
      setTimeout(() => textInputRef.current?.focus(), 30);
    }
  }, [textInput]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    // Track touch fingers for custom pinch-to-zoom (native pinch is blocked by viewport meta).
    if ('pointerType' in e && e.pointerType === 'touch') {
      try { (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId); } catch {}
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // If we just got a 2nd finger, snapshot the pinch baseline.
      if (activeTouchesRef.current.size === 2) {
        const pts = Array.from(activeTouchesRef.current.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinchStartRef.current = {
          distance: Math.hypot(dx, dy) || 1,
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2,
          startScale: zoom.scale,
          startOffsetX: zoom.offsetX,
          startOffsetY: zoom.offsetY,
        };
        // Cancel any in-progress stroke when pinch begins.
        setIsDrawing(false);
        setLastPointer(null);
      }
      return;
    }

    // Text tool: place a floating input overlay at click position
    if (currentTool.type === 'text') {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const canvasX = cssX * scaleX;
      const canvasY = cssY * scaleY;
      setTextInput({ cssX, cssY, canvasX, canvasY });
      return;
    }

    const canvas = canvasRef.current;
    // A direct web stroke makes the canvas authoritative — any pending
    // native/restore snapshot is now older than what's on screen.
    pendingRestoreRef.current = null;
    // Cache the bounding rect ONCE per stroke — avoids forced layout reflow
    // on every pointermove (which is the #1 perf killer for canvas drawing).
    const rect = canvas.getBoundingClientRect();
    cachedRectRef.current = rect;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Capture the pointer so we keep getting events even if the finger/pencil
    // briefly leaves the canvas bounds.
    try { (e.currentTarget as HTMLCanvasElement).setPointerCapture((e as React.PointerEvent).pointerId); } catch {}
    activePointerIdRef.current = (e as React.PointerEvent).pointerId ?? null;

    isDrawingRef.current = true;
    setIsDrawing(true);
    lastPointRef.current = { x, y };
    prevPointRef.current = { x, y };
    setLastPointer({ x, y });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (currentTool.type === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentTool.color;
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = 1.0;
    } else if (currentTool.type === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = currentTool.color;
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = currentTool.opacity || 0.4;
    } else if (currentTool.type === 'whiteout') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = 1.0;
    } else if (currentTool.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = currentTool.size;
      ctx.globalAlpha = 1.0;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw the initial dot so a single tap registers.
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    if (currentTool.type !== 'eraser') ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    // Pinch-zoom branch: a finger touch is moving while another finger is down.
    if ('pointerType' in e && e.pointerType === 'touch') {
      if (!activeTouchesRef.current.has(e.pointerId)) return;
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouchesRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(activeTouchesRef.current.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const newDist = Math.hypot(dx, dy) || 1;
        const newMidX = (pts[0].x + pts[1].x) / 2;
        const newMidY = (pts[0].y + pts[1].y) / 2;
        const start = pinchStartRef.current;
        const rawScale = start.startScale * (newDist / start.distance);
        const newScale = Math.max(0.5, Math.min(5, rawScale));
        const newOffsetX = start.startOffsetX + (newMidX - start.midX);
        const newOffsetY = start.startOffsetY + (newMidY - start.midY);
        setZoom({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
      }
      return;
    }

    // Read from refs — NOT React state — for zero re-render overhead.
    if (!isDrawingRef.current || !canvasRef.current || !cachedRectRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = cachedRectRef.current;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Use coalesced events so we get every Apple Pencil sample (up to 240Hz),
    // not just the ones that aligned with the browser's animation frames.
    // This dramatically reduces "stairstep" aliasing on slow strokes.
    const native = e.nativeEvent as PointerEvent;
    const events: { clientX: number; clientY: number }[] =
      typeof (native as any).getCoalescedEvents === 'function'
        ? (native as any).getCoalescedEvents()
        : [native];
    const points = (events.length > 0 ? events : [native]).map((ev) => ({
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
    }));

    for (const p of points) {
      const last = lastPointRef.current;
      if (!last) {
        lastPointRef.current = p;
        prevPointRef.current = p;
        continue;
      }
      // Skip near-duplicate samples to avoid useless work, but use a tiny
      // 0.5px threshold (canvas-space) so we keep almost all detail.
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 0.25) continue;

      // Quadratic-curve smoothing: draw a curve from the previous midpoint
      // to the current midpoint, using the previous point as the control.
      // This is the standard signature-pad / sketch-app smoothing technique
      // and gives much nicer-looking strokes than straight lineTo segments.
      const midX = (last.x + p.x) / 2;
      const midY = (last.y + p.y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);

      prevPointRef.current = last;
      lastPointRef.current = p;
    }
  };

  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    // Clear touch tracking when a finger lifts.
    if (e && 'pointerType' in e && e.pointerType === 'touch') {
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) {
        pinchStartRef.current = null;
      }
      // If a touch ended, reset any partial draw state and bail (we weren't drawing on touch anyway).
      isDrawingRef.current = false;
      lastPointRef.current = null;
      prevPointRef.current = null;
      cachedRectRef.current = null;
      setIsDrawing(false);
      setLastPointer(null);
      return;
    }

    // Release pointer capture if we have it.
    if (e && 'pointerId' in e && canvasRef.current) {
      try { canvasRef.current.releasePointerCapture((e as React.PointerEvent).pointerId); } catch {}
    }
    activePointerIdRef.current = null;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    prevPointRef.current = null;
    cachedRectRef.current = null;
    setIsDrawing(false);
    setLastPointer(null);
    
    // For eraser, restore template underneath erased areas
    if (currentTool.type === 'eraser' && canvasRef.current && templateImage) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw template underneath using destination-over
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    
    // Reset canvas context to avoid tool interference  
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      }
    }
    
    // Add to history for undo functionality (lightweight)
    if (currentWorksheet && canvasRef.current) {
      const canvas = canvasRef.current;
      const drawingData = canvas.toDataURL('image/jpeg', 0.8); // Compressed for history
      
      setDrawingHistory(prev => [...prev, drawingData].slice(-5)); // Reduced to 5 states for performance
      
      // Auto-save with longer debounce and compression
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        const compressedData = canvas.toDataURL('image/jpeg', 0.6); // More compression
        updateWorksheetMutation.mutate({
          drawingData: compressedData,
          drawingHistory: JSON.stringify(drawingHistory.slice(-5)), // Keep only last 5 states
        });
      }, 10000); // Increased to 10 seconds to reduce API calls
      setAutoSaveTimer(timer);
    }
  };

  const undoLastAction = () => {
    if (drawingHistory.length <= 1 || !canvasRef.current || !templateImage) return;
    // Undo repaints from web history — the canvas is authoritative now.
    pendingRestoreRef.current = null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Remove last state and restore previous one
    const newHistory = drawingHistory.slice(0, -1);
    setDrawingHistory(newHistory);

    const previousState = newHistory[newHistory.length - 1];
    if (!previousState) return;

    // Always restore from the previous state in history.
    // Reset the context so any active tool (eraser/highlighter) doesn't
    // interfere with redrawing the snapshot.
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    img.onerror = () => {
      console.error('Undo: failed to load previous state');
    };
    img.src = previousState;
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !selectedTemplate || !templateImage) return;
    // Explicit reset: the template becomes the authoritative state — drop any
    // pending native/restore snapshot so it can't repaint or be saved.
    pendingRestoreRef.current = null;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear everything and redraw the template
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
    
    // Reset history to just the original template
    const resetState = canvas.toDataURL();
    setDrawingHistory([resetState]);
  };

  // Open the native iOS PencilKit canvas (Apple Pencil) with the current
  // worksheet (template + any existing marks) as the background. On Done, the
  // composited result replaces the canvas so Create Draft Report / Export work
  // unchanged. Only reachable inside the Capacitor iOS app.
  const openPencilKit = async () => {
    if (!canvasRef.current || pencilKitBusyRef.current) return;
    pencilKitBusyRef.current = true;
    setPencilKitPending(true);
    try {
      const bgDataUrl = canvasRef.current.toDataURL('image/png');
      // From here the native session owns the truth, so the pending restore
      // is spent — a later template reload must not repaint a stale snapshot.
      pendingRestoreRef.current = null;
      nativeSessionActiveRef.current = true;
      let result: { dataUrl: string };
      try {
        result = await presentPencilCanvas({ backgroundDataUrl: bgDataUrl });
      } catch (presentErr) {
        // Cancel (or a native failure). Dismissing the sheet can fire a
        // resize → template reload, which would blank the canvas — keep the
        // pre-open state as the reload overlay so nothing visually vanishes.
        const widCancel = currentWorksheetIdRef.current;
        if (widCancel) pendingRestoreRef.current = { worksheetId: widCancel, drawingData: bgDataUrl };
        throw presentErr;
      } finally {
        nativeSessionActiveRef.current = false;
      }
      // Done: the native composite is now the authoritative canvas state.
      // Import it into the web canvas; whether or not that succeeds, the
      // composite is queued to the server (serialized behind any in-flight
      // autosave) — losing pixels is far worse than losing the preview.
      const widForFinal = currentWorksheetIdRef.current;
      try {
        const img = new Image();
        // onload/onerror instead of img.decode(): decode() is flaky on WebKit
        // with multi-MB data URLs and would silently drop the whole import.
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Could not decode the drawing image'));
          img.src = result.dataUrl;
        });
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('Canvas unavailable after drawing');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable after drawing');
        // Keep the canvas at its existing template geometry so the web tools
        // (Clear / Undo / Eraser, which redraw templateImage at canvas dims)
        // keep working. Draw the result aspect-fit and centred — no distortion.
        const cw = canvas.width;
        const ch = canvas.height;
        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
        const newState = canvas.toDataURL('image/jpeg', 0.8);
        setDrawingHistory(prev => [...prev, newState].slice(-5));
        if (widForFinal) {
          // A template reload (resize/fullscreen settling after the sheet
          // dismisses) repaints this instead of wiping back to the template.
          pendingRestoreRef.current = { worksheetId: widForFinal, drawingData: newState };
          queueWorksheetSave(widForFinal, { drawingData: newState });
        }
        toast({
          title: "Drawing captured",
          description: "Your Apple Pencil drawing has been added to the worksheet.",
        });
      } catch (importErr: any) {
        // Preview import failed — persist the raw native export untouched so
        // the drawing still reaches the server and survives template reloads.
        if (widForFinal) {
          pendingRestoreRef.current = { worksheetId: widForFinal, drawingData: result.dataUrl };
          queueWorksheetSave(widForFinal, { drawingData: result.dataUrl });
        }
        toast({
          title: "Drawing saved",
          description: "The drawing was saved, but the preview couldn't refresh. It will appear on the report.",
        });
      }
    } catch (err: any) {
      // The user tapping Cancel rejects with "cancelled" — not an error.
      if (err?.message !== 'cancelled') {
        toast({
          title: "PencilKit Error",
          description: err?.message ?? "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      nativeSessionActiveRef.current = false;
      pencilKitBusyRef.current = false;
      setPencilKitPending(false);
    }
  };

  // On the iPad app, jump straight into Apple Pencil drawing as soon as the
  // worksheet template is ready — no extra "Draw with Apple Pencil" tap.
  // Runs once per worksheet session; after Cancel/Done the user is back on
  // the worksheet page, where tapping the canvas re-opens the pencil surface.
  useEffect(() => {
    autoOpenedPencilKitRef.current = false;
  }, [currentWorksheet?.id]);

  useEffect(() => {
    if (!templateReadyKey || !hasPencilKit || autoOpenedPencilKitRef.current || !currentWorksheet) return;
    // Debounce: the fullscreen transition and resize listener re-draw the
    // template and bump templateReadyKey again within a few hundred ms. Each
    // bump pushes the launch out so only the final (settled) layout's timer
    // fires. Mark "opened" when we actually launch — NOT when scheduled — so
    // a cancelled timer doesn't burn the session's single auto-open.
    const t = setTimeout(() => {
      autoOpenedPencilKitRef.current = true;
      openPencilKit();
    }, 400);
    return () => clearTimeout(t);
  }, [templateReadyKey]);

  // While the native Apple Pencil canvas is open, the iOS plugin emits
  // debounced "autosave" snapshots (template + strokes, JPEG). Persist them as
  // a crash-recovery copy on the server. Deliberately does NOT touch the web
  // canvas or undo history — the user may still tap Cancel to discard.
  useEffect(() => {
    if (!hasPencilKit) return;
    let disposed = false;
    let handle: Awaited<ReturnType<typeof addPencilAutosaveListener>> = null;
    addPencilAutosaveListener((dataUrl) => {
      const worksheetId = currentWorksheetIdRef.current;
      // Drop snapshots that arrive after Done/Cancel dismissed the sheet —
      // from then on the import/final-save path owns the worksheet.
      if (!worksheetId || !nativeSessionActiveRef.current) return;
      queueWorksheetSave(worksheetId, { drawingData: dataUrl });
    }).then((h) => {
      if (disposed) h?.remove();
      else handle = h;
    });
    return () => {
      disposed = true;
      handle?.remove();
    };
  }, [hasPencilKit]);

  // Flush the current canvas to the server immediately — used when the page is
  // hidden (app switch / tab close) or the Draw panel unmounts, where waiting
  // for the 10s debounced auto-save would lose the last strokes.
  // The authoritative drawing state for saves. Normally the live web canvas —
  // but when pendingRestoreRef holds a snapshot for this worksheet that the
  // canvas may not have painted yet (Done composite, Cancel snapshot, or the
  // raw native export after a failed preview import), that snapshot wins:
  // saving the canvas then would overwrite real strokes with a stale template.
  // The ref is cleared the moment the user mutates the web canvas directly
  // (stroke / clear / undo), making the canvas authoritative again.
  const canvasStateForSave = (worksheetId: number, quality = 0.8): string | null => {
    const restore = pendingRestoreRef.current;
    if (restore && restore.worksheetId === worksheetId && restore.drawingData) {
      return restore.drawingData;
    }
    if (!canvasRef.current) return null;
    try {
      return canvasRef.current.toDataURL('image/jpeg', quality);
    } catch {
      // toDataURL can throw on a tainted canvas — nothing useful to save then.
      return null;
    }
  };

  const flushAutoSave = useCallback(() => {
    const worksheetId = currentWorksheetIdRef.current;
    if (!worksheetId) return;
    // While the native Apple Pencil sheet is up the web canvas is stale
    // (template only) — flushing it would clobber the richer native autosave
    // snapshots. The native layer flushes itself on app-switch instead.
    if (nativeSessionActiveRef.current) return;
    const data = canvasStateForSave(worksheetId, 0.6);
    if (data) queueWorksheetSave(worksheetId, { drawingData: data });
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushAutoSave();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushAutoSave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushAutoSave);
      // Panel unmount (e.g. switching dashboard tabs) — save what's there.
      flushAutoSave();
    };
  }, [flushAutoSave]);

  // Rebuild a full drawing session from an unfinished worksheet: restores the
  // patient details, template and autosaved strokes, then re-enters the normal
  // drawing flow (fullscreen + template load + iPad pencil auto-open).
  const resumeWorksheet = (worksheet: DigitalWorksheet) => {
    const templates = (worksheetTemplates as WorksheetTemplate[]) || [];
    const template = templates.find((t) => t.id === worksheet.templateId);
    if (!template) {
      toast({
        title: "Cannot Resume",
        description: "The worksheet template for this drawing no longer exists.",
        variant: "destructive",
      });
      return;
    }
    pendingRestoreRef.current = worksheet.drawingData
      ? { worksheetId: worksheet.id, drawingData: worksheet.drawingData }
      : null;
    setPatientInfo({
      patientName: worksheet.patientName || "",
      patientDob: worksheet.patientDob || "",
      examDate: worksheet.examDate || new Date().toISOString().split("T")[0],
      studyType: worksheet.studyType || "",
      sonographerId: worksheet.sonographerId ? String(worksheet.sonographerId) : "",
      patientId: worksheet.patientId ?? null,
    });
    setSelectedTemplate(template);
    setCurrentWorksheet(worksheet);
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
      patientId: patientInfo.patientId,
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

  // End the current drawing session (auto-saves first, then returns to template selection).
  const endSession = () => {
    if (currentWorksheet) {
      const canvasData = canvasStateForSave(currentWorksheet.id);
      if (canvasData) {
        updateWorksheetMutation.mutate({
          drawingData: canvasData,
          drawingHistory: JSON.stringify(drawingHistory.slice(-5)),
        });
      }
    }
    setIsFullscreen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
    setCurrentWorksheet(null);
    setSelectedTemplate(null);
    pendingRestoreRef.current = null;
    setZoom({ scale: 1, offsetX: 0, offsetY: 0 });
    activeTouchesRef.current.clear();
    pinchStartRef.current = null;
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
      return;
    }
    // Exiting fullscreen ends the drawing session entirely.
    endSession();
  };

  // Keep the local isFullscreen flag in sync if the browser/OS exits fullscreen
  // (e.g. Esc key, iPad swipe-down gesture). We deliberately do NOT end the
  // drawing session here — only the explicit "Exit Fullscreen" button does that.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const resetZoom = () => {
    setZoom({ scale: 1, offsetX: 0, offsetY: 0 });
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

        {selectedPatient && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-purple-900">
                Patient pre-filled from calendar: {selectedPatient.firstName} {selectedPatient.lastName}
              </div>
              <div className="text-xs text-purple-600">
                {selectedPatient.dateOfBirth && `DOB: ${(() => { const m = selectedPatient.dateOfBirth.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : selectedPatient.dateOfBirth; })()}`}
                {selectedPatient.urNumber && ` · UR ${selectedPatient.urNumber}`}
              </div>
            </div>
            <button
              className="text-purple-400 hover:text-purple-600 transition-colors"
              onClick={handleClearPatient}
              title="Clear patient"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {resumableWorksheet && !resumeDismissed && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl" data-testid="banner-resume-drawing">
            <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <PenTool className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-900">Unsaved drawing found</div>
              <div className="text-xs text-amber-700 truncate">
                {resumableWorksheet.patientName}
                {resumableWorksheet.studyType ? ` — ${resumableWorksheet.studyType}` : ""}
                {resumableWorksheet.updatedAt
                  ? ` · last saved ${new Date(resumableWorksheet.updatedAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </div>
            </div>
            <Button size="sm" onClick={() => resumeWorksheet(resumableWorksheet)} data-testid="button-resume-drawing">
              Resume drawing
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResumeDismissed(true)} data-testid="button-dismiss-resume">
              Dismiss
            </Button>
          </div>
        )}

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
                    src={resolveUrl(template.imageUrl)} 
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
        <Dialog open={showPatientDialog} onOpenChange={(open) => {
          setShowPatientDialog(open);
          if (!open && !currentWorksheet) {
            // Only clear the patient if the session was NOT successfully started
            setSelectedPatient(null);
            setPatientSearch("");
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Start Patient Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Search Existing Patient</Label>
                {selectedPatient ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <UserCheck className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                      <div className="font-medium text-green-800">
                        {selectedPatient.firstName} {selectedPatient.lastName}
                      </div>
                      <div className="text-sm text-green-600">
                        DOB: {(() => { const d = selectedPatient.dateOfBirth || ""; const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : d; })()}
                        {selectedPatient.phone && ` | ${selectedPatient.phone}`}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={handleClearPatient}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Type patient name to search..."
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setShowPatientResults(true);
                      }}
                      onFocus={() => setShowPatientResults(true)}
                      className="pl-10"
                    />
                    {showPatientResults && patientSearch.length >= 2 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {searchedPatients.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">No patients found</div>
                        ) : (
                          searchedPatients.map((patient) => (
                            <div
                              key={patient.id}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                              onClick={() => handleSelectPatient(patient)}
                            >
                              <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                              <div className="text-sm text-gray-500">
                                DOB: {(() => { const d = patient.dateOfBirth || ""; const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : d; })()}
                                {patient.phone && ` | ${patient.phone}`}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500">Search for existing patient or enter details manually below</p>
              </div>
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Input
                  value={patientInfo.patientName}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, patientName: e.target.value, patientId: null }))}
                  placeholder="Enter patient name"
                  required
                  disabled={!!selectedPatient}
                />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={patientInfo.patientDob}
                  onChange={(e) => setPatientInfo(prev => ({ ...prev, patientDob: e.target.value }))}
                  disabled={!!selectedPatient}
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
    <div
      className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white flex flex-col' : 'container mx-auto p-6'}`}
      style={isFullscreen ? { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
    >
      <div className={`flex items-center justify-between gap-2 flex-wrap ${isFullscreen ? 'p-4 bg-gray-50 border-b shrink-0' : 'mb-6'}`}>
        <div className="min-w-0">
          <h1 className={`${isFullscreen ? 'text-xl' : 'text-3xl'} font-bold text-gray-900 truncate`}>
            Drawing: {selectedTemplate.name} - {currentWorksheet.patientName}
          </h1>
          {!isFullscreen && (
            <p className="text-sm text-gray-600">
              Session started • Auto-saving enabled
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button 
            onClick={toggleFullscreen} 
            variant="outline"
            size={isFullscreen ? "sm" : "default"}
            data-testid="button-toggle-fullscreen"
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
          {isFullscreen && zoom.scale !== 1 && (
            <Button
              onClick={resetZoom}
              variant="outline"
              size="sm"
              data-testid="button-reset-zoom"
              title="Reset pinch zoom"
            >
              Reset Zoom ({Math.round(zoom.scale * 100)}%)
            </Button>
          )}
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

      <div className={`${isFullscreen ? 'flex flex-1 min-h-0' : hasPencilKit ? 'grid grid-cols-1 gap-6' : 'grid grid-cols-1 lg:grid-cols-4 gap-6'}`}>
        {/* Drawing Tools — hidden on iPad native app, which is Apple Pencil-only */}
        {!hasPencilKit && (
        <div className={`${isFullscreen ? 'w-64 shrink-0 border-r bg-gray-50 p-4 overflow-y-auto' : ''}`}>
          <Card className={`${isFullscreen ? 'border-0 shadow-none bg-transparent' : 'lg:col-span-1'}`}>
            <CardHeader className={isFullscreen ? 'px-0 pb-2' : ''}>
              <CardTitle className={`${isFullscreen ? 'text-base' : 'text-lg'}`}>Drawing Tools</CardTitle>
            </CardHeader>
            <CardContent className={`${isFullscreen ? 'px-0' : ''} space-y-4`}>
              {/* Tool Selection */}
              <div className="space-y-2">
                <Label>Tool</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={currentTool.type === 'pen' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'pen', opacity: 1.0 }))}
                  >
                    <PenTool className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'highlighter' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ 
                      ...prev, 
                      type: 'highlighter', 
                      color: highlighterColors[0],
                      opacity: 0.4,
                      size: 8
                    }))}
                  >
                    <Highlighter className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'whiteout' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ 
                      ...prev, 
                      type: 'whiteout',
                      color: '#ffffff',
                      opacity: 1.0,
                      size: 8
                    }))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'eraser' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ 
                      ...prev, 
                      type: 'eraser', 
                      opacity: 1.0,
                      size: 20
                    }))}
                  >
                    <Eraser className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={currentTool.type === 'text' ? 'default' : 'outline'}
                    onClick={() => setCurrentTool(prev => ({ ...prev, type: 'text', opacity: 1.0, size: prev.type === 'text' ? prev.size : 24 }))}
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={undoLastAction}
                    disabled={drawingHistory.length <= 1}
                    title="Undo last action"
                  >
                    <Undo className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearCanvas}
                    title="Clear all drawing"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Highlighter Colors */}
              {currentTool.type === 'highlighter' && (
                <div className="space-y-2">
                  <Label>Highlighter Colors</Label>
                  <div className="flex gap-2">
                    {highlighterColors.map((color, index) => (
                      <button
                        key={index}
                        className={`w-8 h-8 rounded border-2 transition-all ${
                          currentTool.color === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentTool(prev => ({ ...prev, color }))}
                        title={`Highlighter color ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Opacity Slider for Highlighter */}
              {currentTool.type === 'highlighter' && (
                <div className="space-y-2">
                  <Label>Opacity: {Math.round((currentTool.opacity || 0.4) * 100)}%</Label>
                  <Slider
                    value={[(currentTool.opacity || 0.4) * 100]}
                    onValueChange={(values) => setCurrentTool(prev => ({ ...prev, opacity: values[0] / 100 }))}
                    min={10}
                    max={80}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}

              {/* Pen Colors */}
              {currentTool.type === 'pen' && (
                <div className="space-y-2">
                  <Label>Pen Colors</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {penColors.map((color, index) => (
                      <button
                        key={index}
                        className={`w-8 h-8 rounded border-2 transition-all ${
                          currentTool.color === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentTool(prev => ({ ...prev, color }))}
                        title={`Pen color ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Color Selection for Text */}
              {currentTool.type === 'text' && (
                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {penColors.map((color, index) => (
                      <button
                        key={index}
                        className={`w-8 h-8 rounded border-2 transition-all ${
                          currentTool.color === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentTool(prev => ({ ...prev, color }))}
                        title={`Text color ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Size / Font Size Selection */}
              {currentTool.type !== 'whiteout' && (
                <div className="space-y-2">
                  <Label>
                    {currentTool.type === 'text' ? `Font Size: ${currentTool.size}px` : `Size: ${currentTool.size}px`}
                    {currentTool.type === 'eraser' && ' (removes drawn content)'}
                  </Label>
                  <Slider
                    value={[currentTool.size]}
                    onValueChange={(value) => setCurrentTool(prev => ({ ...prev, size: value[0] }))}
                    max={currentTool.type === 'text' ? 72 : currentTool.type === 'highlighter' ? 15 : currentTool.type === 'eraser' ? 25 : 20}
                    min={currentTool.type === 'text' ? 10 : currentTool.type === 'highlighter' ? 5 : currentTool.type === 'eraser' ? 5 : 1}
                    step={currentTool.type === 'text' ? 2 : 1}
                    className="w-full"
                  />
                </div>
              )}
              
              {/* Text tool hint */}
              {currentTool.type === 'text' && (
                <div className="space-y-1">
                  <p className="text-xs text-blue-600 bg-blue-50 rounded p-2">Click anywhere on the canvas to place a text annotation. Press Enter to stamp it, Escape to cancel.</p>
                </div>
              )}

              {/* Tool Information */}
              {currentTool.type === 'whiteout' && (
                <div className="space-y-2">
                  <Label>White-out Tool</Label>
                  <p className="text-sm text-gray-500">Covers content with white paint (8px)</p>
                </div>
              )}
              
              {currentTool.type === 'eraser' && (
                <div className="space-y-2">
                  <Label>Eraser Tool</Label>
                  <p className="text-sm text-gray-500">Completely removes drawn content (transparent)</p>
                </div>
              )}

              {/* Clear Canvas */}
              <Button onClick={clearCanvas} variant="outline" className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Clear Drawing
              </Button>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Canvas Area */}
        <div className={`${isFullscreen ? 'flex-1 flex items-center justify-center bg-white p-4' : ''}`}>
          <Card className={`${isFullscreen ? 'border-0 shadow-none w-full h-full' : hasPencilKit ? '' : 'lg:col-span-3'}`}>
            <CardContent className={`${isFullscreen ? 'p-0 h-full flex items-center justify-center' : 'p-4'}`}>
              <div className={`border rounded-lg relative ${isFullscreen ? 'w-full h-full flex items-center justify-center' : 'max-h-[600px] overflow-auto'}`}>
                <canvas
                  ref={canvasRef}
                  className={hasPencilKit ? 'cursor-pointer' : currentTool.type === 'text' ? 'cursor-text' : currentTool.type === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair'}
                  style={{ 
                    maxWidth: isFullscreen ? 'calc(100vw - 320px)' : '100%',
                    maxHeight: isFullscreen ? 'calc(100vh - 140px)' : '600px',
                    touchAction: hasPencilKit ? 'auto' : 'none',
                    objectFit: 'contain',
                    transform: `translate(${zoom.offsetX}px, ${zoom.offsetY}px) scale(${zoom.scale})`,
                    transformOrigin: 'center center',
                    willChange: 'transform',
                  }}
                  onPointerDown={hasPencilKit ? undefined : startDrawing}
                  onPointerMove={hasPencilKit ? undefined : draw}
                  onPointerUp={hasPencilKit ? undefined : stopDrawing}
                  onPointerLeave={hasPencilKit ? undefined : stopDrawing}
                  onPointerCancel={hasPencilKit ? undefined : stopDrawing}
                  onClick={hasPencilKit ? openPencilKit : undefined}
                />
                {/* On iPad, tapping the canvas opens the native Apple Pencil
                    surface directly — no separate web drawing mode. */}
                {hasPencilKit && !pencilKitPending && (
                  <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
                    <span className="text-xs bg-black/60 text-white rounded-full px-3 py-1">
                      Tap to draw with Apple Pencil
                    </span>
                  </div>
                )}
                {/* Floating text annotation input */}
                {textInput && (
                  <input
                    ref={textInputRef}
                    type="text"
                    autoFocus
                    placeholder="Type annotation..."
                    className="absolute z-10 border-2 border-blue-400 rounded px-1 bg-white/90 outline-none shadow-lg"
                    style={{
                      left: textInput.cssX,
                      top: textInput.cssY,
                      color: currentTool.color,
                      fontSize: `${Math.max(12, currentTool.size * 0.6)}px`,
                      fontWeight: 'bold',
                      minWidth: 120,
                      transform: 'translateY(-2px)',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { commitText(e.currentTarget.value); }
                      if (e.key === 'Escape') { setTextInput(null); }
                    }}
                    onBlur={(e) => commitText(e.currentTarget.value)}
                  />
                )}
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