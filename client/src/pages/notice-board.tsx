import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Pin, MessageSquare, Plus, Edit, Trash2, Send, Megaphone,
  AlertCircle, Wrench, PartyPopper, BookOpen, X, Paperclip,
  FileText, Image as ImageIcon, Download, Upload, Video
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { NoticeBoardPost, NoticeBoardComment, NoticeBoardAttachment } from "@shared/schema";
import { TasksPanel } from "@/pages/calendar";
import { ChangelogCard } from "@/components/admin-panel";

const URL_REGEX = /(https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]'"])/gi;

function detectMeetingProvider(url: string): { name: string; color: string } | null {
  const u = url.toLowerCase();
  if (u.includes("teams.microsoft.com") || u.includes("teams.live.com")) return { name: "Microsoft Teams", color: "bg-indigo-600 hover:bg-indigo-700" };
  if (u.includes("zoom.us") || u.includes("zoom.com")) return { name: "Zoom", color: "bg-blue-600 hover:bg-blue-700" };
  if (u.includes("meet.google.com")) return { name: "Google Meet", color: "bg-emerald-600 hover:bg-emerald-700" };
  if (u.includes("webex.com")) return { name: "Webex", color: "bg-teal-600 hover:bg-teal-700" };
  if (u.includes("whereby.com")) return { name: "Whereby", color: "bg-rose-600 hover:bg-rose-700" };
  return null;
}

