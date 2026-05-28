"use client";

import useSWR from "swr";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { fetcher } from "@/lib/api";

interface Playbook {
  id: number;
  name: string;
  description: string;
  trigger_kind: string;
  trigger_filter: Record<string, string[]>;
  yaml_body: string;
  require_approval: boolean;
  enabled: boolean;
  created_at: string;
  created_by: string;
}

interface PendingRun {
  id: number;
  playbook_id: number;
  status: string;
  triggered_by: string;
  pending_approval_step: number | null;
  started_at: string;
}

export default function PlaybooksPage() {
  const { data: playbooks } = useSWR<Playbook[]>("/api/playbooks", fetcher, { refreshInterval: 15_000 });

  return (
    <div>
      <Topbar title="Playbooks / Incident response flows" />
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted max-w-2xl">
            Playbooks are YAML-defined sequences of tool calls. They fire automatically when an
            event matches their trigger filter, pause at approval gates, and write every step
            to the case timeline.
          </p>
          <Link
            href="/playbooks/new"
            className="bg-ink text-paper px-3 py-1.5 text-xs uppercase tracking-wider"
          >
            + New playbook
          </Link>
        </div>

        <ApprovalQueue />

        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Name</Th><Th>Trigger</Th><Th>Filter</Th><Th>Approval</Th><Th>Enabled</Th><Th>Created by</Th>
              </tr>
            </thead>
            <tbody>
              {(playbooks ?? []).map((p) => (
                <tr key={p.id} className="border-b hair hover:bg-row">
                  <Td>
                    <Link href={`/playbooks/${p.id}`} className="underline">{p.name}</Link>
                    <div className="label-cap-muted mt-0.5 text-[10px]">{p.description}</div>
                  </Td>
                  <Td><span className="border border-ink px-2 py-0.5 text-[10px] uppercase tracking-wider">{p.trigger_kind}</span></Td>
                  <Td>
                    <div className="font-mono text-[11px] text-muted">
                      {Object.entries(p.trigger_filter || {}).map(([k, v]) => (
                        <div key={k}>{k}: {(v as string[]).join(", ")}</div>
                      ))}
                    </div>
                  </Td>
                  <Td>{p.require_approval ? "required" : "auto"}</Td>
                  <Td>{p.enabled ? <span className="bg-ink text-paper px-2 py-0.5 text-[10px] uppercase">on</span> : <span className="border border-ink px-2 py-0.5 text-[10px] uppercase">off</span>}</Td>
                  <Td className="label-cap-muted">{p.created_by}</Td>
                </tr>
              ))}
              {(playbooks ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center label-cap-muted">No playbooks defined.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ApprovalQueue() {
  // Pull recent runs across all playbooks and surface anything waiting_approval.
  const { data: playbooks } = useSWR<Playbook[]>("/api/playbooks", fetcher);
  const allRunsKey = (playbooks ?? []).map((p) => p.id).join(",");
  const { data, mutate } = useSWR<PendingRun[]>(
    allRunsKey ? `/_pending/${allRunsKey}` : null,
    async () => {
      const all: PendingRun[] = [];
      for (const p of playbooks ?? []) {
        const runs = await fetcher(`/api/playbooks/${p.id}/runs?limit=10`);
        for (const r of runs) if (r.status === "waiting_approval") all.push(r);
      }
      return all;
    },
    { refreshInterval: 6_000 },
  );

  async function decide(runId: number, approved: boolean) {
    await fetch(`/api/playbooks/runs/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    mutate();
  }

  if (!data?.length) return null;
  return (
    <div className="border-2 border-ink p-4 bg-row">
      <div className="label-cap mb-2">Approval queue · {data.length} pending</div>
      <div className="space-y-2">
        {data.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="font-mono">
              run #{r.id} · step {(r.pending_approval_step ?? -1) + 1} · triggered by {r.triggered_by}
            </div>
            <div className="flex gap-2">
              <button onClick={() => decide(r.id, true)}
                className="bg-ink text-paper px-3 py-1 text-xs uppercase tracking-wider">
                Approve
              </button>
              <button onClick={() => decide(r.id, false)}
                className="border border-ink px-3 py-1 text-xs uppercase tracking-wider">
                Deny
              </button>
            </div>
          </div>
        ))}
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
