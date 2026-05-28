"""Symmetric envelope for secrets stored at rest (TOTP secrets, OAuth state).

The KEK is derived with HKDF-SHA256 and a fixed domain-separation label, so the
data-encryption key is cryptographically independent from the token-signing key
even when both fall back to JWT_SECRET. Set MFA_ENC_KEY to a dedicated random
value in production for full key separation. If the underlying secret rotates,
encrypted blobs must be rewrapped."""
import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .config import settings

_HKDF_INFO = b"autosoc-at-rest-encryption-v1"


def _kek() -> bytes:
    secret = (settings.mfa_enc_key or settings.jwt_secret).encode("utf-8")
    derived = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=_HKDF_INFO,
    ).derive(secret)
    return base64.urlsafe_b64encode(derived)


def encrypt(plain: str) -> str:
    return Fernet(_kek()).encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str | None:
    if not token:
        return None
    try:
        return Fernet(_kek()).decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None
