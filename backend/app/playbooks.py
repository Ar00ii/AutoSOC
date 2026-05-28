"""Playbooks engine — YAML-defined IR flows.

A playbook is a sequence of steps. Each step calls a primitive (tool)
with templated arguments. Variables come from the trigger context
(event, case, IP, user) and from previous steps.

Example playbook (YAML):

```yaml
name: "SSH brute force containment"
description: Triages a brute-force SSH burst end-to-end.
trigger:
  kind: on_event
  filter:
    category: [bruteforce]
    severity: [high, critical]
steps:
  - id: enrich
    tool: ip_intel
    args: { ip: "{{event.src_ip}}" }
  - id: open_case
    tool: open_case
    args:
      title: "SSH brute force from {{event.src_ip}}"
      severity: "{{event.severity}}"
      category: bruteforce
      event_ids: [{{event.id}}]
  - id: ticket
    tool: create_ticket
    args:
      title: "Investigate {{event.src_ip}}"
      severity: "{{event.severity}}"
      case_id: "{{steps.open_case.id}}"
  - id: block
    tool: recommend_block
    approval_required: true     # halts here for human approve
    args: { ip: "{{event.src_ip}}", ttl_hours: 24 }
  - id: notify
    tool: notify
    args:
      channel: "#soc-alerts"
      text: "Case {{steps.open_case.case_number}} opened for {{event.src_ip}}"
```

Tools are looked up in `agent_tools.TOOL_REGISTRY` so the playbook
engine shares the agent toolbox. Extra tools (`open_case`, `attach_to_case`)
are registered locally.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Callable, Optional

import yaml
from sqlalchemy.orm import Session

from . import models, cases as cases_mod

log = logging.getLogger("autosoc.playbooks")


# ─────────────────────────────────────────────────────────────
#  Template substitution
# ─────────────────────────────────────────────────────────────

_TEMPLATE_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def _lookup(ctx: dict, path: str) -> Any:
    """Resolve `event.src_ip` / `steps.enrich.abuse_score` against the context."""
    parts = path.split(".")
    cur: Any = ctx
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            cur = getattr(cur, p, None)
        if cur is None:
            return ""
    return cur


def render(value: Any, ctx: dict) -> Any:
    """Recursively render Jinja-lite templates inside strings/dicts/lists."""
    if isinstance(value, str):
        # Whole-string template like "{{event.id}}" → keep native type
        m = _TEMPLATE_RE.fullmatch(value.strip())
        if m:
            return _lookup(ctx, m.group(1))
        return _TEMPLATE_RE.sub(lambda x: str(_lookup(ctx, x.group(1))), value)
    if isinstance(value, list):
        return [render(v, ctx) for v in value]
    if isinstance(value, dict):
        return {k: render(v, ctx) for k, v in value.items()}
    return value


# ─────────────────────────────────────────────────────────────
#  Playbook-only tools — wrappers around case / event primitives
# ─────────────────────────────────────────────────────────────

def _tool_open_case(db: Session, args: dict, principal: dict) -> dict:
    case = cases_mod.create_case(
        db,
        title=args.get("title", "Untitled incident"),
        severity=args.get("severity", "medium"),
        category=args.get("category", "unknown"),
        assignee=args.get("assignee", ""),
        summary=args.get("summary", ""),
        event_ids=args.get("event_ids") or [],
        actor=principal.get("email", "playbook"),
    )
    return cases_mod.serialize_case(case, db)


def _tool_attach_event(db: Session, args: dict, principal: dict) -> dict:
    case = db.query(models.Case).get(int(args["case_id"]))
    if not case:
        return {"error": "case not found"}
    added = cases_mod.attach_events(
        db, case, [int(args["event_id"])], actor=principal.get("email", "playbook")
    )
    return {"added": added, "case_id": case.id}


def _tool_set_case_status(db: Session, args: dict, principal: dict) -> dict:
    case = db.query(models.Case).get(int(args["case_id"]))
    if not case:
        return {"error": "case not found"}
    cases_mod.set_status(db, case, args["status"], principal.get("email", "playbook"))
    return {"id": case.id, "status": case.status}


# Per-playbook extension registry
PLAYBOOK_TOOLS: dict[str, Callable[[Session, dict, dict], dict]] = {
    "open_case":       _tool_open_case,
    "attach_event":    _tool_attach_event,
    "set_case_status": _tool_set_case_status,
}


# ─────────────────────────────────────────────────────────────
#  Step execution
# ─────────────────────────────────────────────────────────────

def _resolve_tool(name: str) -> Optional[Callable]:
    """Return a callable(db, args, principal) -> dict for the tool name."""
    if name in PLAYBOOK_TOOLS:
        return PLAYBOOK_TOOLS[name]
    # Fall back to the agent toolbox. The agent tools use signature
    # handler(db, principal, **kwargs); wrap to the playbook contract.
    try:
        from .agent_tools import TOOLS
        entry = TOOLS.get(name)
        if not entry:
            return None
        handler = entry["handler"]

        def _wrapped(db, args: dict, principal: dict, _h=handler) -> dict:
            # agent tool handlers expect (db, args_dict)
            return _h(db, args or {})

        return _wrapped
    except Exception:  # noqa: BLE001
        return None


def _run_step(
    db: Session,
    step: dict,
    ctx: dict,
    principal: dict,
) -> dict:
    """Execute one step. Returns {status, output|error, ms}."""
    started = datetime.utcnow()
    tool_name = step.get("tool", "")
    fn = _resolve_tool(tool_name)
    if not fn:
        return {"status": "failed", "error": f"unknown tool: {tool_name}", "ms": 0}

    try:
        args = render(step.get("args") or {}, ctx)
    except Exception as e:  # noqa: BLE001
        return {"status": "failed", "error": f"render failed: {e}", "ms": 0}

    try:
        out = fn(db, args, principal)
    except Exception as e:  # noqa: BLE001
        log.warning("playbook step %s failed: %s", step.get("id"), e)
        return {"status": "failed", "error": str(e)[:500], "ms": _ms(started)}

    return {"status": "ok", "output": out, "ms": _ms(started)}


def _ms(started: datetime) -> int:
    return int((datetime.utcnow() - started).total_seconds() * 1000)


# ─────────────────────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────────────────────

def parse_playbook(yaml_body: str) -> dict:
    data = yaml.safe_load(yaml_body) or {}
    if not isinstance(data, dict):
        raise ValueError("playbook root must be a mapping")
    if not isinstance(data.get("steps"), list) or not data["steps"]:
        raise ValueError("playbook must declare a non-empty steps list")
    for i, step in enumerate(data["steps"]):
        if not isinstance(step, dict) or "tool" not in step:
            raise ValueError(f"step {i} must be a mapping with a tool key")
    return data


def run(
    db: Session,
    playbook: models.Playbook,
    *,
    event: Optional[models.Event] = None,
    case: Optional[models.Case] = None,
    extra_ctx: Optional[dict] = None,
    principal: Optional[dict] = None,
    triggered_by: str = "system",
) -> models.PlaybookRun:
    """Execute a playbook. Halts at first failure or pending-approval step."""
    principal = principal or {"email": triggered_by}

    try:
        defn = parse_playbook(playbook.yaml_body)
    except (yaml.YAMLError, ValueError) as e:
        run = models.PlaybookRun(
            playbook_id=playbook.id,
            event_id=event.id if event else None,
            case_id=case.id if case else None,
            triggered_by=triggered_by,
            status="failed",
            error=f"parse error: {e}",
            steps="[]",
            finished_at=datetime.utcnow(),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    ctx: dict = {
        "event": _event_dict(event) if event else {},
        "case": cases_mod.serialize_case(case, db) if case else {},
        "steps": {},
    }
    if extra_ctx:
        ctx.update(extra_ctx)

    pb_run = models.PlaybookRun(
        playbook_id=playbook.id,
        event_id=event.id if event else None,
        case_id=case.id if case else None,
        triggered_by=triggered_by,
        status="running",
        steps="[]",
    )
    db.add(pb_run)
    db.commit()
    db.refresh(pb_run)

    step_results: list[dict] = []

    for i, step in enumerate(defn["steps"]):
        # Approval gate
        if step.get("approval_required") and playbook.require_approval:
            pb_run.status = "waiting_approval"
            pb_run.pending_approval_step = i
            pb_run.steps = json.dumps(step_results)
            db.commit()
            log.info("playbook %s paused for approval at step %d", playbook.name, i)
            return pb_run

        result = _run_step(db, step, ctx, principal)
        step_results.append({
            "id": step.get("id", f"step_{i}"),
            "tool": step["tool"],
            **result,
        })

        if result["status"] == "ok":
            ctx["steps"][step.get("id", f"step_{i}")] = result.get("output", {})
        else:
            pb_run.status = "failed"
            pb_run.error = result.get("error", "step failed")
            break

        # Attach this step to the case timeline so the analyst sees it
        if case:
            cases_mod.add_action(
                db,
                case,
                actor=f"playbook:{playbook.name}",
                body=f"step {step.get('id', i)} → {step['tool']} ({result['ms']}ms)",
                ref_id=pb_run.id,
                ref_kind="playbook_run",
            )

    if pb_run.status == "running":
        pb_run.status = "completed"
    pb_run.finished_at = datetime.utcnow()
    pb_run.steps = json.dumps(step_results)
    pb_run.output = json.dumps({k: v for k, v in ctx["steps"].items()})[:60_000]
    db.commit()
    db.refresh(pb_run)
    return pb_run


def resume_after_approval(
    db: Session,
    pb_run: models.PlaybookRun,
    *,
    approved: bool,
    actor: str,
) -> models.PlaybookRun:
    """Continue (or abort) a run that was paused at an approval gate."""
    if pb_run.status != "waiting_approval":
        return pb_run
    if not approved:
        pb_run.status = "aborted"
        pb_run.error = f"approval denied by {actor}"
        pb_run.finished_at = datetime.utcnow()
        db.commit()
        return pb_run

    playbook = db.query(models.Playbook).get(pb_run.playbook_id)
    if not playbook:
        return pb_run
    defn = parse_playbook(playbook.yaml_body)

    case = db.query(models.Case).get(pb_run.case_id) if pb_run.case_id else None
    event = db.query(models.Event).get(pb_run.event_id) if pb_run.event_id else None
    ctx: dict = {
        "event": _event_dict(event) if event else {},
        "case": cases_mod.serialize_case(case, db) if case else {},
        "steps": {},
    }
    step_results: list[dict] = json.loads(pb_run.steps or "[]")
    for r in step_results:
        if r.get("status") == "ok":
            ctx["steps"][r["id"]] = r.get("output", {})

    start_at = pb_run.pending_approval_step or 0
    principal = {"email": actor}

    for i in range(start_at, len(defn["steps"])):
        step = defn["steps"][i]
        result = _run_step(db, step, ctx, principal)
        step_results.append({
            "id": step.get("id", f"step_{i}"),
            "tool": step["tool"],
            **result,
        })
        if result["status"] == "ok":
            ctx["steps"][step.get("id", f"step_{i}")] = result.get("output", {})
        else:
            pb_run.status = "failed"
            pb_run.error = result.get("error", "step failed")
            break

    if pb_run.status not in ("failed", "aborted"):
        pb_run.status = "completed"
    pb_run.pending_approval_step = None
    pb_run.finished_at = datetime.utcnow()
    pb_run.steps = json.dumps(step_results)
    db.commit()
    return pb_run


def _event_dict(event: models.Event) -> dict:
    return {
        "id": event.id,
        "src_ip": event.src_ip,
        "src_country": event.src_country,
        "severity": event.severity,
        "category": event.category,
        "mitre_id": event.mitre_id,
        "mitre_tactic": event.mitre_tactic,
        "abuse_score": event.abuse_score,
        "known_bad": event.known_bad,
        "raw": (event.raw or "")[:2000],
        "summary": event.summary,
        "timestamp": event.timestamp.isoformat() if event.timestamp else "",
    }


# ─────────────────────────────────────────────────────────────
#  Match on ingest — pick playbooks whose trigger filter accepts the event
# ─────────────────────────────────────────────────────────────

def matching_playbooks(db: Session, event: models.Event) -> list[models.Playbook]:
    out: list[models.Playbook] = []
    for pb in (
        db.query(models.Playbook)
        .filter(models.Playbook.enabled == 1, models.Playbook.trigger_kind == "on_event")
        .all()
    ):
        try:
            f = json.loads(pb.trigger_filter or "{}")
        except json.JSONDecodeError:
            continue
        if _match_filter(event, f):
            out.append(pb)
    return out


def _match_filter(event: models.Event, f: dict) -> bool:
    def ok(key: str, val: str) -> bool:
        allowed = f.get(key)
        if not allowed:
            return True
        return val in allowed

    return (
        ok("category", event.category or "")
        and ok("severity", event.severity or "")
        and ok("source", event.source or "")
        and ok("country", event.src_country or "")
    )


# ─────────────────────────────────────────────────────────────
#  Default playbooks seeded on first start
# ─────────────────────────────────────────────────────────────

DEFAULT_PLAYBOOKS = [
    {
        "name": "SSH brute-force containment",
        "description": "Open case, ticket, recommend block, notify Slack for SSH brute force bursts.",
        "trigger_kind": "on_event",
        "trigger_filter": {"category": ["bruteforce", "brute_force"], "severity": ["high", "critical"]},
        "require_approval": 1,
        "yaml": """
