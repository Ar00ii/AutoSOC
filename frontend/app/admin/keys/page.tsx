"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { delJSON, fetcher, postJSON } from "@/lib/auth";

interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  role_id: number;
  created_at: string;
  last_used: string | null;
  revoked: number;
}
interface Role { id: number; name: string }

export default function KeysAdminPage() {
  const { data: keys } = useSWR<ApiKeyRow[]>("/api/keys", fetcher);
  const { data: roles } = useSWR<Role[]>("/api/roles", fetcher);
  const [draft, setDraft] = useState({ name: "", role_id: 0 });
  const [revealed, setRevealed] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await postJSON<ApiKeyRow & { key: string }>("/api/keys", {
      name: draft.name,
      role_id: Number(draft.role_id),
    });
    setRevealed(r.key);
    setDraft({ name: "", role_id: 0 });
    mutate("/api/keys");
  }

  async function revoke(k: ApiKeyRow) {
    if (!confirm(`Revoke key ${k.name}?`)) return;
    await delJSON(`/api/keys/${k.id}`);
    mutate("/api/keys");
  }

  return (
    <div>
      <Topbar title="Admin / API Keys" />
      <div className="p-6 space-y-6">
        <p className="text-sm text-muted">
          API keys let external automations (your SOAR, your scripts, n8n, Tines, Splunk forwarders) talk to AutoSoc.
          Send the key in the <code>X-API-Key</code> header. The key inherits the chosen role's permissions.
        </p>

        <form onSubmit={create} className="border border-ink p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Field label="Name"><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
          <Field label="Role">
            <select required value={draft.role_id} onChange={(e) => setDraft({ ...draft, role_id: Number(e.target.value) })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase">
              <option value={0}>—</option>
              {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <button type="submit" className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Generate key</button>
        </form>

        {revealed && (
          <div role="alert" className="border border-ink p-4 space-y-2">
            <div className="label-cap">New API key — copy now, this is the only time you'll see it</div>
            <pre className="bg-row p-3 text-sm tabular-nums whitespace-pre-wrap break-all">{revealed}</pre>
            <button type="button" onClick={() => setRevealed(null)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Dismiss</button>
          </div>
        )}

        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Name</Th><Th>Prefix</Th><Th>Role</Th><Th>Created</Th><Th>Last used</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((k) => {
                const role = (roles ?? []).find((r) => r.id === k.role_id);
                return (
                  <tr key={k.id} className="border-b hair hover:bg-row">
                    <Td>{k.name}</Td>
                    <Td className="tabular-nums">{k.key_prefix}…</Td>
                    <Td className="uppercase">{role?.name ?? "?"}</Td>
                    <Td className="tabular-nums">{k.created_at.replace("T", " ").slice(0, 16)}</Td>
                    <Td className="tabular-nums">{k.last_used ? k.last_used.replace("T", " ").slice(0, 16) : "-"}</Td>
                    <Td className="uppercase">{k.revoked === 1 ? "revoked" : "active"}</Td>
                    <Td>
                      {k.revoked !== 1 && (
                        <button type="button" onClick={() => revoke(k)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Revoke</button>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {(!keys || keys.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-6 text-center label-cap-muted">No API keys.</td></tr>
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
