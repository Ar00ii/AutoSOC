from sqlalchemy.orm import Session

from . import models


def log(db: Session, actor: str, action: str, target: str, meta: str = "") -> None:
    db.add(models.AuditLog(
        actor=(actor or "?")[:200],
        action=(action or "")[:80],
        target=(target or "")[:200],
        meta=(meta or "")[:1000],
    ))
    db.commit()
