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
        "jti": _secrets.token_urlsafe(18),
        "iat": int(_now().timestamp()),  # UTC-aware
        "exp": _exp(300),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def consume_jti(db: Session, jti: str | None, purpose: str) -> bool:
    """Atomically mark a one-time token's jti as used. Returns False if the jti
    is missing or was already consumed (replay), True on first successful use."""
    if not jti:
        return False
    existing = (
        db.query(models.UsedToken)
        .filter(models.UsedToken.jti == jti)
        .first()
    )
    if existing:
        return False
    db.add(models.UsedToken(jti=jti, purpose=purpose))
    try:
        db.commit()
    except Exception:
        db.rollback()
        return False
    return True


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
    "ti", "cases", "playbooks", "billing",
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


def has_ai_access(db: Session, principal: dict) -> bool:
    """True if the caller may use AI features (agents, AI reports, AI scoring).

    - admin: always.
    - anonymous demo (id 0, AUTH_REQUIRED=false) and API keys (id < 0):
      allowed, but the public-demo budget guard caps spend separately.
    - authenticated user: needs an active, unexpired subscription.
    """
    if principal.get("role") == "admin":
        return True
    pid = principal.get("id", 0)
    if pid <= 0:
        return True
    sub = (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == pid)
        .first()
    )
    if not sub or sub.status != "active":
        return False
    if sub.current_period_end and sub.current_period_end < _now_naive():
        return False
    return True


def require_ai(
    principal: dict = Depends(current_principal),
    db: Session = Depends(get_db),
) -> dict:
    if not has_ai_access(db, principal):
        raise HTTPException(
            402,
            "AI features require an active subscription. Upgrade at /billing.",
        )
    return principal


_ALL_ACTIONS = {"view", "create", "update", "delete", "execute"}


def perms_within_caller(principal: dict, perms: dict) -> bool:
    """True if every (resource, action) in `perms` is already held by the caller.

    Prevents privilege escalation: a non-admin may only define/grant permissions
    that are a subset of their own. Admins may grant anything."""
    if principal.get("role") == "admin":
        return True
    if not isinstance(perms, dict):
        return False
    for resource, actions in perms.items():
        if not isinstance(actions, (list, tuple)):
            return False
        for action in actions:
            wanted = _ALL_ACTIONS if action == "*" else {action}
            for a in wanted:
                if not has_permission(principal, resource, a):
                    return False
    return True


def role_within_caller(db: Session, principal: dict, role_id: int) -> bool:
    """True if the target role grants nothing the caller doesn't already have.
    Used to stop low-privilege users assigning/minting higher-privilege roles."""
    if principal.get("role") == "admin":
        return True
    role = db.query(models.Role).get(role_id)
    if not role:
        return False
    try:
        perms = json.loads(role.permissions or "{}")
    except Exception:
        return False
    return perms_within_caller(principal, perms)
