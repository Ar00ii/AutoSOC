"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import AiLockBanner from "@/components/AiLockBanner";
import type { Report } from "@/lib/api";
import { fetcher, post } from "@/lib/api";

const PERIODS = ["1h", "24h", "7d", "30d"];

export default function ReportsPage() {
  const { data } = useSWR<Report[]>("/api/reports", fetcher, { refreshInterval: 30_000 });
  const [period, setPeriod] = useState("24h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      await post(`/api/reports/generate?period=${period}`);
      mutate("/api/reports");
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      setError(
        msg.includes("subscription")
          ? "AI reports require an active subscription. Upgrade in Billing."
          : "Could not generate the report.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Topbar title="Reports / AI generated" />
      <div className="p-6 space-y-4">
        <AiLockBanner feature="AI reports" />
        <div className="flex items-center gap-3 border border-ink p-3">
          <span className="label-cap">Period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-ink bg-paper px-2 py-1 text-sm uppercase tracking-wider"
          >
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            aria-busy={busy}
            className="border border-ink px-3 py-2 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {busy ? "Generating..." : "Generate"}
          </button>
        </div>
        {error && (
          <div role="alert" className="border border-ink p-3 text-sm">{error}</div>
        )}
        <div className="space-y-4">
          {(data ?? []).map((r) => (
            <article key={r.id} className="border border-ink p-4">
              <header className="flex items-center justify-between border-b hair pb-2 mb-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wider">{r.title}</div>
                  <div className="label-cap-muted">Period: {r.period}</div>
                </div>
                <div className="label-cap-muted tabular-nums">
                  {r.created_at.replace("T", " ").slice(0, 19)}
                </div>
              </header>
              <pre className="whitespace-pre-wrap text-sm leading-5">{r.body}</pre>
            </article>
          ))}
          {(!data || data.length === 0) && (
            <div className="border border-ink p-6 text-center label-cap-muted">
              No reports yet. Generate one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
