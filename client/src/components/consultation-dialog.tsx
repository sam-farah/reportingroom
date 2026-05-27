import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Sparkles, Type, FileText, Save, Check, Trash2, ChevronLeft, Loader2, Stethoscope, PlayCircle, StopCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import InlineVoiceRecorder from "@/components/inline-voice-recorder";
import type { Consultation } from "@shared/schema";

interface ConsultationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  patientName: string;
}

type Mode = "dictate" | "ambient" | "type";
type View = "list" | "pick-mode" | "editor";

export default function ConsultationDialog({ open, onOpenChange, patientId, patientName }: ConsultationDialogProps) {
  const { toast } = useToast();
  const [view, setView] = useState<View>("list");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("type");
  const [title, setTitle] = useState("");
  const [letter, setLetter] = useState("");
  const [findings, setFindings] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);
  const [isFinalised, setIsFinalised] = useState(false);
  // Optimistic concurrency: holds the server's latest updatedAt for the active draft.
  // Sent on every PATCH so the server can reject stale writes (409).
  const expectedUpdatedAtRef = useRef<string | null>(null);
  // Serializes saves: only one PATCH in flight at a time, queued saves merge.
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);

  // Reset view to list whenever the dialog opens fresh
  useEffect(() => {
    if (open) {
      setView("list");
      setActiveId(null);
      setIsDirty(false);
      setShowVoice(false);
    }
  }, [open]);

  // Load all consultations for this patient (drafts + finalised)
  const { data: consultations = [] } = useQuery<Consultation[]>({
    queryKey: ["/api/patients", patientId, "consultations"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/consultations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load consultations");
      return res.json();
    },
    enabled: open && !!patientId,
  });

  const drafts = consultations.filter((c) => c.status === "draft");
  const finalised = consultations.filter((c) => c.status === "finalised");

  const createMutation = useMutation({
    mutationFn: async (payload: { mode: Mode }) => {
      return await apiRequest(`/api/patients/${patientId}/consultations`, "POST", {
        mode: payload.mode,
        title: `Consultation ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
        letterContent: "",
        examinationFindings: "",
      });
    },
    onSuccess: (created: any) => {
      setActiveId(created.id);
      setMode(created.mode);
      setTitle(created.title || "");
      setLetter(created.letterContent || "");
      setFindings(created.examinationFindings || "");
      setRawTranscript(created.rawTranscript || "");
      setSavedAt(new Date(created.updatedAt || created.createdAt));
      expectedUpdatedAtRef.current = created.updatedAt || created.createdAt;
      setIsFinalised(created.status === "finalised");
      setIsDirty(false);
      setView("editor");
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "consultations"] });
    },
  });

  // Serialized autosave: at most one PATCH in flight; if more saves are requested
  // while one is running, only the most recent state is sent next (no out-of-order
  // overwrites). Sends `expectedUpdatedAt` for server-side optimistic concurrency.
  const [isSaving, setIsSaving] = useState(false);
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!activeId || isFinalised) return false;
    if (saveInFlightRef.current) { pendingSaveRef.current = true; return false; }
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const updated: any = await apiRequest(`/api/consultations/${activeId}`, "PATCH", {
        title, letterContent: letter, examinationFindings: findings, rawTranscript,
        expectedUpdatedAt: expectedUpdatedAtRef.current,
      });
      expectedUpdatedAtRef.current = updated.updatedAt;
      setSavedAt(new Date(updated.updatedAt));
      setIsDirty(false);
      return true;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("409") || msg.includes("stale_update")) {
        toast({
          title: "Draft updated elsewhere",
          description: "This draft was modified in another tab. Please close and reopen it.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Couldn't save draft", description: msg || "Will retry on next change.", variant: "destructive" });
      }
      return false;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        // Schedule the queued save on the next tick with the latest state.
        setTimeout(() => { void flushSave(); }, 0);
      }
    }
  }, [activeId, isFinalised, title, letter, findings, rawTranscript, toast]);

  const summariseMutation = useMutation({
    mutationFn: async (payload: { id: number; transcript: string }) => {
      return await apiRequest(`/api/consultations/${payload.id}/summarise`, "POST", { transcript: payload.transcript });
    },
    onSuccess: (updated: any) => {
      setLetter(updated.letterContent || "");
      setRawTranscript(updated.rawTranscript || "");
      setSavedAt(new Date(updated.updatedAt));
      setIsDirty(false);
      toast({ title: "Letter drafted", description: "Review and edit the AI-generated letter as needed." });
    },
    onError: (e: any) => {
      toast({ title: "Could not summarise", description: e.message || "Try again", variant: "destructive" });
    },
  });

  const finaliseMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/consultations/${id}/finalise`, "POST"),
    onSuccess: () => {
      toast({ title: "Consultation finalised", description: "This consultation is now locked." });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "consultations"] });
      setView("list");
      setActiveId(null);
      setIsDirty(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/consultations/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "consultations"] });
      toast({ title: "Draft deleted" });
      setView("list");
      setActiveId(null);
    },
  });

  // Autosave debounce — saves 1.5s after the last keystroke whenever dirty
  const saveRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isDirty || !activeId || isFinalised) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => { void flushSave(); }, 1500);
    return () => { if (saveRef.current) clearTimeout(saveRef.current); };
  }, [isDirty, activeId, isFinalised, flushSave]);

  // Heartbeat — flush every 30s if dirty, so long-running tabs keep a recent save
  useEffect(() => {
    if (!activeId || isFinalised) return;
    const iv = setInterval(() => { if (isDirty) void flushSave(); }, 30000);
    return () => clearInterval(iv);
  }, [activeId, isDirty, isFinalised, flushSave]);

  // Warn before leaving a dirty editor via tab close
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const openDraft = (c: Consultation) => {
    setActiveId(c.id);
    setMode(c.mode as Mode);
    setTitle(c.title || "");
    setLetter(c.letterContent || "");
    setFindings(c.examinationFindings || "");
    setRawTranscript(c.rawTranscript || "");
    setSavedAt(c.updatedAt ? new Date(c.updatedAt) : null);
    expectedUpdatedAtRef.current = c.updatedAt ? new Date(c.updatedAt).toISOString() : null;
    setIsFinalised(c.status === "finalised");
    setIsDirty(false);
    setView("editor");
  };

  const handleDialogClose = (next: boolean) => {
    if (!next && view === "editor" && isDirty) {
      setShowCloseConfirm(true);
      return;
    }
    onOpenChange(next);
  };

  const handleVoiceTranscription = (text: string) => {
    // In dictate mode, append to letter. In ambient mode, append to raw transcript.
    if (mode === "ambient") {
      setRawTranscript((prev) => (prev ? prev + " " + text : text));
    } else {
      setLetter((prev) => (prev ? prev + " " + text : text));
    }
    setIsDirty(true);
    setShowVoice(false);
  };

  const savedLabel = savedAt ? `Saved ${format(savedAt, "HH:mm:ss")}` : "Not saved yet";

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-blue-600" />
              Consultation — {patientName}
            </DialogTitle>
            <DialogDescription>
              A comprehensive clinical note from a doctor's visit. Drafts autosave and can be resumed any time.
            </DialogDescription>
          </DialogHeader>

          {/* ===== LIST VIEW ===== */}
          {view === "list" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setView("pick-mode")} className="bg-blue-600 hover:bg-blue-700" data-testid="button-new-consultation">
                  <Stethoscope className="w-4 h-4 mr-1.5" /> Add Consultation
                </Button>
              </div>

              {drafts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-amber-700">Drafts in progress ({drafts.length})</h3>
                  {drafts.map((c) => (
                    <Card key={c.id} className="border-amber-200 bg-amber-50/40">
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.title || "Untitled draft"}</p>
                          <p className="text-xs text-muted-foreground">
                            {modeLabel(c.mode as Mode)} • last saved{" "}
                            {c.updatedAt ? format(new Date(c.updatedAt), "dd/MM/yyyy HH:mm") : "—"}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openDraft(c)} data-testid={`button-resume-${c.id}`}>
                          Resume
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {finalised.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-emerald-700">Finalised consultations ({finalised.length})</h3>
                  {finalised.map((c) => (
                    <Card key={c.id} className="border-emerald-200">
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground">
                            {modeLabel(c.mode as Mode)} • finalised{" "}
                            {c.finalisedAt ? format(new Date(c.finalisedAt), "dd/MM/yyyy HH:mm") : "—"}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openDraft(c)}>
                          View
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {consultations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No consultations yet. Click "Add Consultation" to start.
                </p>
              )}
            </div>
          )}

          {/* ===== MODE PICKER ===== */}
          {view === "pick-mode" && (
            <div className="space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <p className="text-sm text-muted-foreground">Choose how you'd like to create this consultation:</p>
              <div className="grid md:grid-cols-3 gap-3">
                <ModeCard
                  icon={<Mic className="w-7 h-7" />}
                  title="Dictate Letter"
                  description="Speak your letter aloud. Speech is transcribed by Whisper AI as you go."
                  onClick={() => createMutation.mutate({ mode: "dictate" })}
                  disabled={createMutation.isPending}
                  testId="mode-dictate"
                />
                <ModeCard
                  icon={<Sparkles className="w-7 h-7" />}
                  title="Ambient Dictation"
                  description="AI listens to the full consultation conversation and drafts a structured clinical letter automatically."
                  onClick={() => createMutation.mutate({ mode: "ambient" })}
                  disabled={createMutation.isPending}
                  highlight
                  testId="mode-ambient"
                />
                <ModeCard
                  icon={<Type className="w-7 h-7" />}
                  title="Type Only"
                  description="A large editor for typing your clinical notes and examination findings manually."
                  onClick={() => createMutation.mutate({ mode: "type" })}
                  disabled={createMutation.isPending}
                  testId="mode-type"
                />
              </div>
            </div>
          )}

          {/* ===== EDITOR ===== */}
          {view === "editor" && activeId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={() => {
                  if (isDirty) { setShowCloseConfirm(true); } else { setView("list"); }
                }}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back to list
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {isFinalised ? (
                    <span className="flex items-center gap-1 text-emerald-700 font-medium"><Check className="w-3 h-3" /> Finalised — read only</span>
                  ) : isSaving ? (
                    <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
                  ) : isDirty ? (
                    <span className="text-amber-600">Unsaved changes</span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> {savedLabel}</span>
                  )}
                  <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] uppercase tracking-wide">{modeLabel(mode)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="consult-title">Title</Label>
                <Input
                  id="consult-title"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
                  placeholder="e.g. Initial consult — left leg varicose veins"
                  className="mt-1"
                  readOnly={isFinalised}
                  disabled={isFinalised}
                />
              </div>

              {/* AMBIENT MODE: raw transcript + summarise button */}
              {mode === "ambient" && (
                <Card className="border-purple-200 bg-purple-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 text-purple-800">
                          <Sparkles className="w-4 h-4" /> Ambient conversation
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Record the consultation, then click "Generate Letter" to have AI draft a structured clinical letter.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setShowVoice(true)} disabled={isFinalised}>
                        <Mic className="w-4 h-4 mr-1" /> Record
                      </Button>
                    </div>
                    {showVoice && (
                      <InlineVoiceRecorder
                        fieldName="Conversation Transcript"
                        onTranscription={(text) => handleVoiceTranscription(text)}
                        onClose={() => setShowVoice(false)}
                      />
                    )}
                    <Textarea
                      value={rawTranscript}
                      onChange={(e) => { setRawTranscript(e.target.value); setIsDirty(true); }}
                      placeholder="Raw conversation transcript will appear here. You can also type or paste in."
                      rows={6}
                      className="bg-white"
                      readOnly={isFinalised}
                      disabled={isFinalised}
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={() => {
                          if (!rawTranscript.trim()) {
                            toast({ title: "No transcript yet", description: "Record or type the conversation first.", variant: "destructive" });
                            return;
                          }
                          summariseMutation.mutate({ id: activeId, transcript: rawTranscript });
                        }}
                        disabled={summariseMutation.isPending || isFinalised}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {summariseMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Drafting…</>
                        ) : (
                          <><Sparkles className="w-4 h-4 mr-1.5" /> Generate Letter from Conversation</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* DICTATE MODE: voice recorder appended to letter */}
              {mode === "dictate" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="consult-letter">Letter</Label>
                    <Button size="sm" variant="outline" onClick={() => setShowVoice(true)} disabled={isFinalised}>
                      <Mic className="w-4 h-4 mr-1" /> Dictate
                    </Button>
                  </div>
                  {showVoice && (
                    <div className="mb-2">
                      <InlineVoiceRecorder
                        fieldName="Letter"
                        onTranscription={(text) => handleVoiceTranscription(text)}
                        onClose={() => setShowVoice(false)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Letter content — present in all modes */}
              {mode !== "dictate" && <Label htmlFor="consult-letter">Letter / Clinical Notes</Label>}
              <Textarea
                id="consult-letter"
                value={letter}
                onChange={(e) => { setLetter(e.target.value); setIsDirty(true); }}
                placeholder="Type the body of the clinical letter here…"
                rows={mode === "ambient" ? 12 : 16}
                className="font-mono text-sm"
                readOnly={isFinalised}
                disabled={isFinalised}
              />

              <div>
                <Label htmlFor="consult-findings">Examination findings (optional)</Label>
                <Textarea
                  id="consult-findings"
                  value={findings}
                  onChange={(e) => { setFindings(e.target.value); setIsDirty(true); }}
                  placeholder="e.g. BP 130/82, HR 76 reg, abdomen soft, peripheral pulses palpable…"
                  rows={4}
                  className="mt-1"
                  readOnly={isFinalised}
                  disabled={isFinalised}
                />
              </div>

              {/* Action bar */}
              <div className="flex items-center justify-between border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Delete this draft? This cannot be undone.")) {
                      deleteMutation.mutate(activeId);
                    }
                  }}
                  disabled={isFinalised}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete draft
                </Button>
                <div className="flex items-center gap-2">
                  {isFinalised ? (
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Close
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (isDirty) {
                            const ok = await flushSave();
                            if (ok) onOpenChange(false);
                          } else {
                            onOpenChange(false);
                          }
                        }}
                      >
                        <Save className="w-4 h-4 mr-1" /> Save Draft &amp; Close
                      </Button>
                      <Button
                        onClick={() => setShowFinaliseConfirm(true)}
                        disabled={finaliseMutation.isPending || !letter.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {finaliseMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                        Finalise
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close confirm */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              The most recent changes haven't autosaved yet. Save before closing, or discard and lose them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setShowCloseConfirm(false);
                setIsDirty(false);
                onOpenChange(false);
              }}
            >
              Discard &amp; close
            </Button>
            <AlertDialogAction
              onClick={async () => {
                if (activeId) {
                  const ok = await flushSave();
                  if (ok) { setShowCloseConfirm(false); onOpenChange(false); }
                }
              }}
            >
              Save &amp; close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Finalise confirm */}
      <AlertDialog open={showFinaliseConfirm} onOpenChange={setShowFinaliseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalise this consultation?</AlertDialogTitle>
            <AlertDialogDescription>
              Once finalised, this consultation is locked and can no longer be edited. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (activeId) {
                  // Save first to capture latest edits, then finalise on success.
                  const ok = await flushSave();
                  if (ok) {
                    finaliseMutation.mutate(activeId);
                    setShowFinaliseConfirm(false);
                  }
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Finalise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function modeLabel(m: Mode): string {
  return m === "dictate" ? "Dictated" : m === "ambient" ? "Ambient AI" : "Typed";
}

function ModeCard({
  icon, title, description, onClick, disabled, highlight, testId,
}: {
  icon: React.ReactNode; title: string; description: string;
  onClick: () => void; disabled?: boolean; highlight?: boolean; testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`text-left rounded-lg border p-4 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
        highlight
          ? "border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 hover:border-purple-400"
          : "border-gray-200 hover:border-blue-300"
      }`}
    >
      <div className={highlight ? "text-purple-700 mb-2" : "text-blue-600 mb-2"}>{icon}</div>
      <h4 className="font-semibold text-sm mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
