"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Building blocks shared by every widget.
 * Monochrome by design: every visual cue uses fill, weight, or pattern — never color.
 */

export function WidgetShell({
  title,
  subtitle,
  badge,
  children,
  loading,
  empty,
  emptyText = "No data.",
  onConfig,
  className = "",
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  onConfig?: () => void;
  className?: string;
}) {
  return (
    <div
      className={
        "h-full w-full border border-ink bg-paper flex flex-col overflow-hidden group/widget " +
        className
      }
    >
      <header className="px-3 py-1.5 border-b border-ink flex items-center justify-between gap-2 shrink-0 cursor-grab active:cursor-grabbing widget-drag-handle">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="label-cap truncate">{title}</span>
          {subtitle && <span className="label-cap-muted truncate">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-1">
          {badge}
          {onConfig && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfig();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="label-cap-muted opacity-0 group-hover/widget:opacity-100 transition-opacity hover:text-ink"
              aria-label="configure"
            >
              ⋯
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 relative">
        {loading && <SkeletonOverlay />}
        {!loading && empty && (
          <div className="absolute inset-0 flex items-center justify-center label-cap-muted text-center px-4">
            {emptyText}
          </div>
        )}
        {!loading && !empty && children}
      </div>
    </div>
  );
}

export function SkeletonOverlay() {
  return (
    <div className="absolute inset-0 bg-paper">
      <div className="h-full w-full animate-pulse">
        <div className="h-3 bg-row m-3 w-2/3" />
        <div className="h-3 bg-row m-3 w-1/2" />
        <div className="h-3 bg-row m-3 w-3/4" />
      </div>
    </div>
  );
}

/** Number that counts up smoothly when value changes. */
export function AnimatedNumber({
  value,
  duration = 700,
  format = (n) => n.toLocaleString("en-US"),
  className = "",
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(performance.now());

  useEffect(() => {
    if (display === value) return;
    fromRef.current = display;
    startRef.current = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{format(Math.round(display))}</span>;
}

/** Tiny sparkline (no axes). 28px tall by default. Pure SVG. */
export function Sparkline({
  data,
  height = 28,
  className = "",
}: {
  data: number[];
  height?: number;
  className?: string;
}) {
  if (!data?.length || data.length < 2) return <div className={className} style={{ height }} />;
  const W = 100; // viewBox width
  const H = height;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(0.0001, max - min);
  const stepX = W / Math.max(1, data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={"w-full " + className}
      style={{ height }}
    >
      <polyline points={points} fill="none" stroke="#000" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Compact horizontal bar (used inside top-N lists). */
export function MiniBar({ pct }: { pct: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1 bg-ink"
      style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
    />
  );
}

/** Severity badge — monochrome by border / fill / outline. */
export function Sev({ s }: { s: string }) {
  const cls: Record<string, string> = {
    low: "border border-ink",
    medium: "border border-ink",
    high: "bg-ink text-paper",
    critical: "bg-ink text-paper outline outline-1 outline-offset-2 outline-ink",
  };
  const extra = s === "medium" ? " pl-2 shadow-[inset_4px_0_0_0_#000]" : "";
  return (
    <span
      className={
        "inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold " +
        (cls[s] || cls.low) + extra
      }
    >
      {s}
    </span>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-ink">
      {children}
    </span>
  );
}
