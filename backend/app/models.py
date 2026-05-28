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
