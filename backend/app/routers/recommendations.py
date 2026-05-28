from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..audit import log as audit_log
from ..auth import require
from ..db import get_db
from ..firewall import apply_block
from ..schemas import IpBlockOut

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("", response_model=list[IpBlockOut])
def list_recommendations(db: Session = Depends(get_db), _=Depends(require("recommendations", "view"))):
    return (
        db.query(models.IpBlock)
        .order_by(models.IpBlock.recommended_at.desc())
        .all()
    )


@router.post("/recompute")
def recompute(db: Session = Depends(get_db), threshold: int = 5, hours: int = 24, principal: dict = Depends(require("recommendations", "execute"))):
    threshold = max(1, min(threshold, 10000))
    hours = max(1, min(hours, 720))
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(models.Event)
        .filter(models.Event.timestamp >= since)
        .filter(models.Event.severity.in_(["medium", "high", "critical"]))
        .all()
    )
    by_ip: dict = {}
    sev_rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    for r in rows:
        b = by_ip.setdefault(
            r.src_ip,
            {"country": r.src_country or "??", "severity": r.severity, "hits": 0, "reason": r.category},
        )
        b["hits"] += 1
        if sev_rank.get(r.severity, 0) > sev_rank.get(b["severity"], 0):
            b["severity"] = r.severity
            b["reason"] = r.category
    created = 0
    for ip, info in by_ip.items():
        if info["hits"] < threshold:
            continue
        existing = db.query(models.IpBlock).filter(models.IpBlock.ip == ip).first()
        if existing:
            existing.hit_count = info["hits"]
            existing.severity = info["severity"]
            existing.reason = info["reason"]
        else:
            db.add(
                models.IpBlock(
                    ip=ip,
                    country=info["country"],
                    severity=info["severity"],
                    reason=info["reason"],
                    hit_count=info["hits"],
                )
            )
            created += 1
    db.commit()
    audit_log(db, principal.get("email", "?"), "recompute_recommendations", "engine", f"created={created} threshold={threshold}")
    return {"created": created, "evaluated": len(by_ip)}


@router.post("/{rec_id}/apply", response_model=IpBlockOut)
def apply_rec(rec_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("recommendations", "execute"))):
    r = db.query(models.IpBlock).get(rec_id)
    if not r:
        raise HTTPException(404)
    result = apply_block(r.ip)
    r.applied = 1
    r.firewall_mode = result["mode"]
    r.firewall_output = result["output"][:500]
    db.commit()
    db.refresh(r)
    audit_log(db, principal.get("email", "?"), "block_ip", r.ip, f"mode={result['mode']} applied={result['applied']}")
    return r


@router.delete("/{rec_id}")
def dismiss(rec_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("recommendations", "execute"))):
    r = db.query(models.IpBlock).get(rec_id)
    if not r:
        raise HTTPException(404)
    ip = r.ip
    db.delete(r)
    db.commit()
    audit_log(db, principal.get("email", "?"), "dismiss_recommendation", ip)
    return {"ok": True}
