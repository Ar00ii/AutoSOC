"""Case (Incident) module.

A Case groups multiple related events / tickets / IPs / actor into one
investigation unit. The SOC analyst lives here: timeline, kill-chain,
notes, evidence, status transitions.

Auto-creation: when a correlation rule fires (severity ≥ high) and no
open case exists for the same cluster, a new case is opened with the
triggering events attached.

Status transitions: open → investigating → contained → closed.
SLA is computed from severity at creation.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from . import models

log = logging.getLogger("autosoc.cases")


# SLA buckets (time until first response). Tuned for tier-1 SOC.
SLA_HOURS = {
    "critical": 1,
    "high":     4,
    "medium":   24,
    "low":      72,
}


def _next_case_number(db: Session) -> str:
    year = datetime.utcnow().year
    last = (
        db.query(models.Case)
        .filter(models.Case.case_number.like(f"CASE-{year}-%"))
        .order_by(models.Case.id.desc())
        .first()
    )
    if last and last.case_number:
        try:
            n = int(last.case_number.split("-")[-1])
            return f"CASE-{year}-{n + 1:04d}"
        except (ValueError, IndexError):
            pass
    return f"CASE-{year}-0001"


def create_case(
    db: Session,
    *,
    title: str,
    severity: str,
    category: str = "unknown",
    assignee: str = "",
    actor: str = "system",
    summary: str = "",
    event_ids: Optional[list[int]] = None,
) -> models.Case:
    """Create a case, optionally attaching events. Returns the Case."""
    now = datetime.utcnow()
    sla_hours = SLA_HOURS.get(severity, SLA_HOURS["medium"])
    case = models.Case(
        case_number=_next_case_number(db),
        title=title[:200],
        severity=severity,
        status="open",
        category=category,
        created_at=now,
        updated_at=now,
        assignee=assignee,
        summary=summary[:4000],
        sla_due_at=now + timedelta(hours=sla_hours),
        kill_chain=json.dumps([]),
    )
    db.add(case)
    db.flush()  # need id for FK links

    # Attach events + seed timeline
    if event_ids:
        attach_events(db, case, event_ids, actor=actor, log_to_timeline=False)

    db.add(models.CaseTimeline(
        case_id=case.id,
        kind="status_change",
        actor=actor,
        body=f"case opened (sev={severity}, cat={category})",
    ))
    db.commit()
    db.refresh(case)
    log.info("cases.create id=%d num=%s sev=%s", case.id, case.case_number, severity)
    return case


def attach_events(
    db: Session,
    case: models.Case,
    event_ids: list[int],
    *,
    actor: str = "system",
    log_to_timeline: bool = True,
) -> int:
    """Link events to case (idempotent). Updates kill-chain. Returns count added."""
    if not event_ids:
        return 0
    existing = {
        e.event_id
        for e in db.query(models.CaseEvent).filter(models.CaseEvent.case_id == case.id).all()
    }
    new_ids = [eid for eid in event_ids if eid not in existing]
    added = 0
    tactics_seen = set(json.loads(case.kill_chain or "[]"))

    for eid in new_ids:
        event = db.query(models.Event).get(eid)
        if not event:
            continue
        db.add(models.CaseEvent(case_id=case.id, event_id=eid))
        if event.mitre_tactic:
            tactics_seen.add(event.mitre_tactic)
        if log_to_timeline:
            db.add(models.CaseTimeline(
                case_id=case.id,
                timestamp=event.timestamp,
                kind="event",
                actor="ingest",
                body=f"{event.severity}/{event.category} from {event.src_ip} ({event.mitre_id})",
                ref_id=event.id,
                ref_kind="event",
            ))
        added += 1

    case.kill_chain = json.dumps(sorted(tactics_seen))
    case.updated_at = datetime.utcnow()
    db.commit()
    return added


def add_note(db: Session, case: models.Case, *, actor: str, body: str) -> models.CaseTimeline:
    note = models.CaseTimeline(
        case_id=case.id,
        kind="note",
        actor=actor,
        body=body[:8000],
    )
    db.add(note)
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return note


def add_action(
    db: Session,
    case: models.Case,
    *,
    actor: str,
    body: str,
    ref_id: Optional[int] = None,
    ref_kind: str = "",
) -> models.CaseTimeline:
    item = models.CaseTimeline(
        case_id=case.id,
        kind="action",
        actor=actor,
        body=body[:4000],
        ref_id=ref_id,
        ref_kind=ref_kind,
    )
    db.add(item)
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


VALID_STATUS = {"open", "investigating", "contained", "closed"}


def set_status(db: Session, case: models.Case, status: str, actor: str) -> models.Case:
    if status not in VALID_STATUS:
        raise ValueError(f"invalid status {status}")
    if status == case.status:
        return case
    prev = case.status
    case.status = status
    case.updated_at = datetime.utcnow()
    if status == "closed":
        case.closed_at = datetime.utcnow()
    db.add(models.CaseTimeline(
        case_id=case.id,
        kind="status_change",
        actor=actor,
        body=f"{prev} → {status}",
    ))
    db.commit()
    db.refresh(case)
    return case


# ─────────────────────────────────────────────────────────────
#  Auto-correlation: open a case from a correlation alert.
# ─────────────────────────────────────────────────────────────

def case_for_cluster(db: Session, cluster_key: str) -> Optional[models.Case]:
    """Find an open case that already covers events with this cluster_key."""
    if not cluster_key:
        return None
    # Cases owning events with same cluster_key, still open/investigating
    q = (
        db.query(models.Case)
        .join(models.CaseEvent, models.CaseEvent.case_id == models.Case.id)
        .join(models.Event, models.Event.id == models.CaseEvent.event_id)
        .filter(
            models.Event.cluster_key == cluster_key,
            models.Case.status.in_(["open", "investigating"]),
        )
        .order_by(models.Case.created_at.desc())
    )
    return q.first()


def ensure_case_for_correlation(
    db: Session,
    *,
    cluster_key: str,
    title: str,
    severity: str,
    category: str,
    event_ids: list[int],
    summary: str = "",
) -> models.Case:
    """Idempotent: attach to existing open case for cluster, else create new."""
    existing = case_for_cluster(db, cluster_key)
    if existing:
        attach_events(db, existing, event_ids, actor="correlation")
        # Bump severity if the new events are worse
        from .ti import SEVERITY_ORDER
        if (
            severity in SEVERITY_ORDER
            and SEVERITY_ORDER.index(severity) > SEVERITY_ORDER.index(existing.severity)
        ):
            existing.severity = severity
            db.add(models.CaseTimeline(
                case_id=existing.id,
                kind="status_change",
                actor="correlation",
                body=f"severity escalated to {severity}",
            ))
            db.commit()
        return existing
    return create_case(
        db,
        title=title,
        severity=severity,
        category=category,
        actor="correlation",
        summary=summary,
        event_ids=event_ids,
    )


# ─────────────────────────────────────────────────────────────
#  Read helpers for the API
# ─────────────────────────────────────────────────────────────

def serialize_case(c: models.Case, db: Session) -> dict:
    ev_count = (
        db.query(models.CaseEvent).filter(models.CaseEvent.case_id == c.id).count()
    )
    return {
        "id": c.id,
        "case_number": c.case_number,
        "title": c.title,
        "severity": c.severity,
        "status": c.status,
        "category": c.category,
        "assignee": c.assignee,
        "summary": c.summary,
        "kill_chain": json.loads(c.kill_chain or "[]"),
        "event_count": ev_count,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "closed_at": c.closed_at.isoformat() if c.closed_at else None,
        "sla_due_at": c.sla_due_at.isoformat() if c.sla_due_at else None,
        "sla_breached": bool(
            c.sla_due_at
            and c.status not in ("closed", "contained")
            and c.sla_due_at.replace(tzinfo=None) < datetime.utcnow()
        ),
    }


def serialize_timeline(t: models.CaseTimeline) -> dict:
    return {
        "id": t.id,
        "case_id": t.case_id,
        "timestamp": t.timestamp.isoformat() if t.timestamp else None,
        "kind": t.kind,
        "actor": t.actor,
        "body": t.body,
        "ref_id": t.ref_id,
        "ref_kind": t.ref_kind,
    }
