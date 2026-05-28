from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    abuseipdb_api_key: str = ""
    notify_webhook: str = ""
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    # Separate key for at-rest encryption (TOTP secrets). Falls back to a
    # domain-separated derivation of jwt_secret when unset, but set this in
    # production so token-signing and data-encryption keys are independent.
    mfa_enc_key: str = ""
    jwt_ttl_hours: int = 12
    access_ttl_min: int = 15
    refresh_ttl_hours: int = 336
    dst_lat: float = 40.4168
    dst_lng: float = -3.7038
    dst_label: str = "HQ"
    apply_firewall: bool = False
    # Secure by default: every request must authenticate. Local dev can opt out
    # by setting AUTH_REQUIRED=false in backend/.env. A bare deploy with no .env
    # therefore never ships an open-admin instance.
    auth_required: bool = True
    admin_email: str = "admin@autosoc.local"
    admin_password: str = "admin"
    mfa_issuer: str = "AutoSoc"
    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_redirect_uri: str = "http://localhost:3000/api/auth/oidc/callback"
    oidc_default_role: str = "viewer"
    db_url: str = "sqlite:///./sentinel.db"
    agents_daily_budget_usd: float = 5.0
    agents_rate_limit_per_ip_day: int = 3

    # ── Billing / subscriptions (Stripe) ──────────────────────
    # AI features (agents, AI reports, AI scoring) require an active
    # subscription. We provide the AI using our own ANTHROPIC_API_KEY.
    app_base_url: str = "http://localhost:3000"
    subscription_price_usd: float = 20.0
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_price_id: str = ""        # the recurring $20/mo Price ID
    stripe_webhook_secret: str = ""

    # ── Email / SMTP alerts ───────────────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    # Comma-separated list of IT/security recipients for automatic alerts.
    alert_email_to: str = ""
    # Minimum event severity that triggers an automatic email alert.
    alert_min_severity: str = "critical"

    # Comma-separated list of browser origins allowed to call the API.
    # In production set this to your domain, e.g. https://auto-soc.org.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── Application logging ───────────────────────────────────
    log_level: str = "INFO"
    log_dir: str = "logs"
    # Max size per log file before rotation, and how many rotated files to keep.
    log_max_bytes: int = 10_000_000
    log_backup_count: int = 5
    # Emit logs as JSON lines (production) instead of human text (dev).
    log_json: bool = False
    # Log every HTTP request (method, path, status, duration).
    log_requests: bool = True


settings = Settings()
