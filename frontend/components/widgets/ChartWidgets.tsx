"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { WidgetShell, Pill, MiniBar } from "./primitives";
import { LineChart, BarChart, Donut, Heatmap } from "./charts";

interface Bucket { t: string; total: number }
interface TopAgg {
  ips: { key: string; count: number }[];
  countries: { key: string; count: number }[];
  categories: { key: string; count: number }[];
  mitre: { key: string; count: number }[];
}
interface EventStats {
  events_24h: number;
  critical_24h: number;
}

const TACTICS = [
  "reconnaissance","resource-development","initial-access","execution",
  "persistence","privilege-escalation","defense-evasion","credential-access",
  "discovery","lateral-movement","collection","command-and-control",
  "exfiltration","impact",
];

export function ChartEventsPerHour() {
  const { data, isLoading } = useSWR<Bucket[]>(
    "/api/dashboard/timeseries?hours=24&bucket_minutes=60",
    fetcher,
    { refreshInterval: 20_000 },
  );
  const series = (data ?? []).map((b) => b.total);
  return (
    <WidgetShell
      title="Events per hour"
      subtitle="last 24h"
      loading={isLoading}
      empty={!series.some((v) => v > 0)}
      emptyText="No events in the window."
    >
      <div className="h-full p-2">
        <LineChart data={series} height={170} />
      </div>
    </WidgetShell>
  );
}

export function ChartSeverityDonut() {
  // Pull last-200 events to derive severity split without a new endpoint
  const { data, isLoading } = useSWR<{ severity: string }[]>(
    "/api/events?limit=200",
    fetcher,
    { refreshInterval: 20_000 },
  );
  const counts: Record<string, number> = {};
  for (const e of data ?? []) counts[e.severity] = (counts[e.severity] || 0) + 1;
  const series = ["critical", "high", "medium", "low"]
    .filter((s) => counts[s])
    .map((s) => ({ label: s, value: counts[s] || 0 }));
  return (
    <WidgetShell title="Severity breakdown" subtitle="last 200 events" loading={isLoading} empty={!series.length}>
      <Donut data={series} size={130} />
    </WidgetShell>
  );
}

export function ChartTopCategories() {
  const { data, isLoading } = useSWR<TopAgg>("/api/dashboard/top?hours=24&n=8", fetcher, { refreshInterval: 20_000 });
  const items = (data?.categories ?? []).slice(0, 8);
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <WidgetShell title="Top categories" subtitle="last 24h" loading={isLoading} empty={!items.length}>
      <ul className="px-3 py-2 space-y-1 overflow-y-auto h-full scrollbar-mono">
        {items.map((i, idx) => (
          <li key={`${idx}-${i.key}`} className="flex items-center gap-2 text-sm">
            <span className="uppercase tracking-wider text-[11px] w-32 truncate">{i.key || "—"}</span>
            <div className="flex-1"><MiniBar pct={(i.count / max) * 100} /></div>
            <span className="tabular-nums w-12 text-right">{i.count.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function ChartTopCountries() {
  const { data, isLoading } = useSWR<TopAgg>("/api/dashboard/top?hours=24&n=8", fetcher, { refreshInterval: 20_000 });
  const items = (data?.countries ?? []).slice(0, 8);
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <WidgetShell title="Top source countries" subtitle="last 24h" loading={isLoading} empty={!items.length}>
      <ul className="px-3 py-2 space-y-1 overflow-y-auto h-full scrollbar-mono">
        {items.map((i, idx) => (
          <li key={`${idx}-${i.key}`} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[12px] w-12 tracking-wider">{i.key || "??"}</span>
            <div className="flex-1"><MiniBar pct={(i.count / max) * 100} /></div>
            <span className="tabular-nums w-12 text-right">{i.count.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function ChartKillchainCoverage() {
  const { data, isLoading } = useSWR<Record<string, number>>("/api/dashboard/layouts/_killchain_coverage", fetcher, { refreshInterval: 20_000 });
  const counts = data || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <WidgetShell title="Kill-chain coverage" subtitle={`${total} events / 24h`} loading={isLoading}>
      <div className="p-3 grid grid-cols-2 gap-1">
        {TACTICS.map((t) => {
          const n = counts[t] || 0;
          return (
            <div key={t} className={"flex items-center justify-between px-2 py-1 border " + (n > 0 ? "bg-ink text-paper border-ink" : "border-hair text-muted")}>
              <span className="text-[10px] uppercase tracking-wider">{t.replace(/-/g, " ")}</span>
              <span className="text-[10px] tabular-nums font-mono">{n || "—"}</span>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}

export function ChartTopMitre() {
  const { data, isLoading } = useSWR<{ key: string; count: number }[]>(
    "/api/dashboard/layouts/_top_mitre", fetcher, { refreshInterval: 30_000 },
  );
  const items = data ?? [];
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <WidgetShell title="Top MITRE techniques" subtitle="last 24h" loading={isLoading} empty={!items.length}>
      <ul className="px-3 py-2 space-y-1 overflow-y-auto h-full scrollbar-mono">
        {items.map((i, idx) => (
          <li key={`${idx}-${i.key}`} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[11px] truncate flex-1">{i.key}</span>
            <div className="w-24"><MiniBar pct={(i.count / max) * 100} /></div>
            <span className="tabular-nums w-10 text-right">{i.count}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function ChartTopAsn() {
  const { data, isLoading } = useSWR<{ key: string; count: number }[]>(
    "/api/dashboard/layouts/_top_asn", fetcher, { refreshInterval: 30_000 },
  );
  const items = data ?? [];
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <WidgetShell title="Top source ASN" subtitle="/16 prefix · 24h" loading={isLoading} empty={!items.length}>
      <ul className="px-3 py-2 space-y-1 overflow-y-auto h-full scrollbar-mono">
        {items.map((i, idx) => (
          <li key={`${idx}-${i.key}`} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[11px] tabular-nums truncate flex-1">{i.key}</span>
            <div className="w-24"><MiniBar pct={(i.count / max) * 100} /></div>
            <span className="tabular-nums w-10 text-right">{i.count}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function ChartCasesByStatus() {
  const { data, isLoading } = useSWR<{ key: string; count: number }[]>(
    "/api/dashboard/layouts/_cases_by_status", fetcher, { refreshInterval: 20_000 },
  );
  const series = (data ?? []).map((d) => ({ label: d.key, value: d.count }));
  return (
    <WidgetShell title="Cases by status" loading={isLoading} empty={!series.length}>
      <Donut data={series} size={130} />
    </WidgetShell>
  );
}

export function ChartHeatmapHour() {
  const { data, isLoading } = useSWR<{ grid: number[][]; max: number }>("/api/dashboard/layouts/_heatmap_hour", fetcher, { refreshInterval: 60_000 });
  return (
    <WidgetShell title="Hourly heatmap" subtitle="last 7 days" loading={isLoading} empty={!data || data.max === 0}>
      {data && (
        <Heatmap
          grid={data.grid}
          max={data.max}
          rowLabels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
          colLabels={Array.from({ length: 24 }, (_, i) => String(i))}
        />
      )}
    </WidgetShell>
  );
}
