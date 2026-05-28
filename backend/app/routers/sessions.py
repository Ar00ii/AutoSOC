from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..audit import log as audit_log
from ..auth import current_principal
from ..db import get_db
from ..schemas import SessionOut

router = APIRouter(prefix="/api/auth/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionOut])
def list_sessions(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    if principal.get("id", 0) <= 0:
        raise HTTPException(401, "Bearer auth required")
    return (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.user_id == principal["id"])
        .order_by(models.RefreshToken.created_at.desc())
        .all()
    )


@router.delete("/{session_id}")
def revoke_session(session_id: int, principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    if principal.get("id", 0) <= 0:
        raise HTTPException(401, "Bearer auth required")
    rt = db.query(models.RefreshToken).get(session_id)
    if not rt or rt.user_id != principal["id"]:
        raise HTTPException(404)
    rt.revoked = 1
    db.commit()
    audit_log(db, principal.get("email", "?"), "session_revoke", str(session_id))
    return {"ok": True}


@router.post("/revoke_others")
def revoke_others(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    if principal.get("id", 0) <= 0:
        raise HTTPException(401, "Bearer auth required")
    n = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.user_id == principal["id"])
        .filter(models.RefreshToken.revoked == 0)
        .update({"revoked": 1})
    )
    db.commit()
    audit_log(db, principal.get("email", "?"), "session_revoke_all", "", f"count={n}")
    return {"revoked": n}
