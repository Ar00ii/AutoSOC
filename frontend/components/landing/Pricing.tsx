"use client";

import Reveal from "./Reveal";
import Link from "next/link";
import { motion } from "framer-motion";
import { DrawUnderline, Spotlight } from "./animations";

const tiers = [
  {
    name: "Self-host",
    price: "$0",
    period: "Forever",
    desc: "Run the full stack on your own box. Docker Compose, SQLite, nginx. No telemetry.",
    bullets: ["Unlimited events", "All v0.6 features", "Bring your own keys", "Community support"],
    cta: "Get the repo",
    href: "/",
    invert: false,
    offset: 0,
  },
  {
    name: "Team",
    price: "$49",
    period: "per analyst / month",
    desc: "Hosted with managed updates, OIDC SSO, daily backups, 99.5% SLA. For SOCs of 3–25 people.",
    bullets: ["Hosted EU/US", "OIDC + MFA", "Daily backups", "Email support 24h"],
    cta: "Start 14-day trial",
    href: "/login",
    invert: true,
    offset: -40,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "Annual",
    desc: "Single tenant, on-prem option, dedicated Claude budget, SAML, custom integrations, named engineer.",
    bullets: ["Single tenant", "SAML SSO", "Custom retention", "Named engineer"],
    cta: "Talk to sales",
    href: "mailto:hello@autosoc.dev",
    invert: false,
    offset: 24,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="relative border-b border-ink bg-paper overflow-hidden">
      {/* Editorial header */}
      <div className="border-b border-ink">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-baseline justify-between flex-wrap gap-4">
          <span className="label-cap tabular-nums">/ 05 ───────── PRICING</span>
          <span className="label-cap-muted">per seat — not per event</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
        {/* Title left-aligned, big */}
        <Reveal className="mb-20 max-w-3xl">
          <h2 className="font-mono font-semibold tracking-tight text-3xl md:text-[72px] leading-[0.95]">
            Honest pricing.
            <br />
            <span className="text-muted">No per-event tax.</span>
          </h2>
          <p className="text-muted mt-6 max-w-xl text-base leading-relaxed">
            We charge per analyst, like the rest of the world charges per seat.
            Self-hosting is free and always will be.
          </p>
        </Reveal>

        {/* Offset cards — each one shifted vertically by a different amount */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px lg:gap-6 items-start">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: t.offset }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
              className={
                "border border-ink p-8 flex flex-col relative overflow-hidden group " +
                (t.invert ? "bg-ink text-paper z-10 shadow-[8px_8px_0_0_#000]" : "bg-paper text-ink hover:bg-row transition-colors")
              }
            >
              {!t.invert && <Spotlight />}
              {/* Index label rotated on the side */}
              <div
                className={
                  "absolute -left-3 top-6 -translate-x-full label-cap tabular-nums hidden lg:block " +
                  (t.invert ? "text-paper" : "text-muted")
                }
              >
                {String(i + 1).padStart(2, "0")} ─
              </div>

              <div className={"label-cap " + (t.invert ? "opacity-70" : "label-cap-muted")}>
                {t.name}
              </div>

              <div className="mt-8 flex items-baseline gap-2">
                <span className="font-mono font-semibold text-[64px] leading-none tabular-nums inline-block">
                  {t.price}
                  <DrawUnderline
                    delay={0.4 + i * 0.08}
                    className={"h-[3px] mt-1 " + (t.invert ? "bg-paper" : "bg-ink")}
                  />
                </span>
                <span className={"text-xs uppercase tracking-wider " + (t.invert ? "opacity-70" : "text-muted")}>
                  {t.period}
                </span>
              </div>

              <p className={"mt-6 leading-relaxed text-sm " + (t.invert ? "opacity-80" : "text-muted")}>
                {t.desc}
              </p>

              <ul className="mt-8 space-y-3 flex-1 border-t pt-6" style={{ borderColor: t.invert ? "rgba(255,255,255,0.25)" : "#e5e5e5" }}>
                {t.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider"
                  >
                    <span
                      className={
                        "inline-block w-4 h-px " + (t.invert ? "bg-paper opacity-70" : "bg-ink")
                      }
                    />
                    {b}
                  </li>
                ))}
              </ul>

              <Link
                href={t.href}
                className={
                  "mt-8 inline-flex items-center justify-center h-12 text-2xs uppercase tracking-wider " +
                  (t.invert
                    ? "bg-paper text-ink"
                    : "bg-ink text-paper hover:bg-[#1a1a1a] transition-colors")
                }
              >
                {t.cta} →
              </Link>
            </motion.div>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-24 text-center label-cap-muted">
          All tiers include MITRE, AbuseIPDB, agents, MFA, RBAC and the 3D globe.
        </Reveal>
      </div>
    </section>
  );
}
