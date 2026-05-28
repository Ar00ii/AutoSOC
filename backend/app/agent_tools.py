from datetime import datetime, timedelta
from typing import Any, Callable

from sqlalchemy.orm import Session

from . import models
from .geo import lookup_ip
from .intel import abuseipdb_lookup
from .notify import notify as send_notify


def _query_events(db: Session, args: dict) -> dict:
    q = db.query(models.Event).order_by(models.Event.timestamp.desc())
    if args.get("severity"):
        q = q.filter(models.Event.severity == args["severity"])
    if args.get("category"):
        q = q.filter(models.Event.category == args["category"])
    if args.get("country"):
        q = q.filter(models.Event.src_country == args["country"].upper())
    if args.get("ip"):
        q = q.filter(models.Event.src_ip == args["ip"])
    if args.get("hours"):
        since = datetime.utcnow() - timedelta(hours=int(args["hours"]))
        q = q.filter(models.Event.timestamp >= since)
    rows = q.limit(int(args.get("limit", 20))).all()
    return {
        "count": len(rows),
        "events": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "src_ip": r.src_ip,
                "src_country": r.src_country,
                "severity": r.severity,
                "category": r.category,
                "mitre_id": r.mitre_id,
                "abuse_score": r.abuse_score,
                "summary": r.summary,
            }
            for r in rows
        ],
    }


def _ip_intel(db: Session, args: dict) -> dict:
    ip = args.get("ip", "")
    if not ip:
        return {"error": "ip required"}
    geo = lookup_ip(ip)
    intel = abuseipdb_lookup(ip)
    return {**geo, **intel}


def _create_ticket(db: Session, args: dict) -> dict:
    t = models.Ticket(
        title=args.get("title", "Agent-created ticket"),
        severity=args.get("severity", "medium"),
        description=args.get("description", ""),
        src_ip=args.get("src_ip", ""),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "title": t.title, "status": t.status}


def _recommend_block(db: Session, args: dict) -> dict:
    ip = args.get("ip", "")
    reason = args.get("reason", "agent-recommended")
    severity = args.get("severity", "medium")
    if not ip:
        return {"error": "ip required"}
    existing = db.query(models.IpBlock).filter(models.IpBlock.ip == ip).first()
    if existing:
        existing.hit_count += 1
        existing.reason = reason
        existing.severity = severity
        db.commit()
        return {"id": existing.id, "ip": ip, "status": "updated"}
    b = models.IpBlock(ip=ip, reason=reason, severity=severity, hit_count=1)
    db.add(b)
    db.commit()
    db.refresh(b)
    return {"id": b.id, "ip": ip, "status": "created"}


def _notify(db: Session, args: dict) -> dict:
    title = args.get("title", "Agent notification")
    text = args.get("text", "")
    severity = args.get("severity", "medium")
    ok = send_notify(title, text, severity)
    return {"sent": ok}


def _query_tickets(db: Session, args: dict) -> dict:
    q = db.query(models.Ticket).order_by(models.Ticket.created_at.desc())
    if args.get("status"):
        q = q.filter(models.Ticket.status == args["status"])
    rows = q.limit(int(args.get("limit", 20))).all()
    return {
        "count": len(rows),
        "tickets": [
            {
                "id": t.id,
                "title": t.title,
                "severity": t.severity,
                "status": t.status,
                "src_ip": t.src_ip,
            }
            for t in rows
        ],
    }


TOOLS: dict[str, dict[str, Any]] = {
    "query_events": {
        "description": "Search recent security events with optional filters.",
        "permission": ("events", "view"),
        "handler": _query_events,
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "category": {"type": "string"},
                "country": {"type": "string", "description": "ISO-2 country code"},
                "ip": {"type": "string"},
                "hours": {"type": "integer", "description": "Look-back window in hours, default 24"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    "ip_intel": {
        "description": "Look up geolocation and AbuseIPDB reputation for an IP.",
        "permission": ("intel", "view"),
        "handler": _ip_intel,
        "input_schema": {
            "type": "object",
            "properties": {"ip": {"type": "string"}},
            "required": ["ip"],
        },
    },
    "create_ticket": {
        "description": "Open a SOC ticket so an analyst will investigate.",
        "permission": ("tickets", "create"),
        "handler": _create_ticket,
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "description": {"type": "string"},
                "src_ip": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    "recommend_block": {
        "description": "Add or upgrade an IP block recommendation for human approval.",
        "permission": ("recommendations", "execute"),
        "handler": _recommend_block,
        "input_schema": {
            "type": "object",
            "properties": {
                "ip": {"type": "string"},
                "reason": {"type": "string"},
                "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
            },
            "required": ["ip"],
        },
    },
    "notify": {
        "description": "Send a notification to the configured webhook (Slack-format).",
        "permission": ("agents", "execute"),
        "handler": _notify,
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "text": {"type": "string"},
                "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
            },
            "required": ["title", "text"],
        },
    },
    "query_tickets": {
        "description": "List recent tickets, optionally filtered by status.",
        "permission": ("tickets", "view"),
        "handler": _query_tickets,
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
}


def list_tools() -> list[dict]:
    return [
        {
            "name": name,
            "description": meta["description"],
            "permission": meta["permission"],
            "input_schema": meta["input_schema"],
        }
        for name, meta in TOOLS.items()
    ]


def claude_tool_specs(allowed: list[str]) -> list[dict]:
    return [
        {
            "name": name,
            "description": meta["description"],
            "input_schema": meta["input_schema"],
        }
        for name, meta in TOOLS.items()
        if name in allowed
    ]


def call_tool(name: str, args: dict, db: Session, principal: dict | None = None) -> dict:
    if name not in TOOLS:
        return {"error": f"unknown tool: {name}"}
    meta = TOOLS[name]
    if principal is not None:
        resource, action = meta["permission"]
        perms = principal.get("permissions", {})
        granted = perms.get(resource, [])
        is_admin = principal.get("role") == "admin"
        if not is_admin and action not in granted and "*" not in granted:
            return {
                "error": f"permission denied: caller lacks {resource}.{action} required by tool {name}",
            }
    try:
        return meta["handler"](db, args or {})
    except Exception as e:
        return {"error": str(e)}
