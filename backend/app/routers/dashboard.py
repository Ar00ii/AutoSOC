from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..db import get_db
from ..scoping import apply_event_query

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/timeseries")
def timeseries(
    db: Session = Depends(get_db),
    hours: int = 24,
    bucket_minutes: int = 60,
    principal: dict = Depends(require("events", "view")),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(models.Event).filter(models.Event.timestamp >= since)
    q = apply_event_query(q, principal)
    rows = q.all()
    buckets: dict = {}
    delta = timedelta(minutes=bucket_minutes)
    start = since.replace(microsecond=0)
    end = datetime.utcnow().replace(microsecond=0)
    t = start
    while t <= end:
        key = t.replace(second=0, minute=(t.minute // bucket_minutes) * bucket_minutes)
        buckets[key.isoformat()] = {"t": key.isoformat(), "low": 0, "medium": 0, "high": 0, "critical": 0, "total": 0}
        t += delta
    for r in rows:
        bucket_min = (r.timestamp.minute // bucket_minutes) * bucket_minutes
        key = r.timestamp.replace(second=0, microsecond=0, minute=bucket_min).isoformat()
        b = buckets.get(key)
        if not b:
            b = {"t": key, "low": 0, "medium": 0, "high": 0, "critical": 0, "total": 0}
            buckets[key] = b
        b[r.severity] = b.get(r.severity, 0) + 1
        b["total"] += 1
    return sorted(buckets.values(), key=lambda x: x["t"])


@router.get("/top")
def top(
    db: Session = Depends(get_db),
    hours: int = 24,
    n: int = 10,
    principal: dict = Depends(require("events", "view")),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(models.Event).filter(models.Event.timestamp >= since)
    q = apply_event_query(q, principal)
    rows = q.all()
    by_ip: dict = {}
    by_country: dict = {}
    by_cat: dict = {}
    by_mitre: dict = {}
    for r in rows:
        by_ip[r.src_ip] = by_ip.get(r.src_ip, 0) + 1
        if r.src_country:
            by_country[r.src_country] = by_country.get(r.src_country, 0) + 1
        by_cat[r.category] = by_cat.get(r.category, 0) + 1
        if r.mitre_id:
            by_mitre[r.mitre_id] = by_mitre.get(r.mitre_id, 0) + 1

    def topn(d):
        return [{"key": k, "count": v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]

    return {
        "ips": topn(by_ip),
        "countries": topn(by_country),
        "categories": topn(by_cat),
        "mitre": topn(by_mitre),
    }
