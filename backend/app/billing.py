"""Subscription billing.

AI features are sold as a flat monthly plan. We run the AI with our own
ANTHROPIC_API_KEY, so a subscription must be active for a user to use
agents / AI reports / AI scoring.

Stripe is optional: if STRIPE_SECRET_KEY is unset (or the `stripe` package
is not installed), checkout/portal are disabled but an admin can still grant
access manually via the billing router. This lets us validate demand before
wiring real payments.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from . import models
from .config import settings


def stripe_enabled() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_price_id)


def _stripe():
    """Lazily import + configure the stripe SDK. Returns None if unavailable."""
    if not settings.stripe_secret_key:
        return None
    try:
        import stripe  # type: ignore
    except ImportError:
        return None
    stripe.api_key = settings.stripe_secret_key
    return stripe


def get_or_create_subscription(db: Session, user_id: int) -> models.Subscription:
    sub = (
        db.query(models.Subscription)
        .filter(models.Subscription.user_id == user_id)
        .first()
    )
    if not sub:
        sub = models.Subscription(user_id=user_id, status="inactive")
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


def serialize(sub: models.Subscription) -> dict:
    active = sub.status == "active" and (
        sub.current_period_end is None or sub.current_period_end >= datetime.utcnow()
    )
    return {
        "status": sub.status,
        "active": active,
        "plan": sub.plan,
        "source": sub.source,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "price_usd": settings.subscription_price_usd,
        "stripe_enabled": stripe_enabled(),
    }


def set_status(
    db: Session,
    user_id: int,
    status: str,
    *,
    source: str = "manual",
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    current_period_end: datetime | None = None,
) -> models.Subscription:
    sub = get_or_create_subscription(db, user_id)
    sub.status = status
    sub.source = source
    if stripe_customer_id is not None:
        sub.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id is not None:
        sub.stripe_subscription_id = stripe_subscription_id
    if current_period_end is not None:
        sub.current_period_end = current_period_end
    sub.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(sub)
    return sub


def create_checkout_session(db: Session, user: models.User) -> str:
    """Create a Stripe Checkout session and return its hosted URL."""
    stripe = _stripe()
    if stripe is None or not settings.stripe_price_id:
        raise RuntimeError("Stripe is not configured")
    sub = get_or_create_subscription(db, user.id)
    customer_id = sub.stripe_customer_id or None
    if not customer_id:
        customer = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
        customer_id = customer["id"]
        sub.stripe_customer_id = customer_id
        db.commit()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=f"{settings.app_base_url}/billing?status=success",
        cancel_url=f"{settings.app_base_url}/billing?status=cancel",
        metadata={"user_id": str(user.id)},
        subscription_data={"metadata": {"user_id": str(user.id)}},
    )
    return session["url"]


def create_portal_session(db: Session, user: models.User) -> str:
    stripe = _stripe()
    if stripe is None:
        raise RuntimeError("Stripe is not configured")
    sub = get_or_create_subscription(db, user.id)
    if not sub.stripe_customer_id:
        raise RuntimeError("No Stripe customer for this user")
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{settings.app_base_url}/billing",
    )
    return session["url"]


def verify_and_parse_webhook(payload: bytes, sig_header: str):
    """Verify the Stripe webhook signature and return the event dict."""
    stripe = _stripe()
    if stripe is None:
        raise RuntimeError("Stripe is not configured")
    if not settings.stripe_webhook_secret:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not set")
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.stripe_webhook_secret
    )


def _is_event_processed(db: Session, event_id: str | None) -> bool:
    """Record the event id; return True if it was already seen (replay)."""
    if not event_id:
        return False
    existing = (
        db.query(models.ProcessedStripeEvent)
        .filter(models.ProcessedStripeEvent.event_id == event_id)
        .first()
    )
    if existing:
        return True
    db.add(models.ProcessedStripeEvent(event_id=event_id, event_type=""))
    try:
        db.commit()
    except Exception:
        db.rollback()
        return True
    return False


def _has_our_price(obj: dict) -> bool:
    """True if the subscription object is for our configured Price ID.

    Defends against a forged/foreign subscription event activating access.
    If no price id is configured we cannot validate, so we accept (dev mode).
    """
    if not settings.stripe_price_id:
        return True
    items = (obj.get("items") or {}).get("data") or []
    for it in items:
        price = (it.get("price") or {})
        if price.get("id") == settings.stripe_price_id:
            return True
    return False


def handle_webhook_event(db: Session, event: dict) -> None:
    """Apply a verified Stripe event to the local subscription state.

    Activates immediately on checkout completion and keeps status in sync
    on subscription updates / cancellations.
    """
    if _is_event_processed(db, event.get("id")):
        return
    etype = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    def _user_id_from(o: dict) -> int | None:
        meta = o.get("metadata") or {}
        uid = meta.get("user_id")
        if uid:
            try:
                return int(uid)
            except (TypeError, ValueError):
                return None
        # Fall back to matching the stored Stripe customer id.
        cust = o.get("customer")
        if cust:
            row = (
                db.query(models.Subscription)
                .filter(models.Subscription.stripe_customer_id == cust)
                .first()
            )
            return row.user_id if row else None
        return None

    if etype == "checkout.session.completed":
        # Only a paid subscription checkout grants access.
        if obj.get("mode") != "subscription":
            return
        if obj.get("payment_status") not in ("paid", "no_payment_required"):
            return
        uid = _user_id_from(obj)
        if uid:
            set_status(
                db, uid, "active", source="stripe",
                stripe_customer_id=obj.get("customer") or None,
                stripe_subscription_id=obj.get("subscription") or None,
            )
    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        if not _has_our_price(obj):
            return
        uid = _user_id_from(obj)
        if uid:
            status = obj.get("status", "")
            local = "active" if status in ("active", "trialing") else (
                "past_due" if status == "past_due" else "inactive"
            )
            period_end = obj.get("current_period_end")
            cpe = datetime.utcfromtimestamp(period_end) if period_end else None
            set_status(
                db, uid, local, source="stripe",
                stripe_subscription_id=obj.get("id") or None,
                current_period_end=cpe,
            )
    elif etype == "customer.subscription.deleted":
        uid = _user_id_from(obj)
        if uid:
            set_status(db, uid, "canceled", source="stripe")
