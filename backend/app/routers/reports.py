from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..ai import generate_report
from ..auth import require, require_ai
from ..db import get_db
from ..schemas import ReportOut

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("", response_model=list[ReportOut])
def list_reports(db: Session = Depends(get_db), _=Depends(require("reports", "view"))):
    return (
        db.query(models.Report)
        .order_by(models.Report.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: int, db: Session = Depends(get_db), _=Depends(require("reports", "view"))):
    r = db.query(models.Report).get(report_id)
    if not r:
        raise HTTPException(404)
    return r


@router.post("/generate", response_model=ReportOut)
def generate(period: str = "24h", db: Session = Depends(get_db), _=Depends(require("reports", "create")), _ai: dict = Depends(require_ai)):
    if period not in {"1h", "24h", "7d", "30d"}:
        raise HTTPException(400, "Invalid period")
    hours = {"1h": 1, "24h": 24, "7d": 168, "30d": 720}.get(period, 24)
    since = datetime.utcnow() - timedelta(hours=hours)
    events = (
        db.query(models.Event)
        .filter(models.Event.timestamp >= since)
        .order_by(models.Event.timestamp.desc())
        .all()
    )
    payload = [
        {
            "timestamp": e.timestamp.isoformat(),
            "src_ip": e.src_ip,
            "src_country": e.src_country,
            "severity": e.severity,
            "category": e.category,
            "summary": e.summary,
        }
        for e in events
    ]
    body = generate_report(payload, period)
    r = models.Report(
        title=f"Incident report {period} {datetime.utcnow():%Y-%m-%d %H:%M}",
        period=period,
        body=body,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
