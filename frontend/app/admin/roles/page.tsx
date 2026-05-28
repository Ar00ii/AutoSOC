"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { delJSON, fetcher, patchJSON, postJSON } from "@/lib/auth";

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: Record<string, string[]>;
  is_builtin: number;
}

export default function RolesAdminPage() {
  const { data: roles } = useSWR<Role[]>("/api/roles", fetcher);
  const { data: meta } = useSWR<{ resources: string[]; actions: string[] }>("/api/roles/_resources", fetcher);
  const [editing, setEditing] = useState<Role | null>(null);

  function openNew() {
    if (!meta) return;
    setEditing({
      id: 0,
      name: "",
      description: "",
      permissions: Object.fromEntries(meta.resources.map((r) => [r, []])),
      is_builtin: 0,
    });
  }

  async function save() {
    if (!editing) return;
    const payload = {
      name: editing.name,
      description: editing.description,
      permissions: editing.permissions,
    };
    if (editing.id) await patchJSON(`/api/roles/${editing.id}`, payload);
    else await postJSON("/api/roles", payload);
    setEditing(null);
    mutate("/api/roles");
  }

  async function remove(r: Role) {
    if (!confirm(`Delete role ${r.name}?`)) return;
    await delJSON(`/api/roles/${r.id}`);
    mutate("/api/roles");
  }

  function toggle(resource: string, action: string) {
    if (!editing) return;
    const current = editing.permissions[resource] || [];
    const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
    setEditing({ ...editing, permissions: { ...editing.permissions, [resource]: next } });
  }

  return (
    <div>
      <Topbar title="Admin / Roles" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Roles map users to allowed actions per resource. Built-in roles can be edited (permissions) but not renamed or deleted.</p>
          <button type="button" onClick={openNew} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">New role</button>
        </div>

        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Name</Th><Th>Description</Th><Th>Resources granted</Th><Th>Type</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(roles ?? []).map((r) => (
                <tr key={r.id} className="border-b hair hover:bg-row">
                  <Td className="uppercase tracking-wider font-semibold">{r.name}</Td>
                  <Td className="text-muted">{r.description}</Td>
                  <Td className="tabular-nums">{Object.entries(r.permissions || {}).filter(([, v]) => v.length > 0).length}</Td>
                  <Td className="uppercase">{r.is_builtin === 1 ? "built-in" : "custom"}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing(r)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Edit</button>
                      {r.is_builtin !== 1 && (
                        <button type="button" onClick={() => remove(r)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Delete</button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {(!roles || roles.length === 0) && (
                <tr><td colSpan={5} className="px-3 py-6 text-center label-cap-muted">No roles.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {editing && meta && (
          <div role="dialog" aria-label="Edit role" className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setEditing(null)}>
            <div className="bg-paper border border-ink max-w-3xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-wider font-semibold">{editing.id ? "Edit role" : "New role"}</div>
                <button type="button" onClick={() => setEditing(null)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">Close</button>
              </div>
              <Field label="Name">
                <input value={editing.name} disabled={editing.is_builtin === 1} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" />
              </Field>
              <Field label="Description">
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border border-ink bg-paper px-2 py-1.5 min-h-[32px]" />
              </Field>
              <div>
                <div className="label-cap mb-2">Permissions</div>
                <div className="border border-ink overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-ink">
                        <th scope="col" className="text-left px-3 py-2 label-cap">Resource</th>
                        {meta.actions.map((a) => (
                          <th key={a} scope="col" className="text-left px-3 py-2 label-cap">{a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {meta.resources.map((res) => {
                        const granted = editing.permissions[res] || [];
                        return (
                          <tr key={res} className="border-b hair">
                            <td className="px-3 py-1.5 uppercase tabular-nums">{res}</td>
                            {meta.actions.map((a) => (
                              <td key={a} className="px-3 py-1.5">
                                <label className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={granted.includes(a)}
                                    onChange={() => toggle(res, a)}
                                    className="accent-black"
                                  />
                                </label>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
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
