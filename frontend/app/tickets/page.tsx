"use client";

import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import Badge from "@/components/Badge";
import type { Ticket } from "@/lib/api";
import { fetcher, patch } from "@/lib/api";

const STATUSES = ["open", "in_progress", "resolved"];

export default function TicketsPage() {
  const { data } = useSWR<Ticket[]>("/api/tickets", fetcher, { refreshInterval: 8_000 });

  async function setStatus(id: number, status: string) {
    await patch(`/api/tickets/${id}`, { status });
    mutate("/api/tickets");
  }

  return (
    <div>
      <Topbar title="Tickets / Incident queue" />
      <div className="p-6">
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>ID</Th><Th>Created</Th><Th>Sev</Th><Th>Title</Th><Th>Src IP</Th><Th>Status</Th><Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => (
                <tr key={t.id} className="border-b hair hover:bg-row">
                  <Td className="tabular-nums">#{t.id}</Td>
                  <Td className="tabular-nums">{t.created_at.replace("T", " ").slice(0, 19)}</Td>
                  <Td><Badge severity={t.severity} /></Td>
                  <Td>{t.title}</Td>
                  <Td className="tabular-nums">{t.src_ip || "-"}</Td>
                  <Td className="uppercase">{t.status}</Td>
                  <Td>
                    <select
                      value={t.status}
                      onChange={(e) => setStatus(t.id, e.target.value)}
                      className="border border-ink bg-paper px-2 py-1 text-xs uppercase tracking-wider"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </Td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-6 text-center label-cap-muted">No tickets.</td></tr>
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
