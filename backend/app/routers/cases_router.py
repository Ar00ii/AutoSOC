"""/api/cases — case (incident) management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import cases as cases_mod
from .. import models
from ..audit import log as audit_log
from ..auth import require
from ..db import get_db

router = APIRouter(prefix="/api/cases", tags=["cases"])


class CaseIn(BaseModel):
    title: str = Field(..., max_length=200)
    severity: str = Field("medium", pattern=r"^(low|medium|high|critical)$")
    category: str = Field("unknown", max_length=40)
    assignee: str = Field("", max_length=120)
    summary: str = Field("", max_length=4000)
    event_ids: list[int] = Field(default_factory=list)


class CaseStatusIn(BaseModel):
    status: str = Field(..., pattern=r"^(open|investigating|contained|closed)$")


class NoteIn(BaseModel):
    body: str = Field(..., max_length=8000)


class AttachIn(BaseModel):
    event_ids: list[int] = Field(..., min_length=1, max_length=200)


@router.get("")
def list_cases(
    status: str | None = Query(None, pattern=r"^(open|investigating|contained|closed)$"),
    severity: str | None = Query(None, pattern=r"^(low|medium|high|critical)$"),
    assignee: str | None = Query(None, max_length=120),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require("cases", "view")),
):
    q = db.query(models.Case)
    if status:
        q = q.filter(models.Case.status == status)
    if severity:
        q = q.filter(models.Case.severity == severity)
    if assignee:
        q = q.filter(models.Case.assignee == assignee)
    rows = q.order_by(models.Case.created_at.desc()).limit(limit).all()
    return [cases_mod.serialize_case(c, db) for c in rows]


@router.post("")
def create_case(
    payload: CaseIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("cases", "create")),
):
    case = cases_mod.create_case(
        db,
        title=payload.title,
        severity=payload.severity,
        category=payload.category,
        assignee=payload.assignee,
        summary=payload.summary,
        event_ids=payload.event_ids,
        actor=principal.get("email", "?"),
    )
    audit_log(db, principal.get("email", "?"), "case.create", str(case.id), case.case_number)
    return cases_mod.serialize_case(case, db)


@router.get("/{case_id}")
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    _=Depends(require("cases", "view")),
):
    case = db.query(models.Case).get(case_id)
    if not case:
        raise HTTPException(404)
    return cases_mod.serialize_case(case, db)


@router.get("/{case_id}/timeline")
def get_timeline(
    case_id: int,
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _=Depends(require("cases", "view")),
):
    case = db.query(models.Case).get(case_id)
    if not case:
        raise HTTPException(404)
    rows = (
        db.query(models.CaseTimeline)
        .filter(models.CaseTimeline.case_id == case_id)
        .order_by(models.CaseTimeline.timestamp.asc())
        .limit(limit)
        .all()
    )
    return [cases_mod.serialize_timeline(t) for t in rows]


@router.get("/{case_id}/events")
def get_events(
    case_id: int,
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _=Depends(require("cases", "view")),
):
    rows = (
        db.query(models.Event)
        .join(models.CaseEvent, models.CaseEvent.event_id == models.Event.id)
        .filter(models.CaseEvent.case_id == case_id)
        .order_by(models.Event.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "src_ip": e.src_ip,
            "src_country": e.src_country,
            "severity": e.severity,
            "category": e.category,
            "mitre_id": e.mitre_id,
            "mitre_tactic": e.mitre_tactic,
            "abuse_score": e.abuse_score,
            "known_bad": bool(e.known_bad),
        }
        for e in rows
    ]


@router.patch("/{case_id}/status")
def patch_status(
    case_id: int,
    payload: CaseStatusIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("cases", "update")),
):
    case = db.query(models.Case).get(case_id)
    if not case:
        raise HTTPException(404)
    cases_mod.set_status(db, case, payload.status, principal.get("email", "?"))
    audit_log(db, principal.get("email", "?"), "case.status", str(case.id), payload.status)
    return cases_mod.serialize_case(case, db)


@router.post("/{case_id}/notes")
def post_note(
    case_id: int,
    payload: NoteIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("cases", "update")),
):
    case = db.query(models.Case).get(case_id)
    if not case:
        raise HTTPException(404)
    note = cases_mod.add_note(db, case, actor=principal.get("email", "?"), body=payload.body)
    audit_log(db, principal.get("email", "?"), "case.note", str(case.id), payload.body[:80])
    return cases_mod.serialize_timeline(note)


@router.post("/{case_id}/attach")
def attach(
    case_id: int,
    payload: AttachIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("cases", "update")),
):
    case = db.query(models.Case).get(case_id)
    if not case:
        raise HTTPException(404)
    added = cases_mod.attach_events(
        db, case, payload.event_ids, actor=principal.get("email", "?")
    )
    audit_log(db, principal.get("email", "?"), "case.attach", str(case.id), f"events={added}")
    return {"added": added, "case": cases_mod.serialize_case(case, db)}


@router.get("/{case_id}/stats")
def case_stats(
    case_id: int,
    db: Session = Depends(get_db),
    _=Depends(require("cases", "view")),
):
    case = db.query(models.Case).get(case_id)
    if not case:
        raise HTTPException(404)
    event_count = (
        db.query(models.CaseEvent).filter(models.CaseEvent.case_id == case_id).count()
    )
    timeline_count = (
        db.query(models.CaseTimeline).filter(models.CaseTimeline.case_id == case_id).count()
    )
    return {
        "case_id": case_id,
        "event_count": event_count,
        "timeline_count": timeline_count,
        "kill_chain_length": len(cases_mod.serialize_case(case, db)["kill_chain"]),
    }
