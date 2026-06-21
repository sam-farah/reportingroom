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
