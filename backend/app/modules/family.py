"""Family vaults: a private group chat for a household's documents.

Members chat, share documents as cards, ask for documents with request cards,
and ask @Cubby questions answered from the family's shared documents only.
"""
import json
import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import log_exception
from ..core.ratelimit import hit
from ..database import get_db
from ..deps import current_user
from ..models import (Document, Family, FamilyDoc, FamilyInvite, FamilyKeyDate, FamilyMember, FamilyMessage,
                      Notification, User, _id)
from ..providers.email import send_email
from ..providers.keys import get_key_provider
from ..services.audit import audit
from ..services.crypto import dec_text, enc_text, family_key
from ..services.family import (FamilyError, ask_cubby, delete_family_doc, load_file, mentions_cubby,
                               save_to_vault, share_document)
from ..services.processing import process_document

router = APIRouter(prefix="/api/family", tags=["family"])

MAX_FAMILIES = 5
MAX_MEMBERS = 12
EMOJIS = {"🏠", "👨‍👩‍👧", "👨‍👩‍👦", "👪", "💛", "🌻", "🐣", "🏡", "🌈", "⭐", "🧸", "🍀"}
COLORS = {"cream", "lav", "mint", "blue", "rose", "peach"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expiry(expiry: str | None) -> tuple[str, int | None]:
    """(status, days_left): valid | expiring (within 90 days) | expired | no_expiry."""
    if not expiry:
        return "no_expiry", None
    try:
        days = (date.fromisoformat(expiry[:10]) - date.today()).days
    except ValueError:
        return "no_expiry", None
    return ("expired" if days < 0 else "expiring" if days <= 90 else "valid"), days


def _raise(e: FamilyError):
    raise HTTPException(e.status, e.message)


# ---------- access helpers ----------

def _membership(db: Session, user: User, fid: str) -> tuple[Family, FamilyMember]:
    fam = db.get(Family, fid)
    mem = db.scalar(select(FamilyMember).where(FamilyMember.family_id == fid, FamilyMember.user_id == user.id)) if fam else None
    if not fam or not mem:
        raise HTTPException(404, "Family not found.")
    return fam, mem


def _admin(mem: FamilyMember) -> None:
    if mem.role != "admin":
        raise HTTPException(403, "Only a family admin can do that.")


def _members(db: Session, fid: str) -> list[tuple[FamilyMember, User]]:
    return list(db.execute(select(FamilyMember, User).join(User, User.id == FamilyMember.user_id)
                           .where(FamilyMember.family_id == fid).order_by(FamilyMember.joined_at)).all())


def _first(name: str | None) -> str:
    return (name or "Someone").split(" ")[0]


def _post(db: Session, fam: Family, key: bytes, kind: str, sender_id: str | None, text: str = "", **extra) -> FamilyMessage:
    m = FamilyMessage(id=_id(), family_id=fam.id, sender_id=sender_id, kind=kind,
                      body_enc=enc_text(key, text) if text else None, created_at=_now(), **extra)
    db.add(m)
    fam.last_activity = m.created_at
    return m


def _notify(db: Session, user_ids, title: str, body: str, link: str, dedupe: str) -> None:
    for uid in set(user_ids):
        db.add(Notification(user_id=uid, title=title[:200], body=body[:400], link=link, dedupe_key=f"{dedupe}:{uid}"[:120]))


# ---------- output shapes ----------

def doc_out(fd: FamilyDoc, key: bytes, names: dict[str, str], detail: bool = False, db: Session | None = None) -> dict:
    card = None
    if fd.id_fields_enc:
        try:
            card = json.loads(dec_text(key, fd.id_fields_enc))
        except Exception:
            card = None
    status, days = _expiry((card or {}).get("expiry_date"))
    out = {
        "id": fd.id, "title": fd.title, "filename": fd.filename, "mime_type": fd.mime_type,
        "size_bytes": fd.size_bytes, "page_count": fd.page_count, "shelf": fd.shelf, "doc_type": fd.doc_type,
        "shared_by": {"id": fd.shared_by, "name": names.get(fd.shared_by or "", "A former member")},
        "id_card": card, "expiry_status": status, "days_left": days, "created_at": fd.created_at.isoformat(),
    }
    if detail and db is not None:
        dates = db.scalars(select(FamilyKeyDate).where(FamilyKeyDate.family_doc_id == fd.id).order_by(FamilyKeyDate.date))
        out["summary"] = dec_text(key, fd.summary_enc)
        out["dates"] = [{"label": d.label, "kind": d.kind, "date": d.date.isoformat()} for d in dates]
    return out


def _preview(m: FamilyMessage, key: bytes, docs: dict[str, FamilyDoc]) -> str:
    if m.kind == "doc":
        d = docs.get(m.family_doc_id or "")
        return f"📄 {d.title}" if d else "📄 A document (removed)"
    if m.kind == "request":
        return f"🙋 Asked for {m.request_label}"
    text = dec_text(key, m.body_enc)
    return ("Cubby: " if m.kind == "cubby" else "") + text[:90]


def messages_out(db: Session, fam: Family, key: bytes, msgs: list[FamilyMessage], me: str, names: dict[str, str]) -> list[dict]:
    doc_ids = {m.family_doc_id for m in msgs if m.family_doc_id}
    reply_ids = {m.reply_to for m in msgs if m.reply_to}
    docs = {d.id: d for d in db.scalars(select(FamilyDoc).where(FamilyDoc.id.in_(doc_ids)))} if doc_ids else {}
    replies = {r.id: r for r in db.scalars(select(FamilyMessage).where(FamilyMessage.id.in_(reply_ids)))} if reply_ids else {}
    rdocs_ids = {r.family_doc_id for r in replies.values() if r.family_doc_id} - set(docs)
    if rdocs_ids:
        docs.update({d.id: d for d in db.scalars(select(FamilyDoc).where(FamilyDoc.id.in_(rdocs_ids)))})

    out = []
    for m in msgs:
        item = {
            "id": m.id, "kind": m.kind, "created_at": m.created_at.isoformat(), "mine": m.sender_id == me,
            "sender": {"id": m.sender_id, "name": names.get(m.sender_id or "", "Cubby" if m.kind == "cubby" else "A former member")}
            if m.kind != "system" else None,
            "text": dec_text(key, m.body_enc) if m.body_enc else "",
            "citations": m.citations or [],
            "doc": None, "doc_removed": False, "request": None, "reply": None,
        }
        if m.kind == "doc":
            d = docs.get(m.family_doc_id or "")
            item["doc"] = doc_out(d, key, names) if d else None
            item["doc_removed"] = d is None
        if m.kind == "request":
            item["request"] = {"label": m.request_label, "status": m.request_status,
                               "target": {"id": m.request_target, "name": names.get(m.request_target or "")} if m.request_target else None}
        if m.reply_to:
            r = replies.get(m.reply_to)
            item["reply"] = {"id": r.id, "sender_name": "Cubby" if r.kind == "cubby" else names.get(r.sender_id or "", "Someone"),
                             "preview": _preview(r, key, docs)} if r else {"id": m.reply_to, "sender_name": "", "preview": "Message deleted"}
        out.append(item)
    return out


# ---------- families ----------

class FamilyIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    emoji: str = "🏠"
    color: str = "cream"


@router.get("")
def list_families(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Family, FamilyMember).join(FamilyMember, FamilyMember.family_id == Family.id)
                      .where(FamilyMember.user_id == user.id).order_by(Family.last_activity.desc())).all()
    out = []
    for fam, mem in rows:
        key = family_key(db, fam)
        last = db.scalar(select(FamilyMessage).where(FamilyMessage.family_id == fam.id)
                         .order_by(FamilyMessage.created_at.desc()).limit(1))
        unread = db.scalar(select(func.count()).select_from(FamilyMessage).where(
            FamilyMessage.family_id == fam.id, FamilyMessage.created_at > mem.last_read_at,
            (FamilyMessage.sender_id.is_(None)) | (FamilyMessage.sender_id != user.id)))
        members = db.scalar(select(func.count()).select_from(FamilyMember).where(FamilyMember.family_id == fam.id))
        docs = db.scalar(select(func.count()).select_from(FamilyDoc).where(FamilyDoc.family_id == fam.id))
        preview = ""
        if last:
            d = {last.family_doc_id: db.get(FamilyDoc, last.family_doc_id)} if last.family_doc_id else {}
            sender = db.get(User, last.sender_id) if last.sender_id else None
            body = _preview(last, key, {k: v for k, v in d.items() if v})
            preview = f"{_first(sender.name)}: {body}" if sender and last.kind in ("text", "doc", "request") else body
        out.append({"id": fam.id, "name": fam.name, "emoji": fam.emoji, "color": fam.color, "role": mem.role,
                    "members": members, "documents": docs, "unread": unread, "preview": preview,
                    "last_activity": fam.last_activity.isoformat()})
    return out


