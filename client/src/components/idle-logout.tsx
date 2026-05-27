import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

const IDLE_MINUTES = 20;
const WARNING_SECONDS = 60;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

export default function IdleLogout() {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_SECONDS);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (logoutTimerRef.current) { clearTimeout(logoutTimerRef.current); logoutTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
  }, []);

  const performLogout = useCallback(async () => {
    clearAllTimers();
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore — proceed with client-side teardown either way.
    }
    queryClient.clear();
    window.location.href = "/login?reason=idle";
  }, [clearAllTimers]);

  const startWarning = useCallback(() => {
    setCountdown(WARNING_SECONDS);
    setShowWarning(true);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    logoutTimerRef.current = setTimeout(() => {
      void performLogout();
    }, WARNING_SECONDS * 1000);
  }, [performLogout]);

  const resetIdleTimer = useCallback(() => {
    if (showWarning) return; // Activity while warning shown is handled by "Stay signed in" button only.
    lastActivityRef.current = Date.now();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(startWarning, IDLE_MINUTES * 60 * 1000);
  }, [startWarning, showWarning]);

  const handleStayActive = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setCountdown(WARNING_SECONDS);
    lastActivityRef.current = Date.now();
    idleTimerRef.current = setTimeout(startWarning, IDLE_MINUTES * 60 * 1000);
  }, [clearAllTimers, startWarning]);

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
      clearAllTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open={showWarning} onOpenChange={() => { /* ignore — must use buttons */ }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>You're about to be signed out</DialogTitle>
          <DialogDescription>
            For security, you'll be signed out automatically after {IDLE_MINUTES} minutes of inactivity.
          </DialogDescription>
        </DialogHeader>
        <div className="text-center py-4">
          <div className="text-5xl font-bold text-amber-600" data-testid="text-idle-countdown">{countdown}</div>
          <div className="text-sm text-gray-600 mt-2">seconds until automatic sign-out</div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => void performLogout()} data-testid="button-idle-logout-now">
            Sign out now
          </Button>
          <Button onClick={handleStayActive} data-testid="button-idle-stay-signed-in">
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
