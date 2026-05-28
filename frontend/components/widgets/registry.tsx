"use client";

import {
  KpiEvents24h, KpiCritical24h, KpiOpenCases, KpiBlockedIps,
  KpiSlaBreached, KpiTiIocs, KpiAgentRuns1h,
} from "./KpiWidgets";
import {
  ChartEventsPerHour, ChartSeverityDonut, ChartTopCategories,
  ChartTopCountries, ChartTopMitre, ChartTopAsn, ChartCasesByStatus,
  ChartKillchainCoverage, ChartHeatmapHour,
} from "./ChartWidgets";
import {
  StreamRecentEvents, StreamOpenCases, StreamApprovalQueue,
  StreamAgentRuns, StreamTiFeeds, StreamRecentReports, StreamAudit,
} from "./StreamWidgets";
import { GlobeWidget } from "./GlobeWidget";

export const WIDGETS: Record<string, () => React.ReactElement> = {
  // KPIs
  kpi_events_24h:     () => <KpiEvents24h />,
  kpi_critical_24h:   () => <KpiCritical24h />,
  kpi_open_cases:     () => <KpiOpenCases />,
  kpi_blocked_ips:    () => <KpiBlockedIps />,
  kpi_sla_breached:   () => <KpiSlaBreached />,
  kpi_ti_iocs:        () => <KpiTiIocs />,
  kpi_agent_runs_1h:  () => <KpiAgentRuns1h />,
  // Charts
  chart_events_per_hour: () => <ChartEventsPerHour />,
  chart_severity_donut:  () => <ChartSeverityDonut />,
  chart_top_categories:  () => <ChartTopCategories />,
  chart_top_countries:   () => <ChartTopCountries />,
  chart_top_mitre:       () => <ChartTopMitre />,
  chart_top_asn:         () => <ChartTopAsn />,
  chart_cases_by_status: () => <ChartCasesByStatus />,
  chart_killchain:       () => <ChartKillchainCoverage />,
  chart_heatmap_hour:    () => <ChartHeatmapHour />,
  // Live / list
  stream_recent_events:  () => <StreamRecentEvents />,
  stream_open_cases:     () => <StreamOpenCases />,
  stream_approval_queue: () => <StreamApprovalQueue />,
  stream_agent_runs:     () => <StreamAgentRuns />,
  stream_ti_feeds:       () => <StreamTiFeeds />,
  stream_recent_reports: () => <StreamRecentReports />,
  stream_audit:          () => <StreamAudit />,
  // Spatial
  globe_3d:              () => <GlobeWidget />,
};

export function renderWidget(type: string): React.ReactElement {
  const fn = WIDGETS[type];
  if (!fn) return <div className="h-full w-full border border-ink p-3 label-cap-muted">unknown widget: {type}</div>;
  return fn();
}
