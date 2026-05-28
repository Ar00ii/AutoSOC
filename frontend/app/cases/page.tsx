"use client";

import useSWR from "swr";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Badge from "@/components/Badge";
import { fetcher, post } from "@/lib/api";
import { useState } from "react";

interface CaseRow {
  id: number;
  case_number: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  assignee: string;
  event_count: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  kill_chain: string[];
}

const STATUSES = ["", "open", "investigating", "contained", "closed"];
const SEVERITIES = ["", "low", "medium", "high", "critical"];

function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtSlaCountdown(iso: string | null, breached: boolean): string {
  if (!iso) return "—";
  if (breached) return "BREACHED";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "BREACHED";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function CasesPage() {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (severity) qs.set("severity", severity);
  const url = `/api/cases?${qs.toString()}`;
  const { data, mutate } = useSWR<CaseRow[]>(url, fetcher, { refreshInterval: 12_000 });

  async function quickCreate() {
    const title = prompt("Case title");
    if (!title) return;
    await post("/api/cases", { title, severity: "medium", category: "manual" });
    mutate();
  }

  const open = (data ?? []).filter((c) => c.status === "open").length;
  const investigating = (data ?? []).filter((c) => c.status === "investigating").length;
  const breached = (data ?? []).filter((c) => c.sla_breached).length;

  return (
    <div>
      <Topbar title="Cases / Active investigations" />
      <div className="p-6 space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink">
          <div className="bg-paper p-4">
            <div className="label-cap-muted">Open</div>
            <div className="font-mono font-semibold text-2xl tabular-nums mt-1">{open}</div>
          </div>
          <div className="bg-paper p-4">
            <div className="label-cap-muted">Investigating</div>
            <div className="font-mono font-semibold text-2xl tabular-nums mt-1">{investigating}</div>
          </div>
          <div className="bg-paper p-4">
            <div className="label-cap-muted">SLA breached</div>
            <div className="font-mono font-semibold text-2xl tabular-nums mt-1">{breached}</div>
          </div>
          <div className="bg-paper p-4">
            <div className="label-cap-muted">Total</div>
            <div className="font-mono font-semibold text-2xl tabular-nums mt-1">{data?.length ?? 0}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <label className="label-cap-muted">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="border border-ink bg-paper px-2 py-1 text-xs uppercase tracking-wider">
            {STATUSES.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
          </select>
          <label className="label-cap-muted">Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}
            className="border border-ink bg-paper px-2 py-1 text-xs uppercase tracking-wider">
            {SEVERITIES.map((s) => <option key={s} value={s}>{s || "any"}</option>)}
          </select>
          <span className="label-cap-muted ml-auto">{data?.length ?? 0} rows</span>
          <button onClick={quickCreate}
            className="bg-ink text-paper px-3 py-1.5 text-xs uppercase tracking-wider">
            + New case
          </button>
        </div>

        {/* Table */}
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Case #</Th><Th>Sev</Th><Th>Status</Th><Th>Title</Th>
                <Th>Kill-chain</Th><Th>Events</Th><Th>SLA</Th><Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c.id} className="border-b hair hover:bg-row">
                  <Td><Link href={`/cases/${c.id}`} className="underline tabular-nums">{c.case_number}</Link></Td>
                  <Td><Badge severity={c.severity} /></Td>
                  <Td className="uppercase">{c.status}</Td>
                  <Td>{c.title}</Td>
                  <Td>
                    <span className="font-mono text-[10px] tracking-wider uppercase">
                      {c.kill_chain.length ? c.kill_chain.join(" → ") : "—"}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{c.event_count}</Td>
                  <Td className={"tabular-nums " + (c.sla_breached ? "font-semibold" : "")}>
                    {fmtSlaCountdown(c.sla_due_at, c.sla_breached)}
                  </Td>
                  <Td className="tabular-nums label-cap-muted">{fmtTimeAgo(c.updated_at)}</Td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center label-cap-muted">No cases match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
