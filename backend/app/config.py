from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    abuseipdb_api_key: str = ""
    notify_webhook: str = ""
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 12
    access_ttl_min: int = 15
    refresh_ttl_hours: int = 336
    dst_lat: float = 40.4168
    dst_lng: float = -3.7038
    dst_label: str = "HQ"
    apply_firewall: bool = False
    auth_required: bool = False
    admin_email: str = "admin@autosoc.local"
    admin_password: str = "admin"
    mfa_issuer: str = "AutoSoc"
    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_redirect_uri: str = "http://localhost:3000/api/auth/oidc/callback"
    oidc_default_role: str = "viewer"
    db_url: str = "sqlite:///./sentinel.db"


settings = Settings()
