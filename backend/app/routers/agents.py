import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models
from ..agent_tools import list_tools
from ..agents import run_agent
from ..auth import require, require_ai
from ..audit import log as audit_log
from ..budget import budget_check, ip_quota_check_and_inc
from ..config import settings
from ..db import get_db
from ..schemas import AgentIn, AgentRunIn
from ..security import agent_run_rate, is_url_safe_outbound

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _serialize(a: models.Agent) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "description": a.description,
        "kind": a.kind,
        "trigger": a.trigger,
        "schedule_cron": a.schedule_cron or "",
        "model": a.model,
        "system_prompt": a.system_prompt,
        "user_prompt_template": a.user_prompt_template,
        "webhook_url": a.webhook_url,
        "allowed_tools": json.loads(a.allowed_tools or "[]"),
        "max_steps": a.max_steps,
        "timeout_seconds": a.timeout_seconds,
        "enabled": a.enabled,
        "created_at": a.created_at,
        "created_by": a.created_by,
    }


def _serialize_run(r: models.AgentRun) -> dict:
    return {
        "id": r.id,
        "agent_id": r.agent_id,
        "started_at": r.started_at,
        "finished_at": r.finished_at,
        "status": r.status,
        "triggered_by": r.triggered_by,
        "input": r.input,
        "output": r.output,
        "steps": r.steps,
        "error": r.error,
        "tokens_in": r.tokens_in,
        "tokens_out": r.tokens_out,
    }


@router.get("/_tools")
def tools(_=Depends(require("agents", "view"))):
    return list_tools()


@router.get("")
def list_agents(db: Session = Depends(get_db), _=Depends(require("agents", "view"))):
    return [_serialize(a) for a in db.query(models.Agent).order_by(models.Agent.name).all()]


def _validate_agent_payload(payload: AgentIn):
    if payload.kind not in ("claude", "webhook"):
        raise HTTPException(400, "kind must be claude or webhook")
    if payload.kind == "webhook":
        ok, reason = is_url_safe_outbound(payload.webhook_url)
        if not ok:
            raise HTTPException(400, f"webhook_url rejected: {reason}")
    if payload.max_steps < 1 or payload.max_steps > 20:
        raise HTTPException(400, "max_steps must be in [1,20]")
    if payload.timeout_seconds < 5 or payload.timeout_seconds > 300:
        raise HTTPException(400, "timeout_seconds must be in [5,300]")
    if len(payload.name) > 80 or len(payload.description) > 500:
        raise HTTPException(400, "name or description too long")
    if len(payload.system_prompt) > 8000 or len(payload.user_prompt_template) > 4000:
        raise HTTPException(400, "prompt too long")


@router.post("")
def create_agent(payload: AgentIn, db: Session = Depends(get_db), principal: dict = Depends(require("agents", "create"))):
    _validate_agent_payload(payload)
    if db.query(models.Agent).filter(models.Agent.name == payload.name).first():
        raise HTTPException(400, "Agent name already exists")
    a = models.Agent(
        name=payload.name,
        description=payload.description,
        kind=payload.kind,
        trigger=payload.trigger,
        schedule_cron=payload.schedule_cron,
        model=payload.model,
        system_prompt=payload.system_prompt,
        user_prompt_template=payload.user_prompt_template,
        webhook_url=payload.webhook_url,
        allowed_tools=json.dumps(payload.allowed_tools),
        max_steps=payload.max_steps,
        timeout_seconds=payload.timeout_seconds,
        enabled=1 if payload.enabled else 0,
        created_by=principal.get("email", "system"),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    try:
        from ..scheduler import sync_scheduled_agents
        sync_scheduled_agents()
    except Exception:
        pass
    audit_log(db, principal.get("email", "?"), "agent_create", str(a.id), payload.name)
    return _serialize(a)


@router.patch("/{agent_id}")
def update_agent(agent_id: int, payload: AgentIn, db: Session = Depends(get_db), principal: dict = Depends(require("agents", "update"))):
    _validate_agent_payload(payload)
    a = db.query(models.Agent).get(agent_id)
    if not a:
        raise HTTPException(404)
    a.name = payload.name
    a.description = payload.description
    a.kind = payload.kind
    a.trigger = payload.trigger
    a.schedule_cron = payload.schedule_cron
    a.model = payload.model
    a.system_prompt = payload.system_prompt
    a.user_prompt_template = payload.user_prompt_template
    a.webhook_url = payload.webhook_url
    a.allowed_tools = json.dumps(payload.allowed_tools)
    a.max_steps = payload.max_steps
    a.timeout_seconds = payload.timeout_seconds
    a.enabled = 1 if payload.enabled else 0
    db.commit()
    db.refresh(a)
    try:
        from ..scheduler import sync_scheduled_agents
        sync_scheduled_agents()
    except Exception:
        pass
    audit_log(db, principal.get("email", "?"), "agent_update", str(a.id), a.name)
    return _serialize(a)


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db), principal: dict = Depends(require("agents", "delete"))):
    a = db.query(models.Agent).get(agent_id)
    if not a:
        raise HTTPException(404)
    name = a.name
    db.query(models.AgentRun).filter(models.AgentRun.agent_id == agent_id).delete()
    db.delete(a)
    db.commit()
    audit_log(db, principal.get("email", "?"), "agent_delete", str(agent_id), name)
    return {"ok": True}


