import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface ConsentData {
  patientName: string;
  clinicName: string;
  clinicLogoUrl: string | null;
  consentText: string;
}

export default function ConsentPage() {
  const { token } = useParams<{ token: string }>();
  const [consentScrolled, setConsentScrolled] = useState(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigDrawing = useRef(false);
  const sigLastPt = useRef<{ x: number; y: number } | null>(null);

  const { data, isLoading, error } = useQuery<ConsentData>({
    queryKey: ["/api/consent", token],
    retry: false,
  });

  // Size the canvas to its rendered width (responsive on phones).
  useEffect(() => {
    if (submitted) return;
    const c = sigCanvasRef.current;
    if (!c) return;
    const resize = () => {
      const rect = c.getBoundingClientRect();
      if (rect.width === 0) return;
      c.width = Math.round(rect.width);
      c.height = 200;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
      }
      setSignatureEmpty(true);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [data, submitted]);

  const getSigCtx = () => sigCanvasRef.current?.getContext("2d") || null;
  const sigPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sigCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const sigStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sigDrawing.current = true;
    sigLastPt.current = sigPos(e);
  };
  const sigMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sigDrawing.current) return;
    const ctx = getSigCtx();
    if (!ctx || !sigLastPt.current) return;
    const p = sigPos(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(sigLastPt.current.x, sigLastPt.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    sigLastPt.current = p;
    if (signatureEmpty) setSignatureEmpty(false);
  };
  const sigEnd = () => { sigDrawing.current = false; sigLastPt.current = null; };
  const sigClear = () => {
    const c = sigCanvasRef.current;
    const ctx = getSigCtx();
    if (c && ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    setSignatureEmpty(true);
  };

  const submit = async () => {
    if (!sigCanvasRef.current || signatureEmpty || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const dataUrl = sigCanvasRef.current.toDataURL("image/png");
      const res = await fetch(`/api/consent/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: dataUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSubmitError(err.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Could not submit your consent. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    const raw = (error as any)?.message?.replace(/^\d+:\s*/, "") || "";
    let message = "This consent link is no longer available.";
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) message = parsed.error;
    } catch {
      if (raw) message = raw;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-8 text-center space-y-3">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h1 className="text-xl font-semibold text-slate-900">Consent unavailable</h1>
            <p className="text-slate-600">{message}</p>
            <p className="text-sm text-slate-400">Please speak to the clinic reception.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <h1 className="text-2xl font-bold text-slate-900">Thank you</h1>
            <p className="text-slate-600">
              Your consent has been recorded for your study at {data.clinicName}. You can close this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-[#1a1a2e] px-4 py-5 flex flex-col items-center text-center">
        {data.clinicLogoUrl ? (
          <img src={data.clinicLogoUrl} alt={data.clinicName} className="h-12 object-contain" />
        ) : (
          <h1 className="text-white text-lg font-semibold">{data.clinicName}</h1>
        )}
        {data.clinicLogoUrl && <p className="text-slate-300 text-xs mt-2">{data.clinicName}</p>}
      </div>

      <div className="flex-1 px-4 py-5">
        <div className="max-w-2xl mx-auto space-y-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Consent for today's study</h2>
            <p className="text-slate-600 text-sm mt-1">
              {data.patientName} — please read the consent below and sign with your finger to confirm.
            </p>
          </div>

          <div
            ref={(el) => {
              if (el && el.scrollHeight <= el.clientHeight + 8) setConsentScrolled(true);
            }}
            className="border rounded-lg p-4 bg-white max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-slate-800 text-[15px] leading-relaxed"
            onScroll={(e) => {
              const t = e.currentTarget;
              if (t.scrollTop + t.clientHeight >= t.scrollHeight - 8) setConsentScrolled(true);
            }}
            data-testid="text-consent-body"
          >
            {data.consentText}
          </div>
          {!consentScrolled && (
            <p className="text-sm text-amber-600 text-center">Please scroll to the end of the consent text.</p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Your signature</label>
              <Button variant="outline" size="sm" onClick={sigClear} data-testid="button-clear-signature">
                Clear
              </Button>
            </div>
            <canvas
              ref={sigCanvasRef}
              onPointerDown={sigStart}
              onPointerMove={sigMove}
              onPointerUp={sigEnd}
              onPointerLeave={sigEnd}
              className="w-full h-[200px] border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair"
              data-testid="canvas-signature"
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-600 text-center" data-testid="text-submit-error">{submitError}</p>
          )}

          <Button
            onClick={submit}
            disabled={!consentScrolled || signatureEmpty || submitting}
            className="w-full h-14 text-base"
            data-testid="button-submit-consent"
          >
            {submitting ? "Submitting…" : "I Agree & Sign"}
          </Button>
          <p className="text-xs text-slate-400 text-center pb-4">
            Powered by Reporting Room
          </p>
        </div>
      </div>
    </div>
  );
}