@router.get("/unread")
def unread_total(user: User = Depends(current_user), db: Session = Depends(get_db)):
    total = db.scalar(select(func.count()).select_from(FamilyMessage)
                      .join(FamilyMember, (FamilyMember.family_id == FamilyMessage.family_id) & (FamilyMember.user_id == user.id))
                      .where(FamilyMessage.created_at > FamilyMember.last_read_at,
                             (FamilyMessage.sender_id.is_(None)) | (FamilyMessage.sender_id != user.id)))
    invites = db.scalar(select(func.count()).select_from(FamilyInvite).where(
        FamilyInvite.email == user.email.lower(), FamilyInvite.status == "pending", FamilyInvite.expires_at > _now()))
    return {"messages": total or 0, "invites": invites or 0}


@router.post("")
def create_family(body: FamilyIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"family-create:user:{user.id}", 10, 3600)
    count = db.scalar(select(func.count()).select_from(FamilyMember).where(FamilyMember.user_id == user.id))
    if count >= MAX_FAMILIES:
        raise HTTPException(400, f"You can be in up to {MAX_FAMILIES} families.")
    provider = get_key_provider()
    fam = Family(id=_id(), name=body.name.strip(), emoji=body.emoji if body.emoji in EMOJIS else "🏠",
                 color=body.color if body.color in COLORS else "cream", created_by=user.id,
                 wrapped_key=provider.wrap(os.urandom(32)), key_provider=provider.name)
    db.add(fam)
    db.flush()
    db.add(FamilyMember(family_id=fam.id, user_id=user.id, role="admin"))
    _post(db, fam, family_key(db, fam), "system", None, f"{_first(user.name)} created {fam.name}. Say hi, share a document, or ask @Cubby anything about what's shared here.")
    db.commit()
    audit(db, user.id, "family_created", request, fam.name)
    return {"id": fam.id}


