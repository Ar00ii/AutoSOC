from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .db import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    source = Column(String, index=True)
    src_ip = Column(String, index=True)
    src_country = Column(String)
    src_city = Column(String, default="")
    src_lat = Column(Float)
    src_lng = Column(Float)
    dst_lat = Column(Float)
    dst_lng = Column(Float)
    severity = Column(String, index=True, default="low")
    category = Column(String, index=True, default="anomaly")
    mitre_id = Column(String, index=True, default="")
    mitre_name = Column(String, default="")
    mitre_tactic = Column(String, default="")
    abuse_score = Column(Integer, default=0)
    known_bad = Column(Integer, default=0)
    cluster_key = Column(String, index=True, default="")
    raw = Column(Text)
    summary = Column(Text, default="")
    status = Column(String, default="open", index=True)


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    title = Column(String)
    severity = Column(String, default="medium")
    status = Column(String, default="open", index=True)
    assignee = Column(String, default="")
    description = Column(Text, default="")
    src_ip = Column(String, default="")


class IpBlock(Base):
    __tablename__ = "ip_blocks"

    id = Column(Integer, primary_key=True)
    ip = Column(String, unique=True, index=True)
    country = Column(String, default="")
    reason = Column(String, default="")
    severity = Column(String, default="medium")
    hit_count = Column(Integer, default=0)
    recommended_at = Column(DateTime, default=datetime.utcnow)
    applied = Column(Integer, default=0)
    firewall_mode = Column(String, default="")
    firewall_output = Column(Text, default="")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    title = Column(String)
    period = Column(String, default="24h")
    body = Column(Text, default="")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    actor = Column(String, default="operator", index=True)
    action = Column(String, index=True)
    target = Column(String, index=True)
    meta = Column(Text, default="")


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    name = Column(String, unique=True, index=True)
    query = Column(Text, default="")


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, default="")
    permissions = Column(Text, default="{}")
    is_builtin = Column(Integer, default=0)


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, default="")
    event_filters = Column(Text, default="{}")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    name = Column(String, default="")
    password_hash = Column(String, default="")
    role_id = Column(Integer, ForeignKey("roles.id"))
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    totp_secret_enc = Column(Text, default="")
    mfa_enabled = Column(Integer, default=0)
    oidc_subject = Column(String, default="", index=True)

    role = relationship("Role")
    team = relationship("Team")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    jti = Column(String, unique=True, index=True)
    expires_at = Column(DateTime, index=True)
    revoked = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_agent = Column(String, default="")
    ip = Column(String, default="")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    key_prefix = Column(String, index=True)
    key_hash = Column(String)
    role_id = Column(Integer, ForeignKey("roles.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used = Column(DateTime, nullable=True)
    revoked = Column(Integer, default=0)

    role = relationship("Role")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, default="")
    kind = Column(String, default="claude")
    trigger = Column(String, default="manual")
    schedule_cron = Column(String, default="")
    model = Column(String, default="claude-sonnet-4-6")
    system_prompt = Column(Text, default="")
    user_prompt_template = Column(Text, default="")
    webhook_url = Column(String, default="")
    allowed_tools = Column(Text, default="[]")
    max_steps = Column(Integer, default=8)
    timeout_seconds = Column(Integer, default=60)
    enabled = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="system")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), index=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, default="running", index=True)
    triggered_by = Column(String, default="manual")
    input = Column(Text, default="")
    output = Column(Text, default="")
    steps = Column(Text, default="[]")
    error = Column(Text, default="")
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)


# ─────────────────────────────────────────────────────────────
#  Threat Intelligence
# ─────────────────────────────────────────────────────────────

class TIFeed(Base):
    """A subscribed threat-intelligence feed (URLhaus, ThreatFox, OTX, MISP)."""
    __tablename__ = "ti_feeds"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    kind = Column(String, default="generic")  # urlhaus / threatfox / otx / misp / generic
    url = Column(String, default="")
    api_key_env = Column(String, default="")
    enabled = Column(Integer, default=1)
    refresh_minutes = Column(Integer, default=60)
    last_pull = Column(DateTime, nullable=True)
    last_count = Column(Integer, default=0)
    last_error = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class IoC(Base):
    """A single Indicator of Compromise — IP / domain / URL / hash / email."""
    __tablename__ = "iocs"

    id = Column(Integer, primary_key=True)
    feed_id = Column(Integer, ForeignKey("ti_feeds.id"), index=True, nullable=True)
    indicator = Column(String, index=True)
    kind = Column(String, index=True)  # ip / domain / url / sha256 / md5 / email
    threat_type = Column(String, default="")  # malware / phishing / c2 / bruteforce / scanner / tor
    confidence = Column(Integer, default=50)  # 0-100
    tags = Column(Text, default="[]")  # JSON list
    first_seen = Column(DateTime, default=datetime.utcnow, index=True)
    last_seen = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True, index=True)
    source_ref = Column(String, default="")  # original URL / MISP event id / etc
    active = Column(Integer, default=1, index=True)

    feed = relationship("TIFeed")


