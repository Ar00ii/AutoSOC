from fastapi import APIRouter, Depends, HTTPException

from ..auth import require
from ..audit import log as audit_log
from ..config import settings
from ..db import get_db
from ..notify import alert_recipients, email_configured, notify, send_email
from ..schemas import TestNotifyIn
from ..security import is_url_safe_outbound

router = APIRouter(prefix="/api/notify", tags=["notify"])


@router.get("/status")
def status(_=Depends(require("settings", "view"))):
    if not settings.notify_webhook:
        return {"configured": False, "url_safe": False}
    ok, reason = is_url_safe_outbound(settings.notify_webhook)
    return {"configured": True, "url_safe": ok, "reason": reason}


@router.post("/test")
def test(payload: TestNotifyIn, principal: dict = Depends(require("settings", "update")), db=Depends(get_db)):
    if not settings.notify_webhook:
        raise HTTPException(400, "NOTIFY_WEBHOOK is not configured")
    ok, reason = is_url_safe_outbound(settings.notify_webhook)
    if not ok:
        raise HTTPException(400, f"NOTIFY_WEBHOOK rejected: {reason}")
    sent = notify(payload.title, payload.text, payload.severity)
    audit_log(db, principal.get("email", "?"), "notify_test", "webhook", f"sent={sent}")
    return {"sent": sent}


@router.get("/email/status")
def email_status(_=Depends(require("settings", "view"))):
    return {
        "configured": email_configured(),
        "host": settings.smtp_host,
        "from": settings.smtp_from,
        "recipients": alert_recipients(),
        "min_severity": settings.alert_min_severity,
    }


@router.post("/email/test")
def email_test(payload: TestNotifyIn, principal: dict = Depends(require("settings", "update")), db=Depends(get_db)):
    if not email_configured():
        raise HTTPException(400, "SMTP is not configured (set SMTP_HOST and SMTP_FROM)")
    if not alert_recipients():
        raise HTTPException(400, "No alert recipients configured (set ALERT_EMAIL_TO)")
    sent = send_email(f"[AutoSoc test] {payload.title}", payload.text)
    audit_log(db, principal.get("email", "?"), "email_test", "smtp", f"sent={sent}")
    return {"sent": sent}
