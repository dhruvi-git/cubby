"""Studio: notes, reports made from your documents, and a vault infographic.

Reports built from structured data (ID checklist, upcoming dates) are written by
code, so the numbers are always exact. Reports that need reading (summaries,
insurance, custom questions) are written by the AI from your passages, with
citations back to the pages they came from.
"""
import json
import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import log_exception
from ..core.ratelimit import hit
from ..database import get_db
from ..deps import current_user
from ..models import Chunk, Document, KeyDate, Note, User
from ..providers.llm import get_chat
from ..services.audit import audit
from ..services.crypto import dec_text, enc_text, user_key
from ..services.idcards import masked
from ..services.privacy import mask_sensitive
from ..services.rag import citations_for, retrieve

router = APIRouter(prefix="/api/studio", tags=["studio"])

TEMPLATES = [
    {"id": "summary", "title": "Document summary", "needs": "document",
     "description": "Key points, numbers, dates and things to watch out for in one document."},
    {"id": "insurance", "title": "Insurance coverage", "needs": None,
     "description": "What each of your insurance policies covers, costs and excludes."},
    {"id": "identity", "title": "Identity documents checklist", "needs": None,
     "description": "Every ID in your vault, who it belongs to, and when it expires."},
    {"id": "dates", "title": "Year ahead", "needs": None,
     "description": "Every expiry, renewal and due date for the next 12 months, month by month."},
    {"id": "custom", "title": "Ask for a report", "needs": "prompt",
     "description": "Describe the report you want. Cubby writes it from your documents."},
]

REPORT_SYSTEM = """You write clear, well-organised reports from a person's own documents.
Use ONLY the numbered sources. Write in Markdown: a one-paragraph overview, then '## ' sections,
'-' bullet points, and a table where it helps comparison. Put citations like [1] or [2][3] right
after the facts they support. If the sources don't cover something, say so briefly instead of guessing.
Long numbers appear masked like XXXX1234 for privacy; keep them masked."""


# ---------- Notes ----------
class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=60000)
    citations: list[dict] = Field(default_factory=list, max_length=50)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=60000)
    pinned: bool | None = None


