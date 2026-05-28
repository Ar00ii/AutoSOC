from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from .. import models
from ..audit import log as audit_log
from ..auth import current_principal, verify_password
from ..db import get_db
from ..mfa import (
    load_secret,
    new_totp_secret,
    provisioning_uri,
    qr_png_data_url,
    store_secret,
    verify_code,
)
from ..schemas import MfaConfirmIn, MfaSetupOut

router = APIRouter(prefix="/api/auth/mfa", tags=["mfa"])


def _require_user(principal: dict, db: Session) -> models.User:
    if principal.get("id", 0) <= 0:
        raise HTTPException(401, "Bearer auth required")
    user = db.query(models.User).get(principal["id"])
    if not user:
        raise HTTPException(401, "User not found")
    return user


@router.get("/status")
def status(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    user = _require_user(principal, db)
    return {"enabled": user.mfa_enabled == 1}


@router.post("/setup", response_model=MfaSetupOut)
def setup(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    user = _require_user(principal, db)
    if user.mfa_enabled == 1:
        raise HTTPException(400, "MFA already enabled; disable it first.")
    secret = new_totp_secret()
    uri = provisioning_uri(secret, user.email)
    user.totp_secret_enc = store_secret(secret)
    db.commit()
    return MfaSetupOut(secret=secret, otpauth_uri=uri, qr_data_url=qr_png_data_url(uri))


@router.post("/confirm")
def confirm(
    payload: MfaConfirmIn,
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
):
    user = _require_user(principal, db)
    if user.mfa_enabled == 1:
        raise HTTPException(400, "MFA already enabled")
    secret = load_secret(user.totp_secret_enc)
    if not secret or not verify_code(secret, payload.code):
        raise HTTPException(400, "Invalid code")
    user.mfa_enabled = 1
    db.commit()
    audit_log(db, user.email, "mfa_enabled", "")
    return {"ok": True}


@router.post("/disable")
def disable(
    payload: dict,
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
):
    user = _require_user(principal, db)
    pwd = (payload or {}).get("password", "")
    if not verify_password(pwd, user.password_hash):
        raise HTTPException(401, "Password incorrect")
    user.mfa_enabled = 0
    user.totp_secret_enc = ""
    db.commit()
    audit_log(db, user.email, "mfa_disabled", "")
    return {"ok": True}
