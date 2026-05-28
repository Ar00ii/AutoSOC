import base64
import io
import secrets

import pyotp
import qrcode

from .config import settings
from .crypto import decrypt, encrypt


def new_totp_secret() -> str:
    return pyotp.random_base32()


def store_secret(plain_secret: str) -> str:
    return encrypt(plain_secret)


def load_secret(encrypted: str) -> str | None:
    return decrypt(encrypted)


def provisioning_uri(secret: str, account: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=settings.mfa_issuer)


def qr_png_data_url(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def verify_code(secret: str, code: str) -> bool:
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit() or len(code) not in (6, 8):
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def new_mfa_challenge_secret() -> str:
    return secrets.token_urlsafe(16)
