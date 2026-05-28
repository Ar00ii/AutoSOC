from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..audit import log as audit_log
from ..config import settings
from ..db import get_db
from ..detection.rules import quick_classify
from ..geo import lookup_ip
from ..mitre import map_category
from ..schemas import BulkIngestIn, IocImportIn

router = APIRouter(prefix="/api/migrate", tags=["migrate"])


BULK_MAX = 5000
IOC_MAX = 50000


@router.post("/bulk_ingest")
def bulk_ingest(payload: BulkIngestIn, db: Session = Depends(get_db), principal: dict = Depends(require("ingest", "create"))):
    if len(payload.events) > BULK_MAX:
        raise HTTPException(400, f"Too many events (max {BULK_MAX})")
    if payload.source and len(payload.source) > 40:
        raise HTTPException(400, "source too long")
    created = 0
    for item in payload.events:
        raw = item.get("raw", "")
        src_ip = item.get("src_ip", "")
        if not raw or not src_ip:
            continue
        geo = lookup_ip(src_ip)
        sev, cat = quick_classify(payload.source, raw)
        mitre = map_category(cat)
        ts = item.get("timestamp")
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts.replace("Z", ""))
            except Exception:
                ts = datetime.utcnow()
        else:
            ts = datetime.utcnow()
        db.add(
            models.Event(
                timestamp=ts,
                source=payload.source,
                src_ip=src_ip,
                src_country=geo["country"],
                src_city=geo["city"],
                src_lat=geo["lat"],
                src_lng=geo["lng"],
                dst_lat=settings.dst_lat,
                dst_lng=settings.dst_lng,
                severity=item.get("severity") or sev,
                category=item.get("category") or cat,
                mitre_id=mitre["mitre_id"],
                mitre_name=mitre["mitre_name"],
                mitre_tactic=mitre["mitre_tactic"],
                cluster_key=f"{src_ip}|{cat}",
                raw=raw,
                summary=item.get("summary", ""),
                status=item.get("status", "open"),
            )
        )
        created += 1
    db.commit()
    audit_log(db, principal.get("email", "?"), "bulk_ingest", payload.source, f"created={created}")
    return {"created": created, "skipped": len(payload.events) - created}


@router.post("/ioc_import")
def ioc_import(payload: IocImportIn, db: Session = Depends(get_db), principal: dict = Depends(require("recommendations", "execute"))):
    if len(payload.items) > IOC_MAX:
        raise HTTPException(400, f"Too many IOCs (max {IOC_MAX})")
    if payload.severity not in {"low", "medium", "high", "critical"}:
        raise HTTPException(400, "Invalid severity")
    created = 0
    updated = 0
    for ip in payload.items:
        ip = ip.strip()
        if not ip:
            continue
        existing = db.query(models.IpBlock).filter(models.IpBlock.ip == ip).first()
        if existing:
            existing.severity = payload.severity
            existing.reason = payload.reason
            existing.hit_count += 1
            updated += 1
        else:
            db.add(
                models.IpBlock(
                    ip=ip,
                    severity=payload.severity,
                    reason=payload.reason,
                    hit_count=1,
                )
            )
            created += 1
    db.commit()
    audit_log(
        db, principal.get("email", "?"), "ioc_import", payload.reason,
        f"created={created} updated={updated}",
    )
    return {"created": created, "updated": updated}
