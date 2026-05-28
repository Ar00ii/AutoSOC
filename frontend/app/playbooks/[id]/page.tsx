"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { fetcher, patch } from "@/lib/api";

interface Playbook {
  id: number;
  name: string;
  description: string;
  trigger_kind: string;
  trigger_filter: Record<string, string[]>;
  yaml_body: string;
  require_approval: boolean;
  enabled: boolean;
}

interface RunRow {
  id: number;
  status: string;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  steps: Array<{ id: string; tool: string; status: string; ms: number; error?: string; output?: any }>;
  error: string;
  pending_approval_step: number | null;
}

const TRIGGERS = ["manual", "on_event", "on_case", "scheduled"];

export default function PlaybookDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: pb, mutate } = useSWR<Playbook>(`/api/playbooks/${id}`, fetcher);
  const { data: runs, mutate: mr } = useSWR<RunRow[]>(`/api/playbooks/${id}/runs?limit=20`, fetcher, { refreshInterval: 8_000 });

  const [yaml, setYaml] = useState("");
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [enabled, setEnabled] = useState(true);
  const [approval, setApproval] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!pb) return;
    setName(pb.name);
    setDescription(pb.description);
    setTrigger(pb.trigger_kind);
    setEnabled(pb.enabled);
    setApproval(pb.require_approval);
    setYaml(pb.yaml_body);
    setFilter(JSON.stringify(pb.trigger_filter || {}, null, 2));
  }, [pb]);

  if (!pb) return <div className="p-6 label-cap-muted">Loading…</div>;

  async function save() {
    setErr(null);
    let parsedFilter: any;
    try {
      parsedFilter = filter.trim() ? JSON.parse(filter) : {};
    } catch (e) {
      setErr("trigger filter is not valid JSON");
      return;
    }
    const r = await fetch(`/api/playbooks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, description, trigger_kind: trigger,
        trigger_filter: parsedFilter, yaml_body: yaml,
        require_approval: approval, enabled,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      setErr(t);
      return;
    }
    setSavedAt(new Date().toISOString());
    mutate();
  }

  async function runNow() {
    await fetch(`/api/playbooks/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    mr();
  }

  return (
    <div>
      <Topbar title={`Playbook / ${pb.name}`} />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-6">
        {/* Editor */}
        <div className="space-y-4">
          <div className="border border-ink p-4 space-y-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border border-ink bg-paper px-2 py-1 text-sm font-mono" />
            </Field>
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-ink bg-paper px-2 py-1 text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Trigger">
                <select value={trigger} onChange={(e) => setTrigger(e.target.value)}
                  className="w-full border border-ink bg-paper px-2 py-1 text-sm uppercase tracking-wider">
                  {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Toggles">
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> enabled
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} /> approval
                  </label>
                </div>
              </Field>
            </div>
            <Field label="Trigger filter (JSON)">
              <textarea value={filter} onChange={(e) => setFilter(e.target.value)} rows={4}
                className="w-full border border-ink bg-paper px-2 py-1 text-xs font-mono" />
            </Field>
          </div>

          <div className="border border-ink">
            <div className="px-3 py-2 border-b border-ink flex items-center justify-between">
              <div className="label-cap">Playbook YAML</div>
              <div className="label-cap-muted tabular-nums">{yaml.split("\n").length} lines</div>
            </div>
            <textarea value={yaml} onChange={(e) => setYaml(e.target.value)} rows={22}
              spellCheck={false}
              className="w-full bg-paper px-3 py-3 text-[13px] font-mono leading-snug" />
          </div>

          {err && <div className="border border-ink p-3 bg-row font-mono text-xs">{err}</div>}

          <div className="flex items-center gap-3">
            <button onClick={save} className="bg-ink text-paper px-4 py-2 text-xs uppercase tracking-wider">
              Save
            </button>
            <button onClick={runNow} className="border border-ink px-4 py-2 text-xs uppercase tracking-wider">
              Run now
            </button>
            {savedAt && <span className="label-cap-muted tabular-nums">saved {savedAt.slice(11, 19)}</span>}
          </div>
        </div>

        {/* Recent runs */}
        <aside className="border border-ink">
          <div className="px-3 py-2 border-b border-ink label-cap">Recent runs · {runs?.length ?? 0}</div>
          <div className="p-3 space-y-3 max-h-[820px] overflow-y-auto scrollbar-mono">
            {(runs ?? []).map((r) => (
              <div key={r.id} className="border border-ink p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">run #{r.id}</span>
                  <span className={"font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 " +
                    (r.status === "completed" ? "bg-ink text-paper" :
                     r.status === "failed" ? "border border-ink" :
                     r.status === "waiting_approval" ? "border border-ink bg-row" :
                     "border border-ink")
                  }>{r.status}</span>
                </div>
                <div className="label-cap-muted mt-1 tabular-nums">
                  {r.triggered_by} · {r.started_at.replace("T", " ").slice(11, 19)}
                </div>
                <ol className="mt-2 space-y-1">
                  {r.steps.map((s, i) => (
                    <li key={i} className="text-[11px] font-mono flex items-center justify-between gap-2">
                      <span>
                        <span className={s.status === "ok" ? "" : "text-muted"}>
                          {s.status === "ok" ? "✓" : "×"}
                        </span>
                        {" "}{s.id} → {s.tool}
                      </span>
                      <span className="text-muted tabular-nums">{s.ms}ms</span>
                    </li>
                  ))}
                </ol>
                {r.error && <div className="text-[11px] font-mono mt-2">err: {r.error}</div>}
              </div>
            ))}
            {(runs ?? []).length === 0 && (
              <div className="label-cap-muted text-center py-6">No runs yet.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="label-cap-muted mb-1">{label}</div>
    {children}
  </div>
);
