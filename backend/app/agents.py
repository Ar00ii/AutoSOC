from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from . import models
from .agent_tools import call_tool, claude_tool_specs
from .ai import get_client


def _safe_load(s: str, default: Any) -> Any:
    try:
        return json.loads(s or "")
    except Exception:
        return default


def run_agent(
    db: Session,
    agent: models.Agent,
    user_input: dict,
    triggered_by: str = "manual",
    principal: dict | None = None,
) -> models.AgentRun:
    run = models.AgentRun(
        agent_id=agent.id,
        triggered_by=triggered_by,
        status="running",
        input=json.dumps(user_input, default=str),
        steps="[]",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        if agent.kind == "claude":
            _run_claude(db, agent, run, user_input, principal)
        elif agent.kind == "webhook":
            _run_webhook(db, agent, run, user_input)
        else:
            run.status = "error"
            run.error = f"unsupported kind: {agent.kind}"
    except Exception as e:
        run.status = "error"
        run.error = str(e)

    run.finished_at = datetime.utcnow()
    if run.status == "running":
        run.status = "completed"
    db.commit()
    db.refresh(run)
    return run


def _render_prompt(template: str, user_input: dict) -> str:
    if not template:
        return json.dumps(user_input, indent=2, default=str)
    try:
        return template.format(**user_input)
    except KeyError:
        return template + "\n\nInputs:\n" + json.dumps(user_input, indent=2, default=str)


def _run_claude(db: Session, agent: models.Agent, run: models.AgentRun, user_input: dict, principal: dict | None = None) -> None:
    client = get_client()
    allowed = _safe_load(agent.allowed_tools, [])
    tool_specs = claude_tool_specs(allowed)

    if client is None:
        run.status = "error"
        run.error = "ANTHROPIC_API_KEY not configured"
        return

    system_prompt = agent.system_prompt or "You are a SOC analyst agent. Use tools when helpful and answer concisely."
    user_prompt = _render_prompt(agent.user_prompt_template, user_input)

    messages: list[dict] = [{"role": "user", "content": user_prompt}]
    steps: list[dict] = []
    total_in = 0
    total_out = 0

    for step in range(max(1, agent.max_steps)):
        kwargs = {
            "model": agent.model or "claude-sonnet-4-6",
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": messages,
        }
        if tool_specs:
            kwargs["tools"] = tool_specs
        resp = client.messages.create(**kwargs)

        total_in += getattr(resp.usage, "input_tokens", 0) or 0
        total_out += getattr(resp.usage, "output_tokens", 0) or 0

        text_parts: list[str] = []
        tool_uses: list[dict] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append({"id": block.id, "name": block.name, "input": block.input})

        steps.append({
            "step": step + 1,
            "stop_reason": resp.stop_reason,
            "text": "\n".join(text_parts),
            "tool_uses": tool_uses,
            "tool_results": [],
        })

        if resp.stop_reason != "tool_use" or not tool_uses:
            run.output = "\n".join(text_parts).strip()
            break

        assistant_blocks = [b.model_dump() if hasattr(b, "model_dump") else b for b in resp.content]
        messages.append({"role": "assistant", "content": assistant_blocks})

        tool_results = []
        for tu in tool_uses:
            result = call_tool(tu["name"], tu["input"], db, principal)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu["id"],
                "content": json.dumps(result, default=str)[:4000],
            })
            steps[-1]["tool_results"].append({"name": tu["name"], "result": result})
        messages.append({"role": "user", "content": tool_results})
    else:
        run.error = "max steps reached"

    run.steps = json.dumps(steps, default=str)
    run.tokens_in = total_in
    run.tokens_out = total_out


def _run_webhook(db: Session, agent: models.Agent, run: models.AgentRun, user_input: dict) -> None:
    if not agent.webhook_url:
        run.status = "error"
        run.error = "webhook_url not configured"
        return
    from .security import is_url_safe_outbound
    ok, reason = is_url_safe_outbound(agent.webhook_url)
    if not ok:
        run.status = "error"
        run.error = f"webhook url rejected: {reason}"
        return
    try:
        r = httpx.post(
            agent.webhook_url,
            json={"agent": agent.name, "input": user_input},
            timeout=max(5, agent.timeout_seconds),
            follow_redirects=False,
        )
        run.output = r.text[:4000]
        run.steps = json.dumps([{"step": 1, "http_status": r.status_code}])
        if r.status_code >= 400:
            run.status = "error"
            run.error = f"HTTP {r.status_code}"
    except Exception as e:
        run.status = "error"
        run.error = str(e)
