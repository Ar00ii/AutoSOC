"""/api/ti — threat intelligence feeds and IoC inventory."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models, ti
from ..auth import require
from ..db import get_db

router = APIRouter(prefix="/api/ti", tags=["ti"])


class FeedIn(BaseModel):
    name: str = Field(..., max_length=120)
    kind: str = Field(..., pattern=r"^(urlhaus|threatfox|otx|misp|generic)$")
    url: str = Field("", max_length=512)
    api_key_env: str = Field("", max_length=80)
    refresh_minutes: int = Field(60, ge=5, le=1440)
    enabled: bool = True


def _serialize_feed(f: models.TIFeed) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "kind": f.kind,
        "url": f.url,
        "api_key_env": f.api_key_env,
        "refresh_minutes": f.refresh_minutes,
        "enabled": bool(f.enabled),
        "last_pull": f.last_pull.isoformat() if f.last_pull else None,
        "last_count": f.last_count,
        "last_error": f.last_error,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


def _serialize_ioc(i: models.IoC) -> dict:
    return {
        "id": i.id,
        "feed_id": i.feed_id,
        "indicator": i.indicator,
        "kind": i.kind,
        "threat_type": i.threat_type,
        "confidence": i.confidence,
        "tags": json.loads(i.tags or "[]"),
        "first_seen": i.first_seen.isoformat() if i.first_seen else None,
        "last_seen": i.last_seen.isoformat() if i.last_seen else None,
        "expires_at": i.expires_at.isoformat() if i.expires_at else None,
        "source_ref": i.source_ref,
        "active": bool(i.active),
    }


@router.get("/feeds")
def list_feeds(db: Session = Depends(get_db), _=Depends(require("ti", "view"))):
    return [_serialize_feed(f) for f in db.query(models.TIFeed).order_by(models.TIFeed.id).all()]


@router.post("/feeds")
def create_feed(
    payload: FeedIn,
    db: Session = Depends(get_db),
    _=Depends(require("ti", "create")),
):
    if db.query(models.TIFeed).filter(models.TIFeed.name == payload.name).first():
        raise HTTPException(409, "name already exists")
    feed = models.TIFeed(
        name=payload.name,
        kind=payload.kind,
        url=payload.url,
        api_key_env=payload.api_key_env,
        refresh_minutes=payload.refresh_minutes,
        enabled=1 if payload.enabled else 0,
    )
    db.add(feed)
    db.commit()
    db.refresh(feed)
    return _serialize_feed(feed)


@router.post("/feeds/{feed_id}/pull")
def pull_one(
    feed_id: int,
    db: Session = Depends(get_db),
    _=Depends(require("ti", "execute")),
):
    feed = db.query(models.TIFeed).get(feed_id)
    if not feed:
        raise HTTPException(404)
    n, err = ti.pull_feed(db, feed)
    return {"added": n, "error": err, "feed": _serialize_feed(feed)}


@router.post("/feeds/pull_all")
def pull_all(
    db: Session = Depends(get_db),
    _=Depends(require("ti", "execute")),
):
    return ti.pull_all(db)


@router.delete("/feeds/{feed_id}")
def delete_feed(
    feed_id: int,
    db: Session = Depends(get_db),
    _=Depends(require("ti", "delete")),
):
    feed = db.query(models.TIFeed).get(feed_id)
    if not feed:
        raise HTTPException(404)
    db.query(models.IoC).filter(models.IoC.feed_id == feed_id).update({"active": 0})
    db.delete(feed)
    db.commit()
    return {"ok": True}


@router.get("/iocs")
def list_iocs(
    kind: str | None = Query(None, pattern=r"^(ip|domain|url|md5|sha256|sha1|email)$"),
    q: str | None = Query(None, max_length=200),
    min_confidence: int = Query(0, ge=0, le=100),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    _=Depends(require("ti", "view")),
):
    query = db.query(models.IoC).filter(models.IoC.active == 1)
    if kind:
        query = query.filter(models.IoC.kind == kind)
    if min_confidence:
        query = query.filter(models.IoC.confidence >= min_confidence)
    if q:
        query = query.filter(models.IoC.indicator.like(f"%{q.lower()}%"))
    rows = query.order_by(models.IoC.last_seen.desc()).limit(limit).all()
    return [_serialize_ioc(i) for i in rows]


@router.get("/stats")
def stats(db: Session = Depends(get_db), _=Depends(require("ti", "view"))):
    total = db.query(models.IoC).filter(models.IoC.active == 1).count()
    by_kind: dict[str, int] = {}
    for kind in ("ip", "domain", "url", "sha256", "md5", "sha1", "email"):
        by_kind[kind] = (
            db.query(models.IoC)
            .filter(models.IoC.active == 1, models.IoC.kind == kind)
            .count()
        )
    feeds = db.query(models.TIFeed).filter(models.TIFeed.enabled == 1).count()
    return {"total_active": total, "by_kind": by_kind, "enabled_feeds": feeds}
