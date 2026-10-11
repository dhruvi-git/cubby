"""The upload pipeline: decrypt -> read text -> sort into a shelf ->
find important dates -> embed passages -> ready to search and chat."""
from datetime import date, datetime, timezone

import json

from sqlalchemy import delete, select

from ..core.errors import friendly_processing_error, log_exception
from ..database import SessionLocal
from ..models import Chunk, Document, KeyDate, Notification, User
from ..providers.llm import get_chat, get_embedder, parse_json
from ..providers.storage import get_storage
from .chunking import chunk_pages
from .crypto import dec_text, decrypt, enc_text, user_key
from .extraction import extract
from .idcards import ID_TYPES, extract_id, holder_key
from .privacy import mask_sensitive

SHELVES = ["Finance", "Health", "Identity", "Home", "Work", "Legal", "Education", "Other"]

CLASSIFY_SYSTEM = (
    "You organise personal documents. Reply with JSON only, no prose."
)

CLASSIFY_PROMPT = """Read the document below and return JSON with exactly these keys:
- "shelf": one of {shelves}
- "doc_type": a short type, e.g. "Passport", "Health insurance policy", "Bank statement", "Rent agreement"
- "title": a short human title, e.g. "Health insurance policy 2026"
- "summary": 2-3 plain sentences saying what this document is and its most useful facts
- "dates": a list of important future-relevant dates, each {{"label": "...", "date": "YYYY-MM-DD", "kind": "expiry"|"renewal"|"due"|"other"}}
  (e.g. passport expiry, policy renewal, payment due date). Use [] if none. Never invent dates.
- "confidence": a number from 0 to 1, how sure you are about doc_type
- "id_type": if this is a personal identity document, one of {id_types}; otherwise null
- "id": if id_type is not null, {{"holder_name": "...", "date_of_birth": "YYYY-MM-DD", "issue_date": "YYYY-MM-DD",
  "expiry_date": "YYYY-MM-DD", "nationality": "..."}} using null for anything not shown; otherwise null
Long numbers in the text have been hidden as XXXX1234 for privacy. That's expected.

File name: {filename}
Document text (may be partial):
\"\"\"
{text}
\"\"\""""


def _classify(filename: str, text: str) -> dict:
    prompt = CLASSIFY_PROMPT.format(shelves=", ".join(SHELVES), id_types=", ".join(ID_TYPES),
                                    filename=filename, text=mask_sensitive(text[:9000]))
    try:
        data = parse_json(get_chat().generate(CLASSIFY_SYSTEM, prompt, json_mode=True))
    except Exception as exc:
        print(f"[processing] classification failed: {exc}")
        return {}
    if data.get("shelf") not in SHELVES:
        data["shelf"] = "Other"
    return data


def _parse_dates(raw) -> list[tuple[str, str, date]]:
    out = []
    for item in raw or []:
        try:
            d = date.fromisoformat(str(item["date"])[:10])
            kind = item.get("kind") if item.get("kind") in ("expiry", "renewal", "due", "other") else "other"
            out.append((str(item.get("label", "Important date"))[:200], kind, d))
        except Exception:
            continue
    return out


