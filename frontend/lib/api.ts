export type Severity = "low" | "medium" | "high" | "critical";

export interface EventRow {
  id: number;
  timestamp: string;
  source: string;
  src_ip: string;
  src_country?: string;
  src_city?: string;
  src_lat?: number;
  src_lng?: number;
  dst_lat?: number;
  dst_lng?: number;
  severity: Severity;
  category: string;
  mitre_id?: string;
  mitre_name?: string;
  mitre_tactic?: string;
  abuse_score?: number;
  known_bad?: number;
  cluster_key?: string;
  raw: string;
  summary?: string;
  status: string;
}

export interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  severity: Severity;
  category: string;
  src_ip: string;
  src_country: string;
  status: string;
}

export interface Point {
  lat: number;
  lng: number;
  label: string;
  severity: Severity;
  hits: number;
}

export interface Stats {
  events_24h: number;
  critical_24h: number;
  blocked_ips: number;
  open_tickets: number;
  top_country: string;
  top_category: string;
}

export interface Ticket {
  id: number;
  created_at: string;
  title: string;
  severity: Severity;
  status: string;
  assignee: string;
  description: string;
  src_ip: string;
}

export interface IpBlock {
  id: number;
  ip: string;
  country: string;
  reason: string;
  severity: Severity;
  hit_count: number;
  recommended_at: string;
  applied: number;
  firewall_mode?: string;
  firewall_output?: string;
}

export interface Report {
  id: number;
  created_at: string;
  title: string;
  period: string;
  body: string;
}

export interface AuditRow {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  meta: string;
}

export interface SavedSearch {
  id: number;
  created_at: string;
  name: string;
  query: string;
}

export interface IpInvestigation {
  ip: string;
  country: string;
  city: string;
  abuse_score: number;
  isp: string;
  domain: string;
  usage_type: string;
  total_reports: number;
  is_tor: boolean;
  event_count: number;
  first_seen?: string;
  last_seen?: string;
  top_categories: { category: string; count: number }[];
  severity_breakdown: Record<Severity, number>;
  ai_summary: string;
}

export interface TimeBucket {
  t: string;
  low: number;
  medium: number;
  high: number;
  critical: number;
  total: number;
}

export interface TopAggregations {
  ips: { key: string; count: number }[];
  countries: { key: string; count: number }[];
  categories: { key: string; count: number }[];
  mitre: { key: string; count: number }[];
}

import { delJSON, fetcher as authFetcher, patchJSON, postJSON } from "./auth";

export const fetcher = authFetcher;
export const post = postJSON;
export const patch = patchJSON;
export const del = delJSON;
