import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useChatSocket, type ChatServerEvent } from "@/hooks/useChatSocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Hash, Lock, Plus, Send, Paperclip, Search, Loader2, Users, AtSign, UserPlus,
  MessageCircle, X, FileText, Download, LogOut, Circle, UserCircle,
} from "lucide-react";
import type { Patient } from "@shared/schema";

// ── Types mirroring the chat REST payloads ─────────────────────────────────
interface StaffMember { id: string; firstName: string | null; lastName: string | null; email: string | null; role: string | null; }
interface DmPeer { id: string; firstName: string | null; lastName: string | null; email: string | null; }
interface ChannelSummary {
  id: number;
  type: "channel" | "dm";
  name: string | null;
  description: string | null;
  isPrivate: boolean;
  createdBy: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  memberIds: string[];
  dmPeer: DmPeer | null;
}
interface ChatAttachment { id: number; fileUrl: string; originalName: string; mimeType: string; sizeBytes: number; }
interface ChatPatientTag { patientId: number; firstName: string | null; lastName: string | null; urNumber: string | null; }
interface ChatMessage {
  id: number;
  channelId: number;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
  attachments: ChatAttachment[];
  mentions: string[];
  patientTags: ChatPatientTag[];
}

function personName(p: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return "Unknown";
  const n = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
  return n || p.email || "Unknown";
}
function initials(p: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return "?";
  const f = (p.firstName ?? "").trim();
  const l = (p.lastName ?? "").trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || "?";
  return (p.email ?? "?").charAt(0).toUpperCase();
}
function channelTitle(c: ChannelSummary): string {
  if (c.type === "dm") return personName(c.dmPeer);
  return c.name || "Untitled";
}
function fmtTime(value: string | Date): string {
  const d = new Date(value);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12; if (h === 0) h = 12;
  const time = `${h}:${pad(m)}${ampm}`;
  if (d.toDateString() === now.toDateString()) return time;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${time}`;
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const CHANNELS_KEY = ["/api/chat/channels"];

export default function Chat({ onOpenPatient }: { onOpenPatient?: (patientId: number) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = (user as any)?.id as string | undefined;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const [composer, setComposer] = useState("");
  const [mentions, setMentions] = useState<Record<string, string>>({}); // userId -> name
  const [pendingTags, setPendingTags] = useState<ChatPatientTag[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingThrottle = useRef<number>(0);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: channels = [], isLoading: channelsLoading } = useQuery<ChannelSummary[]>({ queryKey: CHANNELS_KEY });
  const { data: staff = [] } = useQuery<StaffMember[]>({ queryKey: ["/api/chat/staff"] });
  const { data: allPatients = [] } = useQuery<Patient[]>({ queryKey: ["/api/patients"] });

  const selectedChannel = useMemo(() => channels.find((c) => c.id === selectedId) || null, [channels, selectedId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/channels", selectedId, "messages"],
    enabled: selectedId != null,
  });

  const { data: channelDetail } = useQuery<{ channel: any; members: StaffMember[] }>({
    queryKey: ["/api/chat/channels", selectedId],
    enabled: selectedId != null && selectedChannel?.type === "channel",
  });

  // Auto-select the first channel once loaded.
  useEffect(() => {
    if (selectedId == null && channels.length > 0) setSelectedId(channels[0].id);
  }, [channels, selectedId]);

  // ── Real-time ──────────────────────────────────────────────────────────────
  const appendMessage = useCallback((channelId: number, message: ChatMessage) => {
    queryClient.setQueryData<ChatMessage[]>(["/api/chat/channels", channelId, "messages"], (old) => {
      const list = old ?? [];
      if (list.some((m) => m.id === message.id)) return list;
      return [...list, message];
    });
  }, [queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (channelId: number) => apiRequest(`/api/chat/channels/${channelId}/read`, "POST"),
    onSuccess: (_d, channelId) => {
      queryClient.setQueryData<ChannelSummary[]>(CHANNELS_KEY, (old) =>
        (old ?? []).map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });

  const onEvent = useCallback((e: ChatServerEvent) => {
    if (e.type === "message:new") {
      appendMessage(e.channelId, e.message);
      if (e.channelId === selectedIdRef.current) {
        if (document.hasFocus()) markReadMutation.mutate(e.channelId);
      }
      // Refresh ordering / unread / preview in the sidebar.
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    } else if (e.type === "channels:changed") {
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    } else if (e.type === "channel:updated") {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/channels", e.channelId] });
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    }
  }, [appendMessage, markReadMutation, queryClient]);

  const { online, typing, sendTyping, connected } = useChatSocket({ enabled: !!currentUserId, onEvent });

  // Mark read + scroll when switching channel.
  useEffect(() => {
    if (selectedId != null) markReadMutation.mutate(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (payload: { body: string; mentionUserIds: string[]; patientIds: number[] }) =>
      apiRequest(`/api/chat/channels/${selectedId}/messages`, "POST", payload),
    onSuccess: (msg: any) => {
      if (selectedId != null && msg) appendMessage(selectedId, msg);
      setComposer(""); setMentions({}); setPendingTags([]);
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
    onError: () => toast({ title: "Couldn't send message", variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (composer.trim()) fd.append("body", composer.trim());
      return apiRequest(`/api/chat/channels/${selectedId}/attachments`, "POST", fd, { isFormData: true });
    },
    onSuccess: (msg: any) => {
      if (selectedId != null && msg) appendMessage(selectedId, msg);
      setComposer("");
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
    onError: () => toast({ title: "Couldn't upload file", variant: "destructive" }),
  });

  const createChannelMutation = useMutation({
    mutationFn: (payload: { name: string; description: string | null; isPrivate: boolean; memberIds: string[] }) =>
      apiRequest("/api/chat/channels", "POST", payload),
    onSuccess: (ch: any) => {
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      if (ch?.id) setSelectedId(ch.id);
    },
    onError: () => toast({ title: "Couldn't create channel", variant: "destructive" }),
  });

  const dmMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("/api/chat/dm", "POST", { userId }),
    onSuccess: (ch: any) => {
      setDmOpen(false);
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      if (ch?.id) setSelectedId(ch.id);
    },
    onError: () => toast({ title: "Couldn't open conversation", variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: (memberIds: string[]) => apiRequest(`/api/chat/channels/${selectedId}/members`, "POST", { memberIds }),
    onSuccess: () => {
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/chat/channels", selectedId] });
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
    onError: () => toast({ title: "Couldn't add members", variant: "destructive" }),
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/chat/channels/${selectedId}/members/${currentUserId}`, "DELETE"),
    onSuccess: () => {
      setMembersOpen(false);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
    onError: () => toast({ title: "Couldn't leave channel", variant: "destructive" }),
  });

  // ── Composer helpers ────────────────────────────────────────────────────────
  const handleComposerChange = (value: string) => {
    setComposer(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
    // Throttle typing signals to ~1 per 2s.
    if (selectedId != null) {
      const now = Date.now();
      if (now - typingThrottle.current > 2000) {
        typingThrottle.current = now;
        sendTyping(selectedId);
      }
    }
  };

  const insertMention = (member: StaffMember) => {
    const name = personName(member);
    const caret = textareaRef.current?.selectionStart ?? composer.length;
    const before = composer.slice(0, caret).replace(/@(\w*)$/, `@${(member.firstName || name).replace(/\s+/g, "")} `);
    const after = composer.slice(caret);
    setComposer(before + after);
    setMentions((prev) => ({ ...prev, [member.id]: name }));
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const addTag = (p: Patient) => {
    setPendingTags((prev) => prev.some((t) => t.patientId === p.id) ? prev : [...prev, {
      patientId: p.id, firstName: p.firstName, lastName: p.lastName, urNumber: (p as any).urNumber ?? null,
    }]);
    setTagPickerOpen(false);
    setTagSearch("");
  };

  const handleSend = () => {
    if (selectedId == null) return;
    if (!composer.trim() && pendingTags.length === 0) return;
    sendMutation.mutate({
      body: composer.trim(),
      mentionUserIds: Object.keys(mentions),
      patientIds: pendingTags.map((t) => t.patientId),
    });
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedId != null) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Derived lists ────────────────────────────────────────────────────────
  const channelList = channels.filter((c) => c.type === "channel");
  const dmList = channels.filter((c) => c.type === "dm");

  const mentionCandidates = useMemo(() => {
    if (mentionQuery == null) return [];
    const memberIds = new Set(selectedChannel?.memberIds ?? []);
    return staff
      .filter((s) => s.id !== currentUserId && memberIds.has(s.id))
      .filter((s) => mentionQuery === "" || personName(s).toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, staff, selectedChannel, currentUserId]);

  const tagCandidates = useMemo(() => {
    const q = tagSearch.toLowerCase().trim();
    return allPatients
      .filter((p) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || ((p as any).urNumber ?? "").includes(q))
      .slice(0, 8);
  }, [allPatients, tagSearch]);

  const channelMemberIds = new Set(channelDetail?.members.map((m) => m.id) ?? []);
  const invitable = staff.filter((s) => !channelMemberIds.has(s.id));

  const typingNames = selectedId != null
    ? Object.entries(typing[selectedId] || {}).filter(([uid]) => uid !== currentUserId).map(([, name]) => name)
    : [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border rounded-lg bg-card flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Team Chat</span>
          </div>
          <Circle className={`w-2 h-2 ${connected ? "fill-green-500 text-green-500" : "fill-muted-foreground text-muted-foreground"}`} />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channels</span>
              <button onClick={() => setCreateOpen(true)} className="text-muted-foreground hover:text-foreground" data-testid="button-new-channel">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {channelsLoading ? (
              <div className="px-2 py-3 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
            ) : channelList.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No channels yet</p>
            ) : channelList.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                data-testid={`channel-${c.id}`}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${selectedId === c.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
              >
                {c.isPrivate ? <Lock className="w-3.5 h-3.5 flex-shrink-0" /> : <Hash className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate flex-1 text-left">{channelTitle(c)}</span>
                {c.unreadCount > 0 && <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{c.unreadCount}</Badge>}
              </button>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Direct Messages</span>
              <button onClick={() => setDmOpen(true)} className="text-muted-foreground hover:text-foreground" data-testid="button-new-dm">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {dmList.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No conversations yet</p>
            ) : dmList.map((c) => {
              const peerOnline = c.dmPeer && online.includes(c.dmPeer.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  data-testid={`dm-${c.id}`}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${selectedId === c.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                >
                  <span className="relative flex-shrink-0">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium">{initials(c.dmPeer)}</span>
                    {peerOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-card" />}
                  </span>
                  <span className="truncate flex-1 text-left">{channelTitle(c)}</span>
                  {c.unreadCount > 0 && <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{c.unreadCount}</Badge>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main pane */}
      <div className="flex-1 border rounded-lg bg-card flex flex-col min-w-0">
        {selectedChannel ? (
          <>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {selectedChannel.type === "dm"
                  ? <UserCircle className="w-4 h-4 flex-shrink-0" />
                  : selectedChannel.isPrivate ? <Lock className="w-4 h-4 flex-shrink-0" /> : <Hash className="w-4 h-4 flex-shrink-0" />}
                <span className="font-semibold truncate">{channelTitle(selectedChannel)}</span>
                {selectedChannel.description && <span className="text-xs text-muted-foreground truncate hidden md:inline">— {selectedChannel.description}</span>}
              </div>
              {selectedChannel.type === "channel" && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)} data-testid="button-invite">
                    <UserPlus className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMembersOpen(true)} data-testid="button-members">
                    <Users className="w-4 h-4" />
                    <span className="ml-1 text-xs">{selectedChannel.memberIds.length}</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messagesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello!</p>
              ) : messages.map((m) => (
                <div key={m.id} className="flex gap-2.5" data-testid={`message-${m.id}`}>
                  <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">{initials(m.author)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm">{personName(m.author)}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtTime(m.createdAt)}</span>
                    </div>
                    {m.body && <MessageBody body={m.body} />}
                    {m.patientTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.patientTags.map((t) => (
                          <button
                            key={t.patientId}
                            onClick={() => onOpenPatient?.(t.patientId)}
                            data-testid={`patient-chip-${t.patientId}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800"
                          >
                            <UserCircle className="w-3 h-3" />
                            {personName(t)}{t.urNumber ? ` · UR ${t.urNumber}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {m.attachments.map((a) => (a.mimeType.startsWith("image/") ? (
                          <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="block">
                            <img src={a.fileUrl} alt={a.originalName} className="max-h-48 rounded border" />
                          </a>
                        ) : (
                          <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" download
                            className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-muted/40 hover:bg-muted text-sm">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="truncate max-w-[180px]">{a.originalName}</span>
                            <span className="text-[11px] text-muted-foreground">{fmtSize(a.sizeBytes)}</span>
                            <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          </a>
                        )))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {typingNames.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-10">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="border-t p-3 relative">
              {mentionQuery != null && mentionCandidates.length > 0 && (
                <div className="absolute bottom-full left-3 mb-1 w-56 bg-popover border rounded-lg shadow-lg overflow-hidden z-10">
                  {mentionCandidates.map((s) => (
                    <button key={s.id} onClick={() => insertMention(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left" data-testid={`mention-${s.id}`}>
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{initials(s)}</span>
                      {personName(s)}
                    </button>
                  ))}
                </div>
              )}
              {pendingTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {pendingTags.map((t) => (
                    <span key={t.patientId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs border border-blue-200 dark:border-blue-800">
                      <UserCircle className="w-3 h-3" />
                      {personName(t)}{t.urNumber ? ` · UR ${t.urNumber}` : ""}
                      <button onClick={() => setPendingTags((prev) => prev.filter((x) => x.patientId !== t.patientId))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={composer}
                  onChange={(e) => handleComposerChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message ${channelTitle(selectedChannel)}`}
                  className="min-h-[42px] max-h-32 resize-none"
                  data-testid="input-composer"
                />
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} data-testid="button-attach">
                      {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setTagPickerOpen(true); }} data-testid="button-tag-patient">
                      <UserCircle className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={handleSend} disabled={sendMutation.isPending || (!composer.trim() && pendingTags.length === 0)} data-testid="button-send">
                      {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a channel or start a conversation</p>
            </div>
          </div>
        )}
      </div>

      {/* Patient tag picker */}
      <Dialog open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag a patient</DialogTitle>
            <DialogDescription>Link a patient file to your message.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input autoFocus value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search name or UR number" className="pl-8" data-testid="input-tag-search" />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {tagCandidates.map((p) => (
              <button key={p.id} onClick={() => addTag(p)} className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-muted text-sm text-left" data-testid={`tag-option-${p.id}`}>
                <span>{p.firstName} {p.lastName}</span>
                {(p as any).urNumber && <span className="text-xs text-muted-foreground">UR {(p as any).urNumber}</span>}
              </button>
            ))}
            {tagCandidates.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No patients found</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create channel */}
      <CreateChannelDialog open={createOpen} onOpenChange={setCreateOpen} staff={staff.filter((s) => s.id !== currentUserId)} onCreate={(p) => createChannelMutation.mutate(p)} pending={createChannelMutation.isPending} />

      {/* New DM */}
      <Dialog open={dmOpen} onOpenChange={setDmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New message</DialogTitle><DialogDescription>Start a direct conversation with a colleague.</DialogDescription></DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {staff.filter((s) => s.id !== currentUserId).map((s) => (
              <button key={s.id} onClick={() => dmMutation.mutate(s.id)} disabled={dmMutation.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted text-sm text-left" data-testid={`dm-option-${s.id}`}>
                <span className="relative">
                  <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{initials(s)}</span>
                  {online.includes(s.id) && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-background" />}
                </span>
                <span className="flex-1">{personName(s)}</span>
                <span className="text-xs text-muted-foreground capitalize">{s.role?.replace("_", " ")}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite members */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} invitable={invitable} online={online} onInvite={(ids) => inviteMutation.mutate(ids)} pending={inviteMutation.isPending} />

      {/* Members list */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedChannel ? channelTitle(selectedChannel) : ""} members</DialogTitle></DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {(channelDetail?.members ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="relative">
                  <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{initials(m)}</span>
                  {online.includes(m.id) && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-background" />}
                </span>
                <span className="flex-1">{personName(m)}{m.id === currentUserId ? " (you)" : ""}</span>
                <span className="text-xs text-muted-foreground capitalize">{m.role?.replace("_", " ")}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending} data-testid="button-leave">
              <LogOut className="w-4 h-4 mr-1" /> Leave channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Render message body, bolding @mention tokens.
function MessageBody({ body }: { body: string }) {
  const parts = body.split(/(@\w+)/g);
  return (
    <p className="text-sm whitespace-pre-wrap break-words mt-0.5">
      {parts.map((part, i) => part.startsWith("@")
        ? <span key={i} className="text-primary font-medium bg-primary/10 rounded px-0.5">{part}</span>
        : <span key={i}>{part}</span>)}
    </p>
  );
}

function CreateChannelDialog({ open, onOpenChange, staff, onCreate, pending }: {
  open: boolean; onOpenChange: (v: boolean) => void; staff: StaffMember[];
  onCreate: (p: { name: string; description: string | null; isPrivate: boolean; memberIds: string[] }) => void; pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (!open) { setName(""); setDescription(""); setIsPrivate(false); setSelected(new Set()); } }, [open]);
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a channel</DialogTitle><DialogDescription>Channels are where your team communicates.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. reporting-team" data-testid="input-channel-name" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" data-testid="input-channel-description" />
          <label className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> Private channel</span>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} data-testid="switch-private" />
          </label>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Invite members</p>
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} data-testid={`member-${s.id}`} />
                  <span className="flex-1">{personName(s)}</span>
                  <span className="text-xs text-muted-foreground capitalize">{s.role?.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onCreate({ name: name.trim(), description: description.trim() || null, isPrivate, memberIds: Array.from(selected) })}
            disabled={!name.trim() || pending} data-testid="button-create-channel">
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ open, onOpenChange, invitable, online, onInvite, pending }: {
  open: boolean; onOpenChange: (v: boolean) => void; invitable: StaffMember[]; online: string[];
  onInvite: (ids: string[]) => void; pending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (!open) setSelected(new Set()); }, [open]);
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add members</DialogTitle><DialogDescription>Invite colleagues to this channel.</DialogDescription></DialogHeader>
        <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
          {invitable.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Everyone's already here</p> : invitable.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} data-testid={`invite-${s.id}`} />
              <span className="relative">
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{initials(s)}</span>
                {online.includes(s.id) && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-background" />}
              </span>
              <span className="flex-1">{personName(s)}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onInvite(Array.from(selected))} disabled={selected.size === 0 || pending} data-testid="button-confirm-invite">
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />} Add {selected.size > 0 ? selected.size : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
