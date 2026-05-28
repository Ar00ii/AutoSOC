"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./animations";

const Hero3D = dynamic(() => import("./Hero3D"), { ssr: false });

export default function Hero() {
  return (
    <section className="relative min-h-[100svh] border-b border-ink overflow-hidden">
      <Hero3D />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper/40 via-paper/0 to-paper" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 md:pt-40 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
          className="label-cap-muted mb-4 flex items-center gap-3"
        >
          <span className="inline-block w-6 h-px bg-ink" />
          <span>v0.6 / AI-assisted SOC</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.2, 0.7, 0.2, 1] }}
          className="font-mono font-semibold tracking-tight leading-[1.05] text-[44px] sm:text-[60px] md:text-[84px] max-w-5xl"
        >
          The SOC that
          <br />
          runs itself.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-6 max-w-2xl text-muted text-lg leading-relaxed"
        >
          AutoSoc is a SIEM-lite that ingests logs, scores threats with Claude, correlates
          them with MITRE ATT&amp;CK and AbuseIPDB, and lets autonomous agents triage,
          ticket and recommend blocks. All in one console.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/"
            className="inline-flex items-center h-12 px-6 bg-ink text-paper text-2xs uppercase tracking-wider"
          >
            Open the console
          </Link>
          <a
            href="#demo"
            className="inline-flex items-center h-12 px-6 border border-ink label-cap hover:bg-ink hover:text-paper transition-colors hover:[color:#fff]"
          >
            Watch 65s demo
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink max-w-3xl"
        >
          {[
            { n: 49, label: "Security tests", suffix: "" },
            { n: 14, label: "MITRE tactics", suffix: "" },
            { n: 6, label: "Agent tools", suffix: "" },
            { n: 100, label: "Monochrome", suffix: "%" },
          ].map((k) => (
            <div key={k.label} className="bg-paper px-4 py-3">
              <div className="font-mono font-semibold text-xl tabular-nums">
                <AnimatedNumber to={k.n} suffix={k.suffix} />
              </div>
              <div className="label-cap-muted mt-1">{k.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 label-cap-muted hidden md:flex items-center gap-2 z-10">
        <span className="inline-block w-px h-6 bg-ink animate-pulse" />
        <span>Scroll</span>
      </div>
    </section>
  );
}
