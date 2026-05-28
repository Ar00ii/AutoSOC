"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { fetcher, postJSON } from "@/lib/auth";

interface AgentRow {
  id: number;
  name: string;
  description: string;
  kind: string;
  trigger: string;
  model: string;
  system_prompt: string;
  user_prompt_template: string;
  allowed_tools: string[];
  enabled: number;
}

interface AgentRun {
  id: number;
  agent_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  triggered_by: string;
  input: string;
  output: string;
  steps: string;
  error: string;
  tokens_in: number;
  tokens_out: number;
}

interface Step {
  step: number;
  stop_reason: string;
  text: string;
  tool_uses: { id: string; name: string; input: unknown }[];
  tool_results: { name: string; result: unknown }[];
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: agent } = useSWR<AgentRow>(`/api/agents`, fetcher, {
    fallbackData: undefined,
  });
  const agentObj = (agent as unknown as AgentRow[] | undefined)?.find((a) => a.id === Number(id));
  const { data: runs } = useSWR<AgentRun[]>(`/api/agents/${id}/runs`, fetcher, {
    refreshInterval: 10_000,
  });
  const [inputJSON, setInputJSON] = useState(`{\n  "ip": "1.2.3.4"\n}`);
  const [busy, setBusy] = useState(false);
  const [openRun, setOpenRun] = useState<AgentRun | null>(null);

  async function runAgent() {
    let parsed: unknown = {};
    try { parsed = JSON.parse(inputJSON || "{}"); } catch { alert("Invalid JSON"); return; }
    setBusy(true);
    try {
      const r = await postJSON<AgentRun>(`/api/agents/${id}/run`, { input: parsed });
      setOpenRun(r);
      mutate(`/api/agents/${id}/runs`);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Topbar title={`Agent / ${agentObj?.name ?? id}`} />
      <div className="p-6 space-y-6">
        <Link href="/agents" className="label-cap underline">← Back to agents</Link>

        {agentObj && (
          <section className="border border-ink p-4 space-y-2">
            <div className="text-sm font-semibold uppercase tracking-wider">{agentObj.name}</div>
            <p className="text-sm text-muted">{agentObj.description}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs label-cap-muted mt-2">
              <div>Kind: <span className="text-ink uppercase">{agentObj.kind}</span></div>
              <div>Trigger: <span className="text-ink uppercase">{agentObj.trigger}</span></div>
              <div>Model: <span className="text-ink tabular-nums">{agentObj.model || "-"}</span></div>
              <div>Tools: <span className="text-ink tabular-nums">{agentObj.allowed_tools.length}</span></div>
            </div>
          </section>
        )}

        <section className="border border-ink p-4 space-y-3">
          <div className="label-cap">Run agent</div>
          <label className="block">
            <span className="label-cap-muted">Input JSON (matches your user_prompt_template placeholders)</span>
            <textarea value={inputJSON} onChange={(e) => setInputJSON(e.target.value)} rows={5} className="w-full mt-1 border border-ink bg-paper px-2 py-1.5 font-mono text-sm tabular-nums" />
          </label>
          <button type="button" disabled={busy} onClick={runAgent} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50">
            {busy ? "Running..." : "Run"}
          </button>
        </section>

        <section className="space-y-3">
          <div className="label-cap">Run history</div>
          <div className="border border-ink overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink">
                  <Th>#</Th><Th>Started</Th><Th>Duration</Th><Th>Status</Th><Th>Triggered by</Th><Th>Tokens</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => {
                  const dur = r.finished_at
                    ? `${Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s`
                    : "...";
                  return (
                    <tr key={r.id} className="border-b hair hover:bg-row">
                      <Td className="tabular-nums">#{r.id}</Td>
                      <Td className="tabular-nums">{r.started_at.replace("T", " ").slice(0, 19)}</Td>
                      <Td className="tabular-nums">{dur}</Td>
                      <Td className="uppercase">{r.status}</Td>
                      <Td className="tabular-nums text-xs">{r.triggered_by}</Td>
                      <Td className="tabular-nums">{r.tokens_in}/{r.tokens_out}</Td>
                      <Td>
                        <button type="button" onClick={() => setOpenRun(r)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">View</button>
                      </Td>
                    </tr>
                  );
                })}
                {(!runs || runs.length === 0) && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center label-cap-muted">No runs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {openRun && (
        <div role="dialog" aria-label="Run detail" className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setOpenRun(null)}>
          <div className="bg-paper border border-ink max-w-3xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm uppercase tracking-wider font-semibold">Run #{openRun.id} · {openRun.status}</div>
              <button type="button" onClick={() => setOpenRun(null)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Close</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs label-cap-muted">
              <div>Started: <span className="text-ink tabular-nums">{openRun.started_at.replace("T", " ").slice(0, 19)}</span></div>
              <div>Finished: <span className="text-ink tabular-nums">{openRun.finished_at?.replace("T", " ").slice(0, 19) ?? "-"}</span></div>
              <div>Tokens in/out: <span className="text-ink tabular-nums">{openRun.tokens_in}/{openRun.tokens_out}</span></div>
              <div>Trigger: <span className="text-ink">{openRun.triggered_by}</span></div>
            </div>
            <div>
              <div className="label-cap mb-1">Input</div>
              <pre className="border border-hair bg-row p-3 text-xs whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{openRun.input}</pre>
            </div>
            <div>
              <div className="label-cap mb-1">Output</div>
              <pre className="border border-hair bg-row p-3 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{openRun.output || "(no output)"}</pre>
            </div>
            {openRun.error && (
              <div>
                <div className="label-cap mb-1">Error</div>
                <pre className="border border-ink bg-row p-3 text-xs whitespace-pre-wrap">{openRun.error}</pre>
              </div>
            )}
            <div>
              <div className="label-cap mb-1">Steps</div>
              <StepsView raw={openRun.steps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepsView({ raw }: { raw: string }) {
  let steps: Step[] = [];
  try { steps = JSON.parse(raw || "[]"); } catch { return <div className="label-cap-muted">Invalid steps JSON</div>; }
  if (steps.length === 0) return <div className="label-cap-muted">No steps recorded.</div>;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="border border-hair p-3 text-xs space-y-2">
          <div className="flex justify-between label-cap-muted">
            <span>Step {s.step}</span>
            <span className="uppercase">{s.stop_reason}</span>
          </div>
          {s.text && <pre className="whitespace-pre-wrap text-sm leading-5">{s.text}</pre>}
          {s.tool_uses?.length > 0 && (
            <div className="space-y-1">
              <div className="label-cap">Tool calls</div>
              {s.tool_uses.map((tu, j) => (
                <div key={j} className="border-l-2 border-ink pl-2">
                  <div className="uppercase tracking-wider">{tu.name}</div>
                  <pre className="tabular-nums whitespace-pre-wrap">{JSON.stringify(tu.input, null, 2)}</pre>
                  {s.tool_results?.[j] && (
                    <pre className="tabular-nums whitespace-pre-wrap text-muted">{JSON.stringify(s.tool_results[j].result, null, 2).slice(0, 500)}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th scope="col" className="text-left px-3 py-2 label-cap font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-2 " + className}>{children}</td>;
}
