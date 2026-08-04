import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Palette, Eraser, RotateCcw, Save, Maximize2, X, ZoomIn, ZoomOut, Minimize, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isPencilKitAvailable, presentPencilCanvas, addPencilAutosaveListener } from '@/lib/pencilkit';

interface DrawingCanvasProps {
  onWorksheetCreated: (imageData: string, templateName: string) => void;
}

const VASCULAR_TEMPLATES = {
  'lower-limb-arterial': { name: 'Lower Limb Arterial' },
  'lower-limb-venous': { name: 'Lower Limb Venous Duplex' },
  'aorto-iliac': { name: 'Aorto Iliac' },
} as const;

type TemplateKey = keyof typeof VASCULAR_TEMPLATES;

/** A crash-recovery copy of an in-progress Apple Pencil drawing. */
interface PencilSnapshot {
  dataUrl: string;
  template: TemplateKey;
}

// Natural size of each template at scale 1, in logical pixels.
//
// The renderers below lay out a tall portrait form (a header block plus one row
// per vessel segment). These numbers are the size the form actually needs — get
// them wrong and the bottom segments are simply painted off-canvas. That is what
// used to happen to Aorto-Iliac and the Lower Limb forms: they were rendered
// into a 600x400 landscape canvas, so roughly half of every form was cut off,
// including in the image handed to Apple Pencil as its background.
//
// Height = first segment top (140) + segmentCount * (segmentHeight + 4 gap),
// plus a bottom margin. Width covers the right-most field (margin + 460 + text).
const TEMPLATE_LAYOUT: Record<TemplateKey, { width: number; height: number }> = {
  'lower-limb-arterial': { width: 620, height: 700 },  // 9 segments @ 55
  'lower-limb-venous': { width: 620, height: 930 },    // 11 segments @ 65
  'aorto-iliac': { width: 620, height: 880 },          // 9 segments @ 75
};

/** Fits a template's natural size into `availableHeight`, preserving aspect. */
function fitTemplate(template: TemplateKey, availableHeight: number) {
  const natural = TEMPLATE_LAYOUT[template];
  const scale = availableHeight / natural.height;
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(availableHeight),
    scale,
  };
}

// ---------- Template renderers (unchanged drawing logic, just extracted) ----------

function drawLowerLimbArterialTemplate(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const margin = 40 * scale;
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.round(18 * scale)}px Arial`;
  ctx.fillText('LOWER LIMB ARTERIAL ULTRASOUND', margin, 35 * scale);
  ctx.font = `${Math.round(11 * scale)}px Arial`;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, 50 * scale, width - 2 * margin, 70 * scale);
  ctx.fillText('Patient Name: ____________________', margin + 10, 75 * scale);
  ctx.fillText('DOB: ____________', margin + 280 * scale, 75 * scale);
  ctx.fillText('Date: ____________', margin + 450 * scale, 75 * scale);
  ctx.fillText('Indication: ________________________________', margin + 10, 105 * scale);
  const segmentHeight = 55 * scale;
  const segments = ['Aorta', 'Common Iliac', 'External Iliac', 'Common Femoral', 'Superficial Femoral', 'Popliteal', 'Anterior Tibial', 'Posterior Tibial', 'Peroneal'];
  let yPos = 140 * scale;
  segments.forEach((segment) => {
    ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
    ctx.fillText(segment, margin + 10, yPos + 18 * scale);
    ctx.fillText('PSV: ______ cm/s', margin + 180 * scale, yPos + 18 * scale);
    ctx.fillText('EDV: ______ cm/s', margin + 320 * scale, yPos + 18 * scale);
    ctx.fillText('RI: ______', margin + 460 * scale, yPos + 18 * scale);
    ctx.fillText('Waveform: ____________', margin + 10, yPos + 40 * scale);
    yPos += segmentHeight + 4 * scale;
  });
}

function drawLowerLimbVenousTemplate(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const margin = 40 * scale;
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.round(18 * scale)}px Arial`;
  ctx.fillText('LOWER LIMB VENOUS DUPLEX', margin, 35 * scale);
  ctx.font = `${Math.round(11 * scale)}px Arial`;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, 50 * scale, width - 2 * margin, 70 * scale);
  ctx.fillText('Patient Name: ____________________', margin + 10, 75 * scale);
  ctx.fillText('DOB: ____________', margin + 280 * scale, 75 * scale);
  ctx.fillText('Date: ____________', margin + 450 * scale, 75 * scale);
  ctx.fillText('Indication: ________________________________', margin + 10, 105 * scale);
  const segmentHeight = 65 * scale;
  const segments = ['IVC', 'Common Iliac', 'External Iliac', 'Common Femoral', 'Femoral', 'Deep Femoral', 'Popliteal', 'Posterior Tibial', 'Peroneal', 'Great Saphenous', 'Small Saphenous'];
  let yPos = 140 * scale;
  segments.forEach((segment) => {
    ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
    ctx.fillText(segment, margin + 10, yPos + 18 * scale);
    ctx.fillText('Compressibility: □ Full □ Partial □ None', margin + 170 * scale, yPos + 18 * scale);
    ctx.fillText('Flow: □ Spontaneous □ Augmented □ Absent', margin + 10, yPos + 40 * scale);
    ctx.fillText('Reflux: □ None □ <0.5s □ >0.5s', margin + 350 * scale, yPos + 40 * scale);
    yPos += segmentHeight + 4 * scale;
  });
}