@router.post("/{agent_id}/run")
def run(
    agent_id: int,
    payload: AgentRunIn,
    request: Request,
    db: Session = Depends(get_db),
    principal: dict = Depends(require("agents", "execute")),
    _ai: dict = Depends(require_ai),
):
    allowed, _ = agent_run_rate.check(f"agent:{principal.get('id', 0)}")
    if not allowed:
        raise HTTPException(429, "Agent run rate limit exceeded")

    # Public-demo guards: per-IP quota + global daily budget cap.
    # Only enforced when AUTH_REQUIRED is false (open demo). Authenticated
    # tenants are governed by the per-principal rate limiter above.
    if not settings.auth_required:
        client_ip = (request.client.host if request.client else "0.0.0.0") or "0.0.0.0"
        ip_ok, count = ip_quota_check_and_inc(client_ip)
        if not ip_ok:
            raise HTTPException(
                429,
                f"Demo limit reached: {settings.agents_rate_limit_per_ip_day} agent runs per IP per day. Self-host to remove this cap.",
            )
        budget_ok, spent, cap = budget_check(db)
        if not budget_ok:
            raise HTTPException(
                429,
                f"Daily AI budget exhausted (${spent:.2f} / ${cap:.2f}). Try again tomorrow or self-host with your own ANTHROPIC_API_KEY.",
            )

    a = db.query(models.Agent).get(agent_id)
    if not a:
        raise HTTPException(404)
    if a.enabled != 1:
        raise HTTPException(400, "Agent is disabled")
    input_payload = payload.input or {}
    if len(json.dumps(input_payload, default=str)) > 8000:
        raise HTTPException(400, "input too large (max 8KB)")
    run = run_agent(db, a, input_payload, triggered_by=principal.get("email", "manual"), principal=principal)
    audit_log(db, principal.get("email", "?"), "agent_run", str(a.id), f"run_id={run.id} status={run.status}")
    return _serialize_run(run)


@router.get("/{agent_id}/runs")
def list_runs(agent_id: int, db: Session = Depends(get_db), _=Depends(require("agents", "view")), limit: int = 50):
    rows = (
        db.query(models.AgentRun)
        .filter(models.AgentRun.agent_id == agent_id)
        .order_by(models.AgentRun.started_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_run(r) for r in rows]


@router.get("/runs/all")
def list_all_runs(
    db: Session = Depends(get_db),
    limit: int = 100,
    triggered_by: str | None = None,
    status: str | None = None,
    _=Depends(require("agents", "view")),
):
    q = db.query(models.AgentRun).order_by(models.AgentRun.started_at.desc())
    if triggered_by:
        q = q.filter(models.AgentRun.triggered_by == triggered_by)
    if status:
        q = q.filter(models.AgentRun.status == status)
    rows = q.limit(max(1, min(limit, 500))).all()
    agents = {a.id: a.name for a in db.query(models.Agent).all()}
    return [{**_serialize_run(r), "agent_name": agents.get(r.agent_id, "?")} for r in rows]


@router.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db), _=Depends(require("agents", "view"))):
    r = db.query(models.AgentRun).get(run_id)
    if not r:
        raise HTTPException(404)
    return _serialize_run(r)
