from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import new_api_key, require
from ..audit import log as audit_log
from ..db import get_db
from ..schemas import ApiKeyCreated, ApiKeyIn, ApiKeyOut

router = APIRouter(prefix="/api/keys", tags=["keys"])


@router.get("", response_model=list[ApiKeyOut])
def list_keys(db: Session = Depends(get_db), principal: dict = Depends(require("keys", "view"))):
    return db.query(models.ApiKey).order_by(models.ApiKey.created_at.desc()).all()


@router.post("", response_model=ApiKeyCreated)
def create_key(payload: ApiKeyIn, db: Session = Depends(get_db), principal: dict = Depends(require("keys", "create"))):
    if not db.query(models.Role).get(payload.role_id):
        raise HTTPException(400, "Role does not exist")
    raw, prefix, hashed = new_api_key()
    k = models.ApiKey(
        name=payload.name,
        key_prefix=prefix,
        key_hash=hashed,
        role_id=payload.role_id,
    )
    db.add(k)
    db.commit()
    db.refresh(k)
    audit_log(db, principal.get("email", "?"), "apikey_create", str(k.id), payload.name)
    return ApiKeyCreated(**ApiKeyOut.model_validate(k).model_dump(), key=raw)


@router.delete("/{key_id}")
def revoke_key(key_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("keys", "delete"))):
    k = db.query(models.ApiKey).get(key_id)
    if not k:
        raise HTTPException(404)
    k.revoked = 1
    db.commit()
    audit_log(db, principal.get("email", "?"), "apikey_revoke", str(key_id), k.name)
    return {"ok": True}
