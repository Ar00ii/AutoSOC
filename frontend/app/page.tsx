"use client";

import { useState } from "react";
import useSWR from "swr";
import Globe from "@/components/Globe";
import StatCard from "@/components/StatCard";
import EventTable from "@/components/EventTable";
import Topbar from "@/components/Topbar";
import Sparkline from "@/components/Sparkline";
import TopList from "@/components/TopList";
import IpPanel from "@/components/IpPanel";
import CorrelationsTicker from "@/components/CorrelationsTicker";
import type { EventRow, Stats, TimeBucket, TopAggregations } from "@/lib/api";
import { fetcher } from "@/lib/api";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useSWR<Stats>(
    "/api/events/_stats/summary",
    fetcher,
    { refreshInterval: 10_000 },
  );
  const { data: events, isLoading: eventsLoading } = useSWR<EventRow[]>(
    "/api/events?limit=25",
    fetcher,
    { refreshInterval: 8_000 },
  );
  const { data: ts } = useSWR<TimeBucket[]>(
    "/api/dashboard/timeseries?hours=24&bucket_minutes=60",
    fetcher,
    { refreshInterval: 20_000 },
  );
  const { data: top } = useSWR<TopAggregations>(
    "/api/dashboard/top?hours=24&n=8",
    fetcher,
    { refreshInterval: 20_000 },
  );
  const [ip, setIp] = useState<string | null>(null);

  return (
    <div>
      <Topbar title="Dashboard / Threat overview" />
      <div className="p-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink border border-ink">
          <div className="bg-paper"><StatCard label="Events 24h" value={stats?.events_24h ?? "-"} loading={statsLoading} /></div>
          <div className="bg-paper"><StatCard label="Critical 24h" value={stats?.critical_24h ?? "-"} loading={statsLoading} /></div>
          <div className="bg-paper"><StatCard label="Open tickets" value={stats?.open_tickets ?? "-"} loading={statsLoading} /></div>
          <div className="bg-paper"><StatCard label="Blocked IPs" value={stats?.blocked_ips ?? "-"} loading={statsLoading} /></div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <Globe onIpClick={setIp} />
          <div className="space-y-4">
            <div className="border border-ink p-4 space-y-3">
              <div>
                <div className="label-cap-muted">Top source country</div>
                <div className="text-xl font-semibold mt-1">{stats?.top_country ?? "-"}</div>
              </div>
              <div className="border-t hair pt-3">
                <div className="label-cap-muted">Top category</div>
                <div className="text-xl font-semibold mt-1 uppercase">{stats?.top_category ?? "-"}</div>
              </div>
            </div>
            <CorrelationsTicker />
          </div>
        </section>

        <section aria-labelledby="ts-h">
          <h2 id="ts-h" className="text-sm uppercase tracking-wider font-semibold m-0 mb-3">
            Events per hour (24h)
          </h2>
          <Sparkline data={ts ?? []} height={140} />
        </section>

        <section aria-labelledby="top-h">
          <h2 id="top-h" className="text-sm uppercase tracking-wider font-semibold m-0 mb-3">
            Top aggregations (24h)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <TopList title="Top IPs" items={top?.ips ?? []} onItemClick={setIp} />
            <TopList title="Top countries" items={top?.countries ?? []} />
            <TopList title="Top categories" items={top?.categories ?? []} />
            <TopList title="Top MITRE" items={top?.mitre ?? []} />
          </div>
        </section>

        <section aria-labelledby="recent-events-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="recent-events-heading"
              className="text-sm uppercase tracking-wider font-semibold m-0"
            >
              Recent events
            </h2>
            <a href="/events" className="label-cap underline min-h-[32px] flex items-center px-1">
              View all
            </a>
          </div>
          {eventsLoading ? (
            <div className="border border-ink p-6 text-center label-cap-muted">Loading events...</div>
          ) : (
            <EventTable rows={events ?? []} onIpClick={setIp} />
          )}
        </section>
      </div>
      <IpPanel ip={ip} onClose={() => setIp(null)} />
    </div>
  );
}
