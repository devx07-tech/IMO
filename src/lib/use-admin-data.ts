"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cancel stale filter requests; keep views current without a full-page reload.
export function useAdminData<T>(url: string) {
  const [result, setResult] = useState<{ url: string; data: T | null; error: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const res = await fetch(url, { cache: "no-store", signal: current.signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load admin data.");
      if (!current.signal.aborted) setResult({ url, data: body, error: "" });
    } catch (err) {
      if (!current.signal.aborted) setResult((previous) => ({
        url, data: previous?.url === url ? previous.data : null,
        error: err instanceof Error ? err.message : "Could not load admin data.",
      }));
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    const timeout = setTimeout(() => { setLoading(true); void refresh(); }, 250);
    const update = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearTimeout(timeout); clearInterval(interval);
      window.removeEventListener("focus", update);
      controller.current?.abort();
    };
  }, [refresh]);
  return { data: result?.url === url ? result.data : null,
    error: result?.url === url ? result.error : "",
    loading: loading || result?.url !== url, refresh };
}
