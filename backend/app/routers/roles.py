import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import perms_within_caller, require
from ..audit import log as audit_log
from ..db import get_db
from ..schemas import RoleIn

router = APIRouter(prefix="/api/roles", tags=["roles"])


RESOURCES = [
    "events", "tickets", "blocks", "recommendations", "reports",
    "agents", "audit", "settings", "users", "roles", "teams", "keys", "intel", "ingest",
    "ti", "cases", "playbooks", "billing",
]
ACTIONS = ["view", "create", "update", "delete", "execute"]


def _serialize(r: models.Role) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "permissions": json.loads(r.permissions or "{}"),
        "is_builtin": r.is_builtin,
    }


@router.get("/_resources")
def resources():
    return {"resources": RESOURCES, "actions": ACTIONS}


@router.get("")
def list_roles(db: Session = Depends(get_db), principal: dict = Depends(require("roles", "view"))):
    return [_serialize(r) for r in db.query(models.Role).order_by(models.Role.name).all()]


@router.post("")
def create_role(payload: RoleIn, db: Session = Depends(get_db), principal: dict = Depends(require("roles", "create"))):
    if not perms_within_caller(principal, payload.permissions):
        raise HTTPException(403, "Cannot grant permissions you do not hold")
    if db.query(models.Role).filter(models.Role.name == payload.name).first():
        raise HTTPException(400, "Role name already exists")
    r = models.Role(
        name=payload.name,
        description=payload.description,
        permissions=json.dumps(payload.permissions),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    audit_log(db, principal.get("email", "?"), "role_create", str(r.id), payload.name)
    return _serialize(r)


@router.patch("/{role_id}")
def update_role(role_id: int, payload: RoleIn, db: Session = Depends(get_db), principal: dict = Depends(require("roles", "update"))):
    r = db.query(models.Role).get(role_id)
    if not r:
        raise HTTPException(404)
    if not perms_within_caller(principal, payload.permissions):
        raise HTTPException(403, "Cannot grant permissions you do not hold")
    # Block a non-admin from escalating an existing role beyond their own grants.
    existing_perms = json.loads(r.permissions or "{}")
    if not perms_within_caller(principal, existing_perms):
        raise HTTPException(403, "Cannot modify a role with permissions you do not hold")
    if r.is_builtin and payload.name != r.name:
        raise HTTPException(400, "Cannot rename built-in role")
    r.description = payload.description
    r.permissions = json.dumps(payload.permissions)
    if not r.is_builtin:
        r.name = payload.name
    db.commit()
    db.refresh(r)
    audit_log(db, principal.get("email", "?"), "role_update", str(r.id), r.name)
    return _serialize(r)


@router.delete("/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("roles", "delete"))):
    r = db.query(models.Role).get(role_id)
    if not r:
        raise HTTPException(404)
    if r.is_builtin:
        raise HTTPException(400, "Cannot delete built-in role")
    if db.query(models.User).filter(models.User.role_id == role_id).first():
        raise HTTPException(400, "Role is in use by one or more users")
    name = r.name
    db.delete(r)
    db.commit()
    audit_log(db, principal.get("email", "?"), "role_delete", str(role_id), name)
    return {"ok": True}
