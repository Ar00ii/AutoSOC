import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import hash_password, require
from ..audit import log as audit_log
from ..db import get_db
from ..schemas import UserIn, UserOut, UserUpdate
from ..security import password_complaint, password_strong

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), principal: dict = Depends(require("users", "view"))):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.post("", response_model=UserOut)
def create_user(payload: UserIn, db: Session = Depends(get_db), principal: dict = Depends(require("users", "create"))):
    if len(payload.email) > 200 or len(payload.name) > 200:
        raise HTTPException(400, "Field too long")
    if not password_strong(payload.password):
        raise HTTPException(400, password_complaint())
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(400, "Email already in use")
    if not db.query(models.Role).get(payload.role_id):
        raise HTTPException(400, "Invalid request")
    u = models.User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role_id=payload.role_id,
        team_id=payload.team_id,
        active=1 if payload.active else 0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    audit_log(db, principal.get("email", "?"), "user_create", str(u.id), payload.email)
    return u


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), principal: dict = Depends(require("users", "update"))):
    u = db.query(models.User).get(user_id)
    if not u:
        raise HTTPException(404)
    changed = []
    if payload.name is not None:
        u.name = payload.name
        changed.append("name")
    if payload.password:
        if not password_strong(payload.password):
            raise HTTPException(400, password_complaint())
        u.password_hash = hash_password(payload.password)
        changed.append("password")
    if payload.role_id is not None:
        if not db.query(models.Role).get(payload.role_id):
            raise HTTPException(400, "Role does not exist")
        u.role_id = payload.role_id
        changed.append(f"role_id={payload.role_id}")
    if payload.team_id is not None:
        u.team_id = payload.team_id
        changed.append(f"team_id={payload.team_id}")
    if payload.active is not None:
        u.active = 1 if payload.active else 0
        changed.append(f"active={u.active}")
    db.commit()
    db.refresh(u)
    audit_log(db, principal.get("email", "?"), "user_update", str(u.id), ",".join(changed))
    return u


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("users", "delete"))):
    u = db.query(models.User).get(user_id)
    if not u:
        raise HTTPException(404)
    email = u.email
    db.delete(u)
    db.commit()
    audit_log(db, principal.get("email", "?"), "user_delete", str(user_id), email)
    return {"ok": True}
