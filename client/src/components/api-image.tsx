import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders an image served by an authenticated API route.
 *
 * Why not a plain <img src="/api/...">?
 *  1. Inside the native iPad shell the page origin is capacitor://localhost,
 *     so a relative src never reaches the backend — the image silently renders
 *     blank. fetch() goes through the app's base-URL interceptor and works in
 *     both environments.
 *  2. fetch() carries the session cookie (credentials: "include"), which
 *     authenticated image routes require.
 *  3. cache: "no-store" bypasses stale HTTP caches — worksheet images change
 *     as the sonographer draws (autosave), so cached copies mislead.
 */
export function ApiImage({
  src,
  alt,
  className,
  fallback = null,
}: {
  src: string;
  alt?: string;
  className?: string;
  /** Rendered when the image cannot be loaded (default: nothing). */
  fallback?: ReactNode;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setFailed(false);

    fetch(src, { credentials: "include", cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Image request failed (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) return <>{fallback}</>;
  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return <img src={blobUrl} alt={alt} className={className} />;
}
