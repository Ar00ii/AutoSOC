"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";

const items = [
  {
    name: "MITRE ATT&CK",
    kind: "framework",
    desc: "Every event mapped to a Tactic/Technique. Top-N MITRE on the dashboard. Baked into agent prompts.",
    bullets: ["TA0001", "TA0005", "TA0040"],
  },
  {
    name: "AbuseIPDB",
    kind: "intel",
    desc: "Live IP reputation lookups with 6-hour cache. Heuristic fallback when the API key is absent.",
    bullets: ["abuse_score", "known_bad", "country + ISP"],
  },
  {
    name: "Claude · Anthropic",
    kind: "ai",
    desc: "Haiku 4.5 for scoring + NL search. Sonnet 4.6 for reports + agents. Tool-use loop with per-tool RBAC.",
    bullets: ["haiku-4-5", "sonnet-4-6", "tool-use"],
  },
  {
    name: "Slack · webhooks",
    kind: "notify",
    desc: "Slack-format webhook on critical events. SSRF-guarded outbound calls. Webhook agents can POST anywhere.",
    bullets: ["NOTIFY_WEBHOOK", "SOAR", "n8n / Tines"],
  },
  {
    name: "SSH · nginx · syslog",
    kind: "ingest",
    desc: "Built-in parsers for SSH auth and nginx access logs. Tail-agent CLI streams any log file to ingest.",
    bullets: ["tail_agent", "NDJSON", "IOC CSV"],
  },
  {
    name: "iptables · netsh",
    kind: "firewall",
    desc: "Real firewall hook on Linux and Windows. OFF by default — recommend-only is the safe path.",
    bullets: ["APPLY_FIREWALL", "DROP rules", "audit-logged"],
  },
];

export default function Integrations() {
  return (
    <section id="integrations" className="relative border-b border-ink bg-paper text-ink">
      <div className="border-b border-ink">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-baseline justify-between flex-wrap gap-4">
          <span className="label-cap tabular-nums">/ 03 ───────── INTEGRATIONS</span>
          <span className="label-cap-muted">plugs into your stack</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
        {/* Headline + intro side-by-side */}
        <div className="grid grid-cols-12 gap-6 mb-16">
          <div className="col-span-12 md:col-span-8">
            <Reveal>
              <h2 className="font-mono font-semibold tracking-tight text-3xl md:text-[64px] leading-[1.02]">
                Plugs into the
                <br />
                security stack
                <br />
                <span className="text-muted">you already own.</span>
              </h2>
            </Reveal>
          </div>
          <div className="col-span-12 md:col-span-4 self-end">
            <Reveal delay={0.2}>
              <div className="border-t border-ink pt-4 max-w-sm">
                <p className="text-muted text-sm leading-relaxed">
                  No connectors marketplace. No Zapier middlemen. Drop a file,
                  set an env var, restart.
                </p>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Horizontal grid — 3 cols × 2 rows */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink border border-ink">
          {items.map((it, i) => (
            <motion.div
              key={it.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.2, 0.7, 0.2, 1] }}
              className="bg-paper p-6 md:p-8 hover:bg-row transition-colors flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="label-cap-muted tabular-nums">
                  {String(i + 1).padStart(2, "0")} · {it.kind}
                </div>
                <span className="inline-block w-1.5 h-1.5 bg-ink animate-pulse" aria-hidden />
              </div>

              <h3 className="font-mono font-semibold text-xl md:text-2xl leading-tight">
                {it.name}
              </h3>

              <p className="text-muted leading-relaxed text-sm mt-3 mb-6 flex-1">
                {it.desc}
              </p>

              <ul className="flex flex-wrap gap-1.5 mt-auto">
                {it.bullets.map((b) => (
                  <li
                    key={b}
                    className="border border-ink px-2 py-1 text-[10px] font-mono uppercase tracking-wider"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-8 text-center label-cap-muted">
          {items.length} sources · zero glue code · ~120 LOC each
        </Reveal>
      </div>
    </section>
  );
}
