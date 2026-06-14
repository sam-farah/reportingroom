import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Send, Plus, Search, Loader2, AlertCircle, CheckCheck, Phone, UserCircle, Clock } from "lucide-react";
import type { SmsMessage, Patient } from "@shared/schema";

interface Conversation {
  patientId: number | null;
  phone: string;
  patientName: string | null;
  lastMessage: SmsMessage;
  unreadCount: number;
}

function formatTimestamp(value: string | Date): string {
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = (() => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${pad(m)}${ampm}`;
  })();
  if (sameDay) return time;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${time}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "failed") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500"><AlertCircle className="w-3 h-3" />Failed</span>;
  }
  if (status === "delivered") {
    return <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-100"><CheckCheck className="w-3 h-3" />Delivered</span>;
  }
  return <span className="text-[10px] text-blue-100 capitalize">{status}</span>;
}

export default function Messages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  const { data: smsStatus } = useQuery<{ configured: boolean; fromNumber: string | null }>({
    queryKey: ["/api/sms/status"],
  });

  const { data: conversations = [], isLoading: convosLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/sms/conversations"],
    refetchInterval: 20000,
  });

  const selected = useMemo(
    () => conversations.find(c => (c.patientId != null ? `p:${c.patientId}` : `n:${c.phone}`) === selectedKey) || null,
    [conversations, selectedKey],
  );

  const threadKey = selected
    ? (selected.patientId != null
        ? ["/api/sms/conversations", selected.patientId]
        : ["/api/sms/conversations/by-phone", selected.phone])
    : null;

  const { data: thread = [], isLoading: threadLoading } = useQuery<SmsMessage[]>({
    queryKey: threadKey ?? ["/api/sms/conversations", "none"],
    enabled: !!threadKey,
    refetchInterval: selected ? 15000 : false,
  });

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedKey]);

  // When a conversation is opened, its inbound messages are marked read server-side; refresh the list.
  useEffect(() => {
    if (selected) {
      queryClient.invalidateQueries({ queryKey: ["/api/sms/conversations"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.length]);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    enabled: newOpen,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { patientId?: number | null; phone?: string; body: string }) => {
      const res = await apiRequest("/api/sms/send", "POST", payload);
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/sms/conversations"] });
      if (threadKey) queryClient.invalidateQueries({ queryKey: threadKey });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't send message", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!draft.trim() || !selected) return;
    sendMutation.mutate({
      patientId: selected.patientId ?? undefined,
      phone: selected.patientId == null ? selected.phone : undefined,
      body: draft.trim(),
    });
  };

  const startNewConversation = (patient: Patient) => {
    setNewOpen(false);
    setPatientSearch("");
    setSelectedKey(`p:${patient.id}`);
    // If there's no existing conversation entry yet, seed a placeholder so the thread view opens.
    if (!conversations.some(c => c.patientId === patient.id)) {
      queryClient.setQueryData<Conversation[]>(["/api/sms/conversations"], (old = []) => [
        {
          patientId: patient.id,
          phone: patient.phone || "",
          patientName: `${patient.firstName} ${patient.lastName}`.trim(),
          lastMessage: { id: -1, createdAt: new Date(), body: "", direction: "outbound", status: "", patientId: patient.id } as any,
          unreadCount: 0,
        },
        ...old,
      ]);
    }
  };

  const filteredConvos = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.patientName || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
  });

  const filteredPatients = patients
    .filter(p => (p.phone || "").trim())
    .filter(p => {
      if (!patientSearch.trim()) return true;
      const q = patientSearch.toLowerCase();
      return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.phone || "").includes(q);
    })
    .slice(0, 50);

  return (
    <div className="max-w-6xl mx-auto w-full p-4" style={{ paddingTop: "24px" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <MessageSquare className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Messages</h2>
          <p className="text-sm text-gray-500">Text patients and see their replies in one place</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1.5" data-testid="button-new-message">
          <Plus className="w-4 h-4" />New Message
        </Button>
      </div>

      {smsStatus && !smsStatus.configured && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>SMS isn't switched on yet. Once your Twilio account details are added, messages will start sending automatically.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ height: "calc(100vh - 200px)", minHeight: "480px" }}>
        {/* Conversation list */}
        <div className="border-r border-gray-200 flex flex-col min-h-0">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="pl-8 h-9"
                data-testid="input-search-conversations"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convosLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : filteredConvos.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10 px-4">
                No conversations yet. Start one with "New Message".
              </div>
            ) : (
              filteredConvos.map(c => {
                const key = c.patientId != null ? `p:${c.patientId}` : `n:${c.phone}`;
                const isActive = key === selectedKey;
                const title = c.patientName || c.phone || "Unknown";
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-50 transition-colors ${isActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    data-testid={`conversation-${key}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {c.patientId != null ? <UserCircle className="w-5 h-5 text-gray-400" /> : <Phone className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-sm text-gray-900 truncate">{title}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{c.lastMessage?.createdAt ? formatTimestamp(c.lastMessage.createdAt) : ""}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs text-gray-500 truncate">
                            {c.lastMessage?.direction === "outbound" ? "You: " : ""}{c.lastMessage?.body || "No messages yet"}
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
              <MessageSquare className="w-10 h-10" />
              <p className="text-sm">Select a conversation to view messages</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {selected.patientId != null ? <UserCircle className="w-5 h-5 text-gray-400" /> : <Phone className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">{selected.patientName || selected.phone}</div>
                  {selected.patientName && selected.phone && <div className="text-xs text-gray-400">{selected.phone}</div>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {threadLoading ? (
                  <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : thread.filter(m => m.id !== -1 && m.body).length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-10">No messages yet. Say hello below.</div>
                ) : (
                  thread.filter(m => m.id !== -1).map(m => {
                    const outbound = m.direction === "outbound";
                    return (
                      <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${outbound ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
                          <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                          <div className={`flex items-center gap-1.5 mt-1 ${outbound ? "justify-end" : "justify-start"}`}>
                            {m.isReminder && (
                              <span className={`inline-flex items-center gap-0.5 text-[10px] ${outbound ? "text-blue-100" : "text-gray-400"}`}>
                                <Clock className="w-2.5 h-2.5" />Reminder
                              </span>
                            )}
                            <span className={`text-[10px] ${outbound ? "text-blue-100" : "text-gray-400"}`}>{formatTimestamp(m.createdAt)}</span>
                            {outbound && <StatusBadge status={m.status} />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              <div className="p-3 border-t border-gray-100">
                {!selected.phone && (
                  <p className="text-xs text-amber-600 mb-1.5">No phone number on file for this patient.</p>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={smsStatus?.configured ? "Type a message…" : "SMS not set up yet"}
                    disabled={!smsStatus?.configured || !selected.phone}
                    className="resize-none min-h-[44px] max-h-32"
                    rows={1}
                    data-testid="input-message-body"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMutation.isPending || !smsStatus?.configured || !selected.phone}
                    className="h-11 px-4 gap-1.5"
                    data-testid="button-send-message"
                  >
                    {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New conversation dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>Choose a patient with a phone number on file.</DialogDescription>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
              placeholder="Search patients"
              className="pl-8"
              autoFocus
              data-testid="input-search-patients"
            />
          </div>
          <div className="max-h-72 overflow-y-auto -mx-2">
            {filteredPatients.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No patients with a phone number found.</div>
            ) : (
              filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => startNewConversation(p)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  data-testid={`patient-option-${p.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{p.firstName} {p.lastName}</div>
                    <div className="text-xs text-gray-400">{p.phone}{p.urNumber ? <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1 h-4">UR {p.urNumber}</Badge> : null}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
