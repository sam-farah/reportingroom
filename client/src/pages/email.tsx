import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Mail, Send, Plus, Search, Loader2, AlertCircle, UserCircle, RefreshCw,
  Link2, Link2Off, Paperclip, ChevronDown, ChevronRight, Reply, CheckCircle2,
} from "lucide-react";
import type { EmailThread, EmailMessage, EmailAttachment, Patient } from "@shared/schema";

type Conversation = EmailThread & { patientName: string | null };

interface EmailStatus {
  connected: boolean;
  address: string | null;
  provider: string | null;
  displayName?: string | null;
  connectionError?: string | null;
  syncStatus: "idle" | "syncing" | "error";
  backfillCompleted: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface Recipient { name?: string | null; address: string }

function parseRecipients(json: string | null | undefined): Recipient[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recipientLabel(r: Recipient): string {
  return r.name ? `${r.name} <${r.address}>` : r.address;
}

function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12; if (h === 0) h = 12;
  const time = `${h}:${pad(m)}${ampm}`;
  if (sameDay) return time;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${time}`;
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// One message in a thread — collapsible, fetches its full body + attachments on expand.
function MessageCard({ message, defaultOpen }: { message: EmailMessage; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const outbound = message.direction === "outbound";
  const to = parseRecipients(message.toRecipients);
  const cc = parseRecipients(message.ccRecipients);

  const { data: body, isLoading: bodyLoading } = useQuery<{ html: string | null; snippet?: string | null }>({
    queryKey: ["/api/email/messages", message.id, "body"],
    enabled: open,
  });

  const { data: attachments = [] } = useQuery<EmailAttachment[]>({
    queryKey: ["/api/email/messages", message.id, "attachments"],
    enabled: open && message.hasAttachments,
  });

  return (
    <div className={`rounded-lg border ${outbound ? "border-blue-100 bg-blue-50/40" : "border-gray-200 bg-white"}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        data-testid={`message-header-${message.id}`}
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <UserCircle className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">
              {message.fromName || message.fromAddress || (outbound ? "You" : "Unknown")}
            </span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{formatTimestamp(message.sentAt || message.receivedAt)}</span>
          </div>
          {!open && <div className="text-xs text-gray-500 truncate">{message.snippet || ""}</div>}
        </div>
        {message.hasAttachments && <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        {outbound && <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 flex-shrink-0">Sent</Badge>}
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
          <div className="text-[11px] text-gray-400 mb-2 space-y-0.5">
            {to.length > 0 && <div>To: {to.map(recipientLabel).join(", ")}</div>}
            {cc.length > 0 && <div>Cc: {cc.map(recipientLabel).join(", ")}</div>}
          </div>
          {bodyLoading ? (
            <div className="flex items-center gap-2 py-4 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading message…</div>
          ) : body?.html ? (
            <div
              className="text-sm text-gray-800 email-body break-words"
              dangerouslySetInnerHTML={{ __html: body.html }}
            />
          ) : (
            <div className="text-sm text-gray-600 whitespace-pre-wrap break-words">{message.snippet || "No content."}</div>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map(a => (
                <a
                  key={a.id}
                  href={`/api/email/attachments/${a.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                  data-testid={`attachment-${a.id}`}
                >
                  <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate max-w-[180px]">{a.name || "attachment"}</span>
                  {a.size ? <span className="text-gray-400">{formatBytes(a.size)}</span> : null}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Email() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const { data: status } = useQuery<EmailStatus>({
    queryKey: ["/api/email/status"],
    refetchInterval: 30000,
  });

  const { data: conversations = [], isLoading: convosLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/email/conversations"],
    refetchInterval: 30000,
    enabled: !!status?.connected,
  });

  const selected = useMemo(
    () => conversations.find(c => c.id === selectedId) || null,
    [conversations, selectedId],
  );

  const { data: threadData, isLoading: threadLoading } = useQuery<{ thread: EmailThread; messages: EmailMessage[] }>({
    queryKey: ["/api/email/threads", selectedId],
    enabled: selectedId != null,
    refetchInterval: selectedId != null ? 20000 : false,
  });

  const messages = threadData?.messages ?? [];

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  // Opening a thread marks it read server-side; refresh the list + unread badge.
  useEffect(() => {
    if (selectedId != null && threadData) {
      queryClient.invalidateQueries({ queryKey: ["/api/email/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/unread-count"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadData?.messages?.length]);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    enabled: composeOpen || linkOpen,
  });

  const syncMutation = useMutation({
    mutationFn: async () => (await apiRequest("/api/email/sync-now", "POST")).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/status"] });
      if (selectedId != null) queryClient.invalidateQueries({ queryKey: ["/api/email/threads", selectedId] });
    },
    onError: (err: any) => toast({ title: "Couldn't sync", description: err?.message || "Please try again.", variant: "destructive" }),
  });

  const replyMutation = useMutation({
    mutationFn: async (body: string) => (await apiRequest(`/api/email/threads/${selectedId}/reply`, "POST", { body })).json(),
    onSuccess: () => {
      setReply("");
      toast({ title: "Reply sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/conversations"] });
      if (selectedId != null) queryClient.invalidateQueries({ queryKey: ["/api/email/threads", selectedId] });
    },
    onError: (err: any) => toast({ title: "Couldn't send reply", description: err?.message || "Please try again.", variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => (await apiRequest("/api/email/send", "POST", {
      to: composeTo.split(",").map(s => s.trim()).filter(Boolean),
      cc: composeCc.split(",").map(s => s.trim()).filter(Boolean),
      subject: composeSubject,
      body: composeBody,
    })).json(),
    onSuccess: () => {
      setComposeOpen(false);
      setComposeTo(""); setComposeCc(""); setComposeSubject(""); setComposeBody("");
      toast({ title: "Email sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/conversations"] });
    },
    onError: (err: any) => toast({ title: "Couldn't send email", description: err?.message || "Please try again.", variant: "destructive" }),
  });

  const linkMutation = useMutation({
    mutationFn: async (patientId: number) => (await apiRequest(`/api/email/threads/${selectedId}/link-patient`, "POST", { patientId })).json(),
    onSuccess: () => {
      setLinkOpen(false);
      setPatientSearch("");
      toast({ title: "Linked to patient file" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/conversations"] });
      if (selectedId != null) queryClient.invalidateQueries({ queryKey: ["/api/email/threads", selectedId] });
    },
    onError: (err: any) => toast({ title: "Couldn't link patient", description: err?.message || "Please try again.", variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => (await apiRequest(`/api/email/threads/${selectedId}/unlink-patient`, "POST")).json(),
    onSuccess: () => {
      toast({ title: "Unlinked from patient file" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/conversations"] });
      if (selectedId != null) queryClient.invalidateQueries({ queryKey: ["/api/email/threads", selectedId] });
    },
    onError: (err: any) => toast({ title: "Couldn't unlink", description: err?.message || "Please try again.", variant: "destructive" }),
  });

  const filteredConvos = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.patientName || "").toLowerCase().includes(q)
      || (c.subject || "").toLowerCase().includes(q)
      || (c.lastFrom || "").toLowerCase().includes(q)
      || (c.lastFromName || "").toLowerCase().includes(q);
  });

  const filteredPatients = patients
    .filter(p => {
      if (!patientSearch.trim()) return true;
      const q = patientSearch.toLowerCase();
      return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)
        || (p.email || "").toLowerCase().includes(q);
    })
    .slice(0, 50);

  const handleReply = () => {
    if (!reply.trim() || selectedId == null) return;
    replyMutation.mutate(reply.trim());
  };

  // Not connected — show a friendly setup hint (full connect flow lives in Admin settings).
  if (status && !status.connected) {
    return (
      <div className="max-w-3xl mx-auto w-full p-4" style={{ paddingTop: "24px" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Email Inbox</h2>
            <p className="text-sm text-gray-500">Your clinic mailbox, right inside the app</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No mailbox connected yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Connect your clinic's mailbox in <span className="font-medium">Admin → Clinic Settings → Email Inbox</span> to
            read and reply to your whole mailbox here, and link conversations to patient files. You can use Microsoft 365,
            Google, or any IMAP/SMTP provider.
          </p>
          {status?.connectionError && (
            <div className="inline-flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 text-left">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Last connection error: {status.connectionError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-4" style={{ paddingTop: "24px" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <Mail className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">Email Inbox</h2>
          <p className="text-sm text-gray-500 truncate">
            {status?.address ? <>Connected: <span className="font-medium">{status.address}</span></> : "Your clinic mailbox"}
            {status?.lastSyncedAt && <> · Last synced {formatTimestamp(status.lastSyncedAt)}</>}
            {status && !status.backfillCompleted && <> · <span className="text-blue-600">Importing history…</span></>}
          </p>
        </div>
        <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1.5" data-testid="button-sync-email">
          {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync
        </Button>
        <Button onClick={() => setComposeOpen(true)} className="gap-1.5" data-testid="button-compose-email">
          <Plus className="w-4 h-4" />Compose
        </Button>
      </div>

      {status?.syncStatus === "error" && status.lastError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Last sync failed: {status.lastError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ height: "calc(100vh - 200px)", minHeight: "480px" }}>
        {/* Conversation list */}
        <div className="border-r border-gray-200 flex flex-col min-h-0">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search email"
                className="pl-8 h-9"
                data-testid="input-search-email"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convosLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : filteredConvos.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10 px-4">
                {conversations.length === 0 ? "No emails yet. New mail appears here automatically." : "No matches."}
              </div>
            ) : (
              filteredConvos.map(c => {
                const isActive = c.id === selectedId;
                const title = c.lastFromName || c.lastFrom || c.subject || "Unknown";
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-50 transition-colors ${isActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                    data-testid={`email-conversation-${c.id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm truncate ${c.unreadCount > 0 ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>{title}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTimestamp(c.lastMessageAt)}</span>
                    </div>
                    <div className="text-xs text-gray-600 truncate mt-0.5">{c.subject || "(no subject)"}</div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-xs text-gray-400 truncate">
                        {c.lastDirection === "outbound" ? "You: " : ""}{c.lastSnippet || ""}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {c.patientName && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 gap-0.5">
                            <Link2 className="w-2.5 h-2.5" />{c.patientName}
                          </Badge>
                        )}
                        {c.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {c.unreadCount}
                          </span>
                        )}
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
              <Mail className="w-10 h-10" />
              <p className="text-sm">Select an email to read it</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-gray-900 truncate">{selected.subject || "(no subject)"}</div>
                  <div className="text-xs text-gray-400 truncate">{selected.lastFromName || selected.lastFrom}</div>
                </div>
                {selected.patientName ? (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <UserCircle className="w-3.5 h-3.5" />{selected.patientName}
                      {selected.patientLinkSource === "auto" && <span className="text-gray-400">(auto)</span>}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => unlinkMutation.mutate()} disabled={unlinkMutation.isPending} data-testid="button-unlink-patient">
                      <Link2Off className="w-3.5 h-3.5 text-gray-400" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setLinkOpen(true)} data-testid="button-link-patient">
                    <Link2 className="w-3.5 h-3.5" />Link patient
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                {threadLoading ? (
                  <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-10">No messages in this thread.</div>
                ) : (
                  messages.map((m, i) => (
                    <MessageCard key={m.id} message={m} defaultOpen={i === messages.length - 1} />
                  ))
                )}
                <div ref={threadEndRef} />
              </div>

              <div className="p-3 border-t border-gray-100">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleReply(); } }}
                    placeholder="Write a reply… (Ctrl/Cmd+Enter to send)"
                    className="resize-none min-h-[60px] max-h-40"
                    rows={2}
                    data-testid="input-reply-body"
                  />
                  <Button
                    onClick={handleReply}
                    disabled={!reply.trim() || replyMutation.isPending}
                    className="h-11 px-4 gap-1.5"
                    data-testid="button-send-reply"
                  >
                    {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Reply className="w-4 h-4" />}
                    Reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Email</DialogTitle>
            <DialogDescription>Send a new email from your clinic mailbox.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="To (comma-separated)" value={composeTo} onChange={e => setComposeTo(e.target.value)} data-testid="input-compose-to" />
            <Input placeholder="Cc (optional)" value={composeCc} onChange={e => setComposeCc(e.target.value)} data-testid="input-compose-cc" />
            <Input placeholder="Subject" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} data-testid="input-compose-subject" />
            <Textarea placeholder="Write your message…" value={composeBody} onChange={e => setComposeBody(e.target.value)} className="min-h-[160px]" data-testid="input-compose-body" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !composeTo.trim() || !composeBody.trim()}
              className="gap-1.5"
              data-testid="button-send-compose"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link patient dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to patient file</DialogTitle>
            <DialogDescription>Connect this email conversation to a patient.</DialogDescription>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={patientSearch} onChange={e => setPatientSearch(e.target.value)} placeholder="Search patients" className="pl-8" autoFocus data-testid="input-search-link-patient" />
          </div>
          <div className="max-h-72 overflow-y-auto -mx-2">
            {filteredPatients.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No patients found.</div>
            ) : (
              filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => linkMutation.mutate(p.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  data-testid={`link-patient-option-${p.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{p.firstName} {p.lastName}</div>
                    <div className="text-xs text-gray-400 truncate">{p.email || "No email on file"}{p.urNumber ? <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1 h-4">UR {p.urNumber}</Badge> : null}</div>
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
