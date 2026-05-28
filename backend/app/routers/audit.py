from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..db import get_db
from ..schemas import AuditOut

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditOut])
def list_audit(db: Session = Depends(get_db), limit: int = 200, _=Depends(require("audit", "view"))):
    limit = max(1, min(limit, 1000))
    return (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
