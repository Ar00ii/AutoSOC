"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { delJSON, fetcher, patchJSON, postJSON } from "@/lib/auth";

interface AgentRow {
  id: number;
  name: string;
  description: string;
  kind: string;
  trigger: string;
  schedule_cron?: string;
  model: string;
  system_prompt: string;
  user_prompt_template: string;
  webhook_url: string;
  allowed_tools: string[];
  max_steps: number;
  timeout_seconds: number;
  enabled: number;
  created_at: string;
  created_by: string;
}

interface ToolDef {
  name: string;
  description: string;
  permission: [string, string];
  input_schema: unknown;
}

const KINDS = ["claude", "webhook"];
const TRIGGERS = ["manual", "on_critical", "scheduled"];
const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-7"];

const EMPTY: AgentRow = {
  id: 0,
  name: "",
  description: "",
  kind: "claude",
  trigger: "manual",
  schedule_cron: "",
  model: "claude-sonnet-4-6",
  system_prompt: "",
  user_prompt_template: "",
  webhook_url: "",
  allowed_tools: [],
  max_steps: 6,
  timeout_seconds: 60,
  enabled: 1,
  created_at: "",
  created_by: "",
};

export default function AgentsPage() {
  const { data: agents } = useSWR<AgentRow[]>("/api/agents", fetcher);
  const { data: tools } = useSWR<ToolDef[]>("/api/agents/_tools", fetcher);
  const [editing, setEditing] = useState<AgentRow | null>(null);

  async function save() {
    if (!editing) return;
    const payload = { ...editing, enabled: editing.enabled === 1 };
    if (editing.id) await patchJSON(`/api/agents/${editing.id}`, payload);
    else await postJSON("/api/agents", payload);
    setEditing(null);
    mutate("/api/agents");
  }

  async function remove(a: AgentRow) {
    if (!confirm(`Delete agent ${a.name}?`)) return;
    await delJSON(`/api/agents/${a.id}`);
    mutate("/api/agents");
  }

  function toggleTool(tool: string) {
    if (!editing) return;
    const next = editing.allowed_tools.includes(tool)
      ? editing.allowed_tools.filter((t) => t !== tool)
      : [...editing.allowed_tools, tool];
    setEditing({ ...editing, allowed_tools: next });
  }

  return (
    <div>
      <Topbar title="AI Agents" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted max-w-3xl">
            Agents are reusable AI workers. Each agent has a system prompt, a model, a set of allowed tools (from the AutoSoc toolbox), and a trigger.
            Claude agents use tool-use to call AutoSoc primitives (query events, fetch intel, create tickets, recommend blocks, notify).
            Webhook agents POST inputs to your external automation (n8n / Tines / SOAR).
          </p>
          <button type="button" onClick={() => setEditing({ ...EMPTY })} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">New agent</button>
        </div>

        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Name</Th><Th>Kind</Th><Th>Trigger</Th><Th>Model</Th><Th>Tools</Th><Th>Enabled</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(agents ?? []).map((a) => (
                <tr key={a.id} className="border-b hair hover:bg-row">
                  <Td>
                    <Link href={`/agents/${a.id}`} className="underline underline-offset-2">{a.name}</Link>
                    <div className="text-xs text-muted mt-1 line-clamp-2 max-w-[280px]">{a.description}</div>
                  </Td>
                  <Td className="uppercase">{a.kind}</Td>
                  <Td className="uppercase">{a.trigger}</Td>
                  <Td className="tabular-nums text-xs">{a.kind === "claude" ? a.model : "-"}</Td>
                  <Td className="tabular-nums">{a.allowed_tools.length}</Td>
                  <Td className="uppercase">{a.enabled === 1 ? "yes" : "no"}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Link href={`/agents/${a.id}`} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Open</Link>
                      <button type="button" onClick={() => setEditing(a)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Edit</button>
                      <button type="button" onClick={() => remove(a)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Delete</button>
                    </div>
                  </Td>
                </tr>
              ))}
              {(!agents || agents.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-6 text-center label-cap-muted">No agents.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {editing && (
          <div role="dialog" aria-label="Edit agent" className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setEditing(null)}>
            <div className="bg-paper border border-ink max-w-2xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-wider font-semibold">{editing.id ? "Edit agent" : "New agent"}</div>
                <button type="button" onClick={() => setEditing(null)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Close</button>
              </div>
              <Field label="Name"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
              <Field label="Description"><input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Kind">
                  <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase">
                    {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </Field>
                <Field label="Trigger">
                  <select value={editing.trigger} onChange={(e) => setEditing({ ...editing, trigger: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase">
                    {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Enabled">
                  <select value={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: Number(e.target.value) })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase">
                    <option value={1}>yes</option>
                    <option value={0}>no</option>
                  </select>
                </Field>
              </div>
              {editing.trigger === "scheduled" && (
                <Field label="Cron schedule (e.g. '0 */1 * * *' = top of each hour; empty = every 15 min)">
                  <input value={editing.schedule_cron || ""} onChange={(e) => setEditing({ ...editing, schedule_cron: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] font-mono text-sm tabular-nums" placeholder="*/15 * * * *" />
                </Field>
              )}
              {editing.kind === "claude" && (
                <>
                  <Field label="Model">
                    <select value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] tabular-nums text-xs">
                      {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="System prompt">
                    <textarea value={editing.system_prompt} onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })} rows={4} className="w-full border border-ink bg-paper px-2 py-1.5 font-mono text-sm" />
                  </Field>
                  <Field label="User prompt template (supports {placeholders})">
                    <textarea value={editing.user_prompt_template} onChange={(e) => setEditing({ ...editing, user_prompt_template: e.target.value })} rows={3} className="w-full border border-ink bg-paper px-2 py-1.5 font-mono text-sm" />
                  </Field>
                  <div>
                    <div className="label-cap mb-2">Allowed tools</div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                      {(tools ?? []).map((t) => (
                        <li key={t.name} className="border border-hair p-2">
                          <label className="flex items-start gap-2">
                            <input type="checkbox" checked={editing.allowed_tools.includes(t.name)} onChange={() => toggleTool(t.name)} className="mt-1 accent-black" />
                            <span>
                              <span className="block font-semibold uppercase tracking-wider">{t.name}</span>
                              <span className="block text-muted">{t.description}</span>
                              <span className="block label-cap-muted">requires {t.permission[0]}.{t.permission[1]}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Max steps"><input type="number" value={editing.max_steps} onChange={(e) => setEditing({ ...editing, max_steps: Number(e.target.value) })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] tabular-nums" /></Field>
                    <Field label="Timeout (s)"><input type="number" value={editing.timeout_seconds} onChange={(e) => setEditing({ ...editing, timeout_seconds: Number(e.target.value) })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] tabular-nums" /></Field>
                  </div>
                </>
              )}
              {editing.kind === "webhook" && (
                <Field label="Webhook URL">
                  <input value={editing.webhook_url} onChange={(e) => setEditing({ ...editing, webhook_url: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] tabular-nums" placeholder="https://your-soar.example.com/hooks/abc" />
                </Field>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Cancel</button>
                <button type="button" onClick={save} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-cap">{label}</span>
      {children}
    </label>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="text-left px-3 py-2 label-cap font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-2 " + className}>{children}</td>;
}
