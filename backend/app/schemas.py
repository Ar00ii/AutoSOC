from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    source: str
    src_ip: str
    src_country: Optional[str] = None
    src_city: Optional[str] = ""
    src_lat: Optional[float] = 0.0
    src_lng: Optional[float] = 0.0
    dst_lat: Optional[float] = 0.0
    dst_lng: Optional[float] = 0.0
    severity: str
    category: str
    mitre_id: Optional[str] = ""
    mitre_name: Optional[str] = ""
    mitre_tactic: Optional[str] = ""
    abuse_score: Optional[int] = 0
    known_bad: Optional[int] = 0
    cluster_key: Optional[str] = ""
    raw: str
    summary: Optional[str] = ""
    status: str


class TicketIn(BaseModel):
    title: str
    severity: str = "medium"
    description: str = ""
    src_ip: str = ""


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    title: str
    severity: str
    status: str
    assignee: str
    description: str
    src_ip: str


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    assignee: Optional[str] = None
    severity: Optional[str] = None


class IpBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ip: str
    country: str
    reason: str
    severity: str
    hit_count: int
    recommended_at: datetime
    applied: int
    firewall_mode: Optional[str] = ""
    firewall_output: Optional[str] = ""


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    title: str
    period: str
    body: str


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    actor: str
    action: str
    target: str
    meta: str


class SavedSearchIn(BaseModel):
    name: str
    query: str


class SavedSearchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    name: str
    query: str


class IpInvestigationOut(BaseModel):
    ip: str
    country: str
    city: str
    abuse_score: int
    isp: str
    domain: str
    usage_type: str
    total_reports: int
    is_tor: bool
    event_count: int
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    top_categories: list[dict]
    severity_breakdown: dict
    ai_summary: str


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: dict
    mfa_required: bool = False
    mfa_challenge: Optional[str] = None


class MfaVerifyIn(BaseModel):
    challenge: str
    code: str


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_data_url: str


class MfaConfirmIn(BaseModel):
    code: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: Optional[str] = None


class RoleIn(BaseModel):
    name: str
    description: str = ""
    permissions: dict[str, list[str]]


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    permissions: dict[str, list[str]] | str
    is_builtin: int


class TeamIn(BaseModel):
    name: str
    description: str = ""
    event_filters: dict = {}


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    event_filters: dict | str


class UserIn(BaseModel):
    email: str
    name: str = ""
    password: str
    role_id: int
    team_id: Optional[int] = None
    active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    team_id: Optional[int] = None
    active: Optional[bool] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role_id: int
    team_id: Optional[int] = None
    active: int
    created_at: datetime
    last_login: Optional[datetime] = None


class ApiKeyIn(BaseModel):
    name: str
    role_id: int


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    key_prefix: str
    role_id: int
    created_at: datetime
    last_used: Optional[datetime] = None
    revoked: int


class ApiKeyCreated(ApiKeyOut):
    key: str


class AgentIn(BaseModel):
    name: str
    description: str = ""
    kind: str = "claude"
    trigger: str = "manual"
    schedule_cron: str = ""
    model: str = "claude-sonnet-4-6"
    system_prompt: str = ""
    user_prompt_template: str = ""
    webhook_url: str = ""
    allowed_tools: list[str] = []
    max_steps: int = 8
    timeout_seconds: int = 60
    enabled: bool = True


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    kind: str
    trigger: str
    schedule_cron: str
    model: str
    system_prompt: str
    user_prompt_template: str
    webhook_url: str
    allowed_tools: list[str] | str
    max_steps: int
    timeout_seconds: int
    enabled: int
    created_at: datetime
    created_by: str


class TestNotifyIn(BaseModel):
    title: str = "AutoSoc test notification"
    text: str = "If you see this in Slack, your webhook is wired correctly."
    severity: str = "medium"


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    jti: str
    created_at: datetime
    expires_at: datetime
    revoked: int
    ip: str
    user_agent: str


class ForgotPasswordIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


class AgentRunIn(BaseModel):
    input: dict[str, Any] = {}


class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    triggered_by: str
    input: str
    output: str
    steps: str
    error: str
    tokens_in: int
    tokens_out: int


class IocImportIn(BaseModel):
    items: list[str]
    severity: str = "high"
    reason: str = "ioc-import"


class BulkIngestIn(BaseModel):
    source: str
    events: list[dict]
