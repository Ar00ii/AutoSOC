"use client";

import { useEffect, useRef, useState } from "react";
import { getToken, postJSON } from "@/lib/auth";

export interface LiveEvent {
  id: number;
  timestamp: string;
  src_ip: string;
  src_country: string;
  src_lat: number;
  src_lng: number;
  dst_lat: number;
  dst_lng: number;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  mitre_id?: string;
  abuse_score?: number;
}

export function useLiveStream(maxBuffer: number = 50) {
  const [latest, setLatest] = useState<LiveEvent[]>([]);
  const [correlations, setCorrelations] = useState<
    { rule: string; ip: string; severity: string; t: number }[]
  >([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    async function connect() {
      let url = "/api/stream";
      if (getToken()) {
        try {
          const res = await postJSON<{ ticket: string }>("/api/auth/sse_ticket");
          url = `/api/stream?ticket=${encodeURIComponent(res.ticket)}`;
        } catch {
          return;
        }
      }
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      es.onmessage = (m) => {
        try {
          const parsed = JSON.parse(m.data);
          if (parsed.type === "event") {
            setLatest((prev) => [parsed.data as LiveEvent, ...prev].slice(0, maxBuffer));
          } else if (parsed.type === "correlation") {
            setCorrelations((prev) =>
              [{ ...parsed.data, t: Date.now() }, ...prev].slice(0, 20),
            );
          }
        } catch {}
      };
    }

    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [maxBuffer]);

  return { latest, correlations, connected };
}
