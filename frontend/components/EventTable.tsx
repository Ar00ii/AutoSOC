"use client";

import type { EventRow } from "@/lib/api";
import Badge from "./Badge";

export default function EventTable({
  rows,
  onIpClick,
}: {
  rows: EventRow[];
  onIpClick?: (ip: string) => void;
}) {
  return (
    <div className="border border-ink overflow-x-auto" role="region" aria-label="Events">
      <table className="w-full text-sm">
        <caption className="sr-only">Recent security events</caption>
        <thead>
          <tr className="border-b border-ink">
            <Th>Time</Th>
            <Th>Sev</Th>
            <Th>Source</Th>
            <Th>Category</Th>
            <Th>MITRE</Th>
            <Th>Src IP</Th>
            <Th>Country</Th>
            <Th>Abuse</Th>
            <Th>Status</Th>
            <Th>Detail</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-6 text-center label-cap-muted">
                No events match the current filters.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b hair hover:bg-row">
              <Td className="tabular-nums">{r.timestamp.replace("T", " ").slice(0, 19)}</Td>
              <Td><Badge severity={r.severity} /></Td>
              <Td className="uppercase">{r.source}</Td>
              <Td className="uppercase">{r.category}</Td>
              <Td className="tabular-nums">{r.mitre_id || "-"}</Td>
              <Td className="tabular-nums">
                {onIpClick ? (
                  <button
                    type="button"
                    onClick={() => onIpClick(r.src_ip)}
                    className="underline underline-offset-2 hover:bg-ink hover:text-paper px-1"
                  >
                    {r.src_ip}
                  </button>
                ) : (
                  r.src_ip
                )}
              </Td>
              <Td>{r.src_country || "-"}</Td>
              <Td className="tabular-nums">{r.abuse_score ?? 0}</Td>
              <Td className="uppercase">{r.status}</Td>
              <Td className="max-w-[420px] truncate text-muted">{r.summary || r.raw}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-left px-3 py-2 label-cap font-semibold whitespace-nowrap"
    >
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-2 " + className}>{children}</td>;
}
