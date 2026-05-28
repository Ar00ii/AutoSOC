from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .. import billing, models
from ..audit import log as audit_log
from ..auth import current_principal, has_ai_access, require
from ..config import settings
from ..db import get_db

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/config")
def config(_=Depends(current_principal)):
    return {
        "price_usd": settings.subscription_price_usd,
        "stripe_enabled": billing.stripe_enabled(),
        "publishable_key": settings.stripe_publishable_key,
    }


@router.get("/status")
def status(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    pid = principal.get("id", 0)
    if pid <= 0:
        # Anonymous demo / API key: AI is allowed (budget-guarded), no plan to show.
        return {
            "status": "demo" if pid == 0 else "service",
            "active": has_ai_access(db, principal),
            "plan": None,
            "source": "system",
            "current_period_end": None,
            "price_usd": settings.subscription_price_usd,
            "stripe_enabled": billing.stripe_enabled(),
        }
    sub = billing.get_or_create_subscription(db, pid)
    data = billing.serialize(sub)
    # Admins (and anyone entitled by role) read as active regardless of the
    # subscription row, so the UI unlocks AI features for them.
    data["active"] = has_ai_access(db, principal)
    return data


@router.post("/checkout")
def checkout(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    pid = principal.get("id", 0)
    if pid <= 0:
        raise HTTPException(400, "Sign in with a user account to subscribe")
    user = db.query(models.User).get(pid)
    if not user:
        raise HTTPException(404, "User not found")
    if not billing.stripe_enabled():
        raise HTTPException(503, "Billing is not configured yet")
    try:
        url = billing.create_checkout_session(db, user)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Could not start checkout: {e}")
    audit_log(db, user.email, "billing.checkout", str(user.id), "")
    return {"url": url}


@router.post("/portal")
def portal(principal: dict = Depends(current_principal), db: Session = Depends(get_db)):
    pid = principal.get("id", 0)
    if pid <= 0:
        raise HTTPException(400, "Sign in with a user account")
    user = db.query(models.User).get(pid)
    if not user:
        raise HTTPException(404, "User not found")
    try:
        url = billing.create_portal_session(db, user)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Could not open billing portal: {e}")
    return {"url": url}


@router.post("/webhook")
async def webhook(request: Request, stripe_signature: str = Header(default=""), db: Session = Depends(get_db)):
    payload = await request.body()
    try:
        event = billing.verify_and_parse_webhook(payload, stripe_signature)
    except Exception as e:  # noqa: BLE001 — bad signature / not configured
        raise HTTPException(400, f"Webhook verification failed: {e}")
    billing.handle_webhook_event(db, event)
    return {"received": True}


# ── Admin: manual grant/revoke (comp accounts, trials, demand validation) ──

@router.get("/subscribers")
def subscribers(db: Session = Depends(get_db), _=Depends(require("billing", "view"))):
    rows = db.query(models.Subscription).all()
    users = {u.id: u.email for u in db.query(models.User).all()}
    return [
        {**billing.serialize(s), "user_id": s.user_id, "email": users.get(s.user_id, "?")}
        for s in rows
    ]


@router.post("/grant")
def grant(
    payload: dict,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("billing", "update")),
):
    user_id = payload.get("user_id")
    status_val = payload.get("status", "active")
    if not isinstance(user_id, int):
        raise HTTPException(400, "user_id (int) required")
    if status_val not in ("active", "inactive", "canceled", "past_due"):
        raise HTTPException(400, "invalid status")
    if not db.query(models.User).get(user_id):
        raise HTTPException(404, "User not found")
    sub = billing.set_status(db, user_id, status_val, source="manual")
    audit_log(db, principal.get("email", "?"), "billing.grant", str(user_id), status_val)
    return billing.serialize(sub)