def process_document(document_id: str) -> None:
    db = SessionLocal()
    try:
        doc = db.get(Document, document_id)
        if not doc:
            return
        user = db.get(User, doc.user_id)
        key = user_key(db, user)
        doc.status, doc.error, doc.error_detail = "processing", None, None
        db.commit()

        # 1. Decrypt the stored file and read its text
        data = decrypt(key, get_storage().load(doc.storage_key, doc.storage_locations))
        result = extract(data, doc.mime_type)
        doc.page_count, doc.used_ocr = result.page_count, result.used_ocr
        full_text = "\n\n".join(t for _, t in result.pages).strip()
        if not full_text:
            raise ValueError(result.note or "No readable text found in this file.")

        # 2. Make sure embeddings work before doing anything else
        embedder = get_embedder()

        # 3. Sort into a shelf, write a summary, find important dates
        info = _classify(doc.filename, full_text)
        if info:
            doc.shelf = info.get("shelf", "Other")
            doc.doc_type = (info.get("doc_type") or None) and str(info["doc_type"])[:80]
            if info.get("title"):
                doc.title = str(info["title"])[:255]
            if info.get("summary"):
                doc.summary_enc = enc_text(key, str(info["summary"]))
            try:
                doc.confidence = max(0.0, min(1.0, float(info.get("confidence", 1))))
            except (TypeError, ValueError):
                doc.confidence = None
            doc.needs_review = doc.confidence is not None and doc.confidence < 0.6

        # 3b. Identity documents: read the fields, check the numbers locally
        id_fields = None
        id_type = (info or {}).get("id_type")
        if id_type in ID_TYPES:
            id_fields = extract_id(id_type, full_text, info.get("id") if isinstance(info.get("id"), dict) else None)
            doc.id_fields_enc = enc_text(key, json.dumps(id_fields))
            doc.shelf = "Identity"
            doc.doc_type = id_fields["label"]
            if id_fields.get("holder_name"):
                doc.title = f"{id_fields['label']} · {id_fields['holder_name']}"[:255]
        else:
            doc.id_fields_enc = None

        # 4. Split into passages and embed them
        chunks = chunk_pages(result.pages)
        vectors = embedder.embed([f"{doc.title}\n{c[1]}" for c in chunks], kind="document")

        db.execute(delete(Chunk).where(Chunk.document_id == doc.id))
        db.execute(delete(KeyDate).where(KeyDate.document_id == doc.id))
        for i, ((page, text), vec) in enumerate(zip(chunks, vectors)):
            db.add(Chunk(document_id=doc.id, user_id=doc.user_id, page=page, idx=i,
                         text_enc=enc_text(key, text), embedding=vec))
        found = _parse_dates(info.get("dates"))
        if id_fields and id_fields.get("expiry_date"):
            exp = date.fromisoformat(id_fields["expiry_date"])
            found = [f for f in found if f[2] != exp] + [(f"{id_fields['label']} expiry", "expiry", exp)]
        for label, kind, d in found:
            db.add(KeyDate(user_id=doc.user_id, document_id=doc.id, label=label, kind=kind, date=d))
        if id_fields:
            _mark_versions(db, key, doc, id_fields)

        doc.status = "ready"
        doc.error = None
        doc.processed_at = datetime.now(timezone.utc)
        db.add(Notification(user_id=doc.user_id, title=f"{doc.title} is ready",
                            body=f"Filed under {doc.shelf}.", link=f"/app/documents/{doc.id}",
                            dedupe_key=f"ready:{doc.id}:{int(doc.processed_at.timestamp())}"))
        db.commit()
    except Exception as exc:
        db.rollback()
        ref = log_exception(f"processing document {document_id}", exc)
        _fail(db, document_id, friendly_processing_error(exc), f"[ref {ref}] {type(exc).__name__}: {exc}"[:2000])
    finally:
        db.close()


def _mark_versions(db, key: bytes, doc: Document, fields: dict) -> None:
    """If the same person has another ID of the same type, keep the one that expires
    later as current and mark the other as replaced."""
    who = holder_key(fields.get("holder_name"))
    if not who:
        return
    others = db.scalars(select(Document).where(Document.user_id == doc.user_id, Document.id != doc.id,
                                               Document.id_fields_enc.is_not(None)))
    mine = fields.get("expiry_date") or ""
    doc.superseded_by = None
    for other in others:
        try:
            of = json.loads(dec_text(key, other.id_fields_enc))
        except Exception:
            continue
        if of.get("id_type") != fields.get("id_type") or holder_key(of.get("holder_name")) != who:
            continue
        theirs = of.get("expiry_date") or ""
        if theirs and mine and theirs > mine:
            doc.superseded_by = other.id
        else:
            other.superseded_by = doc.id


def _fail(db, document_id: str, message: str, detail: str) -> None:
    doc = db.get(Document, document_id)
    if doc:
        doc.status, doc.error, doc.error_detail = "failed", message, detail
        db.commit()
