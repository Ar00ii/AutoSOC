"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import { fetcher } from "@/lib/auth";

interface RunRow {
  id: number;
  agent_id: number;
  agent_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  triggered_by: string;
  tokens_in: number;
  tokens_out: number;
}

const TRIGGERS = ["", "manual", "scheduler", "on_critical"];
const STATUSES = ["", "running", "completed", "error"];

export default function AgentRunsPage() {
  const [trig, setTrig] = useState("");
  const [stat, setStat] = useState("");
  const qs = new URLSearchParams({ limit: "200" });
  if (trig) qs.set("triggered_by", trig);
  if (stat) qs.set("status", stat);
  const { data } = useSWR<RunRow[]>(`/api/agents/runs/all?${qs}`, fetcher, { refreshInterval: 10_000 });

  return (
    <div>
      <Topbar title="AI Agents / All runs" />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 border border-ink p-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="label-cap">Trigger</span>
            <select value={trig} onChange={(e) => setTrig(e.target.value)} className="border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase text-sm">
              {TRIGGERS.map((t) => <option key={t} value={t}>{t || "all"}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="label-cap">Status</span>
            <select value={stat} onChange={(e) => setStat(e.target.value)} className="border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase text-sm">
              {STATUSES.map((s) => <option key={s} value={s}>{s || "all"}</option>)}
            </select>
          </label>
          <div className="ml-auto label-cap-muted tabular-nums">Showing {data?.length ?? 0}</div>
        </div>
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>#</Th><Th>Started</Th><Th>Agent</Th><Th>Trigger</Th><Th>Status</Th><Th>Tokens</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id} className="border-b hair hover:bg-row">
                  <Td className="tabular-nums">#{r.id}</Td>
                  <Td className="tabular-nums">{r.started_at.replace("T", " ").slice(0, 19)}</Td>
                  <Td>{r.agent_name}</Td>
                  <Td className="uppercase tracking-wider text-xs">{r.triggered_by}</Td>
                  <Td className="uppercase">{r.status}</Td>
                  <Td className="tabular-nums">{r.tokens_in}/{r.tokens_out}</Td>
                  <Td><Link href={`/agents/${r.agent_id}`} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Open agent</Link></Td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-6 text-center label-cap-muted">No runs match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="text-left px-3 py-2 label-cap font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-2 " + className}>{children}</td>;
}
