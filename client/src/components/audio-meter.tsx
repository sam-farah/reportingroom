import { useEffect, useRef, useState } from "react";

interface AudioMeterProps {
  analyser: AnalyserNode | null;
  active: boolean;
  height?: number;
  bars?: number;
  className?: string;
  showStatus?: boolean;
}

/**
 * Polished audio level meter.
 * - Animated EQ-style frequency bars on a dark "pro audio" panel
 * - Color zones (green → amber → red) for safe / loud / clipping
 * - Peak-hold marker that decays naturally
 * - "CLIP" warning when input is hot enough to risk distortion
 * - Live RMS volume readout in the status row
 */
export default function AudioMeter({
  analyser,
  active,
  height = 64,
  bars = 40,
  className = "",
  showStatus = true,
}: AudioMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const peakRef = useRef<number>(0);
  const peakAtRef = useRef<number>(0);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [silentMs, setSilentMs] = useState(0);
  const silentSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !active) {
      setLevel(0);
      setPeak(0);
      setClipping(false);
      setSilentMs(0);
      peakRef.current = 0;
      silentSinceRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const freqLen = analyser.frequencyBinCount;
    const freqArr = new Uint8Array(freqLen);
    const timeArr = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteFrequencyData(freqArr);
      analyser.getByteTimeDomainData(timeArr);

      // RMS from time-domain → accurate perceived loudness
      let sumSq = 0;
      for (let i = 0; i < timeArr.length; i++) {
        const v = (timeArr[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeArr.length);
      const lvl = Math.min(1, rms * 2.4);
      setLevel(lvl);

      // Peak hold with hold-then-decay behaviour
      const now = performance.now();
      if (lvl > peakRef.current) {
        peakRef.current = lvl;
        peakAtRef.current = now;
      } else if (now - peakAtRef.current > 600) {
        peakRef.current = Math.max(lvl, peakRef.current - 0.012);
      }
      setPeak(peakRef.current);

      const isClip = lvl > 0.92;
      setClipping(isClip);

      // Track sustained silence for "speak louder" hint
      if (lvl < 0.04) {
        if (silentSinceRef.current == null) silentSinceRef.current = now;
        setSilentMs(now - silentSinceRef.current);
      } else {
        silentSinceRef.current = null;
        setSilentMs(0);
      }

      // ── Render ──
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Subtle horizontal grid (3 zones)
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(148,163,184,0.12)";
      ctx.lineWidth = 1;
      [0.33, 0.66].forEach((p) => {
        const y = Math.floor(h * (1 - p)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      });

      const gap = 2;
      const barW = Math.max(2, (w - gap * (bars - 1)) / bars);
      // Logarithmic-ish frequency mapping → looks balanced like a real EQ
      const usable = Math.floor(freqLen * 0.7);
      for (let i = 0; i < bars; i++) {
        const t = i / (bars - 1);
        const idx = Math.min(usable - 1, Math.floor(Math.pow(t, 1.7) * usable));
        // Tiny smoothing across neighbours
        const v0 = freqArr[idx] / 255;
        const v1 = freqArr[Math.min(usable - 1, idx + 1)] / 255;
        const v = (v0 * 0.7 + v1 * 0.3);
        const bh = Math.max(2, v * (h - 2));
        const x = i * (barW + gap);
        const y = h - bh;

        // Color zones based on bar height (relative to total height)
        const intensity = bh / h;
        let topColor: string;
        let midColor: string;
        if (intensity > 0.85) {
          topColor = "#ef4444"; midColor = "#dc2626";
        } else if (intensity > 0.6) {
          topColor = "#fbbf24"; midColor = "#f59e0b";
        } else {
          topColor = "#34d399"; midColor = "#10b981";
        }
        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.4, midColor);
        grad.addColorStop(1, "rgba(15,23,42,0.55)");
        ctx.fillStyle = grad;
        // Rounded top
        const r = Math.min(2, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, h);
        ctx.lineTo(x, h);
        ctx.closePath();
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, active, bars]);

  const lvlPct = Math.round(level * 100);
  const peakPct = Math.round(peak * 100);

  return (
    <div className={className}>
      <div className="relative rounded-lg bg-gradient-to-b from-slate-900 to-slate-950 p-2 overflow-hidden ring-1 ring-slate-800 shadow-inner">
        <canvas ref={canvasRef} style={{ width: "100%", height, display: "block" }} />
        {/* Peak-hold vertical marker */}
        {active && peak > 0.02 && (
          <div
            className={`absolute top-1.5 bottom-1.5 w-px pointer-events-none transition-[left] duration-75 ${
              clipping ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.9)]" : "bg-white/80"
            }`}
            style={{ left: `calc(${peakPct}% - 0.5px)` }}
          />
        )}
        {clipping && (
          <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-red-500 text-white font-bold tracking-widest animate-pulse">
            CLIP
          </span>
        )}
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] uppercase tracking-widest text-slate-600">Idle</span>
          </div>
        )}
      </div>
      {showStatus && (
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                active ? (clipping ? "bg-red-500" : "bg-emerald-500 animate-pulse") : "bg-slate-300"
              }`}
            />
            {active
              ? clipping
                ? "Too loud — back off the mic"
                : silentMs > 1500
                ? "No audio detected — check your mic"
                : "Live"
              : "Idle"}
          </span>
          <span className="font-mono text-slate-500 tabular-nums">
            {lvlPct.toString().padStart(2, "0")}%
            <span className="text-slate-600 mx-1">·</span>
            peak {peakPct.toString().padStart(2, "0")}%
          </span>
        </div>
      )}
    </div>
  );
}
