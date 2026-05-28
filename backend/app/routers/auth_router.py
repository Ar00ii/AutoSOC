from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models
from ..audit import log as audit_log
from ..auth import (
    consume_jti,
    create_access_token,
    create_mfa_challenge,
    create_refresh_token,
    current_principal,
    decode_token,
    hash_password,
    verify_password,
)
from ..config import settings
from ..db import get_db
from ..mfa import load_secret, verify_code
from ..notify import email_configured, send_email
from ..schemas import (
    ForgotPasswordIn,
    LoginIn,
    LogoutIn,
    MfaVerifyIn,
    PasswordChangeIn,
    RefreshIn,
    ResetPasswordIn,
    TokenOut,
)
import jwt as _pyjwt
import logging
import secrets as _secrets
from datetime import timedelta
from ..security import (
    account_lockout,
    client_ip,
    login_rate,
    mfa_rate,
    password_complaint,
    password_strong,
    sse_tickets,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_token_response(user: models.User, db: Session, request: Request) -> TokenOut:
    import json as _json
    role = db.query(models.Role).get(user.role_id)
    role_name = role.name if role else "viewer"
    perms = _json.loads(role.permissions or "{}") if role else {}
    user.last_login = datetime.utcnow()
    db.commit()
    access = create_access_token(user.id, user.email, role_name)
    ip = client_ip(request)
    ua = request.headers.get("user-agent", "")
    refresh, _jti = create_refresh_token(user.id, db, ip=ip, ua=ua)
    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": role_name,
            "team_id": user.team_id,
            "mfa_enabled": user.mfa_enabled,
            "permissions": perms,
        },
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    allowed, _ = login_rate.check(ip)
    if not allowed:
        raise HTTPException(429, "Too many login attempts. Try again in a minute.")
    if account_lockout.is_locked(payload.email):
        raise HTTPException(423, "Account temporarily locked due to repeated failed attempts.")

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or user.active != 1 or not verify_password(payload.password, user.password_hash):
        fails = account_lockout.record_failure(payload.email)
        audit_log(db, payload.email, "login_failed", ip, f"fails_in_window={fails}")
        raise HTTPException(401, "Invalid credentials")

    account_lockout.clear(payload.email)

    if user.mfa_enabled == 1:
        challenge = create_mfa_challenge(user.id)
        audit_log(db, user.email, "login_mfa_required", ip)
        return TokenOut(
            access_token="",
            refresh_token=None,
            user={"email": user.email},
            mfa_required=True,
            mfa_challenge=challenge,
        )

    audit_log(db, user.email, "login_success", ip)
    return _build_token_response(user, db, request)


