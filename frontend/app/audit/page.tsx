"use client";

import useSWR from "swr";
import Topbar from "@/components/Topbar";
import type { AuditRow } from "@/lib/api";
import { fetcher } from "@/lib/api";

export default function AuditPage() {
  const { data } = useSWR<AuditRow[]>("/api/audit", fetcher, { refreshInterval: 10_000 });
  return (
    <div>
      <Topbar title="Audit log / Operator actions" />
      <div className="p-6">
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Audit log of operator actions</caption>
            <thead>
              <tr className="border-b border-ink">
                <Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Meta</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id} className="border-b hair hover:bg-row">
                  <Td className="tabular-nums">{a.timestamp.replace("T", " ").slice(0, 19)}</Td>
                  <Td className="uppercase">{a.actor}</Td>
                  <Td className="uppercase">{a.action.replace(/_/g, " ")}</Td>
                  <Td className="tabular-nums">{a.target || "-"}</Td>
                  <Td className="text-muted max-w-[420px] truncate">{a.meta || "-"}</Td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={5} className="px-3 py-6 text-center label-cap-muted">No audit entries.</td></tr>
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
