import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { resolveUrl } from "./api";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
  options?: { isFormData?: boolean }
): Promise<Response> {
  const res = await fetch(resolveUrl(url), {
    method,
    headers: options?.isFormData ? {} : data ? { "Content-Type": "application/json" } : {},
    body: options?.isFormData ? data as BodyInit : data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // queryKey segments are joined with "/" to form the path, then resolved
    // against the configured API base URL (no-op for the default web build).
    const path = queryKey.join("/") as string;
    const res = await fetch(resolveUrl(path), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // Auto-refresh when the user tabs back to the app or reconnects, and
      // re-fetch on remount once data is older than the stale window. This
      // removes the previous "manual refresh required" behaviour without
      // adding background polling.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
