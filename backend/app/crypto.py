"""Symmetric envelope for secrets stored at rest (TOTP secrets, OAuth state).
KEK derived from JWT_SECRET via SHA-256. If JWT_SECRET rotates, encrypted blobs
must be rewrapped — out of scope of v0.5."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _kek() -> bytes:
    digest = hashlib.sha256(settings.jwt_secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt(plain: str) -> str:
    return Fernet(_kek()).encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str | None:
    if not token:
        return None
    try:
        return Fernet(_kek()).decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None
