import hashlib
import json
from pathlib import Path

from fastapi import (APIRouter, BackgroundTasks, Depends, File, HTTPException, Request,
                     Response, UploadFile)
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import log_exception
from ..core.ratelimit import hit
from ..database import get_db
from ..deps import current_user
from ..models import Chunk, Document, KeyDate, ShareLink, User, _id
from ..providers.storage import get_storage
from ..services.audit import audit
from ..services.crypto import dec_text, decrypt, encrypt, user_key
from ..security import verify_password
from ..services.extraction import ALLOWED
from ..services.idcards import masked
from ..services.processing import SHELVES, process_document

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAGIC = {
    ".pdf": [b"%PDF-"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
}


def content_matches(ext: str, data: bytes) -> bool:
    """Check the file really is what its name says (a renamed .exe isn't a PDF)."""
    if ext in MAGIC:
        head = data[:1024]
        return any(head.startswith(m) or (ext == ".pdf" and m in head) for m in MAGIC[ext])
    try:
        data.decode("utf-8")
        return b"\x00" not in data
    except UnicodeDecodeError:
        return False


def id_card(d: Document, key: bytes | None, reveal: bool = False) -> dict | None:
    """ID card fields with the number masked (unless revealed after a password check)."""
    if not d.id_fields_enc or key is None:
        return None
    try:
        f = json.loads(dec_text(key, d.id_fields_enc))
    except Exception:
        return None
    if not reveal:
        f["number"] = masked(f.get("number"))
    return f


def doc_out(d: Document, key: bytes | None = None) -> dict:
    return {"id": d.id, "title": d.title, "filename": d.filename, "mime_type": d.mime_type,
            "size_bytes": d.size_bytes, "shelf": d.shelf, "doc_type": d.doc_type,
            "status": d.status, "error": d.error, "page_count": d.page_count,
            "read_from_scan": d.used_ocr, "backed_up": len(d.storage_locations or []) > 1,
            "starred": bool(d.starred), "needs_review": bool(d.needs_review),
            "superseded_by": d.superseded_by, "id_card": id_card(d, key),
            "created_at": d.created_at.isoformat(),
            "processed_at": d.processed_at.isoformat() if d.processed_at else None}


def _own(db: Session, user: User, doc_id: str) -> Document:
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(404, "Document not found.")
    return doc


@router.get("")
def list_documents(shelf: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    if shelf:
        stmt = stmt.where(Document.shelf == shelf)
    docs = list(db.scalars(stmt))
    key = user_key(db, user) if any(d.id_fields_enc for d in docs) else None
    return [doc_out(d, key) for d in docs]


@router.get("/shelves")
def shelves(user: User = Depends(current_user), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Document.shelf, func.count()).where(Document.user_id == user.id)
                             .group_by(Document.shelf)).all())
    return [{"name": s, "count": counts.get(s, 0)} for s in SHELVES]


@router.post("")
async def upload(request: Request, background: BackgroundTasks, file: UploadFile = File(...),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"upload:user:{user.id}", 40, 600)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(400, "Cubby can read PDF, PNG, JPG, TXT and MD files.")
    data = await file.read()
    limit = get_settings().max_upload_mb
    if len(data) > limit * 1024 * 1024:
        raise HTTPException(413, f"Files can be up to {limit} MB.")
    if not data:
        raise HTTPException(400, "That file is empty.")
    if not content_matches(ext, data):
        raise HTTPException(400, f"This file doesn't look like a real {ext[1:].upper()} file. "
                                 "It may be damaged or renamed.")

    digest = hashlib.sha256(data).hexdigest()
    same = db.scalar(select(Document).where(Document.user_id == user.id, Document.content_hash == digest))
    if same:
        raise HTTPException(409, f"This file is already in your vault as “{same.title}”.")

    name = Path(file.filename).name[:255]
    doc = Document(id=_id(), user_id=user.id, filename=name, title=Path(name).stem[:255], mime_type=ALLOWED[ext],
                   size_bytes=len(data), storage_key="", storage_locations=[], content_hash=digest)
    doc.storage_key = f"{user.id}/{doc.id}"
    key = user_key(db, user)
    try:
        doc.storage_locations = get_storage().save(doc.storage_key, encrypt(key, data))
    except Exception as exc:
        ref = log_exception("storing upload", exc)
        raise HTTPException(503, f"Cubby couldn't save this file right now. Please try again. (Reference {ref})") from exc
    db.add(doc)
    db.commit()
    audit(db, user.id, "upload", request, name)
    background.add_task(process_document, doc.id)
    return doc_out(doc)


