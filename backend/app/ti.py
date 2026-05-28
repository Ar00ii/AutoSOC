"""Threat-intelligence module.

Subscribes to public feeds (abuse.ch URLhaus, abuse.ch ThreatFox,
AlienVault OTX, generic MISP), pulls IoCs on a schedule, and matches
incoming events against the IoC store to auto-tag / escalate.

Design:
- Each feed is a `TIFeed` row with `kind` driving the pull adapter.
- Pulls are scheduled via APScheduler (`scheduler.py`).
- Matching happens at ingest time via `match_event(event)`.
- Match output: (matched_iocs, new_severity, tags_added).
- Feeds without an API key still work in degraded mode using public
  abuse.ch endpoints (no key required for URLhaus/ThreatFox).
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Iterable, Optional

import httpx
from sqlalchemy.orm import Session

from . import models
from .db import SessionLocal
from .security import is_url_safe_outbound

log = logging.getLogger("autosoc.ti")

# ─────────────────────────────────────────────────────────────
#  Feed adapters — each returns Iterable[dict] with keys:
#    indicator, kind, threat_type, confidence, tags, source_ref, expires_at?
# ─────────────────────────────────────────────────────────────


def _pull_urlhaus_recent() -> Iterable[dict]:
    """abuse.ch URLhaus — recent malware URLs (last 30 days, public)."""
    url = "https://urlhaus.abuse.ch/downloads/csv_recent/"
    _ok, _ = is_url_safe_outbound(url)
    if not _ok:
        return []
    try:
        r = httpx.get(url, timeout=15.0, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise RuntimeError(f"urlhaus pull failed: {e}") from e

    # CSV header rows start with '#'. Skip them.
    lines = [l for l in r.text.splitlines() if l and not l.startswith("#")]
    out: list[dict] = []
    reader = csv.reader(lines)
    for row in reader:
        if len(row) < 9:
            continue
        # cols: id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter
        _id, _dateadded, url_v, _status, _last, threat, tags, link, _reporter = row[:9]
        out.append({
            "indicator": url_v.strip('"'),
            "kind": "url",
            "threat_type": (threat or "malware_distribution").strip('"'),
            "confidence": 85,
            "tags": [t for t in (tags or "").strip('"').split(",") if t],
            "source_ref": link.strip('"'),
        })
    return out


def _pull_threatfox_recent() -> Iterable[dict]:
    """abuse.ch ThreatFox — recent IoCs (last 3 days). Public, no key."""
    url = "https://threatfox-api.abuse.ch/api/v1/"
    _ok, _ = is_url_safe_outbound(url)
    if not _ok:
        return []
    try:
        r = httpx.post(url, json={"query": "get_iocs", "days": 3}, timeout=15.0)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise RuntimeError(f"threatfox pull failed: {e}") from e

    if data.get("query_status") != "ok":
        raise RuntimeError(f"threatfox: {data.get('query_status')}")

    kind_map = {
        "url": "url", "domain": "domain", "ip:port": "ip",
        "md5_hash": "md5", "sha256_hash": "sha256", "sha1_hash": "sha1",
    }
    out: list[dict] = []
    for ioc in data.get("data", []):
        kind = kind_map.get(ioc.get("ioc_type", ""), "")
        if not kind:
            continue
        indicator = ioc.get("ioc", "")
        if kind == "ip" and ":" in indicator:
            indicator = indicator.split(":")[0]
        out.append({
            "indicator": indicator,
            "kind": kind,
            "threat_type": ioc.get("threat_type", "malware"),
            "confidence": int(ioc.get("confidence_level", 50)),
            "tags": ioc.get("tags") or [],
            "source_ref": f"https://threatfox.abuse.ch/ioc/{ioc.get('id')}",
        })
    return out


def _pull_otx_subscribed(api_key: str) -> Iterable[dict]:
    """AlienVault OTX — pulses subscribed by the API key."""
    url = "https://otx.alienvault.com/api/v1/pulses/subscribed?limit=50"
    _ok, _ = is_url_safe_outbound(url)
    if not _ok:
        return []
    try:
        r = httpx.get(url, headers={"X-OTX-API-KEY": api_key}, timeout=20.0)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise RuntimeError(f"otx pull failed: {e}") from e

    kind_map = {
        "IPv4": "ip", "IPv6": "ip", "domain": "domain", "hostname": "domain",
        "URL": "url", "FileHash-MD5": "md5", "FileHash-SHA256": "sha256",
        "FileHash-SHA1": "sha1", "email": "email",
    }
    out: list[dict] = []
    for pulse in data.get("results", []):
        tags = pulse.get("tags") or []
        threat = (pulse.get("targeted_countries") and "targeted_attack") or "generic"
        for ind in pulse.get("indicators", []):
            kind = kind_map.get(ind.get("type", ""), "")
            if not kind:
                continue
            out.append({
                "indicator": ind.get("indicator", ""),
                "kind": kind,
                "threat_type": threat,
                "confidence": 70,
                "tags": tags + [ind.get("title", "")] if ind.get("title") else tags,
                "source_ref": f"https://otx.alienvault.com/pulse/{pulse.get('id')}",
            })
    return out


def _pull_misp(url: str, api_key: str) -> Iterable[dict]:
    """Generic MISP feed pull via REST /attributes/restSearch."""
    _ok, _ = is_url_safe_outbound(url)
    if not _ok:
        return []
    try:
        r = httpx.post(
            f"{url.rstrip('/')}/attributes/restSearch",
            headers={"Authorization": api_key, "Accept": "application/json"},
            json={"returnFormat": "json", "last": "7d", "to_ids": 1},
            timeout=30.0,
            verify=True,
        )
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise RuntimeError(f"misp pull failed: {e}") from e

    kind_map = {
        "ip-src": "ip", "ip-dst": "ip", "domain": "domain", "hostname": "domain",
        "url": "url", "md5": "md5", "sha256": "sha256", "sha1": "sha1",
        "email-src": "email", "email-dst": "email",
    }
    out: list[dict] = []
    for attr in data.get("response", {}).get("Attribute", []):
        kind = kind_map.get(attr.get("type", ""), "")
        if not kind:
            continue
        out.append({
            "indicator": attr.get("value", ""),
            "kind": kind,
            "threat_type": attr.get("category", "misc"),
            "confidence": 80,
            "tags": [t.get("name", "") for t in (attr.get("Tag") or [])],
            "source_ref": f"misp:event:{attr.get('event_id')}",
        })
    return out


# Dispatch table
ADAPTERS = {
    "urlhaus":   lambda key: _pull_urlhaus_recent(),
    "threatfox": lambda key: _pull_threatfox_recent(),
    "otx":       lambda key: _pull_otx_subscribed(key) if key else [],
    "misp":      lambda key: [],  # MISP needs URL + key; handled separately
}


# ─────────────────────────────────────────────────────────────
#  Pull + upsert
# ─────────────────────────────────────────────────────────────

def pull_feed(db: Session, feed: models.TIFeed) -> tuple[int, Optional[str]]:
    """Pull a single feed and upsert its IoCs. Returns (count, error)."""
    api_key = os.getenv(feed.api_key_env, "") if feed.api_key_env else ""
    try:
        if feed.kind == "misp":
            iocs = list(_pull_misp(feed.url, api_key)) if feed.url and api_key else []
        else:
            adapter = ADAPTERS.get(feed.kind)
            iocs = list(adapter(api_key)) if adapter else []
    except Exception as e:
        feed.last_pull = datetime.utcnow()
        feed.last_error = str(e)[:500]
        feed.last_count = 0
        db.commit()
        return 0, str(e)

    now = datetime.utcnow()
    expires = now + timedelta(days=30)
    upserts = 0
    for d in iocs:
        ind = (d.get("indicator") or "").strip().lower()
        if not ind or len(ind) > 2048:
            continue
        existing = (
            db.query(models.IoC)
            .filter(models.IoC.indicator == ind, models.IoC.kind == d["kind"])
            .first()
        )
        if existing:
            existing.last_seen = now
            existing.expires_at = expires
            existing.active = 1
            if d.get("confidence", 0) > existing.confidence:
                existing.confidence = d["confidence"]
        else:
            db.add(models.IoC(
                feed_id=feed.id,
                indicator=ind,
                kind=d["kind"],
                threat_type=d.get("threat_type", ""),
                confidence=int(d.get("confidence", 50)),
                tags=json.dumps(d.get("tags") or []),
                source_ref=d.get("source_ref", ""),
                first_seen=now,
                last_seen=now,
                expires_at=expires,
                active=1,
            ))
            upserts += 1

    feed.last_pull = now
    feed.last_error = ""
    feed.last_count = upserts
    db.commit()
    return upserts, None


def pull_all(db: Session) -> dict:
    """Pull every enabled feed. Returns summary dict."""
    summary = {"feeds": 0, "added": 0, "errors": []}
    for feed in db.query(models.TIFeed).filter(models.TIFeed.enabled == 1).all():
        summary["feeds"] += 1
        n, err = pull_feed(db, feed)
        summary["added"] += n
        if err:
            summary["errors"].append({"feed": feed.name, "error": err[:200]})
    return summary


# ─────────────────────────────────────────────────────────────
#  Event matching
# ─────────────────────────────────────────────────────────────

def match_event(db: Session, event: models.Event) -> list[dict]:
    """Match an incoming event against active IoCs.

    Returns a list of dicts: {indicator, kind, threat_type, confidence}.
    The caller is expected to apply side-effects (severity escalation,
    tags on the event row, audit log entry).
    """
    hits: list[dict] = []
    if event.src_ip:
        ioc = (
            db.query(models.IoC)
            .filter(
                models.IoC.indicator == event.src_ip.lower(),
                models.IoC.kind == "ip",
                models.IoC.active == 1,
            )
            .first()
        )
        if ioc:
            hits.append({
                "indicator": ioc.indicator,
                "kind": "ip",
                "threat_type": ioc.threat_type,
                "confidence": ioc.confidence,
                "source": "ti",
            })

    # Pull domain / url / hash candidates from event.raw
    if event.raw:
        raw_lc = event.raw.lower()
        # cheap pre-filter: only query indicators present in the raw blob
        for kind in ("domain", "url", "sha256", "md5", "sha1"):
            for ioc in (
                db.query(models.IoC)
                .filter(models.IoC.kind == kind, models.IoC.active == 1)
                .all()
            ):
                if ioc.indicator and ioc.indicator in raw_lc:
                    hits.append({
                        "indicator": ioc.indicator,
                        "kind": kind,
                        "threat_type": ioc.threat_type,
                        "confidence": ioc.confidence,
                        "source": "ti",
                    })
                    break  # one hit per kind per event is enough

    return hits


SEVERITY_ORDER = ["low", "medium", "high", "critical"]


def escalate_severity(current: str, max_confidence: int) -> str:
    """If a TI hit fires with high confidence, bump severity by 1-2 steps."""
    if max_confidence >= 90:
        bump = 2
    elif max_confidence >= 70:
        bump = 1
    else:
        bump = 0
    if not bump:
        return current
    try:
        i = SEVERITY_ORDER.index(current)
    except ValueError:
        i = 0
    return SEVERITY_ORDER[min(len(SEVERITY_ORDER) - 1, i + bump)]


def apply_match_to_event(db: Session, event: models.Event) -> list[dict]:
    """Side-effect wrapper: matches + mutates event severity / known_bad + commits."""
    hits = match_event(db, event)
    if not hits:
        return []
    max_conf = max((h["confidence"] for h in hits), default=0)
    event.known_bad = 1
    event.severity = escalate_severity(event.severity, max_conf)
    db.commit()
    return hits


# ─────────────────────────────────────────────────────────────
#  Bootstrap: seed default public feeds on first start
# ─────────────────────────────────────────────────────────────

DEFAULT_FEEDS = [
    {"name": "abuse.ch URLhaus",   "kind": "urlhaus",   "refresh_minutes": 60},
    {"name": "abuse.ch ThreatFox", "kind": "threatfox", "refresh_minutes": 60},
    {"name": "AlienVault OTX",     "kind": "otx",       "refresh_minutes": 60, "api_key_env": "OTX_API_KEY"},
]


def ensure_default_feeds(db: Session) -> None:
    for d in DEFAULT_FEEDS:
        if not db.query(models.TIFeed).filter(models.TIFeed.name == d["name"]).first():
            db.add(models.TIFeed(
                name=d["name"],
                kind=d["kind"],
                refresh_minutes=d["refresh_minutes"],
                api_key_env=d.get("api_key_env", ""),
                enabled=1,
            ))
    db.commit()


def background_refresh() -> None:
    """Entry point for APScheduler. Pulls all enabled feeds."""
    db = SessionLocal()
    try:
        summary = pull_all(db)
        log.info("ti.refresh feeds=%d added=%d errors=%d",
                 summary["feeds"], summary["added"], len(summary["errors"]))
    finally:
        db.close()
