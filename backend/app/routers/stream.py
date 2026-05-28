import asyncio
import json as _json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session

from .. import models
from ..auth import current_principal, has_permission
from ..config import settings
from ..db import get_db
from ..security import sse_tickets
from ..stream import subscribe, unsubscribe

router = APIRouter(prefix="/api/stream", tags=["stream"])


def _principal_from_ticket(ticket: str | None, db: Session) -> dict | None:
    if not ticket:
        return None
    user_id = sse_tickets.consume(ticket)
    if not user_id:
        return None
    user = db.query(models.User).get(user_id)
    if not user or user.active != 1:
        return None
    role = db.query(models.Role).get(user.role_id)
    perms = _json.loads(role.permissions or "{}") if role else {}
    team_filters = {}
    if user.team_id:
        team = db.query(models.Team).get(user.team_id)
        if team:
            team_filters = _json.loads(team.event_filters or "{}")
    return {
        "id": user.id,
        "email": user.email,
        "role": role.name if role else "viewer",
        "permissions": perms,
        "team_filters": team_filters,
    }


@router.get("")
async def stream(
    request: Request,
    ticket: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    principal: dict | None = None
    if ticket:
        principal = _principal_from_ticket(ticket, db)

    if principal is None:
        if settings.auth_required:
            raise HTTPException(401, "Provide ?ticket=<value> from POST /api/auth/sse_ticket")
        from ..auth import _admin_principal
        principal = _admin_principal()

    if not has_permission(principal, "events", "view"):
        raise HTTPException(403, "Missing permission: events.view")

    sub = await subscribe(principal)

    async def gen():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(sub.queue.get(), timeout=15.0)
                    yield {"event": "message", "data": payload}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            unsubscribe(sub)

    return EventSourceResponse(gen())
