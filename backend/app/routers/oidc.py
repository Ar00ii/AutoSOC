import json
import secrets as _secrets
import time
from urllib.parse import urlencode

import httpx
from authlib.jose import JsonWebKey, jwt as authlib_jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..audit import log as audit_log
from ..auth import create_access_token, create_refresh_token, hash_password
from ..config import settings
from ..db import get_db

router = APIRouter(prefix="/api/auth/oidc", tags=["oidc"])

_state_store: dict[str, dict] = {}


def _config_ok() -> bool:
    return bool(settings.oidc_issuer and settings.oidc_client_id and settings.oidc_redirect_uri)


def _discover() -> dict:
    r = httpx.get(f"{settings.oidc_issuer.rstrip('/')}/.well-known/openid-configuration", timeout=5.0)
    if r.status_code >= 400:
        raise HTTPException(503, "OIDC discovery failed")
    return r.json()


@router.get("/status")
def status():
    return {
        "enabled": _config_ok(),
        "issuer": settings.oidc_issuer,
        "default_role": settings.oidc_default_role,
    }


@router.get("/login")
def oidc_login():
    if not _config_ok():
        raise HTTPException(503, "OIDC not configured")
    disc = _discover()
    state = _secrets.token_urlsafe(24)
    nonce = _secrets.token_urlsafe(24)
    _state_store[state] = {"exp": time.time() + 600, "nonce": nonce}
    for k, v in list(_state_store.items()):
        if v.get("exp", 0) < time.time():
            _state_store.pop(k, None)
    params = {
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
    }
    return RedirectResponse(f"{disc['authorization_endpoint']}?{urlencode(params)}", status_code=302)


@router.get("/callback")
def oidc_callback(code: str = Query(...), state: str = Query(...), db: Session = Depends(get_db)):
    if not _config_ok():
        raise HTTPException(503, "OIDC not configured")
    saved = _state_store.pop(state, None)
    if not saved or saved.get("exp", 0) < time.time():
        raise HTTPException(400, "Invalid or expired state")
    expected_nonce = saved.get("nonce")
    disc = _discover()
    tok = httpx.post(
        disc["token_endpoint"],
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.oidc_redirect_uri,
            "client_id": settings.oidc_client_id,
            "client_secret": settings.oidc_client_secret,
        },
        timeout=10.0,
    )
    if tok.status_code >= 400:
        raise HTTPException(401, "Token exchange failed")
    body = tok.json()
    id_token = body.get("id_token")
    if not id_token:
        raise HTTPException(401, "No id_token returned")
    jwks = httpx.get(disc["jwks_uri"], timeout=5.0).json()
    issuers = [disc.get("issuer"), settings.oidc_issuer, settings.oidc_issuer.rstrip("/")]
    issuers = [i for i in issuers if i]
    try:
        claims = authlib_jwt.decode(
            id_token,
            JsonWebKey.import_key_set(jwks),
            claims_options={
                "iss": {"essential": True, "values": issuers},
                "aud": {"essential": True, "values": [settings.oidc_client_id]},
            },
        )
        claims.validate()
    except Exception as e:
        raise HTTPException(401, f"id_token validation failed: {e}")
    # Bind the id_token to this login flow: reject a token minted for another
    # request (replay / token injection).
    if expected_nonce and claims.get("nonce") != expected_nonce:
        raise HTTPException(401, "id_token nonce mismatch")
    sub = str(claims.get("sub"))
    email = claims.get("email") or f"{sub}@{settings.oidc_issuer}"
    name = claims.get("name", "")
    email_verified = bool(claims.get("email_verified"))

    user = db.query(models.User).filter(models.User.oidc_subject == sub).first()
    # Only auto-link to an existing local account when the IdP asserts the email
    # is verified — otherwise an attacker could claim someone else's email.
    if not user and email_verified:
        user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        # Email belongs to a local account we couldn't safely link (e.g. the IdP
        # did not assert it verified): refuse rather than mint a duplicate.
        if db.query(models.User).filter(models.User.email == email).first():
            raise HTTPException(409, "An account with this email already exists")
        role = db.query(models.Role).filter(models.Role.name == settings.oidc_default_role).first()
        if not role:
            raise HTTPException(500, "Configured default role missing")
        user = models.User(
            email=email,
            name=name,
            password_hash=hash_password(_secrets.token_urlsafe(32)),
            role_id=role.id,
            active=1,
            oidc_subject=sub,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        audit_log(db, user.email, "user_oidc_provisioned", sub)
    else:
        if not user.oidc_subject:
            user.oidc_subject = sub
            db.commit()

    role = db.query(models.Role).get(user.role_id)
    access = create_access_token(user.id, user.email, role.name if role else "viewer")
    refresh, _jti = create_refresh_token(user.id, db, ip="oidc", ua="oidc")
    fragment = urlencode({"access_token": access, "refresh_token": refresh})
    return RedirectResponse(f"/login#sso&{fragment}", status_code=302)
