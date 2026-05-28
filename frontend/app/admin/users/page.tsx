"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { delJSON, fetcher, patchJSON, postJSON } from "@/lib/auth";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role_id: number;
  team_id: number | null;
  active: number;
  created_at: string;
  last_login: string | null;
}
interface Role { id: number; name: string }
interface Team { id: number; name: string }

export default function UsersAdminPage() {
  const { data: users } = useSWR<UserRow[]>("/api/users", fetcher);
  const { data: roles } = useSWR<Role[]>("/api/roles", fetcher);
  const { data: teams } = useSWR<Team[]>("/api/teams", fetcher);
  const [draft, setDraft] = useState({ email: "", name: "", password: "", role_id: 0, team_id: 0 });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await postJSON("/api/users", {
      ...draft,
      role_id: Number(draft.role_id),
      team_id: draft.team_id ? Number(draft.team_id) : null,
      active: true,
    });
    setDraft({ email: "", name: "", password: "", role_id: 0, team_id: 0 });
    mutate("/api/users");
  }

  async function toggleActive(u: UserRow) {
    await patchJSON(`/api/users/${u.id}`, { active: u.active !== 1 });
    mutate("/api/users");
  }

  async function changeRole(u: UserRow, role_id: number) {
    await patchJSON(`/api/users/${u.id}`, { role_id });
    mutate("/api/users");
  }

  async function changeTeam(u: UserRow, team_id: number | null) {
    await patchJSON(`/api/users/${u.id}`, { team_id });
    mutate("/api/users");
  }

  async function remove(u: UserRow) {
    if (!confirm(`Delete ${u.email}?`)) return;
    await delJSON(`/api/users/${u.id}`);
    mutate("/api/users");
  }

  return (
    <div>
      <Topbar title="Admin / Users" />
      <div className="p-6 space-y-6">
        <form onSubmit={create} className="border border-ink p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Field label="Email"><input type="email" required value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
          <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
          <Field label="Password"><input type="password" required value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" /></Field>
          <Field label="Role">
            <select required value={draft.role_id} onChange={(e) => setDraft({ ...draft, role_id: Number(e.target.value) })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase">
              <option value={0}>—</option>
              {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Team">
            <select value={draft.team_id} onChange={(e) => setDraft({ ...draft, team_id: Number(e.target.value) })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]">
              <option value={0}>none</option>
              {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div className="col-span-2 md:col-span-5">
            <button type="submit" className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Create user</button>
          </div>
        </form>

        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Email</Th><Th>Name</Th><Th>Role</Th><Th>Team</Th><Th>Active</Th><Th>Created</Th><Th>Last login</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-b hair hover:bg-row">
                  <Td className="tabular-nums">{u.email}</Td>
                  <Td>{u.name || "-"}</Td>
                  <Td>
                    <select value={u.role_id} onChange={(e) => changeRole(u, Number(e.target.value))} className="border border-ink bg-paper px-2 py-1 text-xs uppercase">
                      {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </Td>
                  <Td>
                    <select value={u.team_id ?? 0} onChange={(e) => changeTeam(u, Number(e.target.value) || null)} className="border border-ink bg-paper px-2 py-1 text-xs">
                      <option value={0}>none</option>
                      {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Td>
                  <Td>
                    <button type="button" onClick={() => toggleActive(u)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">
                      {u.active === 1 ? "on" : "off"}
                    </button>
                  </Td>
                  <Td className="tabular-nums">{u.created_at.replace("T", " ").slice(0, 16)}</Td>
                  <Td className="tabular-nums">{u.last_login ? u.last_login.replace("T", " ").slice(0, 16) : "-"}</Td>
                  <Td>
                    <button type="button" onClick={() => remove(u)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Delete</button>
                  </Td>
                </tr>
              ))}
              {(!users || users.length === 0) && (
                <tr><td colSpan={8} className="px-3 py-6 text-center label-cap-muted">No users.</td></tr>
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
