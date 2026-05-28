from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..audit import log as audit_log
from ..db import get_db
from ..schemas import TicketIn, TicketOut, TicketUpdate

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("", response_model=list[TicketOut])
def list_tickets(db: Session = Depends(get_db), status: str | None = None, _=Depends(require("tickets", "view"))):
    q = db.query(models.Ticket).order_by(models.Ticket.created_at.desc())
    if status:
        q = q.filter(models.Ticket.status == status)
    return q.all()


@router.post("", response_model=TicketOut)
def create_ticket(payload: TicketIn, db: Session = Depends(get_db), principal: dict = Depends(require("tickets", "create"))):
    if len(payload.title) > 200 or len(payload.description) > 8000:
        raise HTTPException(400, "Field too long")
    t = models.Ticket(**payload.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    audit_log(db, principal.get("email", "?"), "create_ticket", str(t.id), t.title[:200])
    return t


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, payload: TicketUpdate, db: Session = Depends(get_db), principal: dict = Depends(require("tickets", "update"))):
    t = db.query(models.Ticket).get(ticket_id)
    if not t:
        raise HTTPException(404)
    changed = []
    for k, v in payload.model_dump(exclude_none=True).items():
        if getattr(t, k) != v:
            changed.append(f"{k}={v}")
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    if changed:
        audit_log(db, principal.get("email", "?"), "update_ticket", str(t.id), ",".join(changed)[:500])
    return t


@router.post("/from_event/{event_id}", response_model=TicketOut)
def from_event(event_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("tickets", "create"))):
    e = db.query(models.Event).get(event_id)
    if not e:
        raise HTTPException(404, "event not found")
    t = models.Ticket(
        title=f"{e.category.upper()} from {e.src_ip}",
        severity=e.severity,
        description=e.raw,
        src_ip=e.src_ip,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    audit_log(db, principal.get("email", "?"), "create_ticket_from_event", str(t.id), f"event={event_id}")
    return t
