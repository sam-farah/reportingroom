/**
 * Single source of truth for the backend API base URL.
 *
 * Web builds: VITE_API_BASE_URL is not set, so all URLs are relative — the
 * frontend and backend are served from the same origin and no change in
 * behavior occurs.
 *
 * Native (Capacitor) builds: set VITE_API_BASE_URL to the deployed backend
 * URL (e.g. https://reporting-room.yourusername.replit.app) at build time.
 * All API calls and asset URLs will be prefixed with this base.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/**
 * Resolves a server-relative path (e.g. "/api/auth/user", "/uploads/abc.png")
 * against the configured API base URL.  When no base URL is set the path is
 * returned unchanged (relative URL, works for web).
 */
export function resolveUrl(path: string): string {
  if (!API_BASE) return path;
  // Avoid double-slashes: strip trailing slash from base, ensure path starts with /
  const base = API_BASE.replace(/\/$/, "");
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalised}`;
}

/**
 * Loads an image into a same-origin data URL so it can be drawn onto a <canvas>
 * without tainting it.
 *
 * A raw cross-origin <img> (e.g. a worksheet template served from the deployed
 * backend in the native iPad app) taints the canvas, which makes
 * canvas.toDataURL() throw "The operation is insecure".  Setting crossOrigin
 * isn't reliable here because the same template is also rendered as a plain
 * <img> elsewhere, so a non-CORS copy can already be cached.  Fetching the
 * bytes (via the native HTTP stack under Capacitor) and converting to a data
 * URL sidesteps both the CORS check and the image cache entirely.
 */
export async function loadImageElement(path: string): Promise<HTMLImageElement> {
  const res = await fetch(resolveUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Installs a global fetch interceptor that transparently rewrites all
 * server-relative paths (starting with "/") to the configured backend base
 * URL.  This covers every raw fetch() call in the app without requiring
 * individual call-site edits.
 *
 * This is a no-op when VITE_API_BASE_URL is not set (web build), so it never
 * changes web-build behaviour.
 */
export function installApiBaseInterceptor(): void {
  if (!API_BASE) return; // web build — nothing to do
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof input === "string" && input.startsWith("/")) {
      return originalFetch(resolveUrl(input), init);
    }
    return originalFetch(input, init);
  };
}

export default API_BASE;
