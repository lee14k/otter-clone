import { useEffect, useRef, useState } from "react";
import type { StatusOut } from "@/types";

interface Options {
  fetcher: () => Promise<StatusOut>;
  intervalMs: number;
  enabled: boolean;
}

export function useStatusPoll({ fetcher, intervalMs, enabled }: Options) {
  const [status, setStatus] = useState<StatusOut["status"]>("transcribing");
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const out = await fetcherRef.current();
        if (cancelled) return;
        setStatus(out.status);
        setError(out.error);
        if (out.status === "ready" || out.status === "failed") return;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
      timer = setTimeout(tick, intervalMs);
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs]);

  return { status, error };
}
