// Team Chat real-time layer.
//
// A single WebSocketServer mounted on the existing HTTP server at path
// `/ws/chat` (a distinct path so it never collides with Vite's HMR socket).
// Authentication reuses the same express-session cookie via the shared
// `sessionMiddleware`, so only logged-in staff can connect.
//
// Persistence is handled by the REST routes; this layer only PUSHES live
// events (new messages, read receipts, membership changes) and relays
// ephemeral signals (typing, presence). REST routes call `chatHub.*` after a
// successful DB write to fan the event out to the relevant members.

import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { sessionMiddleware } from "./auth";
import { storage } from "./storage";

type Socket = WebSocket & {
  userId?: string;
  clinicId?: number | null;
  isAlive?: boolean;
};

type OutboundEvent =
  | { type: "message:new"; channelId: number; message: any }
  | { type: "channel:read"; channelId: number; userId: string }
  | { type: "channel:updated"; channelId: number }
  | { type: "channels:changed" }
  | { type: "typing"; channelId: number; userId: string; userName: string }
  | { type: "presence"; online: string[] };

class ChatHub {
  private wss: WebSocketServer | null = null;
  // All live sockets for a given user (a user may have multiple tabs open).
  private userSockets = new Map<string, Set<Socket>>();
  // Per-clinic set of online user ids (for presence broadcasts).
  private clinicOnline = new Map<number, Set<string>>();

  attach(server: HttpServer) {
    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;

    server.on("upgrade", (req: IncomingMessage, socket, head) => {
      // Only handle our path; let everything else (Vite HMR) pass through.
      const url = req.url || "";
      if (!url.startsWith("/ws/chat")) return;

      // Parse the session cookie using the shared express-session middleware.
      const res: any = { getHeader() {}, setHeader() {}, end() {} };
      const mw = sessionMiddleware;
      if (!mw) {
        socket.destroy();
        return;
      }
      mw(req as any, res, async () => {
        const userId = (req as any).session?.userId as string | undefined;
        if (!userId) {
          socket.destroy();
          return;
        }
        try {
          const user = await storage.getUser(userId);
          if (!user || !user.isActive) {
            socket.destroy();
            return;
          }
          wss.handleUpgrade(req, socket, head, (ws) => {
            const s = ws as Socket;
            s.userId = user.id;
            s.clinicId = user.clinicId ?? null;
            s.isAlive = true;
            this.register(s);
            wss.emit("connection", s, req);
          });
        } catch {
          socket.destroy();
        }
      });
    });

    wss.on("connection", (ws: Socket) => {
      ws.on("message", (raw) => this.onMessage(ws, raw.toString()));
      ws.on("pong", () => { ws.isAlive = true; });
      ws.on("close", () => this.unregister(ws));
      ws.on("error", () => this.unregister(ws));
    });

    // Heartbeat — drop dead sockets so presence stays accurate.
    const interval = setInterval(() => {
      wss.clients.forEach((client) => {
        const s = client as Socket;
        if (s.isAlive === false) { s.terminate(); return; }
        s.isAlive = false;
        try { s.ping(); } catch { /* noop */ }
      });
    }, 30000);
    wss.on("close", () => clearInterval(interval));
  }

  private register(s: Socket) {
    if (!s.userId) return;
    let set = this.userSockets.get(s.userId);
    if (!set) { set = new Set(); this.userSockets.set(s.userId, set); }
    set.add(s);
    if (s.clinicId != null) {
      let online = this.clinicOnline.get(s.clinicId);
      if (!online) { online = new Set(); this.clinicOnline.set(s.clinicId, online); }
      const wasOffline = !online.has(s.userId);
      online.add(s.userId);
      if (wasOffline) this.broadcastPresence(s.clinicId);
      else this.sendPresenceTo(s); // new tab — still send current snapshot
    }
  }

  private unregister(s: Socket) {
    if (!s.userId) return;
    const set = this.userSockets.get(s.userId);
    if (set) {
      set.delete(s);
      if (set.size === 0) {
        this.userSockets.delete(s.userId);
        if (s.clinicId != null) {
          const online = this.clinicOnline.get(s.clinicId);
          if (online && online.delete(s.userId)) this.broadcastPresence(s.clinicId);
        }
      }
    }
  }

  private async onMessage(ws: Socket, raw: string) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!ws.userId || ws.clinicId == null) return;

    if (msg.type === "typing" && typeof msg.channelId === "number") {
      // Verify membership before relaying so we don't leak typing into channels
      // the sender isn't part of.
      const isMember = await storage.isChatChannelMember(msg.channelId, ws.userId);
      if (!isMember) return;
      const user = await storage.getUser(ws.userId);
      const userName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || (user.email ?? "Someone") : "Someone";
      const memberIds = await storage.getChatChannelMemberUserIds(msg.channelId);
      this.sendToUsers(
        memberIds.filter((id) => id !== ws.userId),
        { type: "typing", channelId: msg.channelId, userId: ws.userId, userName },
      );
    }
  }

  private sendRaw(s: Socket, event: OutboundEvent) {
    if (s.readyState === WebSocket.OPEN) {
      try { s.send(JSON.stringify(event)); } catch { /* noop */ }
    }
  }

  private sendToUsers(userIds: string[], event: OutboundEvent) {
    for (const uid of userIds) {
      const set = this.userSockets.get(uid);
      if (!set) continue;
      Array.from(set).forEach((s) => this.sendRaw(s, event));
    }
  }

  private sendPresenceTo(s: Socket) {
    if (s.clinicId == null) return;
    const online = Array.from(this.clinicOnline.get(s.clinicId) ?? []);
    this.sendRaw(s, { type: "presence", online });
  }

  private broadcastPresence(clinicId: number) {
    const online = Array.from(this.clinicOnline.get(clinicId) ?? []);
    this.sendToUsers(online, { type: "presence", online });
  }

  // ── Public API used by REST routes after DB writes ──────────────────────

  // Fan a new message out to every channel member who is online.
  async emitNewMessage(channelId: number, message: any) {
    const memberIds = await storage.getChatChannelMemberUserIds(channelId);
    this.sendToUsers(memberIds, { type: "message:new", channelId, message });
  }

  async emitRead(channelId: number, userId: string) {
    const memberIds = await storage.getChatChannelMemberUserIds(channelId);
    this.sendToUsers(memberIds, { type: "channel:read", channelId, userId });
  }

  // Tell a specific set of users their channel list changed (created/invited/removed).
  notifyChannelsChanged(userIds: string[]) {
    this.sendToUsers(userIds, { type: "channels:changed" });
  }

  async emitChannelUpdated(channelId: number) {
    const memberIds = await storage.getChatChannelMemberUserIds(channelId);
    this.sendToUsers(memberIds, { type: "channel:updated", channelId });
  }
}

export const chatHub = new ChatHub();
