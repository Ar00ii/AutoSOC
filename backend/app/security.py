"""Centralised security helpers: URL validation (SSRF), rate limiting,
account lockout, password policy, API key HMAC, CSV sanitizer, HTML escape."""
from __future__ import annotations

import hmac
import hashlib
import ipaddress
import secrets
import socket
import threading
import time
from urllib.parse import urlparse

from .config import settings

DEFAULT_JWT_SECRET = "dev-secret-change-me"


def server_pepper() -> bytes:
    return settings.jwt_secret.encode("utf-8")


def hash_api_key(key: str) -> str:
    return hmac.new(server_pepper(), key.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_api_key_hash(key: str, expected_hex: str) -> bool:
    return hmac.compare_digest(hash_api_key(key), expected_hex)


def new_api_key() -> tuple[str, str, str]:
    raw = secrets.token_urlsafe(32)
    key = f"as_{raw}"
    return key, key[:8], hash_api_key(key)


MIN_PASSWORD_LEN = 12


def password_strong(pwd: str) -> bool:
    if not isinstance(pwd, str) or len(pwd) < MIN_PASSWORD_LEN:
        return False
    classes = sum([
        any(c.islower() for c in pwd),
        any(c.isupper() for c in pwd),
        any(c.isdigit() for c in pwd),
        any(not c.isalnum() for c in pwd),
    ])
    return classes >= 3


def password_complaint() -> str:
    return (
        f"Password must be at least {MIN_PASSWORD_LEN} characters and include three of: "
        "lowercase, uppercase, digit, symbol."
    )


def is_url_safe_outbound(url: str) -> tuple[bool, str]:
    if not url:
        return False, "empty url"
    try:
        u = urlparse(url)
    except Exception as e:
        return False, f"invalid url: {e}"
    if u.scheme not in ("http", "https"):
        return False, "only http/https schemes allowed"
    host = (u.hostname or "").strip()
    if not host:
        return False, "missing host"
    if host.lower() in {"localhost", "metadata.google.internal", "instance-data"}:
        return False, "host not allowed"
    try:
        ips = {addr[4][0] for addr in socket.getaddrinfo(host, None)}
    except Exception as e:
        return False, f"dns failed: {e}"
    for ip in ips:
        try:
            obj = ipaddress.ip_address(ip)
        except Exception:
            return False, f"bad ip {ip}"
        if obj.is_private or obj.is_loopback or obj.is_link_local or obj.is_multicast or obj.is_reserved or obj.is_unspecified:
            return False, f"resolves to disallowed address {ip}"
    return True, ""


_CSV_DANGEROUS = ("=", "+", "-", "@", "\t", "\r", "\n")


def sanitize_csv_cell(value) -> str:
    s = "" if value is None else str(value)
    if s and s[0] in _CSV_DANGEROUS:
        return "'" + s
    return s


_HTML_ESCAPE = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
}


def escape_html(value) -> str:
    s = "" if value is None else str(value)
    return "".join(_HTML_ESCAPE.get(c, c) for c in s)


class RateLimiter:
    def __init__(self, max_hits: int, window_seconds: float):
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            bucket = [t for t in self._hits.get(key, []) if t >= cutoff]
            allowed = len(bucket) < self.max_hits
            if allowed:
                bucket.append(now)
            self._hits[key] = bucket
            remaining = max(0, self.max_hits - len(bucket))
        return allowed, remaining


login_rate = RateLimiter(max_hits=10, window_seconds=60.0)
ingest_rate = RateLimiter(max_hits=600, window_seconds=60.0)
agent_run_rate = RateLimiter(max_hits=30, window_seconds=60.0)


class AccountLockout:
    def __init__(self, max_failures: int = 5, window_seconds: float = 900.0):
        self.max_failures = max_failures
        self.window = window_seconds
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def record_failure(self, email: str) -> int:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            bucket = [t for t in self._fails.get(email.lower(), []) if t >= cutoff]
            bucket.append(now)
            self._fails[email.lower()] = bucket
            return len(bucket)

    def is_locked(self, email: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            bucket = [t for t in self._fails.get(email.lower(), []) if t >= cutoff]
            self._fails[email.lower()] = bucket
            return len(bucket) >= self.max_failures

    def clear(self, email: str) -> None:
        with self._lock:
            self._fails.pop(email.lower(), None)


account_lockout = AccountLockout()


class SSETicketStore:
    """One-shot, short-TTL tickets so EventSource (no header support) can auth."""

    def __init__(self, ttl_seconds: float = 30.0):
        self.ttl = ttl_seconds
        self._tickets: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()

    def issue(self, user_id: int) -> str:
        ticket = secrets.token_urlsafe(24)
        with self._lock:
            self._sweep()
            self._tickets[ticket] = (time.monotonic() + self.ttl, user_id)
        return ticket

    def consume(self, ticket: str) -> int | None:
        with self._lock:
            self._sweep()
            entry = self._tickets.pop(ticket, None)
        if not entry:
            return None
        return entry[1]

    def _sweep(self) -> None:
        now = time.monotonic()
        for t, (exp, _) in list(self._tickets.items()):
            if exp < now:
                self._tickets.pop(t, None)


sse_tickets = SSETicketStore()


def jwt_secret_is_default() -> bool:
    s = settings.jwt_secret or ""
    return s == DEFAULT_JWT_SECRET or len(s) < 32


def startup_security_warnings() -> list[str]:
    warnings: list[str] = []
    if not settings.auth_required:
        warnings.append(
            "AUTH_REQUIRED is FALSE — every request acts as admin. "
            "Set AUTH_REQUIRED=true before exposing AutoSoc beyond localhost."
        )
    if jwt_secret_is_default():
        warnings.append(
            "JWT_SECRET is at default or shorter than 32 chars. "
            "Set a long random JWT_SECRET in backend/.env (e.g. `python -c \"import secrets; print(secrets.token_urlsafe(48))\"`)."
        )
    if settings.auth_required and settings.admin_password in {"admin", ""}:
        warnings.append("ADMIN_PASSWORD is weak. Change it before enabling AUTH_REQUIRED.")
    return warnings


def assert_secure_for_auth_required() -> None:
    """Hard-fail startup if auth is required but secrets are unsafe."""
    if not settings.auth_required:
        return
    if jwt_secret_is_default():
        raise RuntimeError(
            "AUTH_REQUIRED=true requires a strong JWT_SECRET (>=32 chars, not the default). Refusing to start."
        )
