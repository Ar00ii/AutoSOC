"""Team scoping: applied uniformly to every endpoint that returns event-derived
data so visibility limits aren't bypassed via a non-events route."""
from __future__ import annotations

from . import models


def is_admin(principal: dict) -> bool:
    return principal.get("role") == "admin"


def filters_for(principal: dict) -> dict:
    if is_admin(principal):
        return {}
    return principal.get("team_filters") or {}


def apply_event_query(query, principal: dict):
    f = filters_for(principal)
    if not f:
        return query
    if f.get("source"):
        query = query.filter(models.Event.source.in_(list(f["source"])))
    if f.get("category"):
        query = query.filter(models.Event.category.in_(list(f["category"])))
    if f.get("severity"):
        query = query.filter(models.Event.severity.in_(list(f["severity"])))
    if f.get("country"):
        query = query.filter(models.Event.src_country.in_([c.upper() for c in f["country"]]))
    return query


def event_passes(principal: dict, event: dict) -> bool:
    """Used by SSE publish to decide if a streamed event reaches a subscriber."""
    f = filters_for(principal)
    if not f:
        return True
    if f.get("source") and event.get("source") and event["source"] not in f["source"]:
        return False
    if f.get("category") and event.get("category") and event["category"] not in f["category"]:
        return False
    if f.get("severity") and event.get("severity") and event["severity"] not in f["severity"]:
        return False
    if f.get("country") and event.get("src_country"):
        if event["src_country"].upper() not in [c.upper() for c in f["country"]]:
            return False
    return True