function drawAortoIliacTemplate(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const margin = 40 * scale;
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.round(18 * scale)}px Arial`;
  ctx.fillText('AORTO-ILIAC ULTRASOUND', margin, 35 * scale);
  ctx.font = `${Math.round(11 * scale)}px Arial`;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, 50 * scale, width - 2 * margin, 70 * scale);
  ctx.fillText('Patient Name: ____________________', margin + 10, 75 * scale);
  ctx.fillText('DOB: ____________', margin + 280 * scale, 75 * scale);
  ctx.fillText('Date: ____________', margin + 450 * scale, 75 * scale);
  ctx.fillText('Indication: ________________________________', margin + 10, 105 * scale);
  const segmentHeight = 75 * scale;
  const segments = ['Proximal Aorta', 'Mid Aorta', 'Distal Aorta', 'Right Common Iliac', 'Left Common Iliac', 'Right External Iliac', 'Left External Iliac', 'Right Internal Iliac', 'Left Internal Iliac'];
  let yPos = 140 * scale;
  segments.forEach((segment) => {
    ctx.strokeRect(margin, yPos, width - 2 * margin, segmentHeight);
    ctx.fillText(segment, margin + 10, yPos + 18 * scale);
    ctx.fillText('Diameter: ______ cm', margin + 170 * scale, yPos + 18 * scale);
    ctx.fillText('PSV: ______ cm/s', margin + 350 * scale, yPos + 18 * scale);
    ctx.fillText('EDV: ______ cm/s', margin + 170 * scale, yPos + 40 * scale);
    ctx.fillText('Plaque: □ None □ <50% □ 50-70% □ >70%', margin + 10, yPos + 60 * scale);
    yPos += segmentHeight + 4 * scale;
  });
}

function paintTemplate(ctx: CanvasRenderingContext2D, width: number, height: number, template: TemplateKey, scale: number) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (template === 'lower-limb-arterial') drawLowerLimbArterialTemplate(ctx, width, height, scale);
  else if (template === 'lower-limb-venous') drawLowerLimbVenousTemplate(ctx, width, height, scale);
  else if (template === 'aorto-iliac') drawAortoIliacTemplate(ctx, width, height, scale);
  ctx.restore();
}

/**
 * Renders a template on its own off-screen canvas at its full natural size and
 * returns a PNG data URL.
 *
 * Used for the Apple Pencil background: the on-screen preview is a small,
 * scaled-down copy, so exporting that gave PencilKit a low-resolution image.
 * Rendering fresh at 2x gives a crisp, complete form — and because the native
 * side crops its export to the background's aspect ratio, the drawing that
 * comes back is a correctly-proportioned portrait worksheet.
 */
function renderTemplateDataUrl(template: TemplateKey, scale = 2): string | null {
  const natural = TEMPLATE_LAYOUT[template];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(natural.width * scale);
  canvas.height = Math.round(natural.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintTemplate(ctx, canvas.width, canvas.height, template, scale);
  return canvas.toDataURL('image/png');
}

// ---------- Shared drawing surface with smoothing, HiDPI, pinch-zoom ----------

const COMPACT_HEIGHT = 460;

interface DrawingSurfaceProps {
  template: TemplateKey;
  tool: 'pen' | 'eraser';
  strokeColor: string;
  strokeWidth: number;
  logicalWidth: number;
  logicalHeight: number;
  templateScale: number;
  surfaceRef: React.MutableRefObject<DrawingSurfaceHandle | null>;
  onZoomChange?: (zoom: number) => void;
  /** When false the surface is display-only (no strokes, no pinch). */
  interactive?: boolean;
  className?: string;
  containerClassName?: string;
}

export interface DrawingSurfaceHandle {
  clear: () => void;
  undo: () => void;
  toDataURL: () => string | null;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  getZoom: () => number;
}

function DrawingSurface({ template, tool, strokeColor, strokeWidth, logicalWidth, logicalHeight, templateScale, surfaceRef, onZoomChange, interactive = true, className, containerClassName }: DrawingSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // High-DPI-aware paint sizing
  const dprRef = useRef(typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1);

  // Snapshot for undo (taken at stroke start)
  const undoSnapshotRef = useRef<ImageData | null>(null);

  // Active drawing state — refs to avoid re-renders during strokes
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<{ x: number; y: number; pressure: number }[]>([]);
  const rafPendingRef = useRef(false);

  // Active pointers for pinch detection
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Pinch state
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialMidX: number;
    initialMidY: number;
    initialZoom: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  // View transform (zoom + pan applied via CSS transform on the wrapper div)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Repaint template on size/template change. Establish HiDPI backing store.
  const repaintTemplate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = dprRef.current;
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    paintTemplate(ctx, logicalWidth, logicalHeight, template, templateScale);
  }, [logicalWidth, logicalHeight, template, templateScale]);

  useEffect(() => {
    repaintTemplate();
  }, [repaintTemplate]);

  // Listen for DPR changes (e.g., user zoom or moving across monitors)
  useEffect(() => {
    const onChange = () => {
      const newDpr = Math.max(1, window.devicePixelRatio || 1);
      if (newDpr !== dprRef.current) {
        dprRef.current = newDpr;
        repaintTemplate();
      }
    };
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }, [repaintTemplate]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect(); // already includes CSS transform
    const scaleX = logicalWidth / rect.width;
    const scaleY = logicalHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const beginStroke = (x: number, y: number, pressure: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Snapshot for undo (in physical pixels)
    try {
      undoSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      undoSnapshotRef.current = null;
    }

    isDrawingRef.current = true;
    pointsRef.current = [{ x, y, pressure }];

    if (tool === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = strokeColor;
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const flushStroke = () => {
    rafPendingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const points = pointsRef.current;
    if (points.length < 2) return;

    const baseWidth = tool === 'eraser' ? strokeWidth * 3 : strokeWidth;

    // Draw using quadratic curves between midpoints for smooth strokes.
    // Repaint the entire current stroke from the snapshot to avoid kinks
    // when new points come in mid-frame.
    if (undoSnapshotRef.current) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(undoSnapshotRef.current, 0, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineWidth = baseWidth * (0.5 + (points[1].pressure || 0.5));
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }
    // Render piecewise — vary width with pressure if the device reports it.
    for (let i = 1; i < points.length - 1; i++) {
      const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      ctx.lineWidth = baseWidth * (0.5 + (points[i].pressure || 0.5));
      ctx.beginPath();
      const prevMid = i === 1
        ? points[0]
        : { x: (points[i - 1].x + points[i].x) / 2, y: (points[i - 1].y + points[i].y) / 2 };
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
      ctx.stroke();
    }
    // Final segment to last point
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const prevMid = { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 };
    ctx.beginPath();
    ctx.lineWidth = baseWidth * (0.5 + (last.pressure || 0.5));
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  };

  const scheduleFlush = () => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(flushStroke);
  };

  const endStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    // Final flush to ensure the last segment is drawn
    flushStroke();
    pointsRef.current = [];
  };

  // ---- Pointer / pinch handling ----

  const startPinch = () => {
    const pts = Array.from(activePointersRef.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    pinchStateRef.current = {
      initialDistance: Math.hypot(a.x - b.x, a.y - b.y),
      initialMidX: (a.x + b.x) / 2,
      initialMidY: (a.y + b.y) / 2,
      initialZoom: zoom,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
  };

  const updatePinch = () => {
    const ps = pinchStateRef.current;
    if (!ps) return;
    const pts = Array.from(activePointersRef.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (ps.initialDistance < 1) return;
    const newZoom = Math.min(5, Math.max(0.5, ps.initialZoom * (dist / ps.initialDistance)));
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const newPanX = ps.initialPanX + (midX - ps.initialMidX);
    const newPanY = ps.initialPanY + (midY - ps.initialMidY);
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
    onZoomChange?.(newZoom);
  };

  const cancelStrokeWithSnapshot = () => {
    if (undoSnapshotRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(undoSnapshotRef.current, 0, 0);
        ctx.restore();
      }
    }
    isDrawingRef.current = false;
    pointsRef.current = [];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size >= 2) {
      // 2+ touches → enter pinch, abandon any in-progress stroke
      cancelStrokeWithSnapshot();
      startPinch();
      return;
    }

    // Single pointer — start a stroke
    const c = getCanvasCoords(e.clientX, e.clientY);
    beginStroke(c.x, c.y, e.pressure || 0.5);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size >= 2) {
      updatePinch();
      return;
    }

    if (!isDrawingRef.current) return;

    // Use coalesced events on supporting platforms for sub-frame stylus precision.
    const native = e.nativeEvent as PointerEvent;
    const events: PointerEvent[] = (native as any).getCoalescedEvents
      ? (native as any).getCoalescedEvents()
      : [native];
    for (const ev of events) {
      const c = getCanvasCoords(ev.clientX, ev.clientY);
      pointsRef.current.push({ x: c.x, y: c.y, pressure: (ev as any).pressure || 0.5 });
    }
    scheduleFlush();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) {
      pinchStateRef.current = null;
      endStroke();
    } else if (activePointersRef.current.size === 1) {
      // dropped from 2→1 — exit pinch but don't auto-resume drawing
      pinchStateRef.current = null;
    }
  };

  // Imperative handle for parent toolbar
  useEffect(() => {
    surfaceRef.current = {
      clear: () => repaintTemplate(),
      undo: () => {
        const canvas = canvasRef.current;
        if (!canvas || !undoSnapshotRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(undoSnapshotRef.current, 0, 0);
        ctx.restore();
      },
      toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? null,
      zoomIn: () => setZoom((z) => {
        const next = Math.min(5, +(z + 0.25).toFixed(2));
        onZoomChange?.(next);
        return next;
      }),
      zoomOut: () => setZoom((z) => {
        const next = Math.max(0.5, +(z - 0.25).toFixed(2));
        onZoomChange?.(next);
        return next;
      }),
      resetView: () => { setZoom(1); setPan({ x: 0, y: 0 }); onZoomChange?.(1); },
      getZoom: () => zoom,
    };
  });

  // Cancel any pending RAF on unmount
  useEffect(() => () => { rafPendingRef.current = false; }, []);

  return (
    <div ref={wrapperRef} className={containerClassName} style={{ overflow: 'hidden', touchAction: 'none' }}>
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: logicalWidth,
          height: logicalHeight,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={interactive ? onPointerDown : undefined}
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? onPointerUp : undefined}
          onPointerCancel={interactive ? onPointerUp : undefined}
          onPointerLeave={!interactive ? undefined : (e) => {
            // Only end if this pointer was tracked and there are no others
            if (activePointersRef.current.has(e.pointerId)) {
              activePointersRef.current.delete(e.pointerId);
              if (activePointersRef.current.size === 0) endStroke();
            }
          }}
          className={className}
          style={{ touchAction: 'none', display: 'block', background: '#ffffff' }}
        />
      </div>
    </div>
  );
}

// ---------- Outer component ----------

export default function DrawingCanvas({ onWorksheetCreated }: DrawingCanvasProps) {
  const { toast } = useToast();
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('lower-limb-arterial');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomBadge, setZoomBadge] = useState(1);
  const [pencilKitPending, setPencilKitPending] = useState(false);

  const compactRef = useRef<DrawingSurfaceHandle | null>(null);
  const fullRef = useRef<DrawingSurfaceHandle | null>(null);

  const hasPencilKit = isPencilKitAvailable();

  // ---- Apple Pencil interruption safety net --------------------------------
  //
  // The main worksheet screen (pages/draw.tsx) already has one, but it works by
  // streaming autosave snapshots onto an existing worksheet row. This screen has
  // no such row: the worksheet is *created* from whatever the pencil sheet hands
  // back. So if that hand-back never happens — a native error, an interruption
  // that tears the sheet down, a dropped bridge result — there is nothing on the
  // server and the sonographer's drawing is simply gone.
  //
  // The native plugin already emits debounced "autosave" snapshots while the
  // canvas is open, flushes one the instant the app is backgrounded, and flushes
  // again just before Done. Nothing here was listening to them. We now keep the
  // newest snapshot for the live session and fall back to it whenever the
  // session ends without a usable result.
  //
  // Two deliberate limitations, both because the plugin has no per-session id
  // and no terminal "session ended" event the web layer can trust:
  //  - The snapshot is held in memory only. Persisting a half-finished worksheet
  //    to browser storage would leave patient data at rest outside the
  //    encrypted server store, which isn't a trade worth making here.
  //  - Recovery runs only when the native call actually rejects. If the sheet
  //    were ever to disappear without settling its promise, there is no signal
  //    to distinguish that from a session still in progress, and guessing would
  //    risk discarding a real drawing mid-save. Closing and reopening the panel
  //    resets the launch guard.
  const nativeSessionActiveRef = useRef(false);
  const pencilKitBusyRef = useRef(false);
  const lastSnapshotRef = useRef<PencilSnapshot | null>(null);

  // The template chosen when the sheet was launched. The autosave listener must
  // not read the live selection — changing the dropdown mid-session would
  // relabel a drawing that was made on a different form.
  const sessionTemplateRef = useRef<TemplateKey>(selectedTemplate);

  /** Reads and clears the recovery snapshot — it may only ever be used once. */
  const takePencilSnapshot = (): PencilSnapshot | null => {
    const snapshot = lastSnapshotRef.current;
    lastSnapshotRef.current = null;
    return snapshot;
  };

  // The parent's handler is captured in a ref so a session that outlives the
  // current render (the "add page" dialog closes itself on save) never calls a
  // stale closure.
  const onWorksheetCreatedRef = useRef(onWorksheetCreated);
  useEffect(() => {
    onWorksheetCreatedRef.current = onWorksheetCreated;
  });

  useEffect(() => {
    if (!hasPencilKit) return;
    let disposed = false;
    let handle: Awaited<ReturnType<typeof addPencilAutosaveListener>> = null;
    addPencilAutosaveListener((dataUrl) => {
      // Ignore snapshots that land after this component is gone, or after
      // Done/Cancel — from that point the returned drawing (or the user's
      // explicit discard) is the truth.
      if (disposed || !nativeSessionActiveRef.current) return;
      lastSnapshotRef.current = { dataUrl, template: sessionTemplateRef.current };
    }).then((h) => {
      if (disposed) h?.remove();
      else handle = h;
    });
    return () => {
      disposed = true;
      handle?.remove();
    };
  }, [hasPencilKit]);

  // The fullscreen surface is sized to the viewport, so it has to follow
  // rotation, split-view resizes and keyboard changes on the iPad.
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 900,
  );
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Both surfaces are sized from the template's natural aspect so the whole
  // form is visible — previously they used fixed landscape boxes that cut the
  // taller forms (Aorto-Iliac, Lower Limb) off part-way down.
  const compactLayout = fitTemplate(selectedTemplate, COMPACT_HEIGHT);
  const fullLayout = fitTemplate(selectedTemplate, Math.max(400, viewportHeight - 220));

  const saveFromFullscreen = () => {
    const data = fullRef.current?.toDataURL();
    if (!data) return;
    onWorksheetCreated(data, VASCULAR_TEMPLATES[selectedTemplate].name);
    setIsFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    toast({ title: 'Worksheet Created', description: `${VASCULAR_TEMPLATES[selectedTemplate].name} worksheet has been created successfully` });
  };

  // Open native PencilKit canvas with the current template rendered as background.
  const openPencilKit = async () => {
    if (pencilKitBusyRef.current) return;
    pencilKitBusyRef.current = true;
    setPencilKitPending(true);
    const templateName = VASCULAR_TEMPLATES[selectedTemplate].name;
    // Fresh session — any snapshot from a previous one is spent.
    takePencilSnapshot();
    sessionTemplateRef.current = selectedTemplate;
    nativeSessionActiveRef.current = true;
    try {
      // Render the template fresh at full size rather than exporting the small
      // on-screen preview — the preview is scaled down to fit its box, so using
      // it gave Apple Pencil a low-resolution background.
      const bgDataUrl = renderTemplateDataUrl(selectedTemplate) ?? compactRef.current?.toDataURL() ?? undefined;
      let result: { dataUrl: string };
      try {
        result = await presentPencilCanvas({ backgroundDataUrl: bgDataUrl });
      } finally {
        nativeSessionActiveRef.current = false;
      }
      // Done returned the authoritative composite — the recovery copy is spent.
      takePencilSnapshot();
      onWorksheetCreatedRef.current(result.dataUrl, templateName);
      toast({ title: 'Worksheet Created', description: `${templateName} worksheet has been created successfully` });
    } catch (err: any) {
      nativeSessionActiveRef.current = false;
      const rescued = takePencilSnapshot();

      if (err?.message === 'cancelled') {
        // Not an error. The native sheet already asks "Discard this drawing?"
        // whenever strokes exist, so a cancel here is a confirmed discard —
        // resurrecting the strokes from a snapshot would override the user.
        return;
      }
      if (rescued) {
        // The session ended without handing back a drawing. Save the last
        // autosaved snapshot instead: losing the preview is recoverable,
        // losing the sonographer's marks is not.
        onWorksheetCreatedRef.current(rescued.dataUrl, VASCULAR_TEMPLATES[rescued.template].name);
        toast({
          title: 'Drawing recovered',
          description: 'The Apple Pencil screen closed unexpectedly, so your last autosaved drawing was kept.',
        });
        return;
      }
      toast({ title: 'PencilKit Error', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      nativeSessionActiveRef.current = false;
      pencilKitBusyRef.current = false;
      setPencilKitPending(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Template:</label>
          <Select value={selectedTemplate} onValueChange={(v: TemplateKey) => setSelectedTemplate(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(VASCULAR_TEMPLATES).map(([key, t]) => (
                <SelectItem key={key} value={key}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {hasPencilKit ? (
            <Button
              variant="default"
              size="sm"
              onClick={openPencilKit}
              disabled={pencilKitPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Pencil className="w-3 h-3 mr-1" />
              {pencilKitPending ? 'Opening…' : 'Draw with Apple Pencil'}
            </Button>
          ) : (
            <>
              <Button variant={currentTool === 'pen' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentTool('pen')}>
                <Palette className="w-3 h-3 mr-1" /> Pen
              </Button>
              <Button variant={currentTool === 'eraser' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentTool('eraser')}>
                <Eraser className="w-3 h-3 mr-1" /> Eraser
              </Button>

              <Separator orientation="vertical" className="h-6" />

              <Button variant="outline" size="sm" onClick={() => compactRef.current?.zoomOut()}>
                <ZoomOut className="w-3 h-3" />
              </Button>
              <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoomBadge * 100)}%</span>
              <Button variant="outline" size="sm" onClick={() => compactRef.current?.zoomIn()}>
                <ZoomIn className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => compactRef.current?.resetView()}>
                <Minimize className="w-3 h-3 mr-1" /> Reset
              </Button>

              <Separator orientation="vertical" className="h-6" />

              <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Maximize2 className="w-3 h-3 mr-1" /> Full Screen</Button>
                </DialogTrigger>
              </Dialog>
            </>
          )}
        </div>

        <div
          className="border border-gray-300 rounded-lg overflow-hidden flex justify-center"
          style={{ height: COMPACT_HEIGHT }}
          onClick={hasPencilKit ? openPencilKit : undefined}
        >
          <DrawingSurface
            template={selectedTemplate}
            tool={currentTool}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            logicalWidth={compactLayout.width}
            logicalHeight={compactLayout.height}
            templateScale={compactLayout.scale}
            surfaceRef={compactRef}
            onZoomChange={setZoomBadge}
            // On the iPad the real drawing surface is Apple Pencil, so this is a
            // read-only preview — tapping it opens the pencil canvas instead of
            // leaving stray finger marks that PencilKit would never see.
            interactive={!hasPencilKit}
            containerClassName="h-full bg-white"
            className={hasPencilKit ? 'cursor-pointer' : 'cursor-crosshair'}
          />
        </div>
        <p className="text-xs text-gray-500">
          {hasPencilKit
            ? 'Tap the worksheet to draw with Apple Pencil.'
            : 'Tip: pinch with two fingers to zoom on a tablet. Open Full Screen for detailed work.'}
        </p>
      </div>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[99vw] max-h-[99vh] w-[99vw] h-[99vh] p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Fullscreen Drawing Canvas</DialogTitle>
          </DialogHeader>
          <div className="w-full h-full flex flex-col bg-white">
            <div className="flex items-center justify-between p-3 border-b bg-gray-50 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Vascular Worksheet Drawing</h3>
                <Select value={selectedTemplate} onValueChange={(v: TemplateKey) => setSelectedTemplate(v)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VASCULAR_TEMPLATES).map(([key, t]) => (
                      <SelectItem key={key} value={key}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => { setIsFullscreen(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }}>
                <X className="w-4 h-4 mr-1" /> Exit
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-3 border-b bg-white shrink-0">
              <Button variant={currentTool === 'pen' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentTool('pen')}>
                <Palette className="w-4 h-4 mr-1" /> Pen
              </Button>
              <Button variant={currentTool === 'eraser' ? 'default' : 'outline'} size="sm" onClick={() => setCurrentTool('eraser')}>
                <Eraser className="w-4 h-4 mr-1" /> Eraser
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className="w-8 h-8 border border-gray-300 rounded cursor-pointer" />
              <input type="range" min={1} max={15} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-20" />
              <span className="text-sm w-6">{strokeWidth}</span>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="outline" size="sm" onClick={() => fullRef.current?.zoomOut()}><ZoomOut className="w-4 h-4" /></Button>
              <span className="text-xs tabular-nums w-12 text-center">{Math.round(zoomBadge * 100)}%</span>
              <Button variant="outline" size="sm" onClick={() => fullRef.current?.zoomIn()}><ZoomIn className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => fullRef.current?.resetView()}><Minimize className="w-4 h-4 mr-1" /> Reset View</Button>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="outline" size="sm" onClick={() => fullRef.current?.clear()}>Clear</Button>
              <Button variant="outline" size="sm" onClick={() => fullRef.current?.undo()}><RotateCcw className="w-4 h-4 mr-1" /> Undo</Button>
              <Button onClick={saveFromFullscreen} className="medical-btn-primary"><Save className="w-4 h-4 mr-1" /> Use Worksheet</Button>
            </div>

            <div className="flex-1 overflow-hidden bg-gray-100">
              <DrawingSurface
                template={selectedTemplate}
                tool={currentTool}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                logicalWidth={fullLayout.width}
                logicalHeight={fullLayout.height}
                templateScale={fullLayout.scale}
                surfaceRef={fullRef}
                containerClassName="w-full h-full flex items-start justify-center p-4"
                className="border-2 border-gray-300 shadow-lg cursor-crosshair"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
