"""Family vaults: moving documents between a person's vault and a family's space,
and answering @Cubby questions from the family's shared documents.

Every family has its own data key (wrapped by the same master key as people's
keys). Sharing a document decrypts it with the sharer's key and re-encrypts a
separate copy with the family key, so:
  - members read family documents without ever touching anyone's personal key,
  - deleting your original doesn't break the chat, and
  - leaving a family takes nothing of the family's with you.
"""
import hashlib
import json
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (Chunk, Document, Family, FamilyChunk, FamilyDoc, FamilyKeyDate, KeyDate, User, _id)
from ..providers.llm import get_chat, get_embedder
from ..providers.storage import get_storage
from .crypto import dec_text, decrypt, enc_text, encrypt, family_key, user_key
from .idcards import masked
from .rag import build_prompt, citations_for


class FamilyError(Exception):
    """A problem worth showing to the person as-is."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def share_document(db: Session, user: User, family: Family, doc: Document) -> FamilyDoc:
    if doc.user_id != user.id:
        raise FamilyError(404, "Document not found.")
    if doc.status != "ready":
        raise FamilyError(400, "This document is still being read. Share it once it's ready.")
    existing = db.scalar(select(FamilyDoc).where(FamilyDoc.family_id == family.id, FamilyDoc.source_doc_id == doc.id))
    if existing:
        raise FamilyError(409, f"“{doc.title}” is already shared in {family.name}.")

    ukey, fkey = user_key(db, user), family_key(db, family)
    storage = get_storage()
    data = decrypt(ukey, storage.load(doc.storage_key, doc.storage_locations))

    fields: dict = {}
    if doc.id_fields_enc:
        try:
            fields = json.loads(dec_text(ukey, doc.id_fields_enc))
        except Exception:
            fields = {}
    fd = FamilyDoc(
        id=_id(), family_id=family.id, shared_by=user.id, source_doc_id=doc.id, title=doc.title,
        filename=doc.filename, mime_type=doc.mime_type, size_bytes=doc.size_bytes, page_count=doc.page_count,
        shelf=doc.shelf, doc_type=doc.doc_type,
        summary_enc=enc_text(fkey, dec_text(ukey, doc.summary_enc)) if doc.summary_enc else None,
        storage_key="", storage_locations=[],
    )
    if fields:
        # The family copy only ever holds the masked number.
        fields["number"] = masked(fields.get("number"))
        fd.id_fields_enc = enc_text(fkey, json.dumps(fields))
    fd.storage_key = f"family/{family.id}/{fd.id}"
    fd.storage_locations = storage.save(fd.storage_key, encrypt(fkey, data))
    db.add(fd)
    db.flush()

    for c in db.scalars(select(Chunk).where(Chunk.document_id == doc.id).order_by(Chunk.idx)):
        db.add(FamilyChunk(family_doc_id=fd.id, family_id=family.id, page=c.page, idx=c.idx,
                           text_enc=enc_text(fkey, dec_text(ukey, c.text_enc)), embedding=c.embedding))
    for kd in db.scalars(select(KeyDate).where(KeyDate.document_id == doc.id)):
        db.add(FamilyKeyDate(family_id=family.id, family_doc_id=fd.id, label=kd.label, kind=kd.kind, date=kd.date))
    return fd


def load_file(db: Session, family: Family, fd: FamilyDoc) -> bytes:
    return decrypt(family_key(db, family), get_storage().load(fd.storage_key, fd.storage_locations))


def delete_family_doc(db: Session, fd: FamilyDoc) -> None:
    get_storage().delete(fd.storage_key, fd.storage_locations)
    db.delete(fd)


def save_to_vault(db: Session, user: User, family: Family, fd: FamilyDoc) -> Document:
    """Copy a family document into the person's own vault (encrypted with their key).
    The caller queues it for reading, so ID numbers and dates are found afresh."""
    data = load_file(db, family, fd)
    digest = hashlib.sha256(data).hexdigest()
    same = db.scalar(select(Document).where(Document.user_id == user.id, Document.content_hash == digest))
    if same:
        raise FamilyError(409, f"This is already in your vault as “{same.title}”.")
    doc = Document(id=_id(), user_id=user.id, filename=fd.filename, title=fd.title, mime_type=fd.mime_type,
                   size_bytes=fd.size_bytes, storage_key="", storage_locations=[], content_hash=digest)
    doc.storage_key = f"{user.id}/{doc.id}"
    doc.storage_locations = get_storage().save(doc.storage_key, encrypt(user_key(db, user), data))
    db.add(doc)
    return doc


# ---------- @Cubby in the group ----------

FAMILY_SYSTEM = """You are Cubby, a friendly assistant inside a family's private group chat.
Answer ONLY from the numbered sources: documents family members have shared into this group.
Cite sources inline like [1] right after the facts they support. When it helps, say whose
document it is (the sources show who shared each one). If the sources don't contain the
answer, say nobody has shared a document with that information here yet, and suggest
using "Request a document" to ask the right person. Keep it to 2-4 short sentences, warm
and plain. Long numbers appear masked like XXXX1234; never guess the hidden digits."""

MENTION = re.compile(r"@cubby\b", re.IGNORECASE)


def mentions_cubby(text: str) -> bool:
    return bool(MENTION.search(text))


def retrieve_family(db: Session, family: Family, query: str, k: int = 6) -> list[dict]:
    qvec = get_embedder().embed([query], kind="query")[0]
    distance = FamilyChunk.embedding.cosine_distance(qvec)
    rows = db.execute(
        select(FamilyChunk, FamilyDoc.title, User.name, distance.label("dist"))
        .join(FamilyDoc, FamilyDoc.id == FamilyChunk.family_doc_id)
        .outerjoin(User, User.id == FamilyDoc.shared_by)
        .where(FamilyChunk.family_id == family.id)
        .order_by(distance).limit(k * 3))
    key = family_key(db, family)
    words = set(re.findall(r"[a-z0-9]{3,}", query.lower()))
    out = []
    for chunk, title, sharer, dist in rows:
        text = dec_text(key, chunk.text_enc)
        low = text.lower()
        bonus = (sum(1 for w in words if w in low) / len(words)) * 0.08 if words else 0
        out.append({"document_id": chunk.family_doc_id,
                    "title": f"{title} (shared by {sharer or 'a former member'})",
                    "plain_title": title, "page": chunk.page, "text": text,
                    "score": (1 - float(dist)) + bonus})
    out.sort(key=lambda r: r["score"], reverse=True)
    return out[:k]


def ask_cubby(db: Session, family: Family, question: str, history: list[tuple[str, str]]) -> tuple[str, list[dict]]:
    sources = retrieve_family(db, family, MENTION.sub("", question).strip() or question)
    text = get_chat().generate(FAMILY_SYSTEM, build_prompt(question, history, sources)).strip()
    cites = []
    for c in citations_for(text, sources):
        src = sources[c["n"] - 1]
        cites.append({"n": c["n"], "family_doc_id": c["document_id"], "title": src["plain_title"],
                      "page": c["page"], "snippet": c["snippet"]})
    return text, cites
