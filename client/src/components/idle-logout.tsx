import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

const IDLE_MINUTES = 20;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

export default function IdleLogout() {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performLogout = useCallback(async () => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore — proceed with client-side teardown either way.
    }
    queryClient.clear();
    window.location.href = "/login?reason=idle";
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => { void performLogout(); }, IDLE_MINUTES * 60 * 1000);
  }, [performLogout]);

  useEffect(() => {
    resetIdleTimer();

    // Throttle activity handler — fire at most every 2 seconds.
    let throttled = false;
    const handler = () => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => { throttled = false; }, 2000);
      resetIdleTimer();
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