name: SSH brute-force containment
steps:
  - id: enrich
    tool: ip_intel
    args: { ip: "{{event.src_ip}}" }
  - id: open_case
    tool: open_case
    args:
      title: "SSH brute force from {{event.src_ip}}"
      severity: "{{event.severity}}"
      category: bruteforce
      event_ids: [ "{{event.id}}" ]
  - id: ticket
    tool: create_ticket
    args:
      title: "Investigate {{event.src_ip}}"
      severity: "{{event.severity}}"
  - id: block
    tool: recommend_block
    approval_required: true
    args:
      ip: "{{event.src_ip}}"
      reason: "ssh brute-force burst"
  - id: notify
    tool: notify
    args:
      channel: "#soc-alerts"
      text: "Case opened for {{event.src_ip}} — see AutoSoc"
""".strip(),
    },
    {
        "name": "Critical SQLi triage",
        "description": "Open case + ticket + notify for any critical SQLi event.",
        "trigger_kind": "on_event",
        "trigger_filter": {"category": ["sqli"], "severity": ["critical"]},
        "require_approval": 0,
        "yaml": """
name: Critical SQLi triage
steps:
  - id: enrich
    tool: ip_intel
    args: { ip: "{{event.src_ip}}" }
  - id: open_case
    tool: open_case
    args:
      title: "SQLi attempt from {{event.src_ip}}"
      severity: critical
      category: sqli
      event_ids: [ "{{event.id}}" ]
  - id: ticket
    tool: create_ticket
    args:
      title: "Block + WAF tune for {{event.src_ip}}"
      severity: critical
  - id: notify
    tool: notify
    args:
      channel: "#soc-alerts"
      text: "CRITICAL SQLi from {{event.src_ip}} — case opened"
""".strip(),
    },
]


def ensure_default_playbooks(db: Session) -> None:
    for d in DEFAULT_PLAYBOOKS:
        existing = db.query(models.Playbook).filter(models.Playbook.name == d["name"]).first()
        if existing:
            continue
        db.add(models.Playbook(
            name=d["name"],
            description=d["description"],
            trigger_kind=d["trigger_kind"],
            trigger_filter=json.dumps(d["trigger_filter"]),
            yaml_body=d["yaml"],
            require_approval=d.get("require_approval", 1),
            enabled=1,
            created_by="system",
        ))
    db.commit()
