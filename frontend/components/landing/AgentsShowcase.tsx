"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";

const steps = [
  {
    n: "01",
    tool: "query_events",
    in: "severity=critical · hours=1",
    out: "12 events found · top IP 185.220.101.41",
    ms: "640ms",
  },
  {
    n: "02",
    tool: "ip_intel",
    in: "ip=185.220.101.41",
    out: "abuse_score=98 · known_bad · TOR exit · DE",
    ms: "320ms",
  },
  {
    n: "03",
    tool: "create_ticket",
    in: "title=Critical SSH brute · sev=critical",
    out: "ticket #4127 created · assigned to L2",
    ms: "180ms",
  },
  {
    n: "04",
    tool: "recommend_block",
    in: "ip=185.220.101.41 · ttl=24h",
    out: "recommendation queued · awaiting human approval",
    ms: "210ms",
  },
  {
    n: "05",
    tool: "notify",
    in: "channel=#soc-alerts",
    out: "Slack delivered · ts=1717000000.123",
    ms: "440ms",
  },
];

export default function AgentsShowcase() {
  return (
    <section id="agents" className="relative border-b border-ink bg-paper">
      {/* Editorial header */}
      <div className="border-b border-ink">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-baseline justify-between flex-wrap gap-4">
          <span className="label-cap tabular-nums">/ 04 ───────── AUTOMATION</span>
          <span className="label-cap-muted">agent run #248 — 4.2s end-to-end</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
        {/* Right-anchored headline (asymmetric to break the rhythm) */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8 md:gap-16 mb-16">
          <div className="md:col-start-2">
            <Reveal>
              <h2 className="font-mono font-semibold tracking-tight text-3xl md:text-[64px] leading-[0.98]">
                Agents that close
                <br />
                tickets <span className="text-muted">while you sleep.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.1} className="mt-6 max-w-2xl text-muted text-base leading-relaxed">
              Define an agent. Pick a trigger (scheduled · on_critical · webhook).
              Pick the tools. Constrain its model + max steps. Every decision
              audited with tokens, latency and rationale.
            </Reveal>
          </div>
        </div>

        {/* Full-width vertical timeline */}
        <div className="relative border-l-2 border-ink ml-2 md:ml-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: [0.2, 0.7, 0.2, 1] }}
              className="relative pl-8 md:pl-16 pb-10 md:pb-14 last:pb-0"
            >
              {/* Node dot */}
              <span className="absolute left-[-7px] top-0 inline-block w-3 h-3 bg-ink" aria-hidden />

              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-4 md:gap-8 items-baseline">
                <div>
                  <div className="font-mono font-semibold text-[64px] md:text-[88px] leading-none tabular-nums">
                    {s.n}
                  </div>
                  <div className="label-cap-muted mt-1">STEP</div>
                </div>

                <div>
                  <div className="font-mono font-semibold text-xl md:text-2xl uppercase tracking-tight">
                    {s.tool}
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-[60px_1fr] gap-x-4 gap-y-1 text-sm">
                    <span className="label-cap-muted">in</span>
                    <span className="font-mono">{s.in}</span>
                    <span className="label-cap-muted">out</span>
                    <span className="font-mono text-ink">{s.out}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums">{s.ms}</div>
                  <div className="label-cap-muted mt-1">latency</div>
                </div>
              </div>
            </motion.div>
          ))}

          {/* End marker */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: steps.length * 0.1, duration: 0.4 }}
            className="relative pl-8 md:pl-16"
          >
            <span className="absolute left-[-9px] top-0 inline-block w-5 h-5 bg-ink" aria-hidden />
            <div className="inline-block bg-ink text-paper px-4 py-3">
              <div className="label-cap text-paper">result</div>
              <div className="font-mono text-base mt-1">
                Incident contained. 1 ticket · 1 block recommended · 1 Slack delivered.
              </div>
            </div>
          </motion.div>
        </div>

        {/* Spec strip at the bottom */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink">
          {[
            ["Trigger", "scheduled · on_critical · webhook"],
            ["Toolbox", "6 tools · per-agent allow-list"],
            ["Audit", "tool calls · tokens · latency"],
            ["Limits", "max_steps · timeout · rate-limit"],
          ].map(([k, v]) => (
            <div key={k} className="bg-paper p-4">
              <div className="label-cap-muted">{k}</div>
              <div className="mt-2 font-mono text-sm">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
