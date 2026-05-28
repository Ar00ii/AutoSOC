"""Generate fake malicious events + RBAC defaults + sample agents."""
import json
import random
from datetime import datetime, timedelta

from app.auth import hash_password
from app.config import settings
from app.db import SessionLocal, init_db
from app.geo import COUNTRY_COORDS
from app.mitre import map_category
from app.models import (
    Agent,
    AgentRun,
    ApiKey,
    AuditLog,
    Event,
    IpBlock,
    Role,
    SavedSearch,
    Team,
    Ticket,
    User,
)

CATEGORIES = ["brute_force", "sqli", "xss", "scan", "rce", "recon", "exfil", "anomaly"]
SEVERITIES = ["low", "low", "medium", "medium", "medium", "high", "high", "critical"]
SOURCES = ["ssh", "nginx", "postgres"]
STATUSES = ["open", "open", "open", "blocked", "inspecting", "allowed"]

SAMPLE_LINES = {
    "ssh": [
        "sshd[1234]: Failed password for root from {ip} port 51234 ssh2",
        "sshd[1234]: Invalid user admin from {ip} port 51235",
        "sshd[1234]: authentication failure; rhost={ip} user=postgres",
    ],
    "nginx": [
        '{ip} - - [now] "GET /.env HTTP/1.1" 404 162',
        '{ip} - - [now] "GET /admin/login.php HTTP/1.1" 404 162',
        "{ip} - - [now] \"GET /search?q=' OR '1'='1 HTTP/1.1\" 200 5421",
        '{ip} - - [now] "POST /api/login HTTP/1.1" 401 24',
        '{ip} - - [now] "GET /wp-login.php HTTP/1.1" 404 162',
    ],
    "postgres": [
        'FATAL: password authentication failed for user "postgres" from {ip}',
        "LOG: slow query 1834ms from {ip}: SELECT * FROM users WHERE id=1 UNION SELECT password FROM admins",
    ],
}


ALL_RESOURCES = [
    "events", "tickets", "blocks", "recommendations", "reports",
    "agents", "audit", "settings", "users", "roles", "teams", "keys", "intel", "ingest",
]


def builtin_roles() -> list[dict]:
    full = {r: ["view", "create", "update", "delete", "execute"] for r in ALL_RESOURCES}
    return [
        {
            "name": "admin",
            "description": "Full access to everything.",
            "permissions": full,
        },
        {
            "name": "analyst",
            "description": "Investigates events, runs agents, manages tickets and blocks.",
            "permissions": {
                "events": ["view"],
                "tickets": ["view", "create", "update"],
                "blocks": ["view"],
                "recommendations": ["view", "execute"],
                "reports": ["view", "create"],
                "agents": ["view", "execute"],
                "audit": ["view"],
                "settings": ["view"],
                "intel": ["view"],
                "ingest": ["create"],
            },
        },
        {
            "name": "L1",
            "description": "Tier-1 triage: events, tickets, intel.",
            "permissions": {
                "events": ["view"],
                "tickets": ["view", "create", "update"],
                "intel": ["view"],
                "reports": ["view"],
            },
        },
        {
            "name": "viewer",
            "description": "Read-only access.",
            "permissions": {
                "events": ["view"],
                "tickets": ["view"],
                "reports": ["view"],
                "audit": ["view"],
            },
        },
        {
            "name": "agent",
            "description": "Programmatic role for API keys used by external automations.",
            "permissions": {
                "events": ["view", "create"],
                "tickets": ["view", "create"],
                "recommendations": ["view", "execute"],
                "intel": ["view"],
                "agents": ["execute"],
                "ingest": ["create"],
            },
        },
    ]