@router.get("/{fid}")
def family_detail(fid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, mem = _membership(db, user, fid)
    key = family_key(db, fam)
    members = _members(db, fid)
    names = {u.id: u.name for _, u in members}
    docs = db.scalars(select(FamilyDoc).where(FamilyDoc.family_id == fid).order_by(FamilyDoc.created_at.desc()))
    today = date.today()
    dates = db.execute(select(FamilyKeyDate, FamilyDoc.title).join(FamilyDoc, FamilyDoc.id == FamilyKeyDate.family_doc_id)
                       .where(FamilyKeyDate.family_id == fid, FamilyKeyDate.date >= today,
                              FamilyKeyDate.date <= today + timedelta(days=365))
                       .order_by(FamilyKeyDate.date).limit(8)).all()
    invites = db.scalars(select(FamilyInvite).where(FamilyInvite.family_id == fid, FamilyInvite.status == "pending",
                                                    FamilyInvite.expires_at > _now()))
    open_requests = db.scalar(select(func.count()).select_from(FamilyMessage).where(
        FamilyMessage.family_id == fid, FamilyMessage.kind == "request", FamilyMessage.request_status == "open"))
    return {
        "id": fam.id, "name": fam.name, "emoji": fam.emoji, "color": fam.color, "role": mem.role, "me": user.id,
        "created_at": fam.created_at.isoformat(), "open_requests": open_requests,
        "members": [{"user_id": u.id, "name": u.name, "email": u.email, "role": m.role,
                     "joined_at": m.joined_at.isoformat(), "last_read_at": m.last_read_at.isoformat()} for m, u in members],
        "documents": [doc_out(d, key, names) for d in docs],
        "dates": [{"id": kd.id, "label": kd.label, "kind": kd.kind, "date": kd.date.isoformat(),
                   "days_left": (kd.date - today).days, "family_doc_id": kd.family_doc_id, "document_title": t}
                  for kd, t in dates],
        "invites": [{"id": i.id, "email": i.email, "created_at": i.created_at.isoformat()} for i in invites],
    }


class FamilyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    emoji: str | None = None
    color: str | None = None


@router.patch("/{fid}")
def update_family(fid: str, body: FamilyPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, mem = _membership(db, user, fid)
    _admin(mem)
    key = family_key(db, fam)
    if body.name and body.name.strip() != fam.name:
        fam.name = body.name.strip()
        _post(db, fam, key, "system", None, f"{_first(user.name)} renamed the family to {fam.name}.")
    if body.emoji in EMOJIS:
        fam.emoji = body.emoji
    if body.color in COLORS:
        fam.color = body.color
    db.commit()
    return {"ok": True}


def _dissolve(db: Session, fam: Family) -> None:
    for fd in db.scalars(select(FamilyDoc).where(FamilyDoc.family_id == fam.id)):
        delete_family_doc(db, fd)
    db.flush()  # documents first, then the family itself
    db.delete(fam)


@router.delete("/{fid}")
def delete_family(fid: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, mem = _membership(db, user, fid)
    _admin(mem)
    name = fam.name
    _dissolve(db, fam)
    db.commit()
    audit(db, user.id, "family_deleted", request, name)
    return {"ok": True}


@router.delete("/{fid}/members/{uid}")
def remove_member(fid: str, uid: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Leave (your own id) or, as an admin, remove someone."""
    fam, mem = _membership(db, user, fid)
    if uid != user.id:
        _admin(mem)
    target = db.scalar(select(FamilyMember).where(FamilyMember.family_id == fid, FamilyMember.user_id == uid))
    if not target:
        raise HTTPException(404, "That person isn't in this family.")
    who = db.get(User, uid)
    db.delete(target)
    db.flush()
    rest = [m for m, _ in _members(db, fid)]
    if not rest:
        _dissolve(db, fam)
        db.commit()
        audit(db, user.id, "family_left", request, fam.name)
        return {"ok": True, "dissolved": True}
    if not any(m.role == "admin" for m in rest):
        rest[0].role = "admin"  # someone has to look after the family
    key = family_key(db, fam)
    text = f"{_first(who.name if who else None)} left." if uid == user.id else f"{_first(user.name)} removed {_first(who.name if who else None)}."
    _post(db, fam, key, "system", None, text)
    db.commit()
    audit(db, user.id, "family_left" if uid == user.id else "family_member_removed", request, fam.name)
    return {"ok": True, "dissolved": False}


class RoleIn(BaseModel):
    role: str  # admin | member


@router.put("/{fid}/members/{uid}/role")
def set_role(fid: str, uid: str, body: RoleIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, mem = _membership(db, user, fid)
    _admin(mem)
    if body.role not in ("admin", "member"):
        raise HTTPException(400, "Unknown role.")
    target = db.scalar(select(FamilyMember).where(FamilyMember.family_id == fid, FamilyMember.user_id == uid))
    if not target:
        raise HTTPException(404, "That person isn't in this family.")
    if body.role == "member" and target.role == "admin":
        admins = db.scalar(select(func.count()).select_from(FamilyMember).where(
            FamilyMember.family_id == fid, FamilyMember.role == "admin"))
        if admins <= 1:
            raise HTTPException(400, "A family needs at least one admin.")
    target.role = body.role
    db.commit()
    return {"ok": True}


# ---------- invites ----------

class InviteIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


@router.post("/{fid}/invites")
def invite(fid: str, body: InviteIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"family-invite:user:{user.id}", 20, 3600)
    fam, _ = _membership(db, user, fid)
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "That doesn't look like an email address.")
    members = _members(db, fid)
    if any(u.email.lower() == email for _, u in members):
        raise HTTPException(409, "They're already in this family.")
    if len(members) >= MAX_MEMBERS:
        raise HTTPException(400, f"A family can have up to {MAX_MEMBERS} people.")
    pending = db.scalar(select(FamilyInvite).where(FamilyInvite.family_id == fid, FamilyInvite.email == email,
                                                   FamilyInvite.status == "pending", FamilyInvite.expires_at > _now()))
    if pending:
        raise HTTPException(409, "They already have an invite waiting.")
    inv = FamilyInvite(family_id=fid, email=email, invited_by=user.id, expires_at=_now() + timedelta(days=14))
    db.add(inv)
    db.flush()
    invitee = db.scalar(select(User).where(func.lower(User.email) == email))
    if invitee:
        _notify(db, [invitee.id], f"{_first(user.name)} invited you to {fam.name}",
                "Join to share documents and reminders with your family.", "/app/family", f"invite:{inv.id}")
    db.commit()
    origin = get_settings().frontend_origin
    send_email(email, f"{user.name} invited you to {fam.name} on Cubby", [
        f"{user.name} would like you to join “{fam.name}”, a private family vault on Cubby.",
        "Family members can share important documents in one place, ask for the ones they need, "
        "and get reminders before anything expires.",
        "Sign in (or create an account) with this email address, then open Family to accept. The invite lasts 14 days.",
    ], ("Open Cubby", f"{origin}/app/family"))
    audit(db, user.id, "family_invite", request, email)
    return {"id": inv.id, "email": email}


@router.delete("/{fid}/invites/{iid}")
def cancel_invite(fid: str, iid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _membership(db, user, fid)
    inv = db.get(FamilyInvite, iid)
    if not inv or inv.family_id != fid:
        raise HTTPException(404, "Invite not found.")
    inv.status = "cancelled"
    db.commit()
    return {"ok": True}


@router.get("/invites/mine")
def my_invites(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(FamilyInvite, Family, User.name)
                      .join(Family, Family.id == FamilyInvite.family_id)
                      .outerjoin(User, User.id == FamilyInvite.invited_by)
                      .where(FamilyInvite.email == user.email.lower(), FamilyInvite.status == "pending",
                             FamilyInvite.expires_at > _now())
                      .order_by(FamilyInvite.created_at.desc())).all()
    out = []
    for inv, fam, inviter in rows:
        members = db.scalar(select(func.count()).select_from(FamilyMember).where(FamilyMember.family_id == fam.id))
        out.append({"id": inv.id, "family_id": fam.id, "family_name": fam.name, "emoji": fam.emoji, "color": fam.color,
                    "invited_by": inviter or "Someone", "members": members, "created_at": inv.created_at.isoformat()})
    return out


def _my_invite(db: Session, user: User, iid: str) -> FamilyInvite:
    inv = db.get(FamilyInvite, iid)
    if not inv or inv.email != user.email.lower() or inv.status != "pending" or inv.expires_at < _now():
        raise HTTPException(404, "This invite isn't available any more.")
    return inv


@router.post("/invites/{iid}/accept")
def accept_invite(iid: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = _my_invite(db, user, iid)
    fam = db.get(Family, inv.family_id)
    already = db.scalar(select(FamilyMember).where(FamilyMember.family_id == fam.id, FamilyMember.user_id == user.id))
    inv.status = "accepted"
    if not already:
        count = db.scalar(select(func.count()).select_from(FamilyMember).where(FamilyMember.user_id == user.id))
        if count >= MAX_FAMILIES:
            raise HTTPException(400, f"You can be in up to {MAX_FAMILIES} families. Leave one first.")
        db.add(FamilyMember(family_id=fam.id, user_id=user.id, role="member"))
        _post(db, fam, family_key(db, fam), "system", None, f"{_first(user.name)} joined. Welcome! 👋")
    db.commit()
    audit(db, user.id, "family_joined", request, fam.name)
    return {"family_id": fam.id}


@router.post("/invites/{iid}/decline")
def decline_invite(iid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    inv = _my_invite(db, user, iid)
    inv.status = "declined"
    db.commit()
    return {"ok": True}


# ---------- chat ----------

@router.get("/{fid}/messages")
def list_messages(fid: str, before: str | None = None, limit: int = 60,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, _ = _membership(db, user, fid)
    key = family_key(db, fam)
    stmt = select(FamilyMessage).where(FamilyMessage.family_id == fid)
    if before:
        try:
            stmt = stmt.where(FamilyMessage.created_at < datetime.fromisoformat(before))
        except ValueError:
            raise HTTPException(400, "Bad cursor.")
    msgs = list(db.scalars(stmt.order_by(FamilyMessage.created_at.desc()).limit(max(1, min(limit, 100)))))[::-1]
    members = _members(db, fid)
    names = {u.id: u.name for _, u in members}
    return {
        "messages": messages_out(db, fam, key, msgs, user.id, names),
        "reads": [{"user_id": m.user_id, "last_read_at": m.last_read_at.isoformat()} for m, _ in members],
        "has_more": len(msgs) >= max(1, min(limit, 100)),
    }


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    reply_to: str | None = None


@router.post("/{fid}/messages")
def send_message(fid: str, body: MessageIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"family-msg:user:{user.id}", 40, 60)
    fam, mem = _membership(db, user, fid)
    key = family_key(db, fam)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Write a message first.")
    reply_to = None
    if body.reply_to:
        r = db.get(FamilyMessage, body.reply_to)
        reply_to = r.id if r and r.family_id == fid else None
    msg = _post(db, fam, key, "text", user.id, text, reply_to=reply_to)
    mem.last_read_at = msg.created_at
    db.commit()
    created = [msg]

    if mentions_cubby(text):
        hit(f"chat:user:{user.id}", 20, 60)
        hit(f"chat-day:user:{user.id}", 300, 86400)
        recent = list(db.scalars(select(FamilyMessage).where(FamilyMessage.family_id == fid,
                                                             FamilyMessage.kind.in_(("text", "cubby")),
                                                             FamilyMessage.id != msg.id)
                                 .order_by(FamilyMessage.created_at.desc()).limit(6)))[::-1]
        names = {u.id: u.name for _, u in _members(db, fid)}
        history = [("Cubby" if m.kind == "cubby" else _first(names.get(m.sender_id or "")), dec_text(key, m.body_enc))
                   for m in recent if m.body_enc]
        try:
            answer, cites = ask_cubby(db, fam, f"{_first(user.name)} asks: {text}", history)
        except Exception as exc:
            ref = log_exception("family cubby", exc)
            answer, cites = f"Sorry, I can't answer right now. Please try again in a moment. (Reference {ref})", []
        created.append(_post(db, fam, key, "cubby", None, answer or "I couldn't find that in this family's documents.",
                             reply_to=msg.id, citations=cites))
        db.commit()
        audit(db, user.id, "family_cubby", request, fam.name)

    names = {u.id: u.name for _, u in _members(db, fid)}
    return {"messages": messages_out(db, fam, key, created, user.id, names)}


@router.post("/{fid}/read")
def mark_read(fid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, mem = _membership(db, user, fid)
    mem.last_read_at = _now()
    db.commit()
    return {"ok": True}


@router.delete("/{fid}/messages/{mid}")
def delete_message(fid: str, mid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Delete your own text message (shared documents are removed from the document card)."""
    _membership(db, user, fid)
    m = db.get(FamilyMessage, mid)
    if not m or m.family_id != fid or m.sender_id != user.id or m.kind != "text":
        raise HTTPException(404, "Message not found.")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ---------- shared documents ----------

class ShareIn(BaseModel):
    document_id: str
    note: str | None = Field(default=None, max_length=500)


def _share(db: Session, user: User, fam: Family, document_id: str, note: str | None, reply_to: str | None = None) -> FamilyMessage:
    doc = db.get(Document, document_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(404, "Document not found.")
    try:
        fd = share_document(db, user, fam, doc)
    except FamilyError as e:
        _raise(e)
    key = family_key(db, fam)
    return _post(db, fam, key, "doc", user.id, (note or "").strip(), family_doc_id=fd.id, reply_to=reply_to)


@router.post("/{fid}/share")
def share(fid: str, body: ShareIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"family-share:user:{user.id}", 30, 600)
    fam, mem = _membership(db, user, fid)
    try:
        msg = _share(db, user, fam, body.document_id, body.note)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        ref = log_exception("family share", exc)
        raise HTTPException(503, f"Cubby couldn't share this right now. Please try again. (Reference {ref})") from exc
    mem.last_read_at = msg.created_at
    db.commit()
    audit(db, user.id, "family_share", request, fam.name)
    names = {u.id: u.name for _, u in _members(db, fid)}
    return {"messages": messages_out(db, fam, family_key(db, fam), [msg], user.id, names)}


def _family_doc(db: Session, fid: str, did: str) -> FamilyDoc:
    fd = db.get(FamilyDoc, did)
    if not fd or fd.family_id != fid:
        raise HTTPException(404, "Document not found.")
    return fd


@router.get("/{fid}/docs/{did}")
def family_doc(fid: str, did: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, _ = _membership(db, user, fid)
    fd = _family_doc(db, fid, did)
    names = {u.id: u.name for _, u in _members(db, fid)}
    return doc_out(fd, family_key(db, fam), names, detail=True, db=db)


@router.get("/{fid}/docs/{did}/file")
def family_doc_file(fid: str, did: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, _ = _membership(db, user, fid)
    fd = _family_doc(db, fid, did)
    data = load_file(db, fam, fd)
    audit(db, user.id, "family_view_file", request, fd.title)
    safe = fd.filename.replace('"', "")
    return Response(data, media_type=fd.mime_type,
                    headers={"Content-Disposition": f'inline; filename="{safe}"', "Cache-Control": "no-store"})


@router.post("/{fid}/docs/{did}/save")
def save_doc(fid: str, did: str, background: BackgroundTasks, request: Request,
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"upload:user:{user.id}", 40, 600)
    fam, _ = _membership(db, user, fid)
    fd = _family_doc(db, fid, did)
    try:
        doc = save_to_vault(db, user, fam, fd)
    except FamilyError as e:
        _raise(e)
    db.commit()
    background.add_task(process_document, doc.id)
    audit(db, user.id, "family_save", request, fd.title)
    return {"document_id": doc.id}


@router.delete("/{fid}/docs/{did}")
def remove_doc(fid: str, did: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The person who shared it, or an admin, can take a document out of the family."""
    fam, mem = _membership(db, user, fid)
    fd = _family_doc(db, fid, did)
    if fd.shared_by != user.id and mem.role != "admin":
        raise HTTPException(403, "Only the person who shared it or an admin can remove it.")
    title = fd.title
    delete_family_doc(db, fd)
    _post(db, fam, family_key(db, fam), "system", None, f"{_first(user.name)} removed “{title}” from the family.")
    db.commit()
    audit(db, user.id, "family_unshare", request, title)
    return {"ok": True}


# ---------- document requests ----------

class RequestIn(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    target_user_id: str | None = None
    note: str | None = Field(default=None, max_length=500)


@router.post("/{fid}/requests")
def create_request(fid: str, body: RequestIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"family-msg:user:{user.id}", 40, 60)
    fam, mem = _membership(db, user, fid)
    members = _members(db, fid)
    ids = {u.id for _, u in members}
    if body.target_user_id and (body.target_user_id not in ids or body.target_user_id == user.id):
        raise HTTPException(400, "Choose someone else in this family.")
    key = family_key(db, fam)
    msg = _post(db, fam, key, "request", user.id, (body.note or "").strip(), request_label=body.label.strip(),
                request_target=body.target_user_id, request_status="open")
    mem.last_read_at = msg.created_at
    db.flush()
    targets = [body.target_user_id] if body.target_user_id else [i for i in ids if i != user.id]
    _notify(db, targets, f"{_first(user.name)} asked for {body.label.strip()}",
            f"In {fam.name}. Tap to share it from your vault.", f"/app/family/{fid}", f"request:{msg.id}")
    db.commit()
    names = {u.id: u.name for _, u in members}
    return {"messages": messages_out(db, fam, key, [msg], user.id, names)}


def _request(db: Session, fid: str, mid: str) -> FamilyMessage:
    m = db.get(FamilyMessage, mid)
    if not m or m.family_id != fid or m.kind != "request":
        raise HTTPException(404, "Request not found.")
    if m.request_status != "open":
        raise HTTPException(409, "This request has already been answered.")
    return m


class FulfilIn(BaseModel):
    document_id: str


@router.post("/{fid}/requests/{mid}/fulfil")
def fulfil_request(fid: str, mid: str, body: FulfilIn, request: Request,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    fam, mem = _membership(db, user, fid)
    req = _request(db, fid, mid)
    if req.sender_id == user.id:
        raise HTTPException(400, "You asked for this one, so someone else needs to share it.")
    if req.request_target and req.request_target != user.id:
        raise HTTPException(403, "This request was for someone else.")
    try:
        msg = _share(db, user, fam, body.document_id, None, reply_to=req.id)
    except HTTPException:
        db.rollback()
        raise
    req.request_status = "fulfilled"
    mem.last_read_at = msg.created_at
    if req.sender_id:
        _notify(db, [req.sender_id], f"{_first(user.name)} shared {req.request_label}",
                f"In {fam.name}.", f"/app/family/{fid}", f"fulfilled:{req.id}")
    db.commit()
    audit(db, user.id, "family_share", request, fam.name)
    names = {u.id: u.name for _, u in _members(db, fid)}
    key = family_key(db, fam)
    return {"messages": messages_out(db, fam, key, [req, msg], user.id, names)}


@router.post("/{fid}/requests/{mid}/close")
def close_request(fid: str, mid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The asker cancels, or the person asked says they don't have it."""
    fam, _ = _membership(db, user, fid)
    req = _request(db, fid, mid)
    if req.sender_id == user.id:
        req.request_status = "cancelled"
    elif req.request_target in (None, user.id):
        req.request_status = "declined"
        key = family_key(db, fam)
        _post(db, fam, key, "system", None, f"{_first(user.name)} doesn't have {req.request_label}.", reply_to=req.id)
    else:
        raise HTTPException(403, "This request was for someone else.")
    db.commit()
    return {"ok": True, "status": req.request_status}
