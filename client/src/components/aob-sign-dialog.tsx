import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCents } from "@shared/mbs";
import type { AssessmentOfBenefitForm } from "@shared/schema";

interface AobSignDialogProps {
  form: AssessmentOfBenefitForm | null;
  onOpenChange: (open: boolean) => void;
  onSigned: (updated: AssessmentOfBenefitForm) => void;
}

export function AobSignDialog({ form, onOpenChange, onSigned }: AobSignDialogProps) {
  const queryClient = useQueryClient();
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  const getCtx = () => canvasRef.current?.getContext("2d") || null;
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    lastPt.current = getPos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx || !lastPt.current) return;
    const p = getPos(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt.current = p;
    if (signatureEmpty) setSignatureEmpty(false);
  };
  const end = () => { drawing.current = false; lastPt.current = null; };
  const clear = () => {
    const c = canvasRef.current;
    const ctx = getCtx();
    if (c && ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    setSignatureEmpty(true);
  };

  const signMutation = useMutation({
    mutationFn: async ({ id, signatureDataUrl }: { id: number; signatureDataUrl: string }) => {
      const response = await apiRequest(`/api/assessment-of-benefit/${id}/sign`, "POST", { signatureDataUrl });
      return await response.json();
    },
    onSuccess: (updated: AssessmentOfBenefitForm) => {
      onSigned(updated);
      setSignatureEmpty(true);
    },
  });

  return (
    <Dialog open={!!form} onOpenChange={(open) => { if (!open) { onOpenChange(false); setSignatureEmpty(true); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            Assessment of Benefits — Patient Signature
          </DialogTitle>
        </DialogHeader>
        {form && (
          <div className="space-y-4">
            <div className="border rounded-md p-3 text-sm space-y-1 bg-gray-50">
              {form.patientName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Patient</span>
                  <span className="font-medium">{form.patientName}</span>
                </div>
              )}
              <div className="space-y-1 pt-1">
                {form.items.map((line, i) => (
                  <div key={i} className="flex justify-between text-gray-700">
                    <span>{line.item} — {line.description}</span>
                    <span>{formatCents(line.feeCents)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                <span>Total value</span>
                <span>{formatCents(form.totalValueCents)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              By signing below, the patient confirms and assigns the Medicare benefit for the items listed above. This is not a submitted Medicare claim.
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Patient signature</Label>
                <Button variant="outline" size="sm" onClick={clear} data-testid="button-clear-aob-signature">
                  Clear
                </Button>
              </div>
              <canvas
                ref={(el) => {
                  canvasRef.current = el;
                  if (el && !el.dataset.init) {
                    el.width = 900;
                    el.height = 220;
                    const ctx = el.getContext("2d");
                    if (ctx) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, el.width, el.height); }
                    el.dataset.init = "1";
                  }
                }}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
                className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none cursor-crosshair"
                data-testid="canvas-aob-signature"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); setSignatureEmpty(true); }}>
                Cancel
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={signatureEmpty || signMutation.isPending}
                onClick={() => {
                  const dataUrl = canvasRef.current?.toDataURL("image/png");
                  if (dataUrl && form) {
                    signMutation.mutate({ id: form.id, signatureDataUrl: dataUrl });
                  }
                }}
                data-testid="button-submit-aob-signature"
              >
                {signMutation.isPending ? "Signing…" : "Sign & Complete"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
