"use client";

import { useEffect, useState } from "react";
import { useLiveStream } from "@/hooks/useLiveStream";

interface Toast { id: number; ip: string; category: string; country: string; t: number }

export default function CriticalToast() {
  const { latest } = useLiveStream(50);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seen, setSeen] = useState<Set<number>>(new Set());

  useEffect(() => {
    for (const e of latest) {
      if (e.severity !== "critical") continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      setSeen(new Set(seen));
      setToasts((prev) => [...prev, { id: e.id, ip: e.src_ip, category: e.category, country: e.src_country, t: Date.now() }]);
    }
  }, [latest, seen]);

  useEffect(() => {
    const tick = setInterval(() => {
      const cutoff = Date.now() - 8000;
      setToasts((prev) => prev.filter((t) => t.t > cutoff));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md" role="status" aria-live="polite">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className="border border-ink bg-ink text-paper p-3 shadow-lg">
          <div className="label" style={{ color: "#fff" }}>CRITICAL · {t.category.toUpperCase()}</div>
          <div className="text-sm mt-1 tabular-nums">{t.ip} ({t.country})</div>
        </div>
      ))}
    </div>
  );
}
