import useSWR from "swr";
import { fetcher } from "./api";

export interface BillingStatus {
  status: string;
  active: boolean;
  plan: string | null;
  source: string;
  current_period_end: string | null;
  price_usd: number;
  stripe_enabled: boolean;
}

export function useBilling() {
  const { data, isLoading, mutate } = useSWR<BillingStatus>(
    "/api/billing/status",
    fetcher,
    { refreshInterval: 60_000 },
  );
  return { billing: data, loading: isLoading, mutate };
}
