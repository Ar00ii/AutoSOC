"use client";

import { useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import { fetcher, postJSON } from "@/lib/auth";

interface EmailStatus {
  configured: boolean;
  host: string;
  from: string;
  recipients: string[];
  min_severity: string;
}

export default function SettingsPage() {
  const { data: notifyStatus } = useSWR<{ configured: boolean; url_safe: boolean; reason?: string }>("/api/notify/status", fetcher);
  const { data: emailStatus } = useSWR<EmailStatus>("/api/notify/email/status", fetcher);
  const [testMsg, setTestMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

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

  async function testEmail() {
    setEmailBusy(true); setEmailMsg(null);
    try {
      const r = await postJSON<{ sent: boolean }>("/api/notify/email/test", {
        title: "delivery check", text: "If you received this, SMTP alerts are working.", severity: "critical",
      });
      setEmailMsg({ kind: r.sent ? "ok" : "err", text: r.sent ? "Email sent to recipients" : "SMTP server rejected the message" });
    } catch (err) {
      setEmailMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setEmailBusy(false);
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
        <section className="border border-ink p-4 space-y-3">
          <div className="label-cap">Email alerts (IT / security team)</div>
          <p className="text-sm text-muted">
            Configure SMTP in <code>backend/.env</code> to email your IT/security staff automatically
            on high-severity and known-bad events:
            <code> SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,
            <code> SMTP_PASSWORD</code>, <code>SMTP_FROM</code>, <code>ALERT_EMAIL_TO</code>
            (comma-separated recipients), <code>ALERT_MIN_SEVERITY</code>.
          </p>
          <div className="text-xs label-cap-muted space-y-0.5">
            <div>Status: {emailStatus?.configured ? "configured" : "not configured"}</div>
            {emailStatus?.configured && (
              <>
                <div>From: {emailStatus.from || "—"} · Host: {emailStatus.host || "—"}</div>
                <div>Recipients: {emailStatus.recipients.length ? emailStatus.recipients.join(", ") : "none set (ALERT_EMAIL_TO)"}</div>
                <div>Alert threshold: {emailStatus.min_severity}+</div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={testEmail}
            disabled={emailBusy || !emailStatus?.configured || !emailStatus?.recipients.length}
            className="border border-ink px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {emailBusy ? "Sending..." : "Send test email"}
          </button>
          {emailMsg && <div role="alert" className="border border-ink p-2 text-xs uppercase tracking-wider">{emailMsg.text}</div>}
        </section>
        <section className="border border-ink p-4">
          <div className="label-cap mb-2">AI subscription</div>
          <p className="text-sm text-muted">
            AI features (event scoring, agents, AI reports, NL search) require an active subscription —
            we run the AI with our managed Claude key. Users subscribe at <code>/billing</code>.
            Admins can grant access manually via <code>POST /api/billing/grant</code>
            (<code>{`{user_id, status}`}</code>). Connect Stripe by setting <code>STRIPE_SECRET_KEY</code>,
            <code> STRIPE_PRICE_ID</code> and <code>STRIPE_WEBHOOK_SECRET</code>.
          </p>
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
