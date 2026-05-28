"use client";

import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import Badge from "@/components/Badge";
import type { IpBlock } from "@/lib/api";
import { fetcher } from "@/lib/api";

export default function BlocksPage() {
  const { data } = useSWR<IpBlock[]>("/api/recommendations", fetcher, {
    refreshInterval: 10_000,
  });
  const applied = (data ?? []).filter((d) => d.applied === 1);

  return (
    <div>
      <Topbar title="IP Blocks / Applied" />
      <div className="p-6">
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>IP</Th><Th>Country</Th><Th>Sev</Th><Th>Reason</Th><Th>Hits</Th><Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {applied.map((b) => (
                <tr key={b.id} className="border-b hair hover:bg-row">
                  <Td className="tabular-nums">{b.ip}</Td>
                  <Td>{b.country || "-"}</Td>
                  <Td><Badge severity={b.severity} /></Td>
                  <Td className="uppercase">{b.reason}</Td>
                  <Td className="tabular-nums">{b.hit_count}</Td>
                  <Td className="tabular-nums">{b.recommended_at.replace("T", " ").slice(0, 19)}</Td>
                </tr>
              ))}
              {applied.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center label-cap-muted">No IPs blocked yet. Apply from Recommendations.</td></tr>
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