def sample_agents() -> list[dict]:
    return [
        {
            "name": "Critical event triage",
            "description": "Reads recent events for an IP and decides whether to open a ticket and recommend a block.",
            "kind": "claude",
            "trigger": "manual",
            "model": "claude-sonnet-4-6",
            "system_prompt": (
                "You are a tier-2 SOC analyst. Given a source IP, query its recent events, "
                "fetch its threat intel, and decide: (a) open a ticket if behavior is suspicious; "
                "(b) recommend a block if abuse_score >= 70 or sustained malicious activity is observed. "
                "Always justify your decision in 2-3 sentences in the final message."
            ),
            "user_prompt_template": "Investigate IP: {ip}. Time window: last 24 hours.",
            "allowed_tools": ["query_events", "ip_intel", "create_ticket", "recommend_block", "notify"],
            "max_steps": 6,
        },
        {
            "name": "Top threats summary",
            "description": "Summarizes the top 5 attacker IPs from the last 24h.",
            "kind": "claude",
            "trigger": "manual",
            "model": "claude-haiku-4-5-20251001",
            "system_prompt": "You write very short SOC summaries. Use plain English, no markdown.",
            "user_prompt_template": "Use query_events to find the most active malicious IPs in the last {hours} hours. Write a short summary, 4-6 bullet points.",
            "allowed_tools": ["query_events", "ip_intel"],
            "max_steps": 4,
        },
        {
            "name": "Webhook example",
            "description": "Demo agent that forwards input to an external webhook (kept disabled by default).",
            "kind": "webhook",
            "trigger": "manual",
            "webhook_url": "",
            "enabled": False,
            "allowed_tools": [],
        },
    ]


def rand_ip(seed_value: int) -> str:
    random.seed(seed_value * random.randint(1, 9999))
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


def heuristic_abuse(ip: str) -> int:
    if not ip:
        return 0
    parts = [int(p) for p in ip.split(".") if p.isdigit()]
    return (sum(parts) * 7) % 101


