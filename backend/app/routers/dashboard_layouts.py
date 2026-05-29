"""/api/dashboard/layouts — per-user dashboard layout persistence + widget catalog."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..db import get_db

router = APIRouter(prefix="/api/dashboard/layouts", tags=["dashboard_layouts"])


# ─────────────────────────────────────────────────────────────
#  Widget catalog — what the frontend can place on the grid.
# ─────────────────────────────────────────────────────────────

WIDGET_CATALOG = [
    # Compact KPI tiles (1 column wide)
    {"type": "kpi_events_24h",    "name": "Events 24h",           "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Total events in the last 24h"},
    {"type": "kpi_critical_24h",  "name": "Critical 24h",         "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Critical-severity events in the last 24h"},
    {"type": "kpi_open_cases",    "name": "Open cases",           "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Active case count"},
    {"type": "kpi_blocked_ips",   "name": "Blocked IPs",          "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Total active IP blocks"},
    {"type": "kpi_sla_breached",  "name": "SLA breached",         "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Open cases past their SLA"},
    {"type": "kpi_ti_iocs",       "name": "Threat-intel IoCs",    "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Active indicators in the IoC store"},
    {"type": "kpi_agent_runs_1h", "name": "Agent runs 1h",        "group": "kpi",     "default_w": 3, "default_h": 2, "desc": "Autonomous agent runs in last hour"},

    # Charts
    {"type": "chart_events_per_hour", "name": "Events per hour",   "group": "chart",  "default_w": 6, "default_h": 4, "desc": "Line chart of events bucketed by hour"},
    {"type": "chart_severity_donut",  "name": "Severity breakdown","group": "chart",  "default_w": 4, "default_h": 4, "desc": "Distribution of severities in last 24h"},
    {"type": "chart_top_categories",  "name": "Top categories",    "group": "chart",  "default_w": 4, "default_h": 4, "desc": "Top event categories in last 24h"},
    {"type": "chart_top_countries",   "name": "Top source countries","group": "chart","default_w": 4, "default_h": 4, "desc": "Top attacker source countries"},
    {"type": "chart_top_mitre",       "name": "Top MITRE techniques","group": "chart","default_w": 4, "default_h": 4, "desc": "Top MITRE ATT&CK techniques in last 24h"},
    {"type": "chart_top_asn",         "name": "Top source ASN",    "group": "chart",  "default_w": 4, "default_h": 4, "desc": "Top source ASN by event count (heuristic from IP)"},
    {"type": "chart_cases_by_status", "name": "Cases by status",   "group": "chart",  "default_w": 6, "default_h": 4, "desc": "Stacked breakdown of cases by status"},
    {"type": "chart_killchain",       "name": "Kill-chain coverage","group": "chart", "default_w": 6, "default_h": 3, "desc": "MITRE tactics observed in last 24h"},
    {"type": "chart_heatmap_hour",    "name": "Hourly heatmap",    "group": "chart",  "default_w": 8, "default_h": 3, "desc": "Events by hour-of-day over last 7 days"},

    # Live streams / lists
    {"type": "stream_recent_events",  "name": "Recent events",      "group": "live",  "default_w": 6, "default_h": 4, "desc": "Latest ingested events"},
    {"type": "stream_open_cases",     "name": "Open cases",         "group": "live",  "default_w": 6, "default_h": 4, "desc": "Cases needing attention"},
    {"type": "stream_approval_queue", "name": "Approval queue",     "group": "live",  "default_w": 6, "default_h": 3, "desc": "Playbook runs awaiting approval"},
    {"type": "stream_agent_runs",     "name": "Agent activity",     "group": "live",  "default_w": 6, "default_h": 4, "desc": "Recent agent runs with status"},
    {"type": "stream_ti_feeds",       "name": "TI feed health",     "group": "live",  "default_w": 5, "default_h": 3, "desc": "Pull status per intel feed"},
    {"type": "stream_recent_reports", "name": "Recent reports",     "group": "live",  "default_w": 6, "default_h": 4, "desc": "AI-generated incident reports"},
    {"type": "stream_audit",          "name": "Audit log",          "group": "live",  "default_w": 6, "default_h": 4, "desc": "Recent operator and agent actions"},

    # Spatial / globe
    {"type": "globe_3d",              "name": "3D threat globe",    "group": "spatial","default_w": 6, "default_h": 5, "desc": "Live attack arcs over a wireframe globe"},
]


@router.get("/_catalog")
def catalog(_=Depends(require("events", "view"))):
    return {"widgets": WIDGET_CATALOG}


# ─────────────────────────────────────────────────────────────
#  Layout templates — opinionated starting points
# ─────────────────────────────────────────────────────────────

LAYOUT_TEMPLATES = [
    {
        "id": "operations",
        "name": "Operations",
        "description": "Day-to-day SOC view: KPIs, live events, open cases, approvals.",
        "widgets": [
            {"i": "op1", "type": "kpi_events_24h",     "x": 0, "y": 0, "w": 3, "h": 2},
            {"i": "op2", "type": "kpi_critical_24h",   "x": 3, "y": 0, "w": 3, "h": 2},
            {"i": "op3", "type": "kpi_open_cases",     "x": 6, "y": 0, "w": 3, "h": 2},
            {"i": "op4", "type": "kpi_sla_breached",   "x": 9, "y": 0, "w": 3, "h": 2},
            {"i": "op5", "type": "globe_3d",           "x": 0, "y": 2, "w": 6, "h": 6},
            {"i": "op6", "type": "stream_recent_events","x": 6, "y": 2, "w": 6, "h": 6},
            {"i": "op7", "type": "stream_open_cases",  "x": 0, "y": 8, "w": 6, "h": 4},
            {"i": "op8", "type": "stream_approval_queue","x": 6, "y": 8, "w": 6, "h": 4},
            {"i": "op9", "type": "chart_events_per_hour","x": 0, "y":12, "w":12, "h": 3},
        ],
    },
    {
        "id": "threat_hunting",
        "name": "Threat hunting",
        "description": "Investigation surface: kill-chain, MITRE, top countries/ASN, TI feeds.",
        "widgets": [
            {"i": "th1", "type": "kpi_ti_iocs",        "x": 0, "y": 0, "w": 3, "h": 2},
            {"i": "th2", "type": "kpi_critical_24h",   "x": 3, "y": 0, "w": 3, "h": 2},
            {"i": "th3", "type": "kpi_blocked_ips",    "x": 6, "y": 0, "w": 3, "h": 2},
            {"i": "th4", "type": "kpi_agent_runs_1h",  "x": 9, "y": 0, "w": 3, "h": 2},
            {"i": "th5", "type": "chart_killchain",    "x": 0, "y": 2, "w": 6, "h": 4},
            {"i": "th6", "type": "chart_top_mitre",    "x": 6, "y": 2, "w": 6, "h": 4},
            {"i": "th7", "type": "chart_top_countries","x": 0, "y": 6, "w": 4, "h": 4},
            {"i": "th8", "type": "chart_top_asn",      "x": 4, "y": 6, "w": 4, "h": 4},
            {"i": "th9", "type": "stream_ti_feeds",    "x": 8, "y": 6, "w": 4, "h": 4},
            {"i": "th10","type": "chart_heatmap_hour", "x": 0, "y":10, "w":12, "h": 4},
        ],
    },
    {
        "id": "compliance",
        "name": "Compliance",
        "description": "Audit & SLA view: cases by status, agent activity, blocked IPs, audit trail.",
        "widgets": [
            {"i": "co1", "type": "kpi_open_cases",     "x": 0, "y": 0, "w": 3, "h": 2},
            {"i": "co2", "type": "kpi_sla_breached",   "x": 3, "y": 0, "w": 3, "h": 2},
            {"i": "co3", "type": "kpi_blocked_ips",    "x": 6, "y": 0, "w": 3, "h": 2},
            {"i": "co4", "type": "kpi_agent_runs_1h",  "x": 9, "y": 0, "w": 3, "h": 2},
            {"i": "co5", "type": "chart_cases_by_status","x": 0, "y": 2, "w": 6, "h": 4},
            {"i": "co6", "type": "chart_events_per_hour","x": 6, "y": 2, "w": 6, "h": 4},
            {"i": "co7", "type": "stream_open_cases",  "x": 0, "y": 6, "w": 6, "h": 5},
            {"i": "co8", "type": "stream_recent_reports","x": 6, "y": 6, "w": 6, "h": 5},
        ],
    },
    {
        "id": "executive",
        "name": "Executive",
        "description": "Big-number summary for leadership: KPIs only, trend lines.",
        "widgets": [
            {"i": "ex1", "type": "kpi_events_24h",   "x": 0, "y": 0, "w": 3, "h": 3},
            {"i": "ex2", "type": "kpi_critical_24h", "x": 3, "y": 0, "w": 3, "h": 3},
            {"i": "ex3", "type": "kpi_open_cases",   "x": 6, "y": 0, "w": 3, "h": 3},
            {"i": "ex4", "type": "kpi_blocked_ips",  "x": 9, "y": 0, "w": 3, "h": 3},
            {"i": "ex5", "type": "chart_events_per_hour","x": 0, "y": 3, "w": 12,"h": 5},
            {"i": "ex6", "type": "chart_severity_donut", "x": 0, "y": 8, "w": 4, "h": 4},
            {"i": "ex7", "type": "chart_top_categories", "x": 4, "y": 8, "w": 4, "h": 4},
            {"i": "ex8", "type": "chart_top_countries",  "x": 8, "y": 8, "w": 4, "h": 4},
        ],
    },
]


@router.get("/_templates")
def list_templates(_=Depends(require("events", "view"))):
    """Return the built-in templates the user can fork into their own layout."""
    return {"templates": [
        {"id": t["id"], "name": t["name"], "description": t["description"], "widget_count": len(t["widgets"])}
        for t in LAYOUT_TEMPLATES
    ]}


class TemplateForkIn(BaseModel):
    template_id: str
    name: str | None = None


@router.post("/_fork_template")
def fork_template(
    payload: TemplateForkIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    tmpl = next((t for t in LAYOUT_TEMPLATES if t["id"] == payload.template_id), None)
    if not tmpl:
        raise HTTPException(404, f"template {payload.template_id} not found")
    layout = models.DashboardLayout(
        user_id=_user_id(principal),
        name=payload.name or tmpl["name"],
        widgets=json.dumps(tmpl["widgets"]),
        is_default=0,
    )
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return _serialize(layout)


# ─────────────────────────────────────────────────────────────
#  Export / import as portable JSON
# ─────────────────────────────────────────────────────────────

@router.get("/{layout_id}/_export")
def export_layout(
    layout_id: int,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    layout = db.query(models.DashboardLayout).get(layout_id)
    if not layout:
        raise HTTPException(404)
    return {
        "schema": "autosoc.dashboard_layout.v1",
        "name": layout.name,
        "widgets": json.loads(layout.widgets or "[]"),
    }


class ImportIn(BaseModel):
    schema_: str | None = Field(default=None, alias="schema")
    name: str = Field(..., max_length=120)
    widgets: list[dict]


@router.post("/_import")
def import_layout(
    payload: ImportIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    # Validate widget shapes minimally
    types_known = {w["type"] for w in WIDGET_CATALOG}
    for w in payload.widgets:
        if not isinstance(w, dict) or "type" not in w or w["type"] not in types_known:
            raise HTTPException(400, f"unknown widget type: {w.get('type','?')}")
        for k in ("i", "x", "y", "w", "h"):
            if k not in w:
                raise HTTPException(400, f"widget missing field: {k}")
    layout = models.DashboardLayout(
        user_id=_user_id(principal),
        name=payload.name,
        widgets=json.dumps(payload.widgets),
        is_default=0,
    )
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return _serialize(layout)


# ─────────────────────────────────────────────────────────────
#  Layouts CRUD
# ─────────────────────────────────────────────────────────────

class LayoutIn(BaseModel):
    name: str = Field(..., max_length=120)
    widgets: list[dict] = Field(default_factory=list)
    is_default: bool = False


def _serialize(l: models.DashboardLayout) -> dict:
    return {
        "id": l.id,
        "user_id": l.user_id,
        "name": l.name,
        "is_default": bool(l.is_default),
        "widgets": json.loads(l.widgets or "[]"),
        "created_at": l.created_at.isoformat() if l.created_at else None,
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
    }


def _user_id(principal: dict) -> int | None:
    uid = principal.get("id")
    # Anonymous demo principal has id=0 which we treat as "shared default".
    return int(uid) if uid else None


@router.get("")
def list_layouts(
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    """List layouts that belong to the current user, plus shared defaults."""
    uid = _user_id(principal)
    q = db.query(models.DashboardLayout)
    if uid:
        q = q.filter(
            (models.DashboardLayout.user_id == uid) | (models.DashboardLayout.user_id.is_(None))
        )
    rows = q.order_by(models.DashboardLayout.updated_at.desc()).all()
    return [_serialize(r) for r in rows]


@router.post("")
def create_layout(
    payload: LayoutIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    uid = _user_id(principal)
    layout = models.DashboardLayout(
        user_id=uid,
        name=payload.name,
        widgets=json.dumps(payload.widgets or []),
        is_default=1 if payload.is_default else 0,
    )
    if payload.is_default and uid:
        # only one default per user
        db.query(models.DashboardLayout).filter(
            models.DashboardLayout.user_id == uid,
            models.DashboardLayout.is_default == 1,
        ).update({"is_default": 0})
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return _serialize(layout)


@router.put("/{layout_id}")
@router.patch("/{layout_id}")
def update_layout(
    layout_id: int,
    payload: LayoutIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    layout = db.query(models.DashboardLayout).get(layout_id)
    if not layout:
        raise HTTPException(404)
    uid = _user_id(principal)
    # Only owner (or anonymous demo) may edit
    if layout.user_id and layout.user_id != uid:
        raise HTTPException(403)
    layout.name = payload.name
    layout.widgets = json.dumps(payload.widgets or [])
    layout.updated_at = datetime.utcnow()
    if payload.is_default and uid:
        db.query(models.DashboardLayout).filter(
            models.DashboardLayout.user_id == uid,
            models.DashboardLayout.is_default == 1,
            models.DashboardLayout.id != layout.id,
        ).update({"is_default": 0})
        layout.is_default = 1
    db.commit()
    db.refresh(layout)
    return _serialize(layout)


@router.delete("/{layout_id}")
def delete_layout(
    layout_id: int,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("events", "view")),
):
    layout = db.query(models.DashboardLayout).get(layout_id)
    if not layout:
        raise HTTPException(404)
    uid = _user_id(principal)
    if layout.user_id and layout.user_id != uid:
        raise HTTPException(403)
    db.delete(layout)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────
#  Bonus data endpoints for widgets that don't have one yet
# ─────────────────────────────────────────────────────────────

@router.get("/_heatmap_hour")
def heatmap_hour(
    db: Session = Depends(get_db),
    _=Depends(require("events", "view")),
):
    """Returns events bucketed by (day_of_week, hour_of_day) for last 7 days."""
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=7)
    rows = (
        db.query(models.Event.timestamp)
        .filter(models.Event.timestamp >= since)
        .all()
    )
    # 7 × 24 grid
    grid = [[0] * 24 for _ in range(7)]
    for (ts,) in rows:
        if ts:
            grid[ts.weekday()][ts.hour] += 1
    return {"grid": grid, "max": max((max(r) for r in grid), default=0)}


@router.get("/_top_mitre")
def top_mitre(
    db: Session = Depends(get_db),
    _=Depends(require("events", "view")),
):
    from datetime import timedelta
    from sqlalchemy import func
    since = datetime.utcnow() - timedelta(hours=24)
    rows = (
        db.query(models.Event.mitre_id, models.Event.mitre_name, func.count(models.Event.id))
        .filter(models.Event.timestamp >= since, models.Event.mitre_id != "")
        .group_by(models.Event.mitre_id, models.Event.mitre_name)
        .order_by(func.count(models.Event.id).desc())
        .limit(8)
        .all()
    )
    return [{"key": f"{mid} {(mname or '')[:24]}", "count": c} for mid, mname, c in rows]


@router.get("/_top_asn")
def top_asn(
    db: Session = Depends(get_db),
    _=Depends(require("events", "view")),
):
    """Group by source IP /16 as a proxy for ASN when no real ASN data is on hand."""
    from datetime import timedelta
    from sqlalchemy import func
    since = datetime.utcnow() - timedelta(hours=24)
    rows = (
        db.query(models.Event.src_ip)
        .filter(models.Event.timestamp >= since, models.Event.src_ip != "")
        .all()
    )
    counts: dict[str, int] = {}
    for (ip,) in rows:
        if not ip or ":" in ip:
            continue
        parts = ip.split(".")
        if len(parts) < 2:
            continue
        prefix = f"{parts[0]}.{parts[1]}.0.0/16"
        counts[prefix] = counts.get(prefix, 0) + 1
    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:8]
    return [{"key": k, "count": v} for k, v in top]


@router.get("/_cases_by_status")
def cases_by_status(
    db: Session = Depends(get_db),
    _=Depends(require("events", "view")),
):
    from sqlalchemy import func
    rows = (
        db.query(models.Case.status, func.count(models.Case.id))
        .group_by(models.Case.status)
        .all()
    )
    return [{"key": s or "?", "count": c} for s, c in rows]


@router.get("/_killchain_coverage")
def killchain_coverage(
    db: Session = Depends(get_db),
    _=Depends(require("events", "view")),
):
    """Returns event count per MITRE tactic in last 24h."""
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=24)
    rows = (
        db.query(models.Event.mitre_tactic)
        .filter(models.Event.timestamp >= since, models.Event.mitre_tactic != "")
        .all()
    )
    counts: dict[str, int] = {}
    for (t,) in rows:
        if t:
            counts[t] = counts.get(t, 0) + 1
    return counts
