"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { delJSON, fetcher, patchJSON, postJSON } from "@/lib/auth";

interface Team {
  id: number;
  name: string;
  description: string;
  event_filters: Record<string, unknown>;
}

export default function TeamsAdminPage() {
  const { data: teams } = useSWR<Team[]>("/api/teams", fetcher);
  const [draft, setDraft] = useState({ name: "", description: "", filters: "{}" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    let filters = {};
    try { filters = JSON.parse(draft.filters || "{}"); } catch { alert("Invalid JSON for filters"); return; }
    await postJSON("/api/teams", { name: draft.name, description: draft.description, event_filters: filters });
    setDraft({ name: "", description: "", filters: "{}" });
    mutate("/api/teams");
  }

  async function remove(t: Team) {
    if (!confirm(`Delete team ${t.name}?`)) return;
    await delJSON(`/api/teams/${t.id}`);
    mutate("/api/teams");
  }

  async function saveRow(t: Team, key: string, value: string) {
    let filters = t.event_filters;
    if (key === "filters") {
      try { filters = JSON.parse(value || "{}"); } catch { alert("Invalid JSON"); return; }
    }
    await patchJSON(`/api/teams/${t.id}`, {
      name: key === "name" ? value : t.name,
      description: key === "description" ? value : t.description,
      event_filters: filters,
    });
    mutate("/api/teams");
  }

  return (
    <div>
      <Topbar title="Admin / Teams" />
      <div className="p-6 space-y-6">
        <p className="text-sm text-muted">
          Teams group users. <code>event_filters</code> is an optional JSON of arrays like
          <code> {`{"source": ["nginx"], "category": ["sqli"]}`}</code> to limit which events team members see (applied as union on top of role permissions).
        </p>
        <form onSubmit={create} className="border border-ink p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field label="Name"><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
          <Field label="Description"><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
          <Field label="Event filters (JSON)"><input value={draft.filters} onChange={(e) => setDraft({ ...draft, filters: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] tabular-nums" /></Field>
          <button type="submit" className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Create</button>
        </form>
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Name</Th><Th>Description</Th><Th>Filters</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(teams ?? []).map((t) => (
                <tr key={t.id} className="border-b hair">
                  <Td>
                    <input defaultValue={t.name} onBlur={(e) => saveRow(t, "name", e.target.value)} className="border border-hair bg-paper px-2 py-1 min-h-[28px] w-full" />
                  </Td>
                  <Td>
                    <input defaultValue={t.description} onBlur={(e) => saveRow(t, "description", e.target.value)} className="border border-hair bg-paper px-2 py-1 min-h-[28px] w-full" />
                  </Td>
                  <Td>
                    <input defaultValue={JSON.stringify(t.event_filters)} onBlur={(e) => saveRow(t, "filters", e.target.value)} className="border border-hair bg-paper px-2 py-1 min-h-[28px] w-full tabular-nums" />
                  </Td>
                  <Td>
                    <button type="button" onClick={() => remove(t)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Delete</button>
                  </Td>
                </tr>
              ))}
              {(!teams || teams.length === 0) && (
                <tr><td colSpan={4} className="px-3 py-6 text-center label-cap-muted">No teams.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
