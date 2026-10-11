from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..core.errors import log_exception
from ..core.ratelimit import hit
from ..database import get_db
from ..deps import current_user
from ..models import User
from ..services.audit import audit
from ..services.rag import retrieve

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(request: Request, q: str = Query(min_length=2, max_length=300),
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"search:user:{user.id}", 60, 60)
    try:
        hits = retrieve(db, user, q, k=10)
    except Exception as exc:
        ref = log_exception("search", exc)
        raise HTTPException(503, f"Search isn't available right now. Please try again in a moment. (Reference {ref})") from exc
    audit(db, user.id, "search", request)
    return [{**h, "snippet": h.pop("text")[:400]} for h in hits]
