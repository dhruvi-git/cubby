import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Conversation, Document, Message, User
from ..core.errors import log_exception
from ..core.ratelimit import hit
from ..services.audit import audit
from ..services.crypto import dec_text, enc_text, user_key
from ..services.rag import SYSTEM, answer, build_prompt, citations_for, retrieve
from ..providers.llm import get_chat
from ..database import SessionLocal

router = APIRouter(prefix="/api/chat", tags=["chat"])


class NewConversation(BaseModel):
    document_id: str | None = None


class AskIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


def convo_out(c: Conversation, doc_title: str | None = None) -> dict:
    return {"id": c.id, "title": c.title, "document_id": c.document_id, "document_title": doc_title,
            "updated_at": c.updated_at.isoformat()}


def msg_out(m: Message, key: bytes) -> dict:
    return {"id": m.id, "role": m.role, "content": dec_text(key, m.content_enc),
            "citations": m.citations or [], "created_at": m.created_at.isoformat()}


def _own(db: Session, user: User, cid: str) -> Conversation:
    c = db.get(Conversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Chat not found.")
    return c


@router.get("/conversations")
def list_conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Conversation, Document.title)
                      .outerjoin(Document, Document.id == Conversation.document_id)
                      .where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc()))
    return [convo_out(c, t) for c, t in rows]


@router.post("/conversations")
def create_conversation(body: NewConversation, user: User = Depends(current_user), db: Session = Depends(get_db)):
    title = None
    if body.document_id:
        doc = db.get(Document, body.document_id)
        if not doc or doc.user_id != user.id:
            raise HTTPException(404, "Document not found.")
        title = doc.title
    c = Conversation(user_id=user.id, document_id=body.document_id,
                     title=f"About {title}"[:200] if title else "New chat")
    db.add(c)
    db.commit()
    return convo_out(c, title)


@router.get("/conversations/{cid}")
def get_conversation(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _own(db, user, cid)
    key = user_key(db, user)
    msgs = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at))
    doc = db.get(Document, c.document_id) if c.document_id else None
    return {**convo_out(c, doc.title if doc else None), "messages": [msg_out(m, key) for m in msgs]}


@router.delete("/conversations/{cid}")
def delete_conversation(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, cid))
    db.commit()
    return {"ok": True}


@router.post("/conversations/{cid}/messages")
def ask(cid: str, body: AskIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"chat:user:{user.id}", 20, 60)
    hit(f"chat-day:user:{user.id}", 300, 86400)
    c = _own(db, user, cid)
    key = user_key(db, user)
    past = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at))
    history = [(m.role, dec_text(key, m.content_enc)) for m in past]

    question = body.content.strip()
    try:
        sources = retrieve(db, user, question, k=6, document_id=c.document_id)
        text, citations, provider = answer(question, history, sources)
    except Exception as exc:
        ref = log_exception("chat answer", exc)
        raise HTTPException(503, f"Cubby can't answer right now. Please try again in a moment. (Reference {ref})") from exc

    now = datetime.now(timezone.utc)
    db.add(Message(conversation_id=c.id, role="user", content_enc=enc_text(key, question), created_at=now))
    reply = Message(conversation_id=c.id, role="assistant", content_enc=enc_text(key, text),
                    citations=citations, provider=provider)
    db.add(reply)
    if not history and not c.document_id:
        c.title = question[:80]
    c.updated_at = now
    db.commit()
    audit(db, user.id, "chat", request)
    return msg_out(reply, key)


@router.post("/conversations/{cid}/stream")
def ask_stream(cid: str, body: AskIn, request: Request, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Same as /messages, but the answer arrives piece by piece as newline-delimited JSON:
    {"type":"delta","text":...} ... then {"type":"done","message":{...}} or {"type":"error",...}."""
    hit(f"chat:user:{user.id}", 20, 60)
    hit(f"chat-day:user:{user.id}", 300, 86400)
    c = _own(db, user, cid)
    key = user_key(db, user)
    past = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at))
    history = [(m.role, dec_text(key, m.content_enc)) for m in past]
    question = body.content.strip()
    try:
        sources = retrieve(db, user, question, k=6, document_id=c.document_id)
    except Exception as exc:
        ref = log_exception("chat retrieval", exc)
        raise HTTPException(503, f"Cubby can't answer right now. Please try again in a moment. (Reference {ref})") from exc
    prompt = build_prompt(question, history, sources)
    user_id, conv_id, first_turn = user.id, c.id, not history and not c.document_id
    audit(db, user.id, "chat", request)

    def events():
        chat = get_chat()
        parts: list[str] = []
        try:
            for piece in chat.stream(SYSTEM, prompt):
                parts.append(piece)
                yield json.dumps({"type": "delta", "text": piece}) + "\n"
        except Exception as exc:
            ref = log_exception("chat stream", exc)
            yield json.dumps({"type": "error", "detail": f"Cubby couldn't finish this answer. Please try again. (Reference {ref})"}) + "\n"
            return
        text = "".join(parts).strip()
        local = SessionLocal()  # the request's database session may already be closed
        try:
            now = datetime.now(timezone.utc)
            local.add(Message(conversation_id=conv_id, role="user", content_enc=enc_text(key, question), created_at=now))
            reply = Message(conversation_id=conv_id, role="assistant", content_enc=enc_text(key, text),
                            citations=citations_for(text, sources), provider=chat.last_used)
            local.add(reply)
            convo = local.get(Conversation, conv_id)
            if convo:
                if first_turn:
                    convo.title = question[:80]
                convo.updated_at = now
            local.commit()
            yield json.dumps({"type": "done", "message": msg_out(reply, key)}) + "\n"
        finally:
            local.close()

    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
