from fastapi import APIRouter, Depends, HTTPException

from ..auth import require
from ..audit import log as audit_log
from ..config import settings
from ..db import get_db
from ..notify import notify
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
