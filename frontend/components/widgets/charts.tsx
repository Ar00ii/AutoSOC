"use client";

/** Compact monochrome charts in pure SVG.
 * Designed for the widget grid — no external chart lib, no colors, no chrome.
 */

import { useId } from "react";

export function LineChart({
  data,
  height = 160,
  showBaseline = true,
  emphasizeLast = true,
}: {
  data: number[];
  height?: number;
  showBaseline?: boolean;
  emphasizeLast?: boolean;
}) {
  const W = 600;
  const H = height;
  const pad = 16;
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(1, max - min);
  const stepX = (W - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return { x, y, v };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    `M ${pad} ${H - pad} ` +
    points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
    ` L ${W - pad} ${H - pad} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      {showBaseline && (
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#000" strokeWidth="0.5" opacity="0.3" />
      )}
      <path d={areaPath} fill="#000" opacity="0.06" />
      <path d={path} fill="none" stroke="#000" strokeWidth="1.5" />
      {emphasizeLast && (
        <>
          <circle cx={last.x} cy={last.y} r={3.5} fill="#000" />
          <text x={W - pad} y={pad + 4} textAnchor="end" fontSize="11" fontFamily="IBM Plex Mono, monospace" fill="#000">
            {last.v.toLocaleString("en-US")}
          </text>
        </>
      )}
    </svg>
  );
}

export function BarChart({
  data,
  height = 160,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  if (!data?.length) return null;
  const W = 600;
  const H = height;
  const pad = 16;
  const bw = (W - pad * 2) / data.length;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      {data.map((d, i) => {
        const h = ((H - pad * 2) * d.value) / max;
        const x = pad + i * bw + 3;
        const y = H - pad - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={bw - 6} height={h} fill="#000" />
            <text x={x + (bw - 6) / 2} y={H - 4} textAnchor="middle" fontSize="9" fontFamily="IBM Plex Mono, monospace" fill="#6b6b6b">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({
  data,
  size = 140,
}: {
  data: { label: string; value: number; fill?: string }[];
  size?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return null;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size / 8;
  let acc = 0;
  // 4 monochrome fills via opacity steps
  const fills = ["#000000", "rgba(0,0,0,0.65)", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.2)"];
  const id = useId();
  return (
    <div className="flex items-center gap-4 w-full h-full p-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e5e5" strokeWidth={stroke} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const end = ((acc + d.value) / total) * Math.PI * 2 - Math.PI / 2;
          acc += d.value;
          const x1 = cx + r * Math.cos(start);
          const y1 = cy + r * Math.sin(start);
          const x2 = cx + r * Math.cos(end);
          const y2 = cy + r * Math.sin(end);
          const large = frac > 0.5 ? 1 : 0;
          const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
          return (
            <path key={`${id}-${i}`} d={path} fill="none" stroke={d.fill ?? fills[i % fills.length]} strokeWidth={stroke} strokeLinecap="butt" />
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
          {total.toLocaleString("en-US")}
        </text>
      </svg>
      <ul className="flex-1 space-y-1 min-w-0 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 border border-ink shrink-0"
              style={{ background: d.fill ?? fills[i % fills.length] }}
            />
            <span className="uppercase tracking-wider text-[11px] truncate">{d.label}</span>
            <span className="ml-auto tabular-nums label-cap-muted">{d.value.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Heatmap({
  grid,
  max,
  rowLabels,
  colLabels,
}: {
  grid: number[][];
  max: number;
  rowLabels?: string[];
  colLabels?: string[];
}) {
  if (!grid?.length) return null;
  return (
    <div className="w-full h-full p-3 overflow-auto">
      <div className="grid gap-px text-[9px] font-mono"
        style={{
          gridTemplateColumns: `48px repeat(${grid[0].length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {(colLabels ?? grid[0].map((_, i) => String(i))).map((c) => (
          <div key={`c${c}`} className="text-center text-muted">{c}</div>
        ))}
        {grid.map((row, r) => (
          <FragmentRow
            key={r}
            label={rowLabels?.[r] ?? String(r)}
            row={row}
            max={max}
          />
        ))}
      </div>
    </div>
  );
}

function FragmentRow({ label, row, max }: { label: string; row: number[]; max: number }) {
  return (
    <>
      <div className="text-muted pr-1 self-center">{label}</div>
      {row.map((v, c) => {
        const op = max ? Math.min(1, 0.05 + (v / max) * 0.95) : 0;
        return (
          <div
            key={c}
            title={`${label} ${c}h: ${v}`}
            className="aspect-square border border-hair"
            style={{ background: `rgba(0,0,0,${op.toFixed(3)})` }}
          />
        );
      })}
    </>
  );
}
