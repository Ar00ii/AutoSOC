"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import { post } from "@/lib/api";
import { useBilling } from "@/lib/billing";

const FEATURES = [
  "AI event scoring — every log line triaged by Claude in real time",
  "Autonomous AI agents — investigate, open tickets and recommend blocks on their own",
  "AI incident reports — executive summaries generated on demand",
  "Natural-language search across all events",
  "AI-driven playbooks with human approval gates",
];

export default function BillingPage() {
  const { billing, loading, mutate } = useBilling();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upgrade() {
    setBusy(true);
    setError("");
    try {
      const { url } = await post<{ url: string }>("/api/billing/checkout");
      window.location.href = url;
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      setError(
        msg.includes("not configured")
          ? "Online checkout is not enabled yet. Contact your administrator to activate your subscription."
          : "Could not start checkout. Try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    setError("");
    try {
      const { url } = await post<{ url: string }>("/api/billing/portal");
      window.location.href = url;
    } catch {
      setError("Could not open the billing portal.");
    } finally {
      setBusy(false);
    }
  }

  const active = billing?.active;
  const price = billing?.price_usd ?? 20;

  return (
    <div>
      <Topbar title="Billing / AI subscription" />
      <div className="p-6 max-w-3xl space-y-6">
        {/* Status banner */}
        <div className="border border-ink p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="label-cap-muted">Subscription status</div>
              <div className="text-lg font-semibold uppercase tracking-wider mt-1">
                {loading ? "…" : active ? "Active" : "Inactive"}
              </div>
            </div>
            <div
              className={
                "px-3 py-1.5 text-xs uppercase tracking-wider border border-ink " +
                (active ? "bg-ink text-paper" : "")
              }
            >
              {active ? "AI unlocked" : "AI locked"}
            </div>
          </div>
          {billing?.current_period_end && (
            <div className="label-cap-muted mt-3 tabular-nums">
              Renews / ends: {billing.current_period_end.replace("T", " ").slice(0, 16)}
            </div>
          )}
          {billing && billing.source === "manual" && active && (
            <div className="label-cap-muted mt-2">Granted manually by an administrator.</div>
          )}
        </div>

        {/* Plan card */}
        <div className="border border-ink p-5">
          <div className="flex items-baseline justify-between border-b hair pb-3">
            <div className="text-sm font-semibold uppercase tracking-wider">AutoSoc AI</div>
            <div className="tabular-nums">
              <span className="text-2xl font-bold">${price.toFixed(0)}</span>
              <span className="label-cap-muted"> / month</span>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-sm">
                <span aria-hidden className="font-bold">+</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap gap-2">
            {!active && (
              <button
                type="button"
                onClick={upgrade}
                disabled={busy}
                aria-busy={busy}
                className="bg-ink text-paper px-4 py-2.5 min-h-[40px] text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Redirecting…" : `Upgrade — $${price.toFixed(0)}/mo`}
              </button>
            )}
            {active && billing?.source === "stripe" && (
              <button
                type="button"
                onClick={manage}
                disabled={busy}
                className="border border-ink px-4 py-2.5 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper disabled:opacity-50"
              >
                Manage billing
              </button>
            )}
            <button
              type="button"
              onClick={() => mutate()}
              className="border border-ink px-4 py-2.5 min-h-[40px] text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
            >
              Refresh
            </button>
          </div>

          {billing && !billing.stripe_enabled && !active && (
            <div className="label-cap-muted mt-4">
              Note: online payments are not enabled on this instance yet — an admin can
              activate your subscription manually.
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 border border-ink p-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