# ─────────────────────────────────────────────────────────────
#  Cases (Incidents) — group events / tickets / IPs / actor
# ─────────────────────────────────────────────────────────────

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True)
    case_number = Column(String, unique=True, index=True)  # e.g. "CASE-2026-0001"
    title = Column(String)
    severity = Column(String, default="medium", index=True)
    status = Column(String, default="open", index=True)  # open / investigating / contained / closed
    category = Column(String, default="unknown")  # bruteforce / sqli / exfil / malware / phishing
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    assignee = Column(String, default="")
    summary = Column(Text, default="")  # short human/AI summary
    kill_chain = Column(Text, default="[]")  # JSON list of MITRE tactics seen
    sla_due_at = Column(DateTime, nullable=True, index=True)


class CaseEvent(Base):
    """Many-to-many: which events are in which case."""
    __tablename__ = "case_events"

    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("cases.id"), index=True)
    event_id = Column(Integer, ForeignKey("events.id"), index=True)
    added_at = Column(DateTime, default=datetime.utcnow)


class CaseTimeline(Base):
    """Ordered timeline of activity inside a case (events, notes, actions)."""
    __tablename__ = "case_timeline"

    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("cases.id"), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    kind = Column(String, default="note")  # event / note / action / agent_step / status_change
    actor = Column(String, default="")
    body = Column(Text, default="")
    ref_id = Column(Integer, nullable=True)  # FK to event/ticket/run depending on kind
    ref_kind = Column(String, default="")


# ─────────────────────────────────────────────────────────────
#  Playbooks — YAML-defined incident response flows
# ─────────────────────────────────────────────────────────────

class Playbook(Base):
    __tablename__ = "playbooks"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, default="")
    trigger_kind = Column(String, default="manual")  # manual / on_event / on_case / scheduled
    trigger_filter = Column(Text, default="{}")  # JSON: {category:["bruteforce"], severity:["critical"]}
    yaml_body = Column(Text, default="")  # the playbook definition
    enabled = Column(Integer, default=1)
    require_approval = Column(Integer, default=1)  # human-in-the-loop for destructive steps
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="system")


class DashboardLayout(Base):
    """A user's saved dashboard layout. Stores widget positions + config as JSON."""
    __tablename__ = "dashboard_layouts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    name = Column(String, index=True)
    is_default = Column(Integer, default=0)
    # JSON list: [{i: "uid", x, y, w, h, type: "kpi", config: {...}}]
    widgets = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    """Per-user AI subscription. Active status unlocks AI features
    (agents, AI reports, AI scoring). Driven by Stripe webhooks, or
    granted manually by an admin for comp / trial accounts."""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True)
    plan = Column(String, default="ai_monthly")
    status = Column(String, default="inactive", index=True)  # active / inactive / past_due / canceled
    source = Column(String, default="manual")  # stripe / manual
    stripe_customer_id = Column(String, default="", index=True)
    stripe_subscription_id = Column(String, default="", index=True)
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class UsedToken(Base):
    """One-time-use ledger for short-lived JWTs (password reset, MFA challenge).
    A jti is inserted on first use; a second presentation is rejected as replay."""
    __tablename__ = "used_tokens"

    id = Column(Integer, primary_key=True)
    jti = Column(String, unique=True, index=True)
    purpose = Column(String, default="", index=True)
    used_at = Column(DateTime, default=datetime.utcnow)


class ProcessedStripeEvent(Base):
    """Idempotency ledger for Stripe webhook events, to reject replays."""
    __tablename__ = "processed_stripe_events"

    id = Column(Integer, primary_key=True)
    event_id = Column(String, unique=True, index=True)
    event_type = Column(String, default="")
    processed_at = Column(DateTime, default=datetime.utcnow)


class PlaybookRun(Base):
    __tablename__ = "playbook_runs"

    id = Column(Integer, primary_key=True)
    playbook_id = Column(Integer, ForeignKey("playbooks.id"), index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), index=True, nullable=True)
    event_id = Column(Integer, ForeignKey("events.id"), index=True, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, default="running", index=True)  # running / completed / waiting_approval / failed / aborted
    triggered_by = Column(String, default="system")
    steps = Column(Text, default="[]")  # JSON list of per-step result
    output = Column(Text, default="")
    error = Column(Text, default="")
    pending_approval_step = Column(Integer, nullable=True)  # which step index needs approval

    playbook = relationship("Playbook")
