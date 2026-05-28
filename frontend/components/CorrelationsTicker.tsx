"use client";

import { useLiveStream } from "@/hooks/useLiveStream";

export default function CorrelationsTicker() {
  const { correlations } = useLiveStream();
  if (correlations.length === 0) {
    return (
      <div className="border border-ink p-3 label-cap-muted">
        No correlation alerts. Engine watches 15-minute windows per IP.
      </div>
    );
  }
  return (
    <div className="border border-ink">
      <div className="px-3 py-2 border-b border-ink label-cap">Correlation alerts</div>
      <ul className="divide-y hair">
        {correlations.map((c, i) => (
          <li key={i} className="px-3 py-2 text-xs flex items-center justify-between">
            <span className="uppercase tracking-wider">{c.rule.replace(/_/g, " ")}</span>
            <span className="tabular-nums">{c.ip}</span>
            <span className="label-cap">{c.severity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
