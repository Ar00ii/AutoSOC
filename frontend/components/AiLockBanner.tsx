"use client";

import Link from "next/link";
import { useBilling } from "@/lib/billing";

/** Shows an upgrade prompt when the current user has no active AI subscription.
 *  Renders nothing while loading or when AI is already unlocked. */
export default function AiLockBanner({ feature = "AI features" }: { feature?: string }) {
  const { billing, loading } = useBilling();
  if (loading || !billing || billing.active) return null;
  return (
    <div className="border border-ink p-4 flex flex-wrap items-center justify-between gap-3 bg-row">
      <div className="text-sm">
        <span className="font-semibold uppercase tracking-wider">{feature} locked.</span>{" "}
        <span className="label-cap-muted">
          Subscribe for ${billing.price_usd.toFixed(0)}/mo to unlock AI scoring, agents and reports.
        </span>
      </div>
      <Link
        href="/billing"
        className="bg-ink text-paper px-3 py-2 min-h-[36px] text-xs uppercase tracking-wider hover:opacity-90 shrink-0"
      >
        Upgrade
      </Link>
    </div>
  );
}
