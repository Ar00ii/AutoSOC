"use client";

import { useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import { fetcher, postJSON } from "@/lib/auth";

export default function SettingsPage() {
  const { data: notifyStatus } = useSWR<{ configured: boolean; url_safe: boolean; reason?: string }>("/api/notify/status", fetcher);
  const [testMsg, setTestMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function testWebhook() {
    setBusy(true); setTestMsg(null);
    try {
      const r = await postJSON<{ sent: boolean }>("/api/notify/test", {
        title: "AutoSoc test", text: "Webhook reached successfully", severity: "medium",
      });
      setTestMsg({ kind: r.sent ? "ok" : "err", text: r.sent ? "Webhook accepted (200)" : "Webhook rejected by destination" });
    } catch (err) {
      setTestMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Topbar title="Settings" />
      <div className="p-6 space-y-4">
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Detection</div>
          <p className="text-sm text-muted">
            Heuristic classifier always on. Set <code>?use_ai=true</code> on the ingest endpoint
            (or pass <code>--use-ai</code> in the tail agent) to score via Claude Haiku.
            Correlation rules live in <code>backend/rules.yaml</code> (engine
            in <code>app/correlate.py</code>).
          </p>
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">AI provider</div>
          <p className="text-sm text-muted">
            Set <code>ANTHROPIC_API_KEY</code> in <code>backend/.env</code> to enable Claude scoring,
            AI reports, IP investigation summaries, and natural-language search.
            Without a key the system uses heuristic fallbacks.
          </p>
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Threat intel</div>
          <p className="text-sm text-muted">
            Set <code>ABUSEIPDB_API_KEY</code> to enrich incoming IPs with AbuseIPDB reputation, ISP,
            Tor flag, and report count. Cache TTL is 6 hours.
          </p>
        </section>
        <section className="border border-ink p-4 space-y-3">
          <div className="label-cap">Notifications</div>
          <p className="text-sm text-muted">
            Set <code>NOTIFY_WEBHOOK</code> to a Slack-compatible incoming webhook URL.
            Critical events are pushed automatically.
          </p>
          <div className="text-xs label-cap-muted">
            Status: {notifyStatus?.configured ? (notifyStatus.url_safe ? "configured · ok" : `configured · rejected (${notifyStatus.reason})`) : "not configured"}
          </div>
          <button
            type="button"
            onClick={testWebhook}
            disabled={busy || !notifyStatus?.configured || !notifyStatus.url_safe}
            className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {busy ? "Sending..." : "Test webhook"}
          </button>
          {testMsg && <div role="alert" className="border border-ink p-2 text-xs uppercase tracking-wider">{testMsg.text}</div>}
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Live ingestion</div>
          <p className="text-sm text-muted">
            Tail any log file with the agent:<br />
            <code>python tail_agent.py --file /var/log/auth.log --source ssh</code>
            <br />The agent extracts source IPs and POSTs each line to <code>/api/events/ingest</code>.
            The 3D globe updates in real time via SSE.
          </p>
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Bloqueo de IP</div>
          <p className="text-sm text-muted">
            Default: recommendation only. Set <code>APPLY_FIREWALL=true</code> in
            <code> backend/.env</code> to execute real <code>iptables</code> (Linux) or
            <code> netsh advfirewall</code> (Windows) commands when an operator approves a block.
            Every action is recorded in the audit log.
          </p>
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Destination</div>
          <p className="text-sm text-muted">
            <code>DST_LAT</code>, <code>DST_LNG</code>, <code>DST_LABEL</code> control where arcs land on the globe.
          </p>
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">Keyboard shortcuts</div>
          <p className="text-sm text-muted">
            Press <code>?</code> any time for the full list. <code>g</code> followed by 1-8 navigates between sections. <code>Esc</code> closes panels and dialogs.
          </p>
        </section>
      </div>
    </div>
  );
}
