"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import { postJSON } from "@/lib/auth";

export default function MigratePage() {
  const [source, setSource] = useState("nginx");
  const [ndjson, setNdjson] = useState('{"src_ip":"1.2.3.4","raw":"GET /","severity":"low","category":"anomaly"}');
  const [iocs, setIocs] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function bulk() {
    setBusy(true); setMsg(null);
    try {
      const events = ndjson.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const r = await postJSON<{ created: number; skipped: number }>("/api/migrate/bulk_ingest", { source, events });
      setMsg({ kind: "ok", text: `Created ${r.created} events. Skipped ${r.skipped}.` });
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message || "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function importIOCs() {
    setBusy(true); setMsg(null);
    try {
      const items = iocs.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const r = await postJSON<{ created: number; updated: number }>("/api/migrate/ioc_import", {
        items, severity: "high", reason: "ioc-import",
      });
      setMsg({ kind: "ok", text: `Created ${r.created} new blocks. Updated ${r.updated}.` });
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message || "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Topbar title="Admin / Migration" />
      <div className="p-6 max-w-4xl space-y-6">
        <p className="text-sm text-muted">
          Bring data from your existing SIEM/SOAR. Bulk-ingest events as NDJSON or import a list of malicious IPs as block recommendations.
        </p>

        <section className="border border-ink p-4 space-y-3">
          <div className="label">Bulk ingest events (NDJSON)</div>
          <div className="flex gap-2 items-end">
            <label className="flex flex-col gap-1">
              <span className="label-cap">Source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className="border border-ink bg-paper px-2 py-1.5 min-h-[32px] uppercase">
                {["ssh", "nginx", "postgres", "syslog", "auth", "windows", "custom"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <textarea
            value={ndjson}
            onChange={(e) => setNdjson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full border border-ink bg-paper p-3 font-mono text-sm"
            placeholder='{"src_ip":"1.2.3.4","raw":"...","severity":"high","category":"sqli"}'
          />
          <button type="button" disabled={busy} onClick={bulk} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50">
            {busy ? "Importing..." : "Import events"}
          </button>
        </section>

        <section className="border border-ink p-4 space-y-3">
          <div className="label">IOC import (one IP per line or comma-separated)</div>
          <textarea
            value={iocs}
            onChange={(e) => setIocs(e.target.value)}
            rows={6}
            spellCheck={false}
            className="w-full border border-ink bg-paper p-3 font-mono text-sm tabular-nums"
            placeholder={"185.220.101.42\n5.45.207.130\n45.227.253.51"}
          />
          <button type="button" disabled={busy} onClick={importIOCs} className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50">
            {busy ? "Importing..." : "Import IOCs"}
          </button>
        </section>

        {msg && <div role="alert" className="border border-ink p-3 text-sm uppercase tracking-wider">{msg.text}</div>}
      </div>
    </div>
  );
}
