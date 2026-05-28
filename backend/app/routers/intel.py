import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..ai import investigate_ip
from ..auth import require
from ..db import get_db
from ..geo import lookup_ip
from ..intel import abuseipdb_lookup
from ..schemas import IpInvestigationOut
from ..scoping import apply_event_query

router = APIRouter(prefix="/api/intel", tags=["intel"])

_IP_RE = re.compile(r"^[0-9a-fA-F:.]{3,45}$")


@router.get("/ip/{ip}", response_model=IpInvestigationOut)
def investigate(ip: str, db: Session = Depends(get_db), principal: dict = Depends(require("intel", "view"))):
    if not _IP_RE.match(ip):
        raise HTTPException(400, "Invalid IP")
    geo = lookup_ip(ip)
    intel = abuseipdb_lookup(ip)
    q = db.query(models.Event).filter(models.Event.src_ip == ip)
    q = apply_event_query(q, principal)
    events = q.order_by(models.Event.timestamp.desc()).all()
    if not events and principal.get("role") != "admin":
        raise HTTPException(404, "No events for that IP within your scope")
    by_cat: dict = {}
    by_sev: dict = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for e in events:
        by_cat[e.category] = by_cat.get(e.category, 0) + 1
        by_sev[e.severity] = by_sev.get(e.severity, 0) + 1
    top_cats = [
        {"category": c, "count": n}
        for c, n in sorted(by_cat.items(), key=lambda x: -x[1])[:5]
    ]
    first_seen = min((e.timestamp for e in events), default=None)
    last_seen = max((e.timestamp for e in events), default=None)
    payload = [
        {
            "timestamp": e.timestamp.isoformat(),
            "severity": e.severity,
            "category": e.category,
            "summary": e.summary,
            "raw": e.raw,
        }
        for e in events
    ]
    ai_summary = investigate_ip(ip, {**geo, **intel}, payload)
    return IpInvestigationOut(
        ip=ip,
        country=intel.get("country_name") or geo.get("country_name", ""),
        city=geo.get("city", ""),
        abuse_score=intel.get("abuse_score", 0),
        isp=intel.get("isp", ""),
        domain=intel.get("domain", ""),
        usage_type=intel.get("usage_type", ""),
        total_reports=intel.get("total_reports", 0),
        is_tor=intel.get("is_tor", False),
        event_count=len(events),
        first_seen=first_seen,
        last_seen=last_seen,
        top_categories=top_cats,
        severity_breakdown=by_sev,
        ai_summary=ai_summary,
    )