@router.get("/{doc_id}")
def get_document(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = _own(db, user, doc_id)
    key = user_key(db, user)
    dates = db.scalars(select(KeyDate).where(KeyDate.document_id == doc.id).order_by(KeyDate.date))
    passages = db.scalar(select(func.count()).select_from(Chunk).where(Chunk.document_id == doc.id))
    newer = db.get(Document, doc.superseded_by) if doc.superseded_by else None
    shares = db.scalar(select(func.count()).select_from(ShareLink).where(
        ShareLink.document_id == doc.id, ShareLink.revoked.is_(False)))
    return {**doc_out(doc, key), "summary": dec_text(key, doc.summary_enc), "passages": passages,
            "superseded_by_title": newer.title if newer else None, "active_shares": shares,
            "dates": [{"label": d.label, "kind": d.kind, "date": d.date.isoformat()} for d in dates]}


@router.get("/{doc_id}/file")
def download(doc_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = _own(db, user, doc_id)
    data = decrypt(user_key(db, user), get_storage().load(doc.storage_key, doc.storage_locations))
    audit(db, user.id, "view_file", request, doc.title)
    safe = doc.filename.replace('"', "")
    return Response(data, media_type=doc.mime_type,
                    headers={"Content-Disposition": f'inline; filename="{safe}"',
                             "Cache-Control": "no-store"})


class DocPatch(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    shelf: str | None = None
    starred: bool | None = None
    doc_type: str | None = Field(default=None, max_length=80)


@router.patch("/{doc_id}")
def update_document(doc_id: str, body: DocPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = _own(db, user, doc_id)
    if body.title:
        doc.title = body.title.strip()
    if body.shelf:
        if body.shelf not in SHELVES:
            raise HTTPException(400, "Unknown shelf.")
        doc.shelf = body.shelf
    if body.starred is not None:
        doc.starred = body.starred
    if body.doc_type:
        doc.doc_type = body.doc_type.strip()
    if body.shelf or body.doc_type:
        doc.needs_review = False  # the person has confirmed or corrected it
    db.commit()
    return doc_out(doc)


@router.post("/{doc_id}/confirm")
def confirm_type(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The person says Cubby's guess about the document type was right."""
    doc = _own(db, user, doc_id)
    doc.needs_review = False
    db.commit()
    return doc_out(doc)


class RevealIn(BaseModel):
    password: str = Field(max_length=200)


@router.post("/{doc_id}/reveal")
def reveal(doc_id: str, body: RevealIn, request: Request, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    """Show the full ID number, only after re-entering the account password."""
    hit(f"reveal:user:{user.id}", 10, 600)
    doc = _own(db, user, doc_id)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That password isn't right.")
    card = id_card(doc, user_key(db, user), reveal=True)
    if not card:
        raise HTTPException(400, "This document has no ID number to show.")
    audit(db, user.id, "id_revealed", request, doc.title)
    return {"number": card.get("number")}


class BulkIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)
    action: str  # delete | move | star | unstar
    shelf: str | None = None


@router.post("/bulk")
def bulk(body: BulkIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    docs = [d for d in db.scalars(select(Document).where(Document.id.in_(body.ids), Document.user_id == user.id))]
    if body.action == "delete":
        storage = get_storage()
        for d in docs:
            storage.delete(d.storage_key, d.storage_locations)
            db.delete(d)
        db.commit()
        audit(db, user.id, "delete", request, f"{len(docs)} documents")
    elif body.action == "move":
        if body.shelf not in SHELVES:
            raise HTTPException(400, "Choose a shelf to move them to.")
        for d in docs:
            d.shelf, d.needs_review = body.shelf, False
        db.commit()
    elif body.action in ("star", "unstar"):
        for d in docs:
            d.starred = body.action == "star"
        db.commit()
    else:
        raise HTTPException(400, "Unknown action.")
    return {"ok": True, "count": len(docs)}


@router.post("/{doc_id}/reprocess")
def reprocess(doc_id: str, background: BackgroundTasks, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    doc = _own(db, user, doc_id)
    hit(f"reprocess:user:{user.id}", 20, 600)
    doc.status, doc.error, doc.error_detail = "processing", None, None
    db.commit()
    background.add_task(process_document, doc.id)
    return doc_out(doc)


@router.delete("/{doc_id}")
def delete_document(doc_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = _own(db, user, doc_id)
    get_storage().delete(doc.storage_key, doc.storage_locations)
    title = doc.title
    db.delete(doc)
    db.commit()
    audit(db, user.id, "delete", request, title)
    return {"ok": True}
