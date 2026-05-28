"use client";

import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import Badge from "@/components/Badge";
import type { IpBlock } from "@/lib/api";
import { del, fetcher, post } from "@/lib/api";

export default function RecsPage() {
  const { data } = useSWR<IpBlock[]>("/api/recommendations", fetcher, {
    refreshInterval: 10_000,
  });

  async function recompute() {
    await post(`/api/recommendations/recompute?threshold=3`);
    mutate("/api/recommendations");
  }
  async function apply(id: number) {
    await post(`/api/recommendations/${id}/apply`);
    mutate("/api/recommendations");
  }
  async function dismiss(id: number) {
    await del(`/api/recommendations/${id}`);
    mutate("/api/recommendations");
  }

  const pending = (data ?? []).filter((d) => d.applied === 0);

  return (
    <div>
      <Topbar title="Recommendations / Pending review" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between border border-ink p-3">
          <div className="label-cap-muted">
            Engine: heuristic + AI scoring. Applied blocks become inert recommendations until removed.
          </div>
          <button
            type="button"
            onClick={recompute}
            className="border border-ink px-3 py-2 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
          >
            Recompute
          </button>
        </div>
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>IP</Th><Th>Country</Th><Th>Sev</Th><Th>Reason</Th><Th>Hits</Th><Th>Seen</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map((b) => (
                <tr key={b.id} className="border-b hair hover:bg-row">
                  <Td className="tabular-nums">{b.ip}</Td>
                  <Td>{b.country || "-"}</Td>
                  <Td><Badge severity={b.severity} /></Td>
                  <Td className="uppercase">{b.reason}</Td>
                  <Td className="tabular-nums">{b.hit_count}</Td>
                  <Td className="tabular-nums">{b.recommended_at.replace("T", " ").slice(0, 19)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => apply(b.id)}
                        aria-label={`Block IP ${b.ip}`}
                        className="border border-ink px-3 py-1.5 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
                      >
                        Block
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss(b.id)}
                        aria-label={`Dismiss recommendation for ${b.ip}`}
                        className="border border-ink px-3 py-1.5 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
                      >
                        Dismiss
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center label-cap-muted">No pending recommendations.</td></tr>
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
