"use client";

import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/api";
import { AnimatedNumber, Sparkline, WidgetShell } from "./primitives";

interface Stats {
  events_24h: number;
  critical_24h: number;
  open_tickets: number;
  blocked_ips: number;
}
interface Bucket { t: string; total: number }
interface Cases { id: number; sla_breached: boolean; status: string }
interface Run { id: number; started_at: string }
interface TIStats { total_active: number }

export function KpiEvents24h() {
  const { data: stats, isLoading } = useSWR<Stats>("/api/events/_stats/summary", fetcher, { refreshInterval: 10_000 });
  const { data: ts } = useSWR<Bucket[]>("/api/dashboard/timeseries?hours=24&bucket_minutes=60", fetcher, { refreshInterval: 20_000 });
  const series = (ts ?? []).map((b) => b.total);
  return (
    <WidgetShell title="Events 24h" loading={isLoading}>
      <KpiCardBody
        value={stats?.events_24h ?? 0}
        href="/events"
        series={series}
        delta={delta(series)}
      />
    </WidgetShell>
  );
}

export function KpiCritical24h() {
  const { data: stats, isLoading } = useSWR<Stats>("/api/events/_stats/summary", fetcher, { refreshInterval: 10_000 });
  return (
    <WidgetShell title="Critical 24h" loading={isLoading}>
      <KpiCardBody value={stats?.critical_24h ?? 0} href="/events?severity=critical" />
    </WidgetShell>
  );
}

export function KpiOpenCases() {
  const { data, isLoading } = useSWR<Cases[]>("/api/cases?status=open", fetcher, { refreshInterval: 12_000 });
  return (
    <WidgetShell title="Open cases" loading={isLoading}>
      <KpiCardBody value={data?.length ?? 0} href="/cases" />
    </WidgetShell>
  );
}

export function KpiSlaBreached() {
  const { data, isLoading } = useSWR<Cases[]>("/api/cases?status=open", fetcher, { refreshInterval: 12_000 });
  const v = (data ?? []).filter((c) => c.sla_breached).length;
  return (
    <WidgetShell title="SLA breached" subtitle="open cases past SLA" loading={isLoading}>
      <KpiCardBody value={v} href="/cases" emphasize={v > 0} />
    </WidgetShell>
  );
}

export function KpiBlockedIps() {
  const { data: stats, isLoading } = useSWR<Stats>("/api/events/_stats/summary", fetcher, { refreshInterval: 12_000 });
  return (
    <WidgetShell title="Blocked IPs" loading={isLoading}>
      <KpiCardBody value={stats?.blocked_ips ?? 0} href="/blocks" />
    </WidgetShell>
  );
}

export function KpiTiIocs() {
  const { data, isLoading } = useSWR<TIStats>("/api/ti/stats", fetcher, { refreshInterval: 30_000 });
  return (
    <WidgetShell title="Threat-intel IoCs" subtitle="active in store" loading={isLoading}>
      <KpiCardBody value={data?.total_active ?? 0} href="/admin/ti" />
    </WidgetShell>
  );
}

export function KpiAgentRuns1h() {
  // Pull recent agent runs and count last hour
  const { data, isLoading } = useSWR<Run[]>("/api/agents/runs/all?limit=100", fetcher, { refreshInterval: 12_000 });
  const cutoff = Date.now() - 3600_000;
  const v = (data ?? []).filter((r) => r.started_at && new Date(r.started_at).getTime() > cutoff).length;
  return (
    <WidgetShell title="Agent runs 1h" subtitle="autonomous activity" loading={isLoading}>
      <KpiCardBody value={v} href="/agents/runs" />
    </WidgetShell>
  );
}

function KpiCardBody({
  value,
  href,
  series,
  delta,
  emphasize,
}: {
  value: number;
  href?: string;
  series?: number[];
  delta?: number;
  emphasize?: boolean;
}) {
  const body = (
    <div
      className={
        "h-full w-full p-3 flex flex-col justify-between " +
        (emphasize ? "bg-ink text-paper" : "")
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono font-semibold text-[40px] tabular-nums leading-none">
          <AnimatedNumber value={value} />
        </span>
        {delta != null && (
          <span className="label-cap-muted tabular-nums">
            {delta >= 0 ? "+" : ""}{delta.toFixed(0)} 1h
          </span>
        )}
      </div>
      {series && series.length > 1 && (
        <Sparkline data={series} height={28} className="opacity-80" />
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full w-full">
      {body}
    </Link>
  ) : body;
}

function delta(series: number[]): number | undefined {
  if (!series || series.length < 2) return undefined;
  return series[series.length - 1] - series[series.length - 2];
}
