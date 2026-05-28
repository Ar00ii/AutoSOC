import json
import secrets as _secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .db import get_db
from .security import (
    hash_api_key as _hash_api_key,
    new_api_key as _new_api_key,
    verify_api_key_hash,
)


def hash_password(plain: str) -> str:
    return bcrypt.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.verify(plain, hashed)
    except Exception:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_naive() -> datetime:
    return datetime.utcnow()


def _exp(seconds: int) -> int:
    return int((_now() + timedelta(seconds=seconds)).timestamp())


def create_access_token(user_id: int, email: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "typ": "access",
        "iat": int(_now().timestamp()),  # UTC-aware
        "exp": _exp(settings.access_ttl_min * 60),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int, db: Session, ip: str = "", ua: str = "") -> tuple[str, str]:
    jti = _secrets.token_urlsafe(24)
    exp_aware = _now() + timedelta(hours=settings.refresh_ttl_hours)
    exp_naive = _now_naive() + timedelta(hours=settings.refresh_ttl_hours)
    rt = models.RefreshToken(user_id=user_id, jti=jti, expires_at=exp_naive, ip=ip[:80], user_agent=ua[:200])
    db.add(rt)
    db.commit()
    payload = {
        "sub": str(user_id),
        "typ": "refresh",
        "jti": jti,
        "iat": int(_now().timestamp()),
        "exp": int(exp_aware.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti


def create_mfa_challenge(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "typ": "mfa_challenge",
        "iat": int(_now().timestamp()),  # UTC-aware
        "exp": _exp(300),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_typ: str | None = None) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if expected_typ and payload.get("typ") != expected_typ:
        raise HTTPException(401, "Wrong token type")
    return payload


def create_token(user_id: int, email: str, role: str) -> str:
    """Legacy single-token helper (used by older tests). Mirrors access token."""
    return create_access_token(user_id, email, role)


def new_api_key() -> tuple[str, str, str]:
    return _new_api_key()


def hash_api_key(key: str) -> str:
    return _hash_api_key(key)


ADMIN_PERMISSIONS = {r: ["view", "create", "update", "delete", "execute"] for r in [
    "events", "tickets", "blocks", "recommendations", "reports",
    "agents", "audit", "settings", "users", "roles", "teams", "keys", "intel", "ingest",
]}


def _admin_principal() -> dict:
    return {
        "id": 0,
        "email": "anonymous@autosoc.local",
        "role": "admin",
        "permissions": ADMIN_PERMISSIONS,
        "team_filters": {},
    }


def current_principal(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if x_api_key:
        hashed = hash_api_key(x_api_key)
        candidate = (
            db.query(models.ApiKey)
            .filter(models.ApiKey.key_hash == hashed)
            .filter(models.ApiKey.revoked == 0)
            .first()
        )
        if not candidate or not verify_api_key_hash(x_api_key, candidate.key_hash):
            raise HTTPException(401, "Invalid API key")
        candidate.last_used = _now()
        db.commit()
        role = db.query(models.Role).get(candidate.role_id)
        perms = json.loads(role.permissions or "{}") if role else {}
        return {
            "id": -candidate.id,
            "email": f"apikey:{candidate.name}",
            "role": role.name if role else "agent",
            "permissions": perms,
            "team_filters": {},
        }

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        payload = decode_token(token)
        if payload.get("typ") not in (None, "access"):
            raise HTTPException(401, "Use the access token here")
        user = db.query(models.User).get(int(payload["sub"]))
        if not user or user.active != 1:
            raise HTTPException(401, "User disabled")
        role = db.query(models.Role).get(user.role_id)
        perms = json.loads(role.permissions or "{}") if role else {}
        team_filters = {}
        if user.team_id:
            team = db.query(models.Team).get(user.team_id)
            if team:
                team_filters = json.loads(team.event_filters or "{}")
        return {
            "id": user.id,
            "email": user.email,
            "role": role.name if role else "viewer",
            "permissions": perms,
            "team_filters": team_filters,
        }

    if settings.auth_required:
        raise HTTPException(401, "Authentication required")

    return _admin_principal()


def require(resource: str, action: str):
    def dep(principal: dict = Depends(current_principal)):
        if has_permission(principal, resource, action):
            return principal
        raise HTTPException(403, f"Missing permission: {resource}.{action}")

    return dep


def has_permission(principal: dict, resource: str, action: str) -> bool:
    if principal.get("role") == "admin":
        return True
    perms = principal.get("permissions", {})
    actions = perms.get(resource, [])
    return action in actions or "*" in actions
