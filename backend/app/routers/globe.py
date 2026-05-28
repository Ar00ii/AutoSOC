from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..db import get_db
from ..scoping import apply_event_query

router = APIRouter(prefix="/api/globe", tags=["globe"])


@router.get("/arcs")
def arcs(
    db: Session = Depends(get_db),
    limit: int = Query(300, le=2000),
    hours: int = Query(24, le=168),
    principal: dict = Depends(require("events", "view")),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = (
        db.query(models.Event)
        .filter(models.Event.timestamp >= since)
        .filter(models.Event.src_lat != 0.0)
    )
    q = apply_event_query(q, principal)
    rows = q.order_by(models.Event.timestamp.desc()).limit(limit).all()
    return [
        {
            "startLat": r.src_lat,
            "startLng": r.src_lng,
            "endLat": r.dst_lat,
            "endLng": r.dst_lng,
            "severity": r.severity,
            "category": r.category,
            "src_ip": r.src_ip,
            "src_country": r.src_country or "??",
            "status": r.status,
        }
        for r in rows
    ]


@router.get("/points")
def points(db: Session = Depends(get_db), hours: int = 24, principal: dict = Depends(require("events", "view"))):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = (
        db.query(models.Event)
        .filter(models.Event.timestamp >= since)
        .filter(models.Event.src_lat != 0.0)
    )
    q = apply_event_query(q, principal)
    rows = q.all()
    agg: dict = {}
    for r in rows:
        k = (round(r.src_lat, 2), round(r.src_lng, 2))
        a = agg.setdefault(
            k,
            {
                "lat": r.src_lat,
                "lng": r.src_lng,
                "label": r.src_country or "??",
                "severity": r.severity,
                "hits": 0,
            },
        )
        a["hits"] += 1
        order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        if order.get(r.severity, 0) > order.get(a["severity"], 0):
            a["severity"] = r.severity
    return list(agg.values())
