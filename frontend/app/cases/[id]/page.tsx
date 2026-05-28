"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Badge from "@/components/Badge";
import { fetcher, post, patch, type Severity } from "@/lib/api";

interface CaseDetail {
  id: number;
  case_number: string;
  title: string;
  severity: Severity;
  status: string;
  category: string;
  assignee: string;
  summary: string;
  kill_chain: string[];
  event_count: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
}

interface TimelineRow {
  id: number;
  case_id: number;
  timestamp: string;
  kind: string;
  actor: string;
  body: string;
  ref_id: number | null;
  ref_kind: string;
}

interface CaseEventRow {
  id: number;
  timestamp: string;
  src_ip: string;
  src_country: string;
  severity: Severity;
  category: string;
  mitre_id: string;
  mitre_tactic: string;
  abuse_score: number;
  known_bad: boolean;
}

const STATUS_OPTIONS = ["open", "investigating", "contained", "closed"];
// Standard MITRE tactics order for the kill-chain visualization
const TACTICS_ORDER = [
  "reconnaissance",
  "resource-development",
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "defense-evasion",
  "credential-access",
  "discovery",
  "lateral-movement",
  "collection",
  "command-and-control",
  "exfiltration",
  "impact",
];

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: c, mutate: mc } = useSWR<CaseDetail>(`/api/cases/${id}`, fetcher, { refreshInterval: 10_000 });
  const { data: timeline, mutate: mt } = useSWR<TimelineRow[]>(`/api/cases/${id}/timeline`, fetcher, { refreshInterval: 10_000 });
  const { data: events } = useSWR<CaseEventRow[]>(`/api/cases/${id}/events`, fetcher, { refreshInterval: 15_000 });
  const [note, setNote] = useState("");

  if (!c) return <div className="p-6 label-cap-muted">Loading…</div>;

  async function setStatus(s: string) {
    await patch(`/api/cases/${id}/status`, { status: s });
    mc();
    mt();
  }
  async function postNote() {
    if (!note.trim()) return;
    await post(`/api/cases/${id}/notes`, { body: note });
    setNote("");
    mt();
  }

  return (
    <div>
      <Topbar title={`Case / ${c.case_number}`} />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Main column */}
        <div className="space-y-5">
          {/* Title + status bar */}
          <div className="border border-ink p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="label-cap-muted tabular-nums">{c.case_number} · {c.category}</div>
                <h1 className="font-mono text-2xl font-semibold mt-1">{c.title}</h1>
                {c.summary && <p className="text-sm text-muted mt-2 max-w-3xl">{c.summary}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge severity={c.severity} />
                <select
                  value={c.status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="border border-ink bg-paper px-2 py-1 text-xs uppercase tracking-wider"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* MITRE kill-chain visualization */}
          <div className="border border-ink p-5">
            <div className="label-cap-muted mb-3">MITRE kill-chain seen</div>
            <div className="flex gap-1 flex-wrap">
              {TACTICS_ORDER.map((t) => {
                const seen = c.kill_chain.includes(t);
                return (
                  <span key={t}
                    className={
                      "px-2 py-1 text-[10px] font-mono uppercase tracking-wider border " +
                      (seen ? "bg-ink text-paper border-ink" : "bg-paper text-muted border-hair")
                    }
                    title={t}
                  >
                    {t.replace("-", " ")}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Events attached */}
          <div className="border border-ink">
            <div className="px-4 py-2 border-b border-ink flex items-center justify-between">
              <div className="label-cap">Attached events · {events?.length ?? 0}</div>
              <Link href="/events" className="label-cap-muted underline">go to events</Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink">
                  <Th>Time</Th><Th>Sev</Th><Th>Cat</Th><Th>MITRE</Th><Th>Src IP</Th><Th>Country</Th><Th>Abuse</Th><Th>Bad?</Th>
                </tr>
              </thead>
              <tbody>
                {(events ?? []).map((e) => (
                  <tr key={e.id} className="border-b hair">
                    <Td className="tabular-nums">{e.timestamp?.slice(11, 19)}</Td>
                    <Td><Badge severity={e.severity} /></Td>
                    <Td>{e.category}</Td>
                    <Td className="tabular-nums">{e.mitre_id || "—"}</Td>
                    <Td className="tabular-nums">{e.src_ip}</Td>
                    <Td className="tabular-nums">{e.src_country || "??"}</Td>
                    <Td className="tabular-nums">{e.abuse_score}</Td>
                    <Td>{e.known_bad ? "✓" : "—"}</Td>
                  </tr>
                ))}
                {(events ?? []).length === 0 && (
                  <tr><td colSpan={8} className="p-4 text-center label-cap-muted">No events attached yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add note */}
          <div className="border border-ink p-4">
            <div className="label-cap mb-2">Add note</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What did you find / what did you do next…"
              className="w-full border border-ink bg-paper p-2 text-sm font-mono"
            />
            <div className="flex justify-end mt-2">
              <button onClick={postNote}
                className="bg-ink text-paper px-4 py-2 text-xs uppercase tracking-wider">
                Save note
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: timeline + meta */}
        <aside className="space-y-5">
          {/* Meta */}
          <div className="border border-ink p-4">
            <Row k="Severity" v={<Badge severity={c.severity} />} />
            <Row k="Status" v={<span className="uppercase">{c.status}</span>} />
            <Row k="Category" v={c.category} />
            <Row k="Assignee" v={c.assignee || "unassigned"} />
            <Row k="Events" v={String(c.event_count)} />
            <Row k="Created" v={c.created_at.replace("T", " ").slice(0, 19)} />
            <Row k="Updated" v={c.updated_at.replace("T", " ").slice(0, 19)} />
            <Row
              k="SLA"
              v={
                <span className={c.sla_breached ? "font-semibold" : ""}>
                  {c.sla_breached
                    ? "BREACHED"
                    : c.sla_due_at
                    ? c.sla_due_at.replace("T", " ").slice(0, 19)
                    : "—"}
                </span>
              }
            />
          </div>

          {/* Timeline */}
          <div className="border border-ink">
            <div className="px-3 py-2 border-b border-ink label-cap">Timeline · {timeline?.length ?? 0}</div>
            <ol className="p-3 space-y-3 max-h-[600px] overflow-y-auto scrollbar-mono">
              {(timeline ?? []).map((t) => (
                <li key={t.id} className="border-l-2 border-ink pl-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider">{t.kind}</span>
                    <span className="font-mono text-[10px] text-muted tabular-nums">
                      {t.timestamp.replace("T", " ").slice(11, 19)}
                    </span>
                  </div>
                  <div className="text-sm mt-1">{t.body}</div>
                  <div className="font-mono text-[10px] text-muted mt-1">{t.actor}</div>
                </li>
              ))}
              {(timeline ?? []).length === 0 && (
                <li className="label-cap-muted text-center py-4">Nothing yet.</li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="text-left px-3 py-2 label-cap whitespace-nowrap">{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <td className={"px-3 py-2 align-middle " + className}>{children}</td>
);
const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b hair last:border-0">
    <span className="label-cap-muted">{k}</span>
    <span className="text-sm">{v}</span>
  </div>
);
