from fastapi import APIRouter, Depends, HTTPException

from ..ai import nl_to_filters
from ..auth import require

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/parse")
def parse(q: str, _=Depends(require("events", "view"))):
    q = (q or "").strip()
    if len(q) > 200:
        raise HTTPException(400, "query too long")
    return nl_to_filters(q)
