"""/api/playbooks — YAML-defined incident response flows."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models, playbooks as pb_mod
from ..audit import log as audit_log
from ..auth import require
from ..db import get_db

router = APIRouter(prefix="/api/playbooks", tags=["playbooks"])


class PlaybookIn(BaseModel):
    name: str = Field(..., max_length=120)
    description: str = Field("", max_length=500)
    trigger_kind: str = Field("manual", pattern=r"^(manual|on_event|on_case|scheduled)$")
    trigger_filter: dict = Field(default_factory=dict)
    yaml_body: str = Field(..., max_length=64_000)
    require_approval: bool = True
    enabled: bool = True


class RunIn(BaseModel):
    event_id: int | None = None
    case_id: int | None = None
    extra_ctx: dict = Field(default_factory=dict)


class ApproveIn(BaseModel):
    approved: bool


def _serialize(p: models.Playbook) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "trigger_kind": p.trigger_kind,
        "trigger_filter": json.loads(p.trigger_filter or "{}"),
        "yaml_body": p.yaml_body,
        "require_approval": bool(p.require_approval),
        "enabled": bool(p.enabled),
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "created_by": p.created_by,
    }


def _serialize_run(r: models.PlaybookRun) -> dict:
    return {
        "id": r.id,
        "playbook_id": r.playbook_id,
        "case_id": r.case_id,
        "event_id": r.event_id,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "status": r.status,
        "triggered_by": r.triggered_by,
        "steps": json.loads(r.steps or "[]"),
        "output": json.loads(r.output) if r.output and r.output.startswith("{") else r.output,
        "error": r.error,
        "pending_approval_step": r.pending_approval_step,
    }


@router.get("")
def list_playbooks(
    db: Session = Depends(get_db),
    _=Depends(require("playbooks", "view")),
):
    return [_serialize(p) for p in db.query(models.Playbook).order_by(models.Playbook.id).all()]


@router.post("")
def create_playbook(
    payload: PlaybookIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("playbooks", "create")),
):
    if db.query(models.Playbook).filter(models.Playbook.name == payload.name).first():
        raise HTTPException(409, "name already exists")

    # Validate YAML before saving so bad playbooks can't be persisted
    try:
        pb_mod.parse_playbook(payload.yaml_body)
    except Exception as e:
        raise HTTPException(400, f"invalid playbook YAML: {e}") from e

    pb = models.Playbook(
        name=payload.name,
        description=payload.description,
        trigger_kind=payload.trigger_kind,
        trigger_filter=json.dumps(payload.trigger_filter),
        yaml_body=payload.yaml_body,
        require_approval=1 if payload.require_approval else 0,
        enabled=1 if payload.enabled else 0,
        created_by=principal.get("email", "?"),
    )
    db.add(pb)
    db.commit()
    db.refresh(pb)
    audit_log(db, principal.get("email", "?"), "playbook.create", str(pb.id), pb.name)
    return _serialize(pb)


@router.get("/{playbook_id}")
def get_playbook(
    playbook_id: int,
    db: Session = Depends(get_db),
    _=Depends(require("playbooks", "view")),
):
    pb = db.query(models.Playbook).get(playbook_id)
    if not pb:
        raise HTTPException(404)
    return _serialize(pb)


@router.put("/{playbook_id}")
def update_playbook(
    playbook_id: int,
    payload: PlaybookIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("playbooks", "update")),
):
    pb = db.query(models.Playbook).get(playbook_id)
    if not pb:
        raise HTTPException(404)
    try:
        pb_mod.parse_playbook(payload.yaml_body)
    except Exception as e:
        raise HTTPException(400, f"invalid YAML: {e}") from e

    pb.name = payload.name
    pb.description = payload.description
    pb.trigger_kind = payload.trigger_kind
    pb.trigger_filter = json.dumps(payload.trigger_filter)
    pb.yaml_body = payload.yaml_body
    pb.require_approval = 1 if payload.require_approval else 0
    pb.enabled = 1 if payload.enabled else 0
    db.commit()
    db.refresh(pb)
    audit_log(db, principal.get("email", "?"), "playbook.update", str(pb.id), pb.name)
    return _serialize(pb)


@router.delete("/{playbook_id}")
def delete_playbook(
    playbook_id: int,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("playbooks", "delete")),
):
    pb = db.query(models.Playbook).get(playbook_id)
    if not pb:
        raise HTTPException(404)
    name = pb.name
    db.delete(pb)
    db.commit()
    audit_log(db, principal.get("email", "?"), "playbook.delete", str(playbook_id), name)
    return {"ok": True}


@router.post("/{playbook_id}/run")
def run_playbook(
    playbook_id: int,
    payload: RunIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("playbooks", "execute")),
):
    pb = db.query(models.Playbook).get(playbook_id)
    if not pb:
        raise HTTPException(404)
    if pb.enabled != 1:
        raise HTTPException(400, "playbook disabled")

    event = db.query(models.Event).get(payload.event_id) if payload.event_id else None
    case = db.query(models.Case).get(payload.case_id) if payload.case_id else None

    pb_run = pb_mod.run(
        db, pb, event=event, case=case, extra_ctx=payload.extra_ctx,
        principal=principal, triggered_by=principal.get("email", "?"),
    )
    audit_log(
        db, principal.get("email", "?"), "playbook.run",
        str(pb.id), f"run_id={pb_run.id} status={pb_run.status}",
    )
    return _serialize_run(pb_run)


@router.get("/{playbook_id}/runs")
def list_runs(
    playbook_id: int,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _=Depends(require("playbooks", "view")),
):
    rows = (
        db.query(models.PlaybookRun)
        .filter(models.PlaybookRun.playbook_id == playbook_id)
        .order_by(models.PlaybookRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_run(r) for r in rows]


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    _=Depends(require("playbooks", "view")),
):
    r = db.query(models.PlaybookRun).get(run_id)
    if not r:
        raise HTTPException(404)
    return _serialize_run(r)


@router.post("/runs/{run_id}/approve")
def approve_run(
    run_id: int,
    payload: ApproveIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("playbooks", "execute")),
):
    r = db.query(models.PlaybookRun).get(run_id)
    if not r:
        raise HTTPException(404)
    if r.status != "waiting_approval":
        raise HTTPException(400, "run is not waiting for approval")
    r = pb_mod.resume_after_approval(db, r, approved=payload.approved, actor=principal.get("email", "?"))
    audit_log(
        db, principal.get("email", "?"), "playbook.approve",
        str(r.id), "approved" if payload.approved else "denied",
    )
    return _serialize_run(r)
