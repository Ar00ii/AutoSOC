"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Reveal from "./Reveal";

export default function CTA() {
  return (
    <section className="relative border-b border-ink bg-paper overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <svg className="w-full h-full opacity-[0.05]" preserveAspectRatio="none">
          <defs>
            <pattern id="cta-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#000" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cta-grid)" />
        </svg>
      </div>

      {/* Editorial header */}
      <div className="border-b border-ink relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-baseline justify-between flex-wrap gap-4">
          <span className="label-cap tabular-nums">/ 06 ───────── BOOT</span>
          <span className="label-cap-muted">ready when you are</span>
        </div>
      </div>

      {/* Side-anchored: massive type left, CTA stack right */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 md:py-40">
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-12 lg:gap-16 items-end">
          {/* LEFT — huge type, left-aligned */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <h2 className="font-mono font-semibold tracking-tight leading-[0.92] text-[64px] sm:text-[96px] md:text-[140px] lg:text-[180px]">
              Boot
              <br />
              the <span className="text-muted">SOC.</span>
            </h2>
          </motion.div>

          {/* RIGHT — CTA stack */}
          <Reveal delay={0.2} className="lg:pl-8">
            <div className="border-t border-ink pt-8">
              <p className="text-muted text-base leading-relaxed max-w-sm">
                A SIEM you can read. A globe that doesn&apos;t lie. Agents that
                close tickets.
                <br />
                <span className="text-ink">Two clicks away.</span>
              </p>

              <div className="mt-10 flex flex-col gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center justify-between h-14 px-6 bg-ink text-paper text-2xs uppercase tracking-wider w-full"
                >
                  <span>Open the console</span>
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-between h-14 px-6 border border-ink label-cap hover:bg-ink hover:text-paper transition-colors hover:[color:#fff] w-full"
                >
                  <span>Sign in</span>
                  <span aria-hidden>↗</span>
                </Link>
              </div>

              <div className="mt-8 label-cap-muted">
                MIT licensed · docker compose up · ~120MB RSS idle
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
