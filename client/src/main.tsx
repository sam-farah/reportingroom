import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "./index.css";
import { installApiBaseInterceptor } from "./lib/api";

// In native (Capacitor) builds VITE_API_BASE_URL is set to the deployed
// backend URL.  The interceptor rewrites all server-relative fetch() paths
// so every raw `fetch('/api/...')` call reaches the correct backend.
// This is a no-op for the web build (VITE_API_BASE_URL is empty).
installApiBaseInterceptor();

// ── iPad scroll-freeze safety net (native app only) ──
// Radix UI (dialogs, selects, dropdowns) uses react-remove-scroll, which
// locks the page by setting `overflow: hidden` on <body data-scroll-locked>
// while open. On iOS WKWebView that lock can fail to release after the menu
// closes, freezing scrolling on every screen until the app restarts.
// 1. Add `native-app` so the scoped CSS override (index.css) keeps the body
//    scrollable, and 2. clear any stale lock on touch when no Radix overlay
//    is actually open (also drops a leaked scroll-blocking state).
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");

  const overlayIsOpen = () =>
    !!document.querySelector(
      [
        "[data-radix-popper-content-wrapper]",
        '[role="dialog"][data-state="open"]',
        '[role="alertdialog"][data-state="open"]',
        '[data-radix-menu-content][data-state="open"]',
        '[data-state="open"][role="listbox"]',
      ].join(","),
    );

  const clearStaleScrollLock = () => {
    if (document.body.hasAttribute("data-scroll-locked") && !overlayIsOpen()) {
      document.body.removeAttribute("data-scroll-locked");
      for (const prop of [
        "overflow",
        "overscroll-behavior",
        "margin-right",
        "padding-right",
        "position",
      ]) {
        document.body.style.removeProperty(prop);
      }
    }
  };

  document.addEventListener("touchstart", clearStaleScrollLock, {
    passive: true,
    capture: true,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
