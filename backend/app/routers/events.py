from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..ai import score_line
from ..auth import require
from ..config import settings
from ..correlate import push as correlate_push
from ..db import get_db
from ..detection.rules import quick_classify
from ..geo import lookup_ip
from ..intel import abuseipdb_lookup
from ..mitre import map_category
from ..notify import notify
from ..schemas import EventOut
from ..security import ingest_rate
from ..stream import publish

router = APIRouter(prefix="/api/events", tags=["events"])


from ..scoping import apply_event_query as _apply_team_filters  # noqa: E402


@router.get("", response_model=list[EventOut])
def list_events(
    db: Session = Depends(get_db),
    limit: int = Query(100, le=500),
    severity: str | None = None,
    source: str | None = None,
    category: str | None = None,
    country: str | None = None,
    ip: str | None = None,
    hours: int | None = None,
    q: str | None = None,
    principal: dict = Depends(require("events", "view")),
):
    query = db.query(models.Event).order_by(models.Event.timestamp.desc())
    query = _apply_team_filters(query, principal)
    if severity:
        query = query.filter(models.Event.severity == severity)
    if source:
        query = query.filter(models.Event.source == source)
    if category:
        query = query.filter(models.Event.category == category)
    if country:
        query = query.filter(models.Event.src_country == country.upper())
    if ip:
        query = query.filter(models.Event.src_ip == ip)
    if hours:
        since = datetime.utcnow() - timedelta(hours=hours)
        query = query.filter(models.Event.timestamp >= since)
    if q:
        sanitized = q[:200].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{sanitized}%"
        query = query.filter(
            or_(
                models.Event.raw.like(like, escape="\\"),
                models.Event.summary.like(like, escape="\\"),
                models.Event.src_ip.like(like, escape="\\"),
                models.Event.category.like(like, escape="\\"),
                models.Event.mitre_id.like(like, escape="\\"),
            )
        )
    return query.limit(limit).all()


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db), _=Depends(require("events", "view"))):
    e = db.query(models.Event).get(event_id)
    if not e:
        raise HTTPException(404)
    return e


_ALLOWED_SOURCES = {"ssh", "nginx", "postgres", "syslog", "auth", "windows", "custom"}
_IP_RE_BASIC = None
import re as _re
_IP_RE = _re.compile(r"^[0-9a-fA-F:.]{3,45}$")


@router.post("/ingest", response_model=EventOut)
def ingest(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    use_ai: bool = False,
    principal: dict = Depends(require("ingest", "create")),
):
    ip_addr = request.client.host if request.client else "unknown"
    allowed, _remaining = ingest_rate.check(ip_addr)
    if not allowed:
        raise HTTPException(429, "Ingest rate limit exceeded")
    source = payload.get("source", "unknown")
    if source not in _ALLOWED_SOURCES:
        raise HTTPException(400, "source not in allow-list")
    raw = payload.get("raw", "")
    src_ip = payload.get("src_ip", "")
    if not raw or not src_ip:
        raise HTTPException(400, "raw and src_ip required")
    if not _IP_RE.match(src_ip):
        raise HTTPException(400, "src_ip is not a valid address")
    if len(raw) > 8000:
        raise HTTPException(400, "raw too large (max 8000 chars)")
    geo = lookup_ip(src_ip)
    if use_ai:
        scored = score_line(source, raw)
    else:
        sev, cat = quick_classify(source, raw)
        scored = {"severity": sev, "category": cat, "summary": ""}

    intel = abuseipdb_lookup(src_ip)
    mitre = map_category(scored["category"])
    cluster_key = f"{src_ip}|{scored['category']}"
    known_bad = 1 if intel["abuse_score"] >= 50 or intel["is_tor"] else 0

    severity = scored["severity"]
    summary = scored["summary"]

    correlated = correlate_push(src_ip, scored["category"], severity)
    if correlated:
        severity = correlated["severity"]
        summary = correlated["summary"]
        publish("correlation", {"rule": correlated["rule"], "ip": src_ip, "severity": severity})

    e = models.Event(
        source=source,
        src_ip=src_ip,
        src_country=geo["country"],
        src_city=geo["city"],
        src_lat=geo["lat"],
        src_lng=geo["lng"],
        dst_lat=settings.dst_lat,
        dst_lng=settings.dst_lng,
        severity=severity,
        category=scored["category"],
        mitre_id=mitre["mitre_id"],
        mitre_name=mitre["mitre_name"],
        mitre_tactic=mitre["mitre_tactic"],
        abuse_score=intel["abuse_score"],
        known_bad=known_bad,
        cluster_key=cluster_key,
        raw=raw,
        summary=summary,
        status="open",
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    publish(
        "event",
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat(),
            "src_ip": e.src_ip,
            "src_country": e.src_country,
            "src_lat": e.src_lat,
            "src_lng": e.src_lng,
            "dst_lat": e.dst_lat,
            "dst_lng": e.dst_lng,
            "severity": e.severity,
            "category": e.category,
            "mitre_id": e.mitre_id,
            "abuse_score": e.abuse_score,
        },
    )

    if severity == "critical":
        notify(
            title=f"CRITICAL {scored['category']} from {src_ip}",
            text=raw[:300],
            severity=severity,
        )
        try:
            from ..scheduler import trigger_on_critical
            trigger_on_critical({
                "id": e.id,
                "src_ip": e.src_ip,
                "src_country": e.src_country,
                "category": e.category,
                "severity": e.severity,
                "summary": e.summary,
            })
        except Exception:
            pass

    return e


@router.get("/_stats/summary")
def stats(db: Session = Depends(get_db), principal: dict = Depends(require("events", "view"))):
    since = datetime.utcnow() - timedelta(hours=24)
    q = db.query(models.Event).filter(models.Event.timestamp >= since)
    q = _apply_team_filters(q, principal)
    rows = q.all()
    by_country: dict = {}
    by_cat: dict = {}
    for r in rows:
        if r.src_country:
            by_country[r.src_country] = by_country.get(r.src_country, 0) + 1
        by_cat[r.category] = by_cat.get(r.category, 0) + 1
    top_country = max(by_country.items(), key=lambda x: x[1])[0] if by_country else "-"
    top_cat = max(by_cat.items(), key=lambda x: x[1])[0] if by_cat else "-"
    crit = sum(1 for r in rows if r.severity == "critical")
    blocked = db.query(models.IpBlock).filter(models.IpBlock.applied == 1).count()
    open_t = db.query(models.Ticket).filter(models.Ticket.status == "open").count()
    return {
        "events_24h": len(rows),
        "critical_24h": crit,
        "blocked_ips": blocked,
        "open_tickets": open_t,
        "top_country": top_country,
        "top_category": top_cat,
    }