@router.post("/login/mfa", response_model=TokenOut)
def login_mfa(payload: MfaVerifyIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    claims = decode_token(payload.challenge, expected_typ="mfa_challenge")
    sub = claims.get("sub", "")
    allowed, _ = mfa_rate.check(f"mfa:{sub}")
    if not allowed:
        raise HTTPException(429, "Too many MFA attempts. Try again shortly.")
    user = db.query(models.User).get(int(sub))
    if not user or user.active != 1 or user.mfa_enabled != 1:
        raise HTTPException(401, "Challenge no longer valid")
    secret = load_secret(user.totp_secret_enc)
    if not secret or not verify_code(secret, payload.code):
        audit_log(db, user.email, "mfa_failed", ip)
        raise HTTPException(401, "Invalid MFA code")
    # One-time: burn the challenge so a captured challenge+code cannot be replayed.
    if not consume_jti(db, claims.get("jti"), "mfa_challenge"):
        audit_log(db, user.email, "mfa_challenge_replayed", ip)
        raise HTTPException(401, "Challenge already used")
    audit_log(db, user.email, "mfa_success", ip)
    return _build_token_response(user, db, request)


@router.post("/refresh", response_model=TokenOut)
def refresh(payload: RefreshIn, request: Request, db: Session = Depends(get_db)):
    claims = decode_token(payload.refresh_token, expected_typ="refresh")
    jti = claims.get("jti")
    rt = db.query(models.RefreshToken).filter(models.RefreshToken.jti == jti).first()
    if not rt:
        raise HTTPException(401, "Refresh token revoked or expired")
    # Reuse detection: a token we already rotated away (revoked) being presented
    # again means it was likely stolen. Burn the whole family and refuse.
    if rt.revoked == 1:
        db.query(models.RefreshToken).filter(
            models.RefreshToken.user_id == rt.user_id,
            models.RefreshToken.revoked == 0,
        ).update({"revoked": 1})
        db.commit()
        user = db.query(models.User).get(rt.user_id)
        audit_log(db, user.email if user else str(rt.user_id), "refresh_reuse_detected", client_ip(request))
        raise HTTPException(401, "Refresh token revoked or expired")
    if rt.expires_at <= datetime.utcnow():
        raise HTTPException(401, "Refresh token revoked or expired")
    user = db.query(models.User).get(rt.user_id)
    if not user or user.active != 1:
        raise HTTPException(401, "User disabled")
    rt.revoked = 1
    db.commit()
    return _build_token_response(user, db, request)


@router.post("/logout")
def logout(payload: LogoutIn, principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    if payload.refresh_token:
        try:
            claims = decode_token(payload.refresh_token, expected_typ="refresh")
            jti = claims.get("jti")
            rt = db.query(models.RefreshToken).filter(models.RefreshToken.jti == jti).first()
            if rt:
                rt.revoked = 1
                db.commit()
        except HTTPException:
            pass
    else:
        if principal.get("id", 0) > 0:
            db.query(models.RefreshToken).filter(
                models.RefreshToken.user_id == principal["id"],
                models.RefreshToken.revoked == 0,
            ).update({"revoked": 1})
            db.commit()
    return {"ok": True}


@router.get("/me")
def me(principal: dict = Depends(current_principal)):
    return principal


@router.post("/sse_ticket")
def sse_ticket(principal: dict = Depends(current_principal)):
    if principal.get("id", 0) <= 0:
        raise HTTPException(401, "Bearer auth required for SSE ticket")
    return {"ticket": sse_tickets.issue(principal["id"]), "ttl": 30}


@router.post("/me/password")
def change_password(
    payload: PasswordChangeIn,
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
):
    if principal.get("id", 0) <= 0:
        raise HTTPException(401, "Bearer auth required")
    user = db.query(models.User).get(principal["id"])
    if not user or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(401, "Current password is wrong")
    if not password_strong(payload.new_password):
        raise HTTPException(400, password_complaint())
    if payload.new_password == payload.current_password:
        raise HTTPException(400, "New password must differ from current")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.revoked == 0,
    ).update({"revoked": 1})
    db.commit()
    audit_log(db, user.email, "password_change", "")
    return {"ok": True}


_reset_log = logging.getLogger("autosoc.password_reset")


def _create_reset_token(user_id: int) -> str:
    # Use timezone-aware UTC: naive utcnow().timestamp() is read as *local* time,
    # which corrupts exp (instant expiry in +UTC zones, over-long in -UTC zones).
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "typ": "password_reset",
        "jti": _secrets.token_urlsafe(18),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=30)).timestamp()),
    }
    return _pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@router.post("/forgot")
def forgot(payload: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    allowed, _ = login_rate.check(f"forgot:{ip}")
    if not allowed:
        raise HTTPException(429, "Too many requests")
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if user and user.active == 1:
        token = _create_reset_token(user.id)
        base = (settings.app_base_url or "").rstrip("/")
        link = f"{base}/reset?token={token}"
        if email_configured():
            send_email(
                "AutoSoc password reset",
                f"A password reset was requested for your account.\n\n"
                f"Use this link within 30 minutes to set a new password:\n{link}\n\n"
                f"If you did not request this, ignore this email.",
                to=[user.email],
            )
        else:
            # Dev fallback only: no SMTP configured, surface the link in logs.
            _reset_log.warning(
                "PASSWORD RESET (dev, no SMTP) for %s — link valid 30min: %s", user.email, link
            )
        audit_log(db, user.email, "password_reset_requested", ip)
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


@router.post("/reset")
def reset(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    try:
        claims = _pyjwt.decode(payload.token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except _pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if claims.get("typ") != "password_reset":
        raise HTTPException(401, "Wrong token type")
    user = db.query(models.User).get(int(claims["sub"]))
    if not user or user.active != 1:
        raise HTTPException(401, "User unavailable")
    if not password_strong(payload.new_password):
        raise HTTPException(400, password_complaint())
    # One-time: burn the reset token jti so a captured link cannot be reused.
    if not consume_jti(db, claims.get("jti"), "password_reset"):
        raise HTTPException(401, "Reset token already used")
    user.password_hash = hash_password(payload.new_password)
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.revoked == 0,
    ).update({"revoked": 1})
    db.commit()
    audit_log(db, user.email, "password_reset", "")
    return {"ok": True}
