import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..audit import log as audit_log
from ..db import get_db
from ..schemas import TeamIn

router = APIRouter(prefix="/api/teams", tags=["teams"])


def _serialize(t: models.Team) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "event_filters": json.loads(t.event_filters or "{}"),
    }


@router.get("")
def list_teams(db: Session = Depends(get_db), principal: dict = Depends(require("teams", "view"))):
    return [_serialize(t) for t in db.query(models.Team).order_by(models.Team.name).all()]


@router.post("")
def create_team(payload: TeamIn, db: Session = Depends(get_db), principal: dict = Depends(require("teams", "create"))):
    if db.query(models.Team).filter(models.Team.name == payload.name).first():
        raise HTTPException(400, "Team name already exists")
    t = models.Team(
        name=payload.name,
        description=payload.description,
        event_filters=json.dumps(payload.event_filters),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    audit_log(db, principal.get("email", "?"), "team_create", str(t.id), payload.name)
    return _serialize(t)


@router.patch("/{team_id}")
def update_team(team_id: int, payload: TeamIn, db: Session = Depends(get_db), principal: dict = Depends(require("teams", "update"))):
    t = db.query(models.Team).get(team_id)
    if not t:
        raise HTTPException(404)
    t.name = payload.name
    t.description = payload.description
    t.event_filters = json.dumps(payload.event_filters)
    db.commit()
    db.refresh(t)
    audit_log(db, principal.get("email", "?"), "team_update", str(t.id), t.name)
    return _serialize(t)


@router.delete("/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("teams", "delete"))):
    t = db.query(models.Team).get(team_id)
    if not t:
        raise HTTPException(404)
    db.query(models.User).filter(models.User.team_id == team_id).update({"team_id": None})
    name = t.name
    db.delete(t)
    db.commit()
    audit_log(db, principal.get("email", "?"), "team_delete", str(team_id), name)
    return {"ok": True}
