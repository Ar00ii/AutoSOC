"use client";

import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import { delJSON, fetcher, postJSON } from "@/lib/auth";

interface SessionRow {
  id: number;
  jti: string;
  created_at: string;
  expires_at: string;
  revoked: number;
  ip: string;
  user_agent: string;
}

export default function SessionsPage() {
  const { data } = useSWR<SessionRow[]>("/api/auth/sessions", fetcher, { refreshInterval: 15_000 });

  async function revoke(id: number) {
    if (!confirm("Revoke this session?")) return;
    await delJSON(`/api/auth/sessions/${id}`);
    mutate("/api/auth/sessions");
  }

  async function revokeAll() {
    if (!confirm("Revoke all OTHER sessions? You will stay logged in on this device.")) return;
    await postJSON(`/api/auth/sessions/revoke_others`);
    mutate("/api/auth/sessions");
  }

  return (
    <div>
      <Topbar title="Account / Active sessions" />
      <div className="p-6 max-w-4xl space-y-4">
        <p className="text-sm text-muted">
          Each device that signed in holds a refresh token. Revoking a session forces that device to sign in again.
        </p>
        <button type="button" onClick={revokeAll} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">
          Revoke all other sessions
        </button>
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Created</Th><Th>Expires</Th><Th>IP</Th><Th>User-Agent</Th><Th>Status</Th><Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-b hair">
                  <Td className="tabular-nums">{s.created_at.replace("T", " ").slice(0, 19)}</Td>
                  <Td className="tabular-nums">{s.expires_at.replace("T", " ").slice(0, 19)}</Td>
                  <Td className="tabular-nums">{s.ip || "-"}</Td>
                  <Td className="text-muted max-w-[420px] truncate">{s.user_agent || "-"}</Td>
                  <Td className="uppercase">{s.revoked === 1 ? "revoked" : "active"}</Td>
                  <Td>
                    {s.revoked === 0 && (
                      <button type="button" onClick={() => revoke(s.id)} className="border border-ink px-2 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper">
                        Revoke
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={6} className="px-3 py-6 text-center label-cap-muted">No sessions yet.</td></tr>
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
