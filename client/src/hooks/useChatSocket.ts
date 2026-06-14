import { useEffect, useRef, useState, useCallback } from "react";

// Real-time channel for Team Chat. Connects to the server's `/ws/chat`
// WebSocket (a distinct path from Vite's HMR socket), reconnects with backoff,
// and surfaces presence + typing as state. Domain events (new messages,
// channel/membership changes) are handed to the caller via `onEvent`.

export type ChatServerEvent =
  | { type: "message:new"; channelId: number; message: any }
  | { type: "message:updated"; channelId: number; message: any }
  | { type: "message:deleted"; channelId: number; messageId: number }
  | { type: "channel:read"; channelId: number; userId: string }
  | { type: "channel:updated"; channelId: number }
  | { type: "channels:changed" }
  | { type: "typing"; channelId: number; userId: string; userName: string }
  | { type: "presence"; online: string[] };

export function useChatSocket(opts: { enabled: boolean; onEvent: (e: ChatServerEvent) => void }) {
  const { enabled } = opts;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const closedByUs = useRef(false);

  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  // channelId -> { userId -> displayName } of who is currently typing.
  const [typing, setTyping] = useState<Record<number, Record<string, string>>>({});
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const connect = useCallback(() => {
    if (!enabled) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${window.location.host}/ws/chat`);
    } catch {
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); attemptsRef.current = 0; };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (closedByUs.current || !enabled) return;
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 15000);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };

    ws.onmessage = (ev) => {
      let data: ChatServerEvent;
      try { data = JSON.parse(ev.data); } catch { return; }

      if (data.type === "presence") { setOnline(data.online); return; }

      if (data.type === "typing") {
        const key = `${data.channelId}:${data.userId}`;
        setTyping((prev) => ({
          ...prev,
          [data.channelId]: { ...(prev[data.channelId] || {}), [data.userId]: data.userName },
        }));
        if (typingTimers.current[key]) clearTimeout(typingTimers.current[key]);
        typingTimers.current[key] = setTimeout(() => {
          setTyping((prev) => {
            const ch = { ...(prev[data.channelId] || {}) };
            delete ch[data.userId];
            return { ...prev, [data.channelId]: ch };
          });
        }, 4000);
        return;
      }

      onEventRef.current(data);
    };
  }, [enabled]);

  useEffect(() => {
    closedByUs.current = false;
    if (enabled) connect();
    return () => {
      closedByUs.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      Object.values(typingTimers.current).forEach((t) => clearTimeout(t));
      if (wsRef.current) { try { wsRef.current.close(); } catch { /* noop */ } wsRef.current = null; }
    };
  }, [enabled, connect]);

  const sendTyping = useCallback((channelId: number) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "typing", channelId }));
    }
  }, []);

  return { connected, online, typing, sendTyping };
}
