"use client";

import useSWR from "swr";
import Link from "next/link";
import { fetcher, post } from "@/lib/api";
import { WidgetShell, Sev, Pill } from "./primitives";

interface EventRow {
  id: number;
  timestamp: string;
  severity: string;
  category: string;
  src_ip: string;
  src_country: string;
  mitre_id: string;
}
interface CaseRow {
  id: number;
  case_number: string;
  title: string;
  severity: string;
  status: string;
  event_count: number;
  sla_breached: boolean;
}
interface Run {
  id: number;
  agent_name?: string;
  agent_id: number;
  started_at: string;
  status: string;
  tokens_in: number;
  tokens_out: number;
}
interface Feed {
  id: number;
  name: string;
  kind: string;
  enabled: boolean;
  last_pull: string | null;
  last_count: number;
  last_error: string;
}
interface PlaybookRun {
  id: number;
  status: string;
  triggered_by: string;
  pending_approval_step: number | null;
  started_at: string;
}
interface Playbook { id: number; name: string }

export function StreamRecentEvents() {
  const { data, isLoading } = useSWR<EventRow[]>("/api/events?limit=12", fetcher, { refreshInterval: 8_000 });
  return (
    <WidgetShell title="Recent events" subtitle="live" loading={isLoading} empty={!data?.length}>
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {(data ?? []).map((e) => (
          <li key={e.id} className="px-3 py-1.5 hover:bg-row">
            <Link href={`/events`} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-[11px] tabular-nums w-14 text-muted">{e.timestamp?.slice(11, 19)}</span>
              <Sev s={e.severity} />
              <span className="font-mono uppercase text-[11px] w-24 truncate">{e.category}</span>
              <span className="font-mono tabular-nums text-[12px] flex-1 truncate">{e.src_ip}</span>
              <span className="font-mono text-[11px] w-8 text-muted">{e.src_country || "??"}</span>
              <span className="font-mono text-[10px] text-muted w-16 text-right">{e.mitre_id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function StreamOpenCases() {
  const { data, isLoading } = useSWR<CaseRow[]>("/api/cases?status=open", fetcher, { refreshInterval: 12_000 });
  const items = (data ?? []).slice(0, 8);
  return (
    <WidgetShell title="Open cases" subtitle="active investigations" loading={isLoading} empty={!items.length}>
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {items.map((c) => (
          <li key={c.id} className={"px-3 py-2 hover:bg-row " + (c.sla_breached ? "bg-row" : "")}>
            <Link href={`/cases/${c.id}`} className="block">
              <div className="flex items-center gap-2 text-sm">
                <Sev s={c.severity} />
                <span className="font-mono text-[11px] tabular-nums">{c.case_number}</span>
                {c.sla_breached && <Pill>SLA BREACHED</Pill>}
                <span className="ml-auto label-cap-muted tabular-nums">{c.event_count} ev</span>
              </div>
              <div className="text-[12px] truncate mt-0.5">{c.title}</div>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function StreamApprovalQueue() {
  const { data: playbooks } = useSWR<Playbook[]>("/api/playbooks", fetcher);
  const { data, mutate, isLoading } = useSWR<(PlaybookRun & { playbook_name: string })[]>(
    playbooks?.length ? `/_approval_${playbooks.map((p) => p.id).join(",")}` : null,
    async () => {
      const all: any[] = [];
      for (const p of playbooks ?? []) {
        const runs: PlaybookRun[] = await fetcher(`/api/playbooks/${p.id}/runs?limit=10`);
        for (const r of runs) if (r.status === "waiting_approval") all.push({ ...r, playbook_name: p.name });
      }
      return all;
    },
    { refreshInterval: 6_000 },
  );
  async function decide(runId: number, approved: boolean) {
    await post(`/api/playbooks/runs/${runId}/approve`, { approved });
    mutate();
  }
  return (
    <WidgetShell title="Approval queue" subtitle="pending playbook gates" loading={isLoading} empty={!data?.length} emptyText="No approvals pending.">
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {(data ?? []).map((r) => (
          <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="font-mono text-xs tabular-nums">run #{r.id} · {r.playbook_name}</div>
              <div className="label-cap-muted">step {(r.pending_approval_step ?? -1) + 1} · {r.triggered_by}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => decide(r.id, true)}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-ink text-paper px-2 py-1 text-[10px] uppercase tracking-wider">approve</button>
              <button onClick={() => decide(r.id, false)}
                onMouseDown={(e) => e.stopPropagation()}
                className="border border-ink px-2 py-1 text-[10px] uppercase tracking-wider">deny</button>
            </div>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function StreamAgentRuns() {
  const { data, isLoading } = useSWR<Run[]>("/api/agents/runs/all?limit=10", fetcher, { refreshInterval: 10_000 });
  return (
    <WidgetShell title="Agent activity" subtitle="autonomous runs" loading={isLoading} empty={!data?.length}>
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {(data ?? []).map((r) => (
          <li key={r.id} className="px-3 py-2 text-sm">
            <Link href="/agents/runs" className="block">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums">#{r.id}</span>
                <span className="font-mono text-[11px] w-20 truncate">{r.agent_name || "agent"}</span>
                <Pill>{r.status}</Pill>
                <span className="ml-auto label-cap-muted tabular-nums">{r.tokens_in}/{r.tokens_out} tok</span>
              </div>
              <div className="label-cap-muted tabular-nums">{r.started_at?.slice(11, 19)}</div>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

interface ReportRow { id: number; title: string; period: string; created_at: string }
export function StreamRecentReports() {
  const { data, isLoading } = useSWR<ReportRow[]>("/api/reports?limit=8", fetcher, { refreshInterval: 30_000 });
  return (
    <WidgetShell title="Recent reports" subtitle="AI-generated" loading={isLoading} empty={!data?.length}>
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {(data ?? []).map((r) => (
          <li key={r.id} className="px-3 py-2 hover:bg-row">
            <Link href="/reports" className="block text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] tabular-nums">#{r.id}</span>
                <Pill>{r.period}</Pill>
                <span className="label-cap-muted ml-auto tabular-nums">{r.created_at?.slice(11, 19)}</span>
              </div>
              <div className="text-[12px] truncate mt-0.5">{r.title}</div>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

interface AuditRow { id: number; timestamp: string; actor: string; action: string; target: string; meta: string }
export function StreamAudit() {
  const { data, isLoading } = useSWR<AuditRow[]>("/api/audit?limit=15", fetcher, { refreshInterval: 12_000 });
  return (
    <WidgetShell title="Audit log" subtitle="live actions" loading={isLoading} empty={!data?.length}>
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {(data ?? []).map((a) => (
          <li key={a.id} className="px-3 py-1.5 text-[12px] font-mono">
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-muted w-14">{a.timestamp?.slice(11, 19)}</span>
              <span className="truncate w-32">{a.actor}</span>
              <span className="truncate flex-1">{a.action} · {a.target}</span>
            </div>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function StreamTiFeeds() {
  const { data, isLoading } = useSWR<Feed[]>("/api/ti/feeds", fetcher, { refreshInterval: 30_000 });
  return (
    <WidgetShell title="TI feed health" subtitle="threat intel pulls" loading={isLoading} empty={!data?.length}>
      <ul className="divide-y hair overflow-y-auto h-full scrollbar-mono">
        {(data ?? []).map((f) => (
          <li key={f.id} className="px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">{f.name}</span>
              <Pill>{f.kind}</Pill>
              {f.enabled
                ? <span className="bg-ink text-paper px-1.5 py-0.5 text-[10px] uppercase">on</span>
                : <span className="border border-ink px-1.5 py-0.5 text-[10px] uppercase">off</span>}
            </div>
            <div className="label-cap-muted tabular-nums flex justify-between mt-0.5">
              <span>{f.last_pull ? f.last_pull.replace("T", " ").slice(0, 19) : "never"}</span>
              <span>{f.last_count.toLocaleString("en-US")} new</span>
            </div>
            {f.last_error && (
              <div className="text-[10px] font-mono mt-1 truncate">err: {f.last_error}</div>
            )}
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}
