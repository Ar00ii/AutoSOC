"use client";

import type { TimeBucket } from "@/lib/api";

export default function Sparkline({ data, height = 120 }: { data: TimeBucket[]; height?: number }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="border border-ink flex items-center justify-center label-cap-muted"
      >
        No data
      </div>
    );
  }
  const W = 800;
  const H = height;
  const PAD_L = 36;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...data.map((d) => d.total));
  const step = innerW / Math.max(1, data.length - 1);

  const totalPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${PAD_L + i * step} ${PAD_T + innerH - (d.total / max) * innerH}`)
    .join(" ");
  const critPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${PAD_L + i * step} ${PAD_T + innerH - (d.critical / max) * innerH}`)
    .join(" ");

  const yTicks = 4;
  const yVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((max / yTicks) * (yTicks - i)));
  const firstTime = data[0].t;
  const lastTime = data[data.length - 1].t;

  return (
    <div className="border border-ink p-2" role="img" aria-label={`Events per hour, max ${max}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {yVals.map((v, i) => {
          const y = PAD_T + (innerH / yTicks) * i;
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e5e5e5" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="10" fontFamily="IBM Plex Mono" fill="#6b6b6b">
                {v}
              </text>
            </g>
          );
        })}
        <line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} stroke="#000" strokeWidth="1" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + innerH} stroke="#000" strokeWidth="1" />
        <path d={totalPath} fill="none" stroke="#000" strokeWidth="1.5" />
        <path d={critPath} fill="none" stroke="#000" strokeWidth="2.5" strokeDasharray="3 2" />
        <text x={PAD_L} y={H - 6} fontSize="10" fontFamily="IBM Plex Mono" fill="#6b6b6b">
          {firstTime.replace("T", " ").slice(5, 16)}
        </text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" fontSize="10" fontFamily="IBM Plex Mono" fill="#6b6b6b">
          {lastTime.replace("T", " ").slice(5, 16)}
        </text>
      </svg>
      <div className="flex items-center gap-4 text-xs label-cap-muted mt-1 px-2">
        <span className="flex items-center gap-2"><span className="inline-block w-6 h-[2px] bg-black" />total</span>
        <span className="flex items-center gap-2"><span className="inline-block w-6 h-[2px] bg-black" style={{ backgroundImage: "repeating-linear-gradient(90deg, #000 0 3px, transparent 3px 5px)", background: "none", borderTop: "2px dashed #000" }} />critical</span>
      </div>
    </div>
  );
}
