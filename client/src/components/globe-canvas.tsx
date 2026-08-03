import { useEffect, useRef } from "react";

/**
 * Decorative rotating "connected dots" globe, drawn on a <canvas>.
 * Purely visual — pointer-events are disabled and it renders behind content.
 */
export default function GlobeCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const POINTS = 220;
    const LINK_DIST = 0.42; // link points closer than this (in sphere radius units)

    // Evenly spread points on a sphere (Fibonacci lattice)
    const pts: { x: number; y: number; z: number }[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < POINTS; i++) {
      const y = 1 - (i / (POINTS - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
    }

    // Precompute neighbour pairs (distances on the unit sphere are rotation-invariant)
    const pairs: [number, number][] = [];
    for (let i = 0; i < POINTS; i++) {
      for (let j = i + 1; j < POINTS; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const dz = pts[i].z - pts[j].z;
        if (dx * dx + dy * dy + dz * dz < LINK_DIST * LINK_DIST) pairs.push([i, j]);
      }
    }

    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();
    const proj: { sx: number; sy: number; z: number }[] = new Array(POINTS)
      .fill(0)
      .map(() => ({ sx: 0, sy: 0, z: 0 }));

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const rotY = t * 0.18; // slow spin
      const tilt = 0.42; // fixed axial tilt
      const cy = Math.cos(rotY);
      const sy = Math.sin(rotY);
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);

      const R = Math.min(width, height) * 0.42;
      const cxp = width / 2;
      const cyp = height / 2;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < POINTS; i++) {
        const p = pts[i];
        // rotate around Y, then tilt around X
        const x1 = p.x * cy + p.z * sy;
        const z1 = -p.x * sy + p.z * cy;
        const y1 = p.y * ct - z1 * st;
        const z2 = p.y * st + z1 * ct;
        // mild perspective
        const s = 1 / (1.6 - z2 * 0.35);
        proj[i].sx = cxp + x1 * R * s;
        proj[i].sy = cyp + y1 * R * s;
        proj[i].z = z2;
      }

      // links
      for (const [i, j] of pairs) {
        const zAvg = (proj[i].z + proj[j].z) / 2; // -1 (back) .. 1 (front)
        const alpha = 0.05 + ((zAvg + 1) / 2) * 0.16;
        ctx.strokeStyle = `rgba(94, 234, 212, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(proj[i].sx, proj[i].sy);
        ctx.lineTo(proj[j].sx, proj[j].sy);
        ctx.stroke();
      }

      // dots
      for (let i = 0; i < POINTS; i++) {
        const front = (proj[i].z + 1) / 2;
        const alpha = 0.15 + front * 0.55;
        const size = 0.8 + front * 1.4;
        ctx.fillStyle = `rgba(147, 197, 253, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(proj[i].sx, proj[i].sy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className || ""}`}
      aria-hidden="true"
    />
  );
}