def _plain(md: str) -> str:
    text = re.sub(r"\[\d+\]", "", md)          # citations like [1]
    text = re.sub(r"[#*_`>|\[\]-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def note_out(n: Note, key: bytes, full: bool = False) -> dict:
    body = dec_text(key, n.body_enc)
    out = {"id": n.id, "kind": n.kind, "template": n.template, "title": n.title, "pinned": n.pinned,
           "preview": _plain(body)[:180], "created_at": n.created_at.isoformat(), "updated_at": n.updated_at.isoformat()}
    if full:
        out.update(body=body, citations=n.citations or [])
    return out


def _own(db: Session, user: User, note_id: str) -> Note:
    n = db.get(Note, note_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Note not found.")
    return n


@router.get("/notes")
def list_notes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    key = user_key(db, user)
    rows = db.scalars(select(Note).where(Note.user_id == user.id).order_by(Note.pinned.desc(), Note.updated_at.desc()))
    return [note_out(n, key) for n in rows]


@router.post("/notes")
def create_note(body: NoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    key = user_key(db, user)
    n = Note(user_id=user.id, kind="note", title=body.title.strip(), body_enc=enc_text(key, body.body),
             citations=body.citations)
    db.add(n)
    db.commit()
    return note_out(n, key, full=True)


@router.get("/notes/{note_id}")
def get_note(note_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return note_out(_own(db, user, note_id), user_key(db, user), full=True)


@router.patch("/notes/{note_id}")
def update_note(note_id: str, body: NotePatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = _own(db, user, note_id)
    key = user_key(db, user)
    if body.title is not None:
        n.title = body.title.strip()
    if body.body is not None:
        n.body_enc = enc_text(key, body.body)
    if body.pinned is not None:
        n.pinned = body.pinned
    n.updated_at = datetime.now(timezone.utc)
    db.commit()
    return note_out(n, key, full=True)


@router.delete("/notes/{note_id}")
def delete_note(note_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, note_id))
    db.commit()
    return {"ok": True}


# ---------- Reports ----------
class ReportIn(BaseModel):
    template: str
    document_id: str | None = None
    prompt: str | None = Field(default=None, max_length=600)


@router.get("/templates")
def templates(_: User = Depends(current_user)):
    return TEMPLATES


def _id_cards(db: Session, user: User, key: bytes) -> list[tuple[Document, dict]]:
    out = []
    for d in db.scalars(select(Document).where(Document.user_id == user.id, Document.id_fields_enc.is_not(None))):
        try:
            out.append((d, json.loads(dec_text(key, d.id_fields_enc))))
        except Exception:
            continue
    return out


def _identity_report(db: Session, user: User, key: bytes) -> str:
    cards = _id_cards(db, user, key)
    today = date.today()
    if not cards:
        return ("No identity documents found yet.\n\nUpload your passport, Aadhaar, PAN, driving licence or "
                "voter ID and Cubby will list them here, with their expiry dates.")
    rows = ["| Document | Belongs to | Number | Expires | Status |", "|---|---|---|---|---|"]
    expiring = []
    for d, f in sorted(cards, key=lambda x: (x[1].get("holder_name") or "", x[1].get("label") or "")):
        exp = f.get("expiry_date")
        if d.superseded_by:
            status = "Replaced by a newer copy"
        elif not exp:
            status = "No expiry"
        else:
            days = (date.fromisoformat(exp) - today).days
            status = "Expired" if days < 0 else f"Expires in {days} days" if days <= 180 else "Valid"
            if 0 <= days <= 180 and not d.superseded_by:
                expiring.append(f"- **{f.get('label')}** for {f.get('holder_name') or 'unknown'}: renew before {exp}.")
        check = " ✓" if f.get("verified") else ""
        rows.append(f"| {f.get('label')}{check} | {f.get('holder_name') or '–'} | {masked(f.get('number')) or '–'} "
                    f"| {exp or '–'} | {status} |")
    have = {f.get("id_type") for _, f in cards}
    missing = [label for key_, label in (("passport", "Passport"), ("aadhaar", "Aadhaar card"), ("pan", "PAN card"),
                                         ("driving_licence", "Driving licence"), ("voter_id", "Voter ID"))
               if key_ not in have]
    parts = [f"You have **{len(cards)} identity document{'s' if len(cards) != 1 else ''}** in your vault. "
             "A ✓ means Cubby verified the number with its official checksum.", "## Your IDs", "\n".join(rows)]
    parts += ["## Renew soon", "\n".join(expiring)] if expiring else []
    if missing:
        parts += ["## Not in your vault yet", "\n".join(f"- {m}" for m in missing)]
    return "\n\n".join(parts)


def _dates_report(db: Session, user: User) -> str:
    today = date.today()
    rows = db.execute(select(KeyDate, Document.title).join(Document, Document.id == KeyDate.document_id)
                      .where(KeyDate.user_id == user.id, KeyDate.date >= today,
                             KeyDate.date <= today + timedelta(days=366), Document.superseded_by.is_(None))
                      .order_by(KeyDate.date)).all()
    if not rows:
        return "Nothing is due in the next 12 months. Cubby adds dates here as it finds them in your documents."
    by_month: dict[str, list[str]] = {}
    for kd, title in rows:
        by_month.setdefault(kd.date.strftime("%B %Y"), []).append(
            f"- **{kd.date.strftime('%d %b')}**: {kd.label} ({title})")
    parts = [f"**{len(rows)} date{'s' if len(rows) != 1 else ''}** coming up in the next 12 months."]
    for month, items in by_month.items():
        parts += [f"## {month}", "\n".join(items)]
    return "\n\n".join(parts)


def _sources_for_doc(db: Session, user: User, key: bytes, doc: Document) -> list[dict]:
    chunks = db.scalars(select(Chunk).where(Chunk.document_id == doc.id).order_by(Chunk.idx).limit(30))
    return [{"document_id": doc.id, "title": doc.title, "shelf": doc.shelf, "page": c.page,
             "text": dec_text(key, c.text_enc)} for c in chunks]


def _ai_report(instruction: str, sources: list[dict]) -> tuple[str, list[dict]]:
    if not sources:
        return "Cubby couldn't find anything in your documents for this report yet.", []
    numbered = "\n\n".join(f"[{i + 1}] {s['title']} (page {s['page']}):\n{mask_sensitive(s['text'])}"
                           for i, s in enumerate(sources))
    text = get_chat().generate(REPORT_SYSTEM, f"Report to write: {instruction}\n\nSources:\n{numbered}")
    return text.strip(), citations_for(text, sources)


@router.post("/reports")
def create_report(body: ReportIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"report:user:{user.id}", 15, 3600)
    key = user_key(db, user)
    tpl = next((t for t in TEMPLATES if t["id"] == body.template), None)
    if not tpl:
        raise HTTPException(400, "Choose a report type.")
    citations: list[dict] = []
    try:
        if body.template == "identity":
            title, text = "Identity documents checklist", _identity_report(db, user, key)
        elif body.template == "dates":
            title, text = f"Year ahead · from {date.today().strftime('%d %b %Y')}", _dates_report(db, user)
        elif body.template == "summary":
            doc = db.get(Document, body.document_id or "")
            if not doc or doc.user_id != user.id:
                raise HTTPException(400, "Choose a document to summarise.")
            title = f"Summary · {doc.title}"
            text, citations = _ai_report(
                "A structured summary of this one document: overview, key points, important numbers and "
                "amounts, important dates, and anything to watch out for (conditions, penalties, exclusions).",
                _sources_for_doc(db, user, key, doc))
        elif body.template == "insurance":
            title = "Insurance coverage"
            sources = retrieve(db, user, "insurance policy coverage sum insured premium deductible exclusions "
                                         "renewal date policy number", k=12)
            text, citations = _ai_report(
                "For each insurance policy found: insurer, type, who is covered, sum insured, premium, "
                "renewal date, key inclusions and exclusions. End with a comparison table and any gaps.", sources)
        else:
            prompt = (body.prompt or "").strip()
            if len(prompt) < 5:
                raise HTTPException(400, "Describe the report you'd like.")
            title = prompt[:80]
            text, citations = _ai_report(prompt, retrieve(db, user, prompt, k=12))
    except HTTPException:
        raise
    except Exception as exc:
        ref = log_exception("studio report", exc)
        raise HTTPException(503, f"Cubby couldn't write this report right now. Please try again. (Reference {ref})") from exc

    n = Note(user_id=user.id, kind="report", template=body.template, title=title[:200],
             body_enc=enc_text(key, text), citations=citations)
    db.add(n)
    db.commit()
    audit(db, user.id, "report_created", request, tpl["title"])
    return note_out(n, key, full=True)


# ---------- Infographic data (exact numbers, no AI) ----------
@router.get("/infographic")
def infographic(user: User = Depends(current_user), db: Session = Depends(get_db)):
    key = user_key(db, user)
    today = date.today()
    docs = list(db.scalars(select(Document).where(Document.user_id == user.id)))
    shelves: dict[str, int] = {}
    for d in docs:
        shelves[d.shelf] = shelves.get(d.shelf, 0) + 1
    months = []
    y, m = today.year, today.month
    for _ in range(12):  # this month and the 11 before it
        months.insert(0, date(y, m, 1))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    added = {m.strftime("%b %y"): 0 for m in months}
    for d in docs:
        label = d.created_at.date().replace(day=1).strftime("%b %y")
        if label in added:
            added[label] += 1
    upcoming = db.execute(select(KeyDate, Document.title).join(Document, Document.id == KeyDate.document_id)
                          .where(KeyDate.user_id == user.id, KeyDate.date >= today,
                                 KeyDate.date <= today + timedelta(days=366), Document.superseded_by.is_(None))
                          .order_by(KeyDate.date)).all()
    cards = _id_cards(db, user, key)
    id_status = {"valid": 0, "expiring": 0, "expired": 0}
    for d, f in cards:
        if d.superseded_by or not f.get("expiry_date"):
            continue
        days = (date.fromisoformat(f["expiry_date"]) - today).days
        id_status["expired" if days < 0 else "expiring" if days <= 180 else "valid"] += 1
    return {
        "name": user.name.split(" ")[0],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {"documents": len(docs), "pages": sum(d.page_count for d in docs),
                   "ids": len([1 for d, _ in cards if not d.superseded_by]), "upcoming": len(upcoming),
                   "starred": sum(1 for d in docs if d.starred)},
        "shelves": [{"name": k, "count": v} for k, v in sorted(shelves.items(), key=lambda x: -x[1])],
        "added_by_month": [{"month": k, "count": v} for k, v in added.items()],
        "timeline": [{"date": kd.date.isoformat(), "label": kd.label, "document": t, "kind": kd.kind,
                      "days_left": (kd.date - today).days} for kd, t in upcoming[:12]],
        "id_status": id_status,
    }