def main(n: int = 250):
    init_db()
    db = SessionLocal()
    for cls in (AgentRun, Agent, ApiKey, User, Team, Role, AuditLog, SavedSearch, IpBlock, Ticket, Event):
        db.query(cls).delete()
    db.commit()

    role_ids: dict[str, int] = {}
    for r in builtin_roles():
        role = Role(
            name=r["name"],
            description=r["description"],
            permissions=json.dumps(r["permissions"]),
            is_builtin=1,
        )
        db.add(role)
        db.commit()
        db.refresh(role)
        role_ids[r["name"]] = role.id

    teams = [
        Team(name="SOC Day Shift", description="EU daytime SOC team", event_filters=json.dumps({})),
        Team(name="SOC Night Shift", description="EU night SOC team", event_filters=json.dumps({})),
        Team(name="DB Team", description="Database operations", event_filters=json.dumps({"source": ["postgres"]})),
        Team(name="Web Team", description="Web app on-call", event_filters=json.dumps({"source": ["nginx"]})),
    ]
    for t in teams:
        db.add(t)
    db.commit()

    db.add(User(
        email=settings.admin_email,
        name="Admin",
        password_hash=hash_password(settings.admin_password),
        role_id=role_ids["admin"],
        active=1,
    ))
    import os
    import secrets as _secrets
    if os.getenv("SEED_DEMO_USERS", "false").lower() in ("1", "true", "yes"):
        # Demo users get a random strong password each time the seed runs.
        # Set them manually via the API afterwards if you need predictable creds.
        for email, name, role in [
            ("analyst@autosoc.local", "Ana Analyst", "analyst"),
            ("l1@autosoc.local", "Luis L1", "L1"),
            ("viewer@autosoc.local", "Vera Viewer", "viewer"),
        ]:
            pw = _secrets.token_urlsafe(18) + "Aa1!"
            db.add(User(
                email=email, name=name,
                password_hash=hash_password(pw),
                role_id=role_ids[role], active=1,
            ))
            print(f"  demo user {email}: {pw}")
    db.commit()

    for spec in sample_agents():
        db.add(Agent(
            name=spec["name"],
            description=spec.get("description", ""),
            kind=spec.get("kind", "claude"),
            trigger=spec.get("trigger", "manual"),
            model=spec.get("model", "claude-sonnet-4-6"),
            system_prompt=spec.get("system_prompt", ""),
            user_prompt_template=spec.get("user_prompt_template", ""),
            webhook_url=spec.get("webhook_url", ""),
            allowed_tools=json.dumps(spec.get("allowed_tools", [])),
            max_steps=spec.get("max_steps", 6),
            timeout_seconds=spec.get("timeout_seconds", 60),
            enabled=1 if spec.get("enabled", True) else 0,
            created_by="system",
        ))
    db.commit()

    countries = list(COUNTRY_COORDS.keys())
    now = datetime.utcnow()
    for i in range(n):
        cc = random.choice(countries)
        lat, lng, name = COUNTRY_COORDS[cc]
        lat += random.uniform(-3, 3)
        lng += random.uniform(-3, 3)
        ip = rand_ip(sum(ord(c) for c in cc) + i)
        source = random.choice(SOURCES)
        category = random.choice(CATEGORIES)
        severity = random.choice(SEVERITIES)
        raw_tpl = random.choice(SAMPLE_LINES[source])
        raw = raw_tpl.format(ip=ip)
        ts = now - timedelta(minutes=random.randint(0, 60 * 24))
        mitre = map_category(category)
        score = heuristic_abuse(ip)
        db.add(Event(
            timestamp=ts,
            source=source,
            src_ip=ip,
            src_country=cc,
            src_city=name,
            src_lat=lat,
            src_lng=lng,
            dst_lat=settings.dst_lat,
            dst_lng=settings.dst_lng,
            severity=severity,
            category=category,
            mitre_id=mitre["mitre_id"],
            mitre_name=mitre["mitre_name"],
            mitre_tactic=mitre["mitre_tactic"],
            abuse_score=score,
            known_bad=1 if score >= 50 else 0,
            cluster_key=f"{ip}|{category}",
            raw=raw,
            summary=f"{category} attempt from {cc}",
            status=random.choice(STATUSES),
        ))
    db.commit()

    high_ips = (
        db.query(Event)
        .filter(Event.severity.in_(["high", "critical"]))
        .limit(20)
        .all()
    )
    for e in high_ips[:10]:
        db.add(Ticket(
            title=f"{e.category.upper()} from {e.src_ip}",
            severity=e.severity,
            description=e.raw,
            src_ip=e.src_ip,
            status=random.choice(["open", "open", "in_progress", "resolved"]),
        ))

    counter: dict[str, dict] = {}
    for e in db.query(Event).filter(Event.severity.in_(["medium", "high", "critical"])).all():
        c = counter.setdefault(
            e.src_ip,
            {"country": e.src_country, "severity": e.severity, "hits": 0, "reason": e.category},
        )
        c["hits"] += 1
    for ip, info in list(counter.items())[:25]:
        if info["hits"] >= 3:
            db.add(IpBlock(
                ip=ip,
                country=info["country"],
                severity=info["severity"],
                reason=info["reason"],
                hit_count=info["hits"],
            ))

    db.add(SavedSearch(name="Criticals last 24h", query="severity=critical&hours=24"))
    db.add(SavedSearch(name="SSH brute force", query="source=ssh&category=brute_force"))
    db.add(SavedSearch(name="SQL injection", query="category=sqli"))
    db.add(AuditLog(actor="system", action="seed", target="db", meta=f"events={n}"))

    db.commit()
    import os
    user_count = 4 if os.getenv("SEED_DEMO_USERS", "false").lower() in ("1", "true", "yes") else 1
    print(f"Seeded {n} events + 5 roles + 4 teams + {user_count} user(s) + 3 agents.")
    print(f"Admin login: {settings.admin_email} / {settings.admin_password}")
    if user_count == 1:
        print("Demo users skipped. Set SEED_DEMO_USERS=true to include analyst/l1/viewer.")


if __name__ == "__main__":
    main()
