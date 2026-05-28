from __future__ import annotations

import json
from typing import Iterable

from anthropic import Anthropic

from .config import settings

_client: Anthropic | None = None


def get_client() -> Anthropic | None:
    global _client
    if not settings.anthropic_api_key:
        return None
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


SCORE_SYSTEM = (
    "You are a SOC analyst. Classify a single log line. "
    "Reply with exactly one JSON object on a single line, no prose, no code fences, schema: "
    '{"severity":"low|medium|high|critical","category":"brute_force|sqli|xss|scan|rce|anomaly|recon|exfil","summary":"short one-line explanation"}'
)


def score_line(source: str, line: str) -> dict:
    client = get_client()
    if client is None:
        return _fallback_score(source, line)
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=SCORE_SYSTEM,
            messages=[{"role": "user", "content": f"source={source}\nline={line}"}],
        )
        text = msg.content[0].text.strip() if msg.content else "{}"
        data = json.loads(text)
        return {
            "severity": data.get("severity", "low"),
            "category": data.get("category", "anomaly"),
            "summary": data.get("summary", ""),
        }
    except Exception:
        return _fallback_score(source, line)


def _fallback_score(source: str, line: str) -> dict:
    low = line.lower()
    if "failed password" in low or "invalid user" in low or "authentication failure" in low:
        return {"severity": "medium", "category": "brute_force", "summary": "SSH authentication failure"}
    if "union select" in low or "' or '1'='1" in low or "sleep(" in low:
        return {"severity": "high", "category": "sqli", "summary": "Possible SQL injection attempt"}
    if "<script" in low or "javascript:" in low:
        return {"severity": "high", "category": "xss", "summary": "Possible XSS payload"}
    if "/.env" in low or "/admin" in low or "/wp-login" in low:
        return {"severity": "medium", "category": "recon", "summary": "Recon against sensitive path"}
    return {"severity": "low", "category": "anomaly", "summary": ""}


REPORT_SYSTEM = (
    "You are a SOC analyst writing an incident report for a security operations dashboard. "
    "Output plain text, no markdown headers above level 2, English. "
    "Keep it concise: executive summary, top threats, top source countries, recommendations."
)


def generate_report(events: Iterable[dict], period: str) -> str:
    client = get_client()
    if client is None:
        return _fallback_report(events, period)
    try:
        digest = "\n".join(
            f"- {e['timestamp']} src={e['src_ip']} ({e.get('src_country','??')}) "
            f"sev={e['severity']} cat={e['category']} mitre={e.get('mitre_id','')} {e.get('summary','')}"
            for e in list(events)[:200]
        )
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=REPORT_SYSTEM,
            messages=[
                {"role": "user", "content": f"Period: {period}\n\nEvents:\n{digest}\n\nWrite the report."}
            ],
        )
        return msg.content[0].text if msg.content else ""
    except Exception:
        return _fallback_report(events, period)


def _fallback_report(events, period: str) -> str:
    events = list(events)
    if not events:
        return f"No events in the last {period}."
    by_sev: dict = {}
    by_cat: dict = {}
    by_country: dict = {}
    for e in events:
        by_sev[e["severity"]] = by_sev.get(e["severity"], 0) + 1
        by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1
        c = e.get("src_country") or "??"
        by_country[c] = by_country.get(c, 0) + 1
    top_cat = sorted(by_cat.items(), key=lambda x: -x[1])[:3]
    top_country = sorted(by_country.items(), key=lambda x: -x[1])[:3]
    lines = [
        "Executive summary",
        f"Total events in the last {period}: {len(events)}.",
        f"Critical: {by_sev.get('critical', 0)} | High: {by_sev.get('high', 0)} | "
        f"Medium: {by_sev.get('medium', 0)} | Low: {by_sev.get('low', 0)}.",
        "",
        "Top categories",
        *[f"- {c}: {n}" for c, n in top_cat],
        "",
        "Top source countries",
        *[f"- {c}: {n}" for c, n in top_country],
        "",
        "Recommendations",
        "- Review tickets in open state and triage critical events first.",
        "- Consider blocking source IPs above the recommended threshold.",
        "- Tighten WAF rules for repeated SQLi and XSS patterns.",
    ]
    return "\n".join(lines)


