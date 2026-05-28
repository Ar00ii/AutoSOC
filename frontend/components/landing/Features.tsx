"use client";

import Reveal, { StaggerGrid, StaggerItem } from "./Reveal";
import { Spotlight } from "./animations";

type Feature = {
  code: string;
  title: string;
  desc: string;
  span: string;
  align?: "tl" | "tr" | "bl" | "br";
};

const features: Feature[] = [
  {
    code: "01",
    title: "3D threat map",
    desc: "Real-time globe, severity-weighted dashes, country choropleth. SSE arcs without polling.",
    span: "md:col-span-3 md:row-span-2",
    align: "bl",
  },
  {
    code: "02",
    title: "AI severity",
    desc: "Claude Haiku 4.5 scores every event in 80ms. Rule-based fallback when offline.",
    span: "md:col-span-2 md:row-span-1",
  },
  {
    code: "03",
    title: "Correlation",
    desc: "ssh brute → recon → exploit → repeated crit. Auto-escalates severity.",
    span: "md:col-span-2 md:row-span-1",
  },
  {
    code: "04",
    title: "NL search",
    desc: "Type 'critical sqli from China last hour'. Claude translates to filters.",
    span: "md:col-span-3 md:row-span-1",
  },
  {
    code: "05",
    title: "Live SSE",
    desc: "No polling. Scoped per principal so team filters apply live.",
    span: "md:col-span-2 md:row-span-1",
  },
  {
    code: "06",
    title: "Audit-grade RBAC",
    desc: "5 roles · per-resource perms · team-scoped event filters · OIDC SSO · TOTP MFA · refresh-token rotation.",
    span: "md:col-span-5 md:row-span-1",
    align: "tl",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative border-b border-ink bg-paper">
      {/* Editorial section header */}
      <div className="border-b border-ink">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-baseline justify-between flex-wrap gap-4">
          <span className="label-cap tabular-nums">/ 01 ───────── CAPABILITIES</span>
          <span className="label-cap-muted">six things, one screen</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-10 pb-16 md:pt-12 md:pb-20">
        <Reveal className="mb-8">
          <h2 className="font-mono font-semibold tracking-tight text-3xl md:text-[56px] leading-[1] max-w-4xl">
            Everything a tier-1
            <br />
            analyst needs.
            <span className="text-muted"> One screen.</span>
          </h2>
        </Reveal>

        {/* Bento: 5-col × 3-row asymmetric grid */}
        <StaggerGrid className="grid grid-cols-1 md:grid-cols-5 md:grid-rows-3 gap-px bg-ink border border-ink">
          {features.map((f) => (
            <StaggerItem
              key={f.code}
              className={
                "bg-paper p-6 md:p-8 relative hover:bg-row transition-all duration-300 flex flex-col group overflow-hidden " +
                f.span +
                (f.align === "bl" ? " min-h-[320px] justify-end" : "") +
                (f.align === "tl" ? " min-h-[160px]" : "")
              }
            >
              <Spotlight />
              <div className="label-cap-muted tabular-nums">{f.code}</div>
              <h3 className="font-mono font-semibold text-xl md:text-2xl mt-3 mb-2 group-hover:translate-x-1 transition-transform duration-300">
                {f.title}
              </h3>
              <p className="text-muted leading-relaxed text-sm md:text-base max-w-md">{f.desc}</p>

              {/* Corner tick marks per card */}
              <span className="absolute top-2 right-2 inline-block w-2 h-2 border-t border-r border-ink group-hover:w-3 group-hover:h-3 transition-all duration-300" aria-hidden />
              <span className="absolute bottom-2 left-2 inline-block w-2 h-2 border-b border-l border-ink group-hover:w-3 group-hover:h-3 transition-all duration-300" aria-hidden />
            </StaggerItem>
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}
