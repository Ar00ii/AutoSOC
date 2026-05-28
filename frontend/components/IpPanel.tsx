"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import Badge from "./Badge";
import type { IpInvestigation, Severity } from "@/lib/api";
import { fetcher, post } from "@/lib/api";

export default function IpPanel({
  ip,
  onClose,
}: {
  ip: string | null;
  onClose: () => void;
}) {
  const open = !!ip;
  const { data, isLoading } = useSWR<IpInvestigation>(
    open ? `/api/intel/ip/${ip}` : null,
    fetcher,
  );
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function createTicket() {
    if (!ip) return;
    await post(`/api/tickets`, {
      title: `Investigation: ${ip}`,
      description: data?.ai_summary ?? "",
      severity: "high",
      src_ip: ip,
    });
    alert("Ticket created.");
  }

  async function recommendBlock() {
    if (!ip) return;
    await post(`/api/recommendations/recompute?threshold=1`);
    alert("Recommendation engine re-run. Check the Recommendations page.");
  }

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={
          "fixed inset-0 bg-black/40 z-40 transition-opacity " +
          (open ? "opacity-100" : "opacity-0 pointer-events-none")
        }
      />
      <aside
        aria-label="IP investigation"
        aria-hidden={!open}
        className={
          "fixed top-0 right-0 h-screen w-full max-w-[560px] bg-paper border-l border-ink z-50 " +
          "transition-transform duration-200 ease-out overflow-y-auto scrollbar-mono " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <header className="h-12 border-b border-ink flex items-center justify-between px-4">
          <div className="text-sm uppercase tracking-wider font-semibold">
            IP investigation
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="border border-ink px-3 py-1.5 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
          >
            Close [esc]
          </button>
        </header>
        <div className="p-4 space-y-4">
          <div className="border border-ink p-3">
            <div className="label-cap-muted">Address</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{ip}</div>
            {data && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Cell label="Country" value={data.country || "-"} />
                <Cell label="City" value={data.city || "-"} />
                <Cell label="ISP" value={data.isp || "-"} />
                <Cell label="Usage" value={data.usage_type || "-"} />
                <Cell label="Abuse score" value={`${data.abuse_score}/100`} />
                <Cell label="Total reports" value={String(data.total_reports)} />
                <Cell label="Tor exit" value={data.is_tor ? "yes" : "no"} />
                <Cell label="Events" value={String(data.event_count)} />
              </div>
            )}
            {isLoading && <div className="label-cap-muted mt-2">Investigating...</div>}
          </div>

          <div className="border border-ink p-3">
            <div className="label-cap mb-2">AI summary</div>
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-3 bg-hair" />
                <div className="h-3 bg-hair w-3/4" />
                <div className="h-3 bg-hair w-1/2" />
              </div>
            ) : (
              <p className="text-sm leading-5 whitespace-pre-wrap">
                {data?.ai_summary || "No data."}
              </p>
            )}
          </div>

          {data && (
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-ink p-3">
                <div className="label-cap mb-2">Severity</div>
                <ul className="text-xs space-y-1">
                  {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                    <li key={s} className="flex justify-between">
                      <span className="flex items-center gap-2">
                        <Badge severity={s} />
                      </span>
                      <span className="tabular-nums">{data.severity_breakdown[s] ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-ink p-3">
                <div className="label-cap mb-2">Top categories</div>
                <ul className="text-xs space-y-1 tabular-nums">
                  {data.top_categories.map((c) => (
                    <li key={c.category} className="flex justify-between">
                      <span className="uppercase">{c.category}</span>
                      <span>{c.count}</span>
                    </li>
                  ))}
                  {data.top_categories.length === 0 && (
                    <li className="label-cap-muted">No data.</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={createTicket}
              className="flex-1 border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
            >
              Create ticket
            </button>
            <button
              type="button"
              onClick={recommendBlock}
              className="flex-1 border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
            >
              Recommend block
            </button>
          </div>
          {data && (data.first_seen || data.last_seen) && (
            <div className="border border-ink p-3 text-xs tabular-nums">
              <div className="label-cap-muted">Timeline</div>
              <div className="mt-1">First: {data.first_seen?.replace("T", " ").slice(0, 19)}</div>
              <div>Last: {data.last_seen?.replace("T", " ").slice(0, 19)}</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t hair pt-1 first:border-0 first:pt-0">
      <div className="label-cap-muted">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
