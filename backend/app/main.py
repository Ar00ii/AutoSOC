import csv
import io
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from . import models
from .auth import require
from .config import settings
from .db import get_db, init_db
from .scoping import apply_event_query
from .routers import (
    agents,
    audit,
    auth_router,
    billing,
    bulk,
    cases_router,
    correlate_router,
    dashboard,
    dashboard_layouts,
    events,
    globe,
    intel,
    keys,
    mfa_router,
    notify_router,
    oidc,
    playbooks_router,
    recommendations,
    reports,
    roles,
    saved,
    search,
    sessions,
    stream,
    teams,
    ti_router,
    tickets,
    users,
)
from .logging_config import setup_logging
from .security import (
    assert_secure_for_auth_required,
    sanitize_csv_cell,
    startup_security_warnings,
)

setup_logging()
log = logging.getLogger("autosoc.security")
request_log = logging.getLogger("autosoc.request")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    assert_secure_for_auth_required()
    for w in startup_security_warnings():
        log.warning("SECURITY: %s", w)
    init_db()
    # Seed default TI feeds + playbooks on first start
    from .db import SessionLocal
    from . import ti, playbooks as pb_seed
    _db = SessionLocal()
    try:
        ti.ensure_default_feeds(_db)
        pb_seed.ensure_default_playbooks(_db)
    finally:
        _db.close()
    from .scheduler import start_jobs, stop_jobs
    start_jobs()
    try:
        yield
    finally:
        stop_jobs()


app = FastAPI(
    title="AutoSoc",
    version="0.6.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    # Don't expose the full API schema on hardened (auth-required) deployments.
    openapi_url=None if settings.auth_required else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["authorization", "content-type", "x-api-key"],
    expose_headers=["content-disposition"],
)


if settings.log_requests:
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        rid = uuid.uuid4().hex[:8]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            dur = (time.perf_counter() - start) * 1000
            request_log.exception(
                "rid=%s %s %s -> 500 (%.1fms)", rid, request.method, request.url.path, dur
            )
            raise
        dur = (time.perf_counter() - start) * 1000
        request_log.info(
            "rid=%s %s %s -> %s (%.1fms)",
            rid, request.method, request.url.path, response.status_code, dur,
        )
        response.headers["X-Request-ID"] = rid
        return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "interest-cohort=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    return response

app.include_router(auth_router.router)
app.include_router(mfa_router.router)
app.include_router(oidc.router)
app.include_router(sessions.router)
app.include_router(notify_router.router)
app.include_router(correlate_router.router)
app.include_router(events.router)
app.include_router(tickets.router)
app.include_router(globe.router)
app.include_router(reports.router)
app.include_router(recommendations.router)
app.include_router(intel.router)
app.include_router(search.router)
app.include_router(stream.router)
app.include_router(audit.router)
app.include_router(saved.router)
app.include_router(dashboard.router)
app.include_router(dashboard_layouts.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(teams.router)
app.include_router(keys.router)
app.include_router(agents.router)
app.include_router(bulk.router)
app.include_router(ti_router.router)
app.include_router(cases_router.router)
app.include_router(playbooks_router.router)
app.include_router(billing.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.6.0", "product": "AutoSoc"}


@app.get("/api/export/events.csv")
def export_csv(
    db: Session = Depends(get_db),
    hours: int = 24,
    principal: dict = Depends(require("events", "view")),
):
    hours = max(1, min(int(hours or 24), 720))
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(models.Event).filter(models.Event.timestamp >= since)
    q = apply_event_query(q, principal)
    rows = q.order_by(models.Event.timestamp.desc()).all()

    def gen():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([
            "id", "timestamp", "source", "src_ip", "src_country",
            "severity", "category", "mitre_id", "abuse_score",
            "status", "summary", "raw",
        ])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()
        for r in rows:
            w.writerow([
                r.id,
                r.timestamp.isoformat(),
                sanitize_csv_cell(r.source),
                sanitize_csv_cell(r.src_ip),
                sanitize_csv_cell(r.src_country),
                sanitize_csv_cell(r.severity),
                sanitize_csv_cell(r.category),
                sanitize_csv_cell(r.mitre_id),
                r.abuse_score,
                sanitize_csv_cell(r.status),
                sanitize_csv_cell(r.summary),
                sanitize_csv_cell(r.raw),
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    return StreamingResponse(
        gen(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=events-{hours}h.csv"},
    )
