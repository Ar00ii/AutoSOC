"""Background scheduler: token cleanup + scheduled-trigger agents.
Single-process only (in-memory). For multi-replica deploy, lift jobs to Celery+Redis."""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from . import models
from .agents import run_agent
from .db import SessionLocal

log = logging.getLogger("autosoc.scheduler")
_scheduler: BackgroundScheduler | None = None
_lock = threading.Lock()


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    with _lock:
        if _scheduler is None:
            _scheduler = BackgroundScheduler(daemon=True)
            _scheduler.start()
    return _scheduler


def _cleanup_refresh_tokens():
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        n = (
            db.query(models.RefreshToken)
            .filter((models.RefreshToken.expires_at < now) | (models.RefreshToken.revoked == 1))
            .delete(synchronize_session=False)
        )
        db.commit()
        if n:
            log.info("cleaned %s revoked/expired refresh tokens", n)
    finally:
        db.close()


def _run_agent_job(agent_id: int):
    db = SessionLocal()
    try:
        a = db.query(models.Agent).get(agent_id)
        if not a or a.enabled != 1:
            return
        try:
            run_agent(db, a, {}, triggered_by="scheduler")
        except Exception as e:
            log.exception("scheduled agent %s failed: %s", a.name, e)
    finally:
        db.close()


def sync_scheduled_agents():
    """Reads agents with trigger=scheduled and adds/updates their cron jobs."""
    sched = get_scheduler()
    db = SessionLocal()
    try:
        agents = (
            db.query(models.Agent)
            .filter(models.Agent.enabled == 1)
            .filter(models.Agent.trigger == "scheduled")
            .all()
        )
        active_ids = {f"agent_{a.id}" for a in agents}
        for job in sched.get_jobs():
            if job.id.startswith("agent_") and job.id not in active_ids:
                sched.remove_job(job.id)
        for a in agents:
            job_id = f"agent_{a.id}"
            cron = (a.schedule_cron or "").strip()
            try:
                trigger = CronTrigger.from_crontab(cron) if cron else IntervalTrigger(minutes=15)
            except Exception:
                log.warning("agent %s: invalid cron '%s', falling back to 15-min interval", a.name, cron)
                trigger = IntervalTrigger(minutes=15)
            sched.add_job(_run_agent_job, trigger=trigger, args=[a.id], id=job_id, replace_existing=True)
    finally:
        db.close()


def trigger_on_critical(event: dict) -> None:
    """Called inline from events.ingest when an event is critical."""
    def _go():
        db = SessionLocal()
        try:
            agents = (
                db.query(models.Agent)
                .filter(models.Agent.enabled == 1)
                .filter(models.Agent.trigger == "on_critical")
                .all()
            )
            for a in agents:
                try:
                    run_agent(db, a, {"event": event}, triggered_by="on_critical")
                except Exception as e:
                    log.exception("on_critical agent %s failed: %s", a.name, e)
        finally:
            db.close()

    threading.Thread(target=_go, daemon=True).start()


def _refresh_ti_feeds() -> None:
    """Pull every TI feed whose `refresh_minutes` window has elapsed.

    Cheap to run frequently (5-min tick): we only pull a feed if its
    `last_pull` is older than `refresh_minutes`. URLhaus + ThreatFox are
    public, OTX + MISP need a key.
    """
    from . import ti
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        to_pull = []
        for feed in db.query(models.TIFeed).filter(models.TIFeed.enabled == 1).all():
            interval = max(5, feed.refresh_minutes or 60)
            if feed.last_pull is None or feed.last_pull + timedelta(minutes=interval) <= now:
                to_pull.append(feed)
        for feed in to_pull:
            try:
                n, err = ti.pull_feed(db, feed)
                if err:
                    log.warning("ti.refresh feed=%s error=%s", feed.name, err[:200])
                else:
                    log.info("ti.refresh feed=%s added=%d", feed.name, n)
            except Exception as e:
                log.exception("ti.refresh feed=%s crashed: %s", feed.name, e)
    finally:
        db.close()


def start_jobs() -> None:
    s = get_scheduler()
    s.add_job(_cleanup_refresh_tokens, "interval", minutes=30, id="cleanup_refresh", replace_existing=True)
    s.add_job(sync_scheduled_agents, "interval", minutes=5, id="sync_scheduled", replace_existing=True)
    s.add_job(_refresh_ti_feeds, "interval", minutes=5, id="ti_refresh", replace_existing=True, next_run_time=datetime.utcnow() + timedelta(seconds=30))
    sync_scheduled_agents()
    log.info("scheduler started: cleanup_refresh@30m, sync_scheduled@5m, ti_refresh@5m, + per-agent cron jobs")


def stop_jobs() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