INVESTIGATE_SYSTEM = (
    "You are a SOC tier-2 analyst writing a short investigation note about a single source IP. "
    "Output 4-6 sentences in English. Cover: behavior pattern, likely intent, severity rationale, "
    "and a recommended action. No markdown, no headers."
)


def investigate_ip(ip: str, geo: dict, events: list[dict]) -> str:
    client = get_client()
    if client is None:
        return _fallback_investigate(ip, geo, events)
    try:
        digest = "\n".join(
            f"- {e['timestamp']} sev={e['severity']} cat={e['category']} {e.get('summary','') or e.get('raw','')[:120]}"
            for e in events[:60]
        )
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=400,
            system=INVESTIGATE_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"IP: {ip}\nCountry: {geo.get('country','')}\n"
                        f"ISP: {geo.get('isp','')}\nUsage: {geo.get('usage_type','')}\n"
                        f"Events ({len(events)}):\n{digest}"
                    ),
                }
            ],
        )
        return msg.content[0].text if msg.content else ""
    except Exception:
        return _fallback_investigate(ip, geo, events)


def _fallback_investigate(ip: str, geo: dict, events: list[dict]) -> str:
    if not events:
        return f"No activity recorded for {ip}."
    sev_counts: dict = {}
    cat_counts: dict = {}
    for e in events:
        sev_counts[e["severity"]] = sev_counts.get(e["severity"], 0) + 1
        cat_counts[e["category"]] = cat_counts.get(e["category"], 0) + 1
    top_cat = max(cat_counts.items(), key=lambda x: x[1])[0]
    crit = sev_counts.get("critical", 0) + sev_counts.get("high", 0)
    country = geo.get("country", "??")
    return (
        f"{ip} ({country}) produced {len(events)} events, primarily {top_cat}. "
        f"{crit} high or critical events were recorded. "
        f"The traffic pattern is consistent with an automated tool rather than a human operator. "
        f"Recommend blocking the IP at the perimeter and creating a ticket if any successful access is observed."
    )


NL_SEARCH_SYSTEM = (
    "Translate the user's natural language SOC query into JSON filters. "
    "Reply with exactly one JSON object, no prose, schema: "
    '{"severity":"low|medium|high|critical|","source":"ssh|nginx|postgres|","category":"brute_force|sqli|xss|scan|rce|anomaly|recon|exfil|","country":"ISO-2|","ip":"","hours":24,"text":""}. '
    "Empty string means no filter for that field. hours defaults to 24."
)


def nl_to_filters(q: str) -> dict:
    client = get_client()
    if client is None or not q.strip():
        return _heuristic_nl(q)
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=NL_SEARCH_SYSTEM,
            messages=[{"role": "user", "content": q}],
        )
        text = msg.content[0].text.strip() if msg.content else "{}"
        data = json.loads(text)
        return {
            "severity": data.get("severity", "") or "",
            "source": data.get("source", "") or "",
            "category": data.get("category", "") or "",
            "country": data.get("country", "") or "",
            "ip": data.get("ip", "") or "",
            "hours": int(data.get("hours", 24) or 24),
            "text": data.get("text", "") or "",
        }
    except Exception:
        return _heuristic_nl(q)


def _heuristic_nl(q: str) -> dict:
    low = q.lower()
    out = {"severity": "", "source": "", "category": "", "country": "", "ip": "", "hours": 24, "text": ""}
    for s in ("critical", "high", "medium", "low"):
        if s in low:
            out["severity"] = s
            break
    for s in ("ssh", "nginx", "postgres"):
        if s in low:
            out["source"] = s
            break
    for c in ("brute_force", "sqli", "xss", "rce", "scan", "recon", "exfil", "anomaly"):
        if c.replace("_", " ") in low or c in low:
            out["category"] = c
            break
    if "last hour" in low or " 1h" in low:
        out["hours"] = 1
    elif "7 days" in low or "week" in low:
        out["hours"] = 168
    return out
