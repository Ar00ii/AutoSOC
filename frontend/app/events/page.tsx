"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import EventTable from "@/components/EventTable";
import Topbar from "@/components/Topbar";
import SearchBar, { type ParsedFilters } from "@/components/SearchBar";
import IpPanel from "@/components/IpPanel";
import type { EventRow, SavedSearch } from "@/lib/api";
import { del, fetcher, post } from "@/lib/api";
import { getUser } from "@/lib/auth";

const SEVS = ["", "low", "medium", "high", "critical"] as const;
const SOURCES = ["", "ssh", "nginx", "postgres"] as const;

export default function EventsPage() {
  const [sev, setSev] = useState<string>("");
  const [src, setSrc] = useState<string>("");
  const [cat, setCat] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [ipFilter, setIpFilter] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [hours, setHours] = useState<number>(24);
  const [ip, setIp] = useState<string | null>(null);

  const qs = new URLSearchParams();
  qs.set("limit", "200");
  qs.set("hours", String(hours));
  if (sev) qs.set("severity", sev);
  if (src) qs.set("source", src);
  if (cat) qs.set("category", cat);
  if (country) qs.set("country", country);
  if (ipFilter) qs.set("ip", ipFilter);
  if (text) qs.set("q", text);

  const url = `/api/events?${qs.toString()}`;
  const { data } = useSWR<EventRow[]>(url, fetcher, { refreshInterval: 5_000 });
  const { data: saved } = useSWR<SavedSearch[]>("/api/saved", fetcher);

  function clearFilters() {
    setSev(""); setSrc(""); setCat(""); setCountry(""); setIpFilter(""); setText(""); setHours(24);
  }

  function applyParsed(p: ParsedFilters) {
    setSev(p.severity); setSrc(p.source); setCat(p.category);
    setCountry(p.country); setIpFilter(p.ip); setText(p.text);
    setHours(p.hours || 24);
  }

  async function saveCurrent() {
    const name = prompt("Save current filter as:");
    if (!name) return;
    await post(`/api/saved`, { name, query: qs.toString() });
    mutate("/api/saved");
  }

  function loadSaved(query: string) {
    const p = new URLSearchParams(query);
    setSev(p.get("severity") || ""); setSrc(p.get("source") || "");
    setCat(p.get("category") || ""); setCountry(p.get("country") || "");
    setIpFilter(p.get("ip") || ""); setText(p.get("q") || "");
    setHours(Number(p.get("hours") || "24"));
  }

  async function removeSaved(id: number) {
    await del(`/api/saved/${id}`);
    mutate("/api/saved");
  }

  const me = getUser();
  const { data: meRemote } = useSWR<{ team_filters?: Record<string, unknown> }>("/api/auth/me", fetcher);
  const teamFilters = (meRemote?.team_filters ?? {}) as Record<string, string[]>;
  const hasScope = me?.role !== "admin" && Object.keys(teamFilters).length > 0;

  return (
    <div>
      <Topbar title="Events / Live stream" />
      <div className="p-6 space-y-4">
        {hasScope && (
          <div className="border border-ink p-3 text-sm">
            <span className="label-cap mr-2">Team scope:</span>
            <span className="tabular-nums">{JSON.stringify(teamFilters)}</span>
            <span className="label-cap-muted ml-2">— you see events matching your team's filters only.</span>
          </div>
        )}
        <SearchBar onParsed={applyParsed} />
        <div className="border border-ink p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Select label="Severity" value={sev} onChange={setSev} options={SEVS} />
          <Select label="Source" value={src} onChange={setSrc} options={SOURCES} />
          <Input label="Category" value={cat} onChange={setCat} placeholder="any" />
          <Input label="Country" value={country} onChange={setCountry} placeholder="any" />
          <Input label="IP" value={ipFilter} onChange={setIpFilter} placeholder="any" />
          <Input label="Text" value={text} onChange={setText} placeholder="contains" />
          <Select
            label="Window"
            value={String(hours)}
            onChange={(v) => setHours(Number(v))}
            options={["1", "24", "168", "720"]}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={clearFilters}
            className="border border-ink px-3 py-1.5 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={saveCurrent}
            className="border border-ink px-3 py-1.5 min-h-[32px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
          >
            Save filter
          </button>
          <a
            href={`/api/export/events.csv?hours=${hours}`}
            className="border border-ink px-3 py-1.5 min-h-[32px] flex items-center text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
          >
            Export CSV
          </a>
          <div className="ml-auto label-cap-muted tabular-nums">
            Showing {data?.length ?? 0} rows
          </div>
        </div>
        {saved && saved.length > 0 && (
          <div className="border border-ink p-3 flex flex-wrap gap-2 items-center">
            <span className="label-cap mr-1">Saved:</span>
            {saved.map((s) => (
              <span key={s.id} className="border border-ink flex items-stretch">
                <button
                  type="button"
                  onClick={() => loadSaved(s.query)}
                  className="px-3 py-1 text-xs uppercase tracking-wider hover:bg-ink hover:text-paper min-h-[28px]"
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeSaved(s.id)}
                  aria-label={`Delete saved search ${s.name}`}
                  className="px-2 text-xs border-l border-ink hover:bg-ink hover:text-paper min-h-[28px]"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
        <EventTable rows={data ?? []} onIpClick={setIp} />
      </div>
      <IpPanel ip={ip} onClose={() => setIp(null)} />
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="label-cap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-ink bg-paper px-2 py-1.5 min-h-[32px] text-sm uppercase tracking-wider"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "all"}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="label-cap">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-ink bg-paper px-2 py-1.5 min-h-[32px] text-sm"
      />
    </label>
  );
}
