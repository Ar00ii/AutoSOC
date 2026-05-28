"use client";

import useSWR from "swr";
import { useState } from "react";
import Topbar from "@/components/Topbar";
import { fetcher, post } from "@/lib/api";

interface Feed {
  id: number;
  name: string;
  kind: string;
  url: string;
  api_key_env: string;
  refresh_minutes: number;
  enabled: boolean;
  last_pull: string | null;
  last_count: number;
  last_error: string;
}

interface IoC {
  id: number;
  feed_id: number;
  indicator: string;
  kind: string;
  threat_type: string;
  confidence: number;
  tags: string[];
  first_seen: string;
  last_seen: string;
  expires_at: string | null;
  source_ref: string;
  active: boolean;
}

interface Stats {
  total_active: number;
  by_kind: Record<string, number>;
  enabled_feeds: number;
}

const KINDS = ["", "ip", "domain", "url", "sha256", "md5", "sha1", "email"];

export default function TIPage() {
  const { data: feeds, mutate: mf } = useSWR<Feed[]>("/api/ti/feeds", fetcher, { refreshInterval: 15_000 });
  const { data: stats, mutate: ms } = useSWR<Stats>("/api/ti/stats", fetcher, { refreshInterval: 15_000 });
  const [kindFilter, setKindFilter] = useState("");
  const [query, setQuery] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);

  const iocQs = new URLSearchParams();
  if (kindFilter) iocQs.set("kind", kindFilter);
  if (query) iocQs.set("q", query);
  if (minConfidence) iocQs.set("min_confidence", String(minConfidence));
  iocQs.set("limit", "200");
  const { data: iocs } = useSWR<IoC[]>(`/api/ti/iocs?${iocQs.toString()}`, fetcher, { refreshInterval: 30_000 });

  async function pullFeed(id: number) {
    await post(`/api/ti/feeds/${id}/pull`, {});
    mf();
    ms();
  }
  async function pullAll() {
    await post("/api/ti/feeds/pull_all", {});
    mf();
    ms();
  }

  return (
    <div>
      <Topbar title="Threat intelligence / Feeds & IoCs" />
      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink">
          <Stat label="Active IoCs" value={stats?.total_active ?? 0} />
          <Stat label="Enabled feeds" value={stats?.enabled_feeds ?? 0} />
          <Stat label="URLs" value={stats?.by_kind?.url ?? 0} />
          <Stat label="IPs" value={stats?.by_kind?.ip ?? 0} />
        </div>

        {/* Feeds */}
        <div className="border border-ink">
          <div className="px-4 py-2 border-b border-ink flex items-center justify-between">
            <div className="label-cap">Feeds · {feeds?.length ?? 0}</div>
            <button onClick={pullAll}
              className="bg-ink text-paper px-3 py-1 text-xs uppercase tracking-wider">
              Pull all
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Name</Th><Th>Kind</Th><Th>Refresh</Th><Th>API key env</Th><Th>Enabled</Th>
                <Th>Last pull</Th><Th>Last count</Th><Th>Error</Th><Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {(feeds ?? []).map((f) => (
                <tr key={f.id} className="border-b hair">
                  <Td>{f.name}</Td>
                  <Td><span className="border border-ink px-2 py-0.5 text-[10px] uppercase tracking-wider">{f.kind}</span></Td>
                  <Td className="tabular-nums">{f.refresh_minutes}m</Td>
                  <Td className="font-mono text-[11px]">{f.api_key_env || "—"}</Td>
                  <Td>{f.enabled
                    ? <span className="bg-ink text-paper px-2 py-0.5 text-[10px] uppercase">on</span>
                    : <span className="border border-ink px-2 py-0.5 text-[10px] uppercase">off</span>}
                  </Td>
                  <Td className="tabular-nums label-cap-muted">{f.last_pull ? f.last_pull.replace("T", " ").slice(0, 19) : "never"}</Td>
                  <Td className="tabular-nums">{f.last_count.toLocaleString("en-US")}</Td>
                  <Td className="font-mono text-[11px] text-muted max-w-xs truncate" title={f.last_error}>{f.last_error || "—"}</Td>
                  <Td>
                    <button onClick={() => pullFeed(f.id)}
                      className="border border-ink px-2 py-1 text-[10px] uppercase tracking-wider">
                      Pull
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* IoC search */}
        <div className="border border-ink">
          <div className="px-4 py-2 border-b border-ink flex items-center justify-between flex-wrap gap-3">
            <div className="label-cap">IoCs · {iocs?.length ?? 0} shown</div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="search indicator…"
                className="border border-ink bg-paper px-2 py-1 text-sm font-mono"
              />
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
                className="border border-ink bg-paper px-2 py-1 text-xs uppercase tracking-wider">
                {KINDS.map((k) => <option key={k} value={k}>{k || "any kind"}</option>)}
              </select>
              <label className="label-cap-muted">min conf</label>
              <input type="number" min={0} max={100} value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="border border-ink bg-paper px-2 py-1 text-xs tabular-nums w-16" />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <Th>Indicator</Th><Th>Kind</Th><Th>Threat type</Th><Th>Conf</Th>
                <Th>Tags</Th><Th>Last seen</Th><Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {(iocs ?? []).map((i) => (
                <tr key={i.id} className="border-b hair">
                  <Td className="font-mono break-all max-w-md">{i.indicator}</Td>
                  <Td><span className="border border-ink px-2 py-0.5 text-[10px] uppercase">{i.kind}</span></Td>
                  <Td className="font-mono">{i.threat_type}</Td>
                  <Td className="tabular-nums">{i.confidence}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {i.tags.slice(0, 3).map((t) => (
                        <span key={t} className="border border-ink px-1.5 py-0.5 text-[10px] font-mono">{t}</span>
                      ))}
                    </div>
                  </Td>
                  <Td className="tabular-nums label-cap-muted">{i.last_seen?.replace("T", " ").slice(0, 19)}</Td>
                  <Td className="font-mono text-[11px] text-muted truncate max-w-[200px]" title={i.source_ref}>
                    {i.source_ref || "—"}
                  </Td>
                </tr>
              ))}
              {(iocs ?? []).length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center label-cap-muted">No IoCs match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="text-left px-3 py-2 label-cap whitespace-nowrap">{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = "", title }) => (
  <td className={"px-3 py-2 align-middle " + className} title={title}>{children}</td>
);
const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="bg-paper p-4">
    <div className="label-cap-muted">{label}</div>
    <div className="font-mono font-semibold text-2xl tabular-nums mt-1">{value.toLocaleString("en-US")}</div>
  </div>
);
