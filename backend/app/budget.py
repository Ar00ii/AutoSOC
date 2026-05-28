"""Daily-budget guard for agent runs.

When AUTH_REQUIRED=false the public demo is open to anonymous traffic.
Without these guards a single visitor can drain the Anthropic credit
balance. Two protections layer here:

1. Per-IP daily quota (default 3 runs / IP / day).
2. Estimated-cost daily cap (default $5 / day across all runs).

Costs use the official Anthropic price list for Claude 3.5 / 4.x models
in USD per 1M tokens. Update PRICES below when models or prices change.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from . import models
from .config import settings

# USD per 1M tokens. Approximate, conservative (overestimate is the safe direction).
PRICES = {
    # input_per_1m, output_per_1m
    "claude-sonnet-4-6":            (3.0, 15.0),
    "claude-sonnet-4-5-20250929":   (3.0, 15.0),
    "claude-haiku-4-5-20251001":    (0.80, 4.0),
    "claude-haiku-4-5":             (0.80, 4.0),
    "claude-3-5-sonnet-20241022":   (3.0, 15.0),
    "claude-3-5-haiku-20241022":    (1.0, 5.0),
}
_DEFAULT_PRICE = (3.0, 15.0)


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    pin, pout = PRICES.get(model, _DEFAULT_PRICE)
    return (tokens_in * pin + tokens_out * pout) / 1_000_000.0


def today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


# In-memory per-IP counter — resets every UTC midnight.
_ip_lock = threading.Lock()
_ip_counters: dict[str, dict[str, int]] = {}  # ip -> {date: count}


def ip_quota_check_and_inc(ip: str) -> tuple[bool, int]:
    """Returns (allowed, current_count_after_inc_or_current). Atomic per IP."""
    today = today_utc()
    limit = max(1, settings.agents_rate_limit_per_ip_day)
    with _ip_lock:
        entry = _ip_counters.setdefault(ip, {})
        # purge stale dates for this IP
        for k in list(entry):
            if k != today:
                entry.pop(k, None)
        current = entry.get(today, 0)
        if current >= limit:
            return False, current
        entry[today] = current + 1
        return True, current + 1


def daily_spend_usd(db: Session) -> float:
    """Sum of estimated cost of every agent run today (UTC)."""
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.query(models.AgentRun.tokens_in, models.AgentRun.tokens_out, models.Agent.model)
        .join(models.Agent, models.Agent.id == models.AgentRun.agent_id)
        .filter(models.AgentRun.started_at >= start)
        .all()
    )
    total = 0.0
    for tin, tout, model in rows:
        total += estimate_cost(model or "", tin or 0, tout or 0)
    return round(total, 4)


def budget_check(db: Session) -> tuple[bool, float, float]:
    """Returns (allowed, spent_usd, budget_usd)."""
    spent = daily_spend_usd(db)
    return spent < settings.agents_daily_budget_usd, spent, settings.agents_daily_budget_usd