function renderBodyWithLinks(body: string) {
  const parts: (string | { url: string })[] = [];
  let lastIndex = 0;
  for (const m of Array.from(body.matchAll(URL_REGEX))) {
    if (m.index! > lastIndex) parts.push(body.slice(lastIndex, m.index));
    parts.push({ url: m[0] });
    lastIndex = m.index! + m[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts.map((p, i) =>
    typeof p === "string"
      ? <span key={i}>{p}</span>
      : <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline break-all">{p.url}</a>
  );
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StaffMember {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

const CATEGORIES: { value: string; label: string; icon: any; color: string }[] = [
  { value: "general",     label: "General",      icon: Megaphone,    color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "important",   label: "Important",    icon: AlertCircle,  color: "bg-red-100 text-red-800 border-red-200" },
  { value: "policy",      label: "Policy / SOP", icon: BookOpen,     color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "maintenance", label: "Maintenance",  icon: Wrench,       color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "social",      label: "Social",       icon: PartyPopper,  color: "bg-pink-100 text-pink-800 border-pink-200" },
];

function getCategory(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[0];
}

function authorName(staff: StaffMember[], authorId: string | null) {
  if (!authorId) return "Unknown";
  const m = staff.find(s => s.id === authorId);
  if (!m) return "Unknown";
  const full = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
  return full || m.email || "Unknown";
}

export default function NoticeBoard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [filter, setFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeBoardPost | null>(null);
  const [form, setForm] = useState({ title: "", body: "", category: "general", pinned: false });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: posts = [], isLoading } = useQuery<NoticeBoardPost[]>({ queryKey: ["/api/notice-board"] });
  const { data: staff = [] } = useQuery<StaffMember[]>({ queryKey: ["/api/staff"] });

  const resetForm = () => {
    setEditing(null);
    setForm({ title: "", body: "", category: "general", pinned: false });
    setPendingFiles([]);
  };

  const uploadAttachments = async (postId: number, files: File[]) => {
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/notice-board/${postId}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to upload ${file.name}`);
      }
    }
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (p: NoticeBoardPost) => {
    setEditing(p);
    setForm({ title: p.title, body: p.body, category: p.category, pinned: p.pinned });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let postId: number;
      if (editing) {
        await apiRequest(`/api/notice-board/${editing.id}`, "PATCH", form);
        postId = editing.id;
      } else {
        const res = await apiRequest("/api/notice-board", "POST", form);
        const created = await res.json();
        postId = created.id;
      }
      if (pendingFiles.length > 0) {
        setUploading(true);
        try {
          await uploadAttachments(postId, pendingFiles);
        } finally {
          setUploading(false);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/notice-board", postId, "attachments"] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notice-board"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editing ? "Notice updated" : "Notice posted" });
    },
    onError: (err: any) => toast({ title: "Failed to save", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/notice-board/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notice-board"] });
      toast({ title: "Notice deleted" });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async (p: NoticeBoardPost) => apiRequest(`/api/notice-board/${p.id}`, "PATCH", { pinned: !p.pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notice-board"] }),
  });

  const filtered = filter === "all" ? posts : posts.filter(p => p.category === filter);
  const pinnedCount = posts.filter(p => p.pinned).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-4 min-w-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-blue-600" /> Notice Board
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Internal announcements, policy updates and team news for your clinic.
            {pinnedCount > 0 && <span className="ml-2"><Pin className="w-3 h-3 inline mb-0.5" /> {pinnedCount} pinned</span>}
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-notice">
          <Plus className="w-4 h-4 mr-1" /> New Notice
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
          data-testid="filter-all"
        >
          All ({posts.length})
        </Button>
        {CATEGORIES.map(c => {
          const count = posts.filter(p => p.category === c.value).length;
          if (count === 0) return null;
          const Icon = c.icon;
          return (
            <Button
              key={c.value}
              size="sm"
              variant={filter === c.value ? "default" : "outline"}
              onClick={() => setFilter(c.value)}
              data-testid={`filter-${c.value}`}
            >
              <Icon className="w-3.5 h-3.5 mr-1" /> {c.label} ({count})
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Megaphone className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="font-semibold">No notices yet</p>
            <p className="text-sm">Click "New Notice" to post the first announcement for your team.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(post => (
            <NoticePostCard
              key={post.id}
              post={post}
              staff={staff}
              currentUserId={user?.id}
              onEdit={() => openEdit(post)}
              onDelete={() => {
                if (confirm("Delete this notice and all its comments?")) deleteMutation.mutate(post.id);
              }}
              onTogglePin={() => togglePinMutation.mutate(post)}
            />
          ))}
        </div>
      )}

        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TasksPanel />
          <div className="max-h-[420px] overflow-y-auto rounded-lg border bg-white text-xs [&_.text-base]:text-sm">
            <ChangelogCard />
          </div>
        </aside>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Notice" : "New Notice"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
            className="space-y-3"
          >
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. New ultrasound machine arriving Monday"
                required
                data-testid="input-notice-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-notice-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3 pb-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.pinned}
                    onCheckedChange={(v) => setForm(f => ({ ...f, pinned: v }))}
                    data-testid="switch-notice-pinned"
                  />
                  <Label className="cursor-pointer flex items-center gap-1">
                    <Pin className="w-3.5 h-3.5" /> Pin to top
                  </Label>
                </div>
              </div>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                rows={8}
                placeholder="Write your notice here. Plain text — line breaks are preserved."
                required
                data-testid="textarea-notice-body"
              />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Attachments</Label>
              <div className="mt-1 space-y-2">
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-md py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 text-sm text-gray-600">
                  <Upload className="w-4 h-4" />
                  <span>Click to add files (images, PDFs — max 10MB each)</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      setPendingFiles(prev => [...prev, ...files]);
                      e.target.value = "";
                    }}
                    data-testid="input-notice-attachments"
                  />
                </label>
                {pendingFiles.length > 0 && (
                  <ul className="space-y-1">
                    {pendingFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm bg-gray-50 border rounded px-2 py-1">
                        {f.type.startsWith("image/") ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-gray-500" />}
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-gray-400">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-red-600"
                          onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || uploading} data-testid="button-save-notice">
                {uploading ? "Uploading…" : saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Post Notice"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoticePostCard({
  post, staff, currentUserId, onEdit, onDelete, onTogglePin,
}: {
  post: NoticeBoardPost;
  staff: StaffMember[];
  currentUserId?: string;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const cat = getCategory(post.category);
  const Icon = cat.icon;
  const isAuthor = currentUserId && post.authorId === currentUserId;
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");

  const { data: comments = [] } = useQuery<NoticeBoardComment[]>({
    queryKey: ["/api/notice-board", post.id, "comments"],
    enabled: showComments,
  });

  const { data: attachments = [] } = useQuery<NoticeBoardAttachment[]>({
    queryKey: ["/api/notice-board", post.id, "attachments"],
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/notice-board/attachments/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notice-board", post.id, "attachments"] }),
  });

  const addAttachmentsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/notice-board/${post.id}/attachments`, {
          method: "POST", body: fd, credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Failed to upload ${file.name}`);
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notice-board", post.id, "attachments"] }),
  });

  const commentMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/notice-board/${post.id}/comments`, "POST", { body: newComment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notice-board", post.id, "comments"] });
      setNewComment("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/notice-board/comments/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notice-board", post.id, "comments"] }),
  });

  return (
    <Card className={post.pinned ? "border-amber-300 bg-amber-50/30" : ""} data-testid={`notice-${post.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {post.pinned && <Pin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base">{post.title}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                <Badge variant="outline" className={`${cat.color} text-xs`}>
                  <Icon className="w-3 h-3 mr-1" /> {cat.label}
                </Badge>
                <span>by {authorName(staff, post.authorId)}</span>
                <span>·</span>
                <span title={post.createdAt ? format(new Date(post.createdAt), "PPpp") : ""}>
                  {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={onTogglePin} className="h-7 w-7 p-0" title={post.pinned ? "Unpin" : "Pin"} data-testid={`button-pin-${post.id}`}>
              <Pin className={`w-3.5 h-3.5 ${post.pinned ? "text-amber-600 fill-amber-500" : "text-gray-400"}`} />
            </Button>
            {isAuthor && (
              <>
                <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 w-7 p-0" data-testid={`button-edit-${post.id}`}>
                  <Edit className="w-3.5 h-3.5 text-gray-500" />
                </Button>
                <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 w-7 p-0" data-testid={`button-delete-${post.id}`}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap text-gray-700">{renderBodyWithLinks(post.body)}</p>

        {(() => {
          const meetingMatch = Array.from(post.body.matchAll(URL_REGEX))
            .map(m => ({ url: m[0], provider: detectMeetingProvider(m[0]) }))
            .find(x => x.provider !== null);
          if (!meetingMatch) return null;
          return (
            <a
              href={meetingMatch.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium shadow-sm transition-colors ${meetingMatch.provider!.color}`}
              data-testid={`button-join-meeting-${post.id}`}
            >
              <Video className="w-4 h-4" />
              Join {meetingMatch.provider!.name} meeting
            </a>
          );
        })()}

        {attachments.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {attachments.filter(a => a.mimeType.startsWith("image/")).map(a => (
                <a
                  key={a.id}
                  href={a.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block relative group rounded border bg-gray-50 overflow-hidden hover:border-blue-400"
                  data-testid={`attachment-image-${a.id}`}
                >
                  <img src={a.fileUrl} alt={a.originalName} className="w-full h-32 object-cover" />
                  {isAuthor && (
                    <button
                      className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm(`Delete attachment "${a.originalName}"?`)) deleteAttachmentMutation.mutate(a.id);
                      }}
                    >
                      <X className="w-3 h-3 text-red-600" />
                    </button>
                  )}
                </a>
              ))}
            </div>
            <ul className="space-y-1">
              {attachments.filter(a => !a.mimeType.startsWith("image/")).map(a => (
                <li key={a.id} className="flex items-center gap-2 bg-gray-50 border rounded px-2 py-1.5 text-sm">
                  <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate text-blue-700 hover:underline"
                    data-testid={`attachment-file-${a.id}`}
                  >
                    {a.originalName}
                  </a>
                  <span className="text-xs text-gray-400">{formatBytes(a.sizeBytes)}</span>
                  <a href={a.fileUrl} download={a.originalName} className="text-gray-500 hover:text-gray-700">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {isAuthor && (
                    <button
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => { if (confirm(`Delete attachment "${a.originalName}"?`)) deleteAttachmentMutation.mutate(a.id); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1 flex items-center gap-1 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-gray-500"
            onClick={() => setShowComments(s => !s)}
            data-testid={`button-comments-${post.id}`}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1" />
            {showComments ? "Hide comments" : `Comments${comments.length ? ` (${comments.length})` : ""}`}
          </Button>
          {isAuthor && (
            <label className="cursor-pointer">
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-gray-500">
                <span>
                  <Paperclip className="w-3.5 h-3.5 mr-1" />
                  {addAttachmentsMutation.isPending ? "Uploading…" : "Add attachment"}
                </span>
              </Button>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) addAttachmentsMutation.mutate(files);
                  e.target.value = "";
                }}
                data-testid={`input-add-attachment-${post.id}`}
              />
            </label>
          )}
        </div>
        {showComments && (
          <div className="border-t pt-2 space-y-2">
            {comments.length === 0 && <p className="text-xs text-gray-400">No comments yet.</p>}
            {comments.map(c => {
              const isCommentAuthor = currentUserId && c.authorId === currentUserId;
              return (
                <div key={c.id} className="bg-gray-50 rounded p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{authorName(staff, c.authorId)}</span>
                      <span className="ml-2">{c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : ""}</span>
                    </div>
                    {isCommentAuthor && (
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteCommentMutation.mutate(c.id)}>
                        <X className="w-3 h-3 text-gray-400" />
                      </Button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap mt-0.5">{c.body}</p>
                </div>
              );
            })}
            <form
              onSubmit={(e) => { e.preventDefault(); if (newComment.trim()) commentMutation.mutate(); }}
              className="flex gap-2 pt-1"
            >
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment…"
                className="text-sm"
                data-testid={`input-comment-${post.id}`}
              />
              <Button type="submit" size="sm" disabled={!newComment.trim() || commentMutation.isPending} data-testid={`button-send-comment-${post.id}`}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
