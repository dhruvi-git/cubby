"""Share one document with someone else through a time-limited, revocable link.

Only a hash of the link's token is stored, so the full link is shown once, when
it's created. Anyone with the link can view the document until it expires, is
revoked, or runs out of views.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.ratelimit import hit, limit_ip
from ..database import get_db
from ..deps import current_user
from ..models import Document, Notification, ShareLink, User
from ..providers.storage import get_storage
from ..security import sha256
from ..services.audit import audit
from ..services.crypto import decrypt, user_key

router = APIRouter(tags=["shares"])

ALLOWED_HOURS = (1, 24, 72, 168, 720)


class ShareIn(BaseModel):
    hours: int = 24
    allow_download: bool = True
    max_views: int | None = Field(default=None, ge=1, le=1000)
    label: str = Field(default="", max_length=120)


def share_out(s: ShareLink, title: str | None = None) -> dict:
    now = datetime.now(timezone.utc)
    state = ("revoked" if s.revoked else "expired" if s.expires_at < now
             else "used up" if s.max_views and s.views >= s.max_views else "active")
    return {"id": s.id, "document_id": s.document_id, "document_title": title, "label": s.label,
            "allow_download": s.allow_download, "max_views": s.max_views, "views": s.views,
            "expires_at": s.expires_at.isoformat(), "created_at": s.created_at.isoformat(),
            "last_viewed_at": s.last_viewed_at.isoformat() if s.last_viewed_at else None, "state": state}


@router.post("/api/documents/{doc_id}/shares")
def create_share(doc_id: str, body: ShareIn, request: Request, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    hit(f"share:user:{user.id}", 30, 3600)
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(404, "Document not found.")
    if body.hours not in ALLOWED_HOURS:
        raise HTTPException(400, "Choose how long the link should work.")
    token = secrets.token_urlsafe(24)
    link = ShareLink(user_id=user.id, document_id=doc.id, token_hash=sha256(token), label=body.label.strip(),
                     allow_download=body.allow_download, max_views=body.max_views,
                     expires_at=datetime.now(timezone.utc) + timedelta(hours=body.hours))
    db.add(link)
    db.commit()
    audit(db, user.id, "share_created", request, doc.title)
    return {**share_out(link, doc.title), "url": f"{get_settings().frontend_origin}/s/{token}"}


@router.get("/api/documents/{doc_id}/shares")
def doc_shares(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ShareLink).where(ShareLink.document_id == doc_id, ShareLink.user_id == user.id)
                      .order_by(ShareLink.created_at.desc()))
    return [share_out(s) for s in rows]


@router.get("/api/shares")
def all_shares(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(ShareLink, Document.title).join(Document, Document.id == ShareLink.document_id)
                      .where(ShareLink.user_id == user.id).order_by(ShareLink.created_at.desc()).limit(100))
    return [share_out(s, t) for s, t in rows]


@router.delete("/api/shares/{share_id}")
def revoke_share(share_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(ShareLink, share_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Link not found.")
    s.revoked = True
    db.commit()
    audit(db, user.id, "share_revoked", request)
    return {"ok": True}


# ---------- Public side (no login) ----------
def _valid(db: Session, token: str) -> tuple[ShareLink, Document]:
    s = db.scalar(select(ShareLink).where(ShareLink.token_hash == sha256(token)))
    now = datetime.now(timezone.utc)
    if not s or s.revoked or s.expires_at < now:
        raise HTTPException(404, "This link has expired or was turned off by its owner.")
    doc = db.get(Document, s.document_id)
    if not doc:
        raise HTTPException(404, "This link has expired or was turned off by its owner.")
    return s, doc


@router.get("/api/public/share/{token}", dependencies=[Depends(limit_ip("share-view", 60, 600))])
def public_meta(token: str, request: Request, db: Session = Depends(get_db)):
    s, doc = _valid(db, token)
    if s.max_views and s.views >= s.max_views:
        raise HTTPException(404, "This link has reached its view limit.")
    s.views += 1
    s.last_viewed_at = datetime.now(timezone.utc)
    owner = db.get(User, s.user_id)
    db.execute(insert(Notification).values(
        user_id=owner.id, title=f"Your shared link to {doc.title} was opened",
        body=f"View {s.views}{f' of {s.max_views}' if s.max_views else ''}.", link=f"/app/documents/{doc.id}",
        read=False, emailed=True, dedupe_key=f"share:{s.id}:{s.views}",
    ).on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"]))
    db.commit()
    audit(db, owner.id, "share_opened", request, doc.title)
    return {"title": doc.title, "doc_type": doc.doc_type, "mime_type": doc.mime_type, "size_bytes": doc.size_bytes,
            "page_count": doc.page_count, "owner": owner.name.split(" ")[0], "label": s.label,
            "allow_download": s.allow_download, "expires_at": s.expires_at.isoformat(),
            "views_left": (s.max_views - s.views) if s.max_views else None}


@router.get("/api/public/share/{token}/file", dependencies=[Depends(limit_ip("share-file", 60, 600))])
def public_file(token: str, download: bool = False, db: Session = Depends(get_db)):
    s, doc = _valid(db, token)
    if s.max_views and s.views > s.max_views:
        raise HTTPException(404, "This link has reached its view limit.")
    if download and not s.allow_download:
        raise HTTPException(403, "The owner turned off downloads for this link.")
    owner = db.get(User, s.user_id)
    data = decrypt(user_key(db, owner), get_storage().load(doc.storage_key, doc.storage_locations))
    safe = doc.filename.replace('"', "")
    return Response(data, media_type=doc.mime_type, headers={
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename="{safe}"',
        "Cache-Control": "no-store", "X-Robots-Tag": "noindex"})
