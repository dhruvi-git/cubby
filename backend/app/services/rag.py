"""Retrieval-augmented generation: find the right passages, then answer from them."""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Chunk, Document, User
from ..providers.llm import get_chat, get_embedder
from .crypto import dec_text, user_key
from .privacy import mask_sensitive


def retrieve(db: Session, user: User, query: str, k: int = 6,
             document_id: str | None = None) -> list[dict]:
    qvec = get_embedder().embed([query], kind="query")[0]
    distance = Chunk.embedding.cosine_distance(qvec)
    stmt = (
        select(Chunk, Document.title, Document.shelf, distance.label("dist"))
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.user_id == user.id, Document.status == "ready")
        .order_by(distance)
        .limit(k * 3)
    )
    if document_id:
        stmt = stmt.where(Chunk.document_id == document_id)

    key = user_key(db, user)
    words = {w for w in re.findall(r"[a-z0-9]{3,}", query.lower())}
    results = []
    for chunk, title, shelf, dist in db.execute(stmt):
        text = dec_text(key, chunk.text_enc)
        low = text.lower()
        keyword_bonus = (sum(1 for w in words if w in low) / len(words)) * 0.08 if words else 0
        results.append({
            "document_id": chunk.document_id, "title": title, "shelf": shelf,
            "page": chunk.page, "text": text, "score": round((1 - float(dist)) + keyword_bonus, 4),
        })
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:k]


SYSTEM = """You are Cubby, a friendly assistant inside a private document vault.
Answer ONLY from the numbered sources provided. Cite sources inline like [1] or [2][3]
right after the facts they support. If the sources don't contain the answer, say you
couldn't find it in the vault and suggest what document might help. Be concise and warm.
Use plain text with short paragraphs or simple '-' lists. Long numbers appear masked like
XXXX1234 for privacy; refer to them that way and never guess the hidden digits."""


def build_prompt(question: str, history: list[tuple[str, str]], sources: list[dict]) -> str:
    numbered = "\n\n".join(
        f"[{i + 1}] {s['title']} (page {s['page']}):\n{mask_sensitive(s['text'])}" for i, s in enumerate(sources)
    ) or "(no sources found)"
    convo = "\n".join(f"{role}: {text}" for role, text in history[-6:])
    return f"Recent conversation:\n{convo or '(none)'}\n\nSources:\n{numbered}\n\nQuestion: {question}"


def citations_for(text: str, sources: list[dict]) -> list[dict]:
    used = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text) if 0 < int(n) <= len(sources)})
    return [
        {"n": n, "document_id": sources[n - 1]["document_id"], "title": sources[n - 1]["title"],
         "page": sources[n - 1]["page"], "snippet": sources[n - 1]["text"][:280]}
        for n in used
    ]


def answer(question: str, history: list[tuple[str, str]], sources: list[dict]) -> tuple[str, list[dict], str]:
    chat = get_chat()
    text = chat.generate(SYSTEM, build_prompt(question, history, sources))
    return text, citations_for(text, sources), chat.last_used or ""
