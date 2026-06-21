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

  // ── TEMPORARY build marker + diagnostics (native only) ──
  // A tiny badge in the bottom-right corner confirms the iPad is running the
  // latest build. TAP it to see live diagnostics (plugin availability, scroll
  // state, content height) straight from the device. Remove once verified.
  const badge = document.createElement("div");
  badge.textContent = "BUILD #4 · tap";
  badge.style.cssText = [
    "position:fixed",
    "bottom:4px",
    "right:6px",
    "z-index:2147483647",
    "font:600 11px -apple-system,system-ui,sans-serif",
    "color:#fff",
    "background:rgba(220,38,38,0.9)",
    "padding:4px 8px",
    "border-radius:6px",
    "pointer-events:auto",
  ].join(";");
  badge.addEventListener("click", () => {
    const cap = (window as any).Capacitor;
    const info = {
      platform: cap?.getPlatform?.(),
      pencilKit_isPluginAvailable: cap?.isPluginAvailable?.("PencilKit"),
      pencilKit_legacyGlobal: !!cap?.Plugins?.PencilKit,
      body_overflowY: getComputedStyle(document.body).overflowY,
      html_overflowY: getComputedStyle(document.documentElement).overflowY,
      scrollLocked_attr: document.body.hasAttribute("data-scroll-locked"),
      innerHeight: window.innerHeight,
      bodyScrollHeight: document.body.scrollHeight,
      contentTallerThanScreen:
        document.body.scrollHeight > window.innerHeight + 4,
    };
    alert("Diagnostics:\n\n" + JSON.stringify(info, null, 2));
  });
  const attach = () => document.body && document.body.appendChild(badge);
  document.addEventListener("DOMContentLoaded", attach);
  attach();
}

createRoot(document.getElementById("root")!).render(<App />);
