"use client";

import { useEffect, useRef } from "react";
import Reveal from "./Reveal";

export default function VideoDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <section id="demo" className="relative border-b border-ink bg-paper">
      {/* Editorial header */}
      <div className="border-b border-ink">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-baseline justify-between flex-wrap gap-4">
          <span className="label-cap tabular-nums">/ 02 ───────── LIVE DEMO</span>
          <span className="label-cap-muted">65 seconds, no narration</span>
        </div>
      </div>

      {/* Split: sticky text col left + full-bleed video right */}
      <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] min-h-[80vh]">
        {/* Left: sticky narrative — borders right only */}
        <div className="border-b md:border-b-0 md:border-r border-ink">
          <div className="md:sticky md:top-14 p-6 md:p-10 md:h-[calc(100vh-56px)] flex flex-col">
            <Reveal>
              <h2 className="font-mono font-semibold tracking-tight text-3xl md:text-[44px] leading-[1.02]">
                See it run
                <br />
                end-to-end.
              </h2>
            </Reveal>

            <Reveal delay={0.1} className="mt-6">
              <p className="text-muted text-sm leading-relaxed">
                Ingest → score → globe → ticket → block. The full loop.
                Cold-opens on the dashboard. Zero brand intro, zero login screen.
              </p>
            </Reveal>

            <Reveal delay={0.2} className="mt-auto">
              <ol className="border-t hair pt-6 space-y-3 text-xs font-mono uppercase tracking-wider">
                {[
                  ["00:00", "Globe + KPIs"],
                  ["00:09", "IP investigation"],
                  ["00:15", "Events → reports"],
                  ["00:30", "Agent triage"],
                  ["00:48", "RBAC matrix"],
                  ["00:57", "MFA TOTP"],
                ].map(([t, l]) => (
                  <li key={t} className="grid grid-cols-[60px_1fr] gap-4 items-baseline">
                    <span className="tabular-nums">{t}</span>
                    <span className="text-muted">{l}</span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>

        {/* Right: full-bleed video on white background, no overlay badges */}
        <div className="relative bg-paper flex items-center justify-center">
          <video
            ref={videoRef}
            src="/autosoc-promo.mp4"
            className="block w-full h-auto max-h-[88vh] object-contain"
            muted
            loop
            playsInline
            preload="metadata"
            controls
            aria-label="AutoSoc product demo video"
          />
        </div>
      </div>
    </section>
  );
}
