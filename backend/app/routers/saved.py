from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..auth import require
from ..db import get_db
from ..schemas import SavedSearchIn, SavedSearchOut

router = APIRouter(prefix="/api/saved", tags=["saved"])


@router.get("", response_model=list[SavedSearchOut])
def list_saved(db: Session = Depends(get_db), _=Depends(require("events", "view"))):
    return db.query(models.SavedSearch).order_by(models.SavedSearch.name).all()


@router.post("", response_model=SavedSearchOut)
def create_saved(payload: SavedSearchIn, db: Session = Depends(get_db), _=Depends(require("events", "view"))):
    if len(payload.name) > 80 or len(payload.query) > 2000:
        raise HTTPException(400, "Name or query too long")
    existing = db.query(models.SavedSearch).filter_by(name=payload.name).first()
    if existing:
        existing.query = payload.query
        db.commit()
        db.refresh(existing)
        return existing
    s = models.SavedSearch(name=payload.name, query=payload.query)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{saved_id}")
def delete_saved(saved_id: int, db: Session = Depends(get_db), _=Depends(require("events", "view"))):
    s = db.query(models.SavedSearch).get(saved_id)
    if not s:
        raise HTTPException(404)
    db.delete(s)
    db.commit()
    return {"ok": True}
