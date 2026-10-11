import io
import json
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import current_user
from ..models import AuditEvent, Document, KeyDate, Note, User
from ..providers.storage import get_storage
from ..core.ratelimit import hit, limit_ip
from ..security import SESSION_COOKIE, verify_password
from ..services.audit import audit
from ..services.crypto import dec_text, decrypt, forget_key, user_key

router = APIRouter(prefix="/api/trust", tags=["trust"])

@router.get("/summary")
def summary(user: User = Depends(current_user)):
    """Plain-language promises for the Trust Center. No service names or internals."""
    s = get_settings()
    return {
        "encrypted": True,
        "key_held_separately": user.key_provider == "azure" and s.storage_primary != "local",
        "backed_up": s.storage_backup not in ("", "none"),
        "two_factor": user.totp_enabled,
        "recovery_codes_left": len(user.recovery_codes or []),
    }


@router.get("/audit")
def audit_log(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditEvent).where(AuditEvent.user_id == user.id)
                      .order_by(AuditEvent.created_at.desc()).limit(100))
    return [{"id": e.id, "action": e.action, "detail": e.detail, "ip": e.ip,
             "user_agent": e.user_agent, "created_at": e.created_at.isoformat()} for e in rows]


@router.get("/export")
def export(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"export:user:{user.id}", 5, 3600)
    key = user_key(db, user)
    storage = get_storage()
    buf = io.BytesIO()
    meta = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for d in db.scalars(select(Document).where(Document.user_id == user.id)):
            try:
                z.writestr(f"{d.shelf}/{d.id[:6]}-{d.filename}",
                           decrypt(key, storage.load(d.storage_key, d.storage_locations)))
            except Exception as exc:
                print(f"[export] skipped {d.id}: {exc}")
            dates = db.scalars(select(KeyDate).where(KeyDate.document_id == d.id))
            meta.append({"title": d.title, "filename": d.filename, "shelf": d.shelf, "type": d.doc_type,
                         "summary": dec_text(key, d.summary_enc), "uploaded": d.created_at.isoformat(),
                         "dates": [{"label": k.label, "date": k.date.isoformat()} for k in dates]})
        notes = [{"title": n.title, "kind": n.kind, "body": dec_text(key, n.body_enc), "updated": n.updated_at.isoformat()}
                 for n in db.scalars(select(Note).where(Note.user_id == user.id))]
        for i, n in enumerate(notes):
            safe = "".join(ch for ch in n["title"] if ch.isalnum() or ch in " -_")[:60] or "note"
            z.writestr(f"Studio/{i + 1:02d} {safe}.md", f"# {n['title']}\n\n{n['body']}\n")
        z.writestr("cubby-vault.json", json.dumps({"owner": user.email, "documents": meta, "notes": notes}, indent=2))
    audit(db, user.id, "export", request)
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="cubby-vault-export.zip"'})


class DeleteVaultIn(BaseModel):
    password: str


@router.post("/delete-vault", dependencies=[Depends(limit_ip("deletevault", 5, 3600))])
def delete_vault(body: DeleteVaultIn, response: Response, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That password isn't right.")
    storage = get_storage()
    for d in db.scalars(select(Document).where(Document.user_id == user.id)):
        storage.delete(d.storage_key, d.storage_locations)
    forget_key(user.id)
    db.delete(user)  # cascades to documents, passages, chats, notifications
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
