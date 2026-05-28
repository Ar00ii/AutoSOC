import re
import smtplib
import ssl
from email.message import EmailMessage

import httpx

from .config import settings
from .security import is_url_safe_outbound

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean_header(value: str) -> str:
    """Strip CR/LF to prevent SMTP header injection."""
    return value.replace("\r", " ").replace("\n", " ")


def notify(title: str, text: str, severity: str = "high") -> bool:
    if not settings.notify_webhook:
        return False
    ok, _ = is_url_safe_outbound(settings.notify_webhook)
    if not ok:
        return False
    payload = _slack_format(title, text, severity)
    try:
        r = httpx.post(settings.notify_webhook, json=payload, timeout=4.0, follow_redirects=False)
        return r.status_code < 400
    except Exception:
        return False


_SEV_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def alert_recipients() -> list[str]:
    return [a.strip() for a in (settings.alert_email_to or "").split(",") if a.strip()]


def send_email(subject: str, body: str, to: list[str] | None = None) -> bool:
    """Send a plain-text email via the configured SMTP server.

    Returns False (never raises) if SMTP is not configured or sending fails,
    so callers in the ingest hot path can fire-and-forget safely.
    """
    if not email_configured():
        return False
    recipients = [r for r in (to or alert_recipients()) if _EMAIL_RE.match(r)]
    if not recipients:
        return False
    msg = EmailMessage()
    msg["Subject"] = _clean_header(subject[:200])
    msg["From"] = _clean_header(settings.smtp_from)
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)
    try:
        if settings.smtp_starttls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=8) as s:
                s.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=8, context=ssl.create_default_context()) as s:
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        return True
    except Exception:
        return False


def alert_email(title: str, text: str, severity: str = "high") -> bool:
    """Email the configured IT/security recipients if severity clears the
    configured minimum threshold."""
    if _SEV_ORDER.get(severity, 0) < _SEV_ORDER.get(settings.alert_min_severity, 3):
        return False
    subject = f"[AutoSoc {severity.upper()}] {title}"
    body = f"{title}\n\nSeverity: {severity.upper()}\n\n{text}\n\n— AutoSoc automated alert"
    return send_email(subject, body)


def _slack_format(title: str, text: str, severity: str) -> dict:
    indicator = {"low": "·", "medium": "··", "high": "===", "critical": "===!==="}.get(
        severity, "·"
    )
    return {
        "text": f"[{severity.upper()}] {title}",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{indicator} AutoSoc {indicator}*\n*{title}*\n```{text}```",
                },
            }
        ],
    }
