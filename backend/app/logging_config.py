"""Centralised application logging.

Configures the root logger with a console handler and a rotating file
handler. Set LOG_JSON=true for structured (one-JSON-object-per-line) output
that ships cleanly into a log aggregator; leave it false for readable dev
output. Files rotate at LOG_MAX_BYTES, keeping LOG_BACKUP_COUNT backups.
"""
from __future__ import annotations

import json
import logging
import os
from logging.handlers import RotatingFileHandler

from .config import settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        for key, val in getattr(record, "extra_fields", {}).items():
            payload[key] = val
        return json.dumps(payload, ensure_ascii=False)


def _formatter() -> logging.Formatter:
    if settings.log_json:
        return JsonFormatter()
    return logging.Formatter(
        "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def setup_logging() -> None:
    """Idempotently configure the root logger. Safe to call on every startup."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)

    # Remove handlers from a prior call / basicConfig so we don't double-log.
    for h in list(root.handlers):
        root.removeHandler(h)

    fmt = _formatter()

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    root.addHandler(console)

    os.makedirs(settings.log_dir, exist_ok=True)
    file_handler = RotatingFileHandler(
        os.path.join(settings.log_dir, "autosoc.log"),
        maxBytes=settings.log_max_bytes,
        backupCount=settings.log_backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    # Route uvicorn's own loggers through our handlers instead of its defaults.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
