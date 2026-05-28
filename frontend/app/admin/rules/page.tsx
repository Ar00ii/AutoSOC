"use client";

import useSWR from "swr";
import Topbar from "@/components/Topbar";
import { fetcher } from "@/lib/auth";

interface Rule {
  id: string;
  severity_escalation: string;
  window_minutes: number;
  description: string;
  category_match: string;
  threshold: number | null;
}

export default function RulesPage() {
  const { data } = useSWR<{ engine: string; rules: Rule[] }>("/api/correlate/rules", fetcher);
  return (
    <div>
      <Topbar title="Admin / Correlation rules" />
      <div className="p-6 max-w-5xl space-y-4">
        <p className="text-sm text-muted">
          The correlation engine watches a 15-minute window per source IP and escalates events when a rule matches.
          Rules are coded in <code>backend/app/correlate.py</code>; this view is read-only.
        </p>
        <div className="border border-ink overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Rule ID</Th><Th>Window</Th><Th>Match</Th><Th>Threshold</Th><Th>Escalates to</Th><Th>Description</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.rules ?? []).map((r) => (
                <tr key={r.id} className="border-b hair">
                  <Td className="tabular-nums">{r.id}</Td>
                  <Td className="tabular-nums">{r.window_minutes}m</Td>
                  <Td className="uppercase">{r.category_match}</Td>
                  <Td className="tabular-nums">{r.threshold ?? "—"}</Td>
                  <Td className="uppercase font-semibold">{r.severity_escalation}</Td>
                  <Td className="text-muted">{r.description}</Td>
                </tr>
              ))}
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
