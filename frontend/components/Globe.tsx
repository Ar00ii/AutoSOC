"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import useSWR from "swr";
import type { Arc, Point, Severity } from "@/lib/api";
import { fetcher } from "@/lib/api";
import { useLiveStream } from "@/hooks/useLiveStream";

function escapeHtml(value: unknown): string {
  const s = value == null ? "" : String(value);
  return s.replace(/[&<>"'/]/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#x27;";
      case "/": return "&#x2F;";
      default: return c;
    }
  });
}

const GlobeGL = dynamic(() => import("react-globe.gl"), { ssr: false });

const SEV_COLOR: Record<Severity, [string, string]> = {
  low: ["rgba(0,0,0,0.25)", "rgba(0,0,0,0.5)"],
  medium: ["rgba(0,0,0,0.4)", "rgba(0,0,0,0.7)"],
  high: ["rgba(0,0,0,0.65)", "rgba(0,0,0,0.95)"],
  critical: ["rgba(0,0,0,0.85)", "rgba(0,0,0,1)"],
};

type WorldFeature = {
  type: "Feature";
  properties: { ISO_A2?: string; ISO_A2_EH?: string; ADMIN?: string; NAME?: string };
  geometry: any;
};

export default function GlobeView({ onIpClick }: { onIpClick?: (ip: string) => void }) {
  const { data: arcs } = useSWR<Arc[]>("/api/globe/arcs?limit=400", fetcher, {
    refreshInterval: 30_000,
  });
  const { data: points } = useSWR<Point[]>("/api/globe/points", fetcher, {
    refreshInterval: 30_000,
  });
  const { latest, connected } = useLiveStream(80);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [world, setWorld] = useState<WorldFeature[]>([]);

  const globeMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
    [],
  );

  useEffect(() => {
    return () => {
      globeMaterial.dispose();
    };
  }, [globeMaterial]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(m.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    fetch("/world.geojson")
      .then((r) => r.json())
      .then((j) => setWorld(j.features ?? []))
      .catch(() => setWorld([]));
  }, []);

  const arcData = useMemo<Arc[]>(() => {
    const live: Arc[] = latest
      .filter((e) => e.src_lat && e.src_lng)
      .map((e) => ({
        startLat: e.src_lat,
        startLng: e.src_lng,
        endLat: e.dst_lat,
        endLng: e.dst_lng,
        severity: e.severity,
        category: e.category,
        src_ip: e.src_ip,
        src_country: e.src_country || "??",
        status: "open",
      }));
    const seen = new Set(live.map((a) => `${a.src_ip}|${a.startLat}|${a.startLng}`));
    const base = (arcs ?? []).filter(
      (a) => !seen.has(`${a.src_ip}|${a.startLat}|${a.startLng}`),
    );
    return [...live, ...base].slice(0, 400);
  }, [arcs, latest]);

  const pointData = useMemo<Point[]>(() => points ?? [], [points]);

  const hitsByCountry = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of arcData) {
      const k = (a.src_country || "").toUpperCase();
      if (!k || k === "??") continue;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [arcData]);

  const maxHits = useMemo(
    () => Math.max(1, ...Object.values(hitsByCountry)),
    [hitsByCountry],
  );

  function isoOf(f: WorldFeature): string {
    return (f.properties.ISO_A2 || f.properties.ISO_A2_EH || "").toUpperCase();
  }

  function nameOf(f: WorldFeature): string {
    return f.properties.ADMIN || f.properties.NAME || "";
  }

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={`Threat map showing ${arcData.length} malicious requests from ${pointData.length} source locations`}
      className="border border-ink bg-paper relative"
      style={{ height: 520 }}
    >
      <div className="absolute top-0 left-0 z-10 px-3 py-2 border-r border-b border-ink bg-paper label-cap flex items-center gap-2">
        <span>Threat map</span>
        <span className={"label-cap " + (connected ? "" : "opacity-50")}>
          [{connected ? "live" : "polling"}]
        </span>
      </div>
      <div className="absolute top-0 right-0 z-10 px-3 py-2 border-l border-b border-ink bg-paper label-cap-muted tabular-nums">
        Arcs: {arcData.length} | Sources: {pointData.length} | Countries: {Object.keys(hitsByCountry).length}
      </div>
      <div className="absolute bottom-0 left-0 z-10 px-3 py-2 border-r border-t border-ink bg-paper label-cap-muted">
        Drag to rotate · scroll to zoom · click arc to investigate
      </div>
      <GlobeGL
        width={size.w}
        height={size.h}
        backgroundColor="#ffffff"
        showAtmosphere={false}
        showGraticules={true}
        globeMaterial={globeMaterial}
        atmosphereColor="#000000"
        polygonsData={world}
        polygonAltitude={(f: any) => {
          const iso = (f.properties.ISO_A2 || f.properties.ISO_A2_EH || "").toUpperCase();
          const hits = hitsByCountry[iso] || 0;
          return hits > 0 ? 0.008 + (hits / maxHits) * 0.02 : 0.005;
        }}
        polygonCapColor={(f: any) => {
          const iso = (f.properties.ISO_A2 || f.properties.ISO_A2_EH || "").toUpperCase();
          const hits = hitsByCountry[iso] || 0;
          if (hits === 0) return "rgba(0,0,0,0)";
          const intensity = Math.min(0.85, 0.12 + (hits / maxHits) * 0.73);
          return `rgba(0,0,0,${intensity.toFixed(3)})`;
        }}
        polygonSideColor={() => "rgba(0,0,0,0.15)"}
        polygonStrokeColor={() => "#000000"}
        polygonLabel={(f: any) => {
          const iso = (f.properties.ISO_A2 || f.properties.ISO_A2_EH || "").toUpperCase();
          const hits = hitsByCountry[iso] || 0;
          const name = f.properties.ADMIN || f.properties.NAME || iso;
          return `<div style="background:#fff;border:1px solid #000;padding:6px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#000;letter-spacing:.04em">
            <div style="text-transform:uppercase;font-weight:600">${escapeHtml(name)}</div>
            <div style="color:#6b6b6b">ISO ${escapeHtml(iso || "-")}</div>
            <div style="margin-top:4px">Events: <b>${escapeHtml(hits)}</b></div>
          </div>`;
        }}
        arcsData={arcData}
        arcStartLat={(d: any) => d.startLat}
        arcStartLng={(d: any) => d.startLng}
        arcEndLat={(d: any) => d.endLat}
        arcEndLng={(d: any) => d.endLng}
        arcColor={(d: any) => SEV_COLOR[d.severity as Severity] ?? SEV_COLOR.low}
        arcStroke={(d: any) => (d.severity === "critical" ? 0.7 : 0.35)}
        arcDashLength={0.4}
        arcDashGap={0.15}
        arcDashAnimateTime={(d: any) =>
          reducedMotion
            ? 0
            : d.severity === "critical"
            ? 1800
            : d.severity === "high"
            ? 2400
            : 3200
        }
        arcAltitudeAutoScale={0.4}
        arcLabel={(d: any) => `<div style="background:#000;color:#fff;border:1px solid #000;padding:4px 8px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.05em;text-transform:uppercase">${escapeHtml(d.src_country)} · ${escapeHtml(d.src_ip)} · ${escapeHtml(d.severity)}</div>`}
        onArcClick={(d: any) => onIpClick?.(d.src_ip)}
        pointsData={pointData}
        pointLat={(d: any) => d.lat}
        pointLng={(d: any) => d.lng}
        pointColor={() => "#000000"}
        pointAltitude={(d: any) => Math.min(0.12, 0.01 + d.hits * 0.004)}
        pointRadius={(d: any) => Math.min(0.6, 0.15 + d.hits * 0.02)}
        pointLabel={(d: any) => `<div style="background:#fff;border:1px solid #000;padding:4px 8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#000;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(d.label)} · hits ${escapeHtml(d.hits)} · ${escapeHtml(d.severity)}</div>`}
      />
    </div>
  );
}
