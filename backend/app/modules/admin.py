"""Admin dashboard: real health checks, settings warnings, usage and failures.
Only accounts listed in ADMIN_EMAILS can reach it (others get a 404)."""
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.checks import config_problems, config_warnings
from ..database import get_db
from ..deps import admin_user
from ..models import Document, Message, Session as UserSession, User

router = APIRouter(prefix="/api/admin", tags=["admin"])

_CACHE: dict = {"at": 0.0, "data": None}
TTL = 300  # real checks call the clouds, so cache them for 5 minutes


def _check(fn) -> dict:
    start = time.perf_counter()
    try:
        detail = fn()
        return {"status": "ok", "ms": int((time.perf_counter() - start) * 1000), "detail": detail or ""}
    except Exception as exc:
        return {"status": "error", "ms": int((time.perf_counter() - start) * 1000),
                "detail": f"{type(exc).__name__}: {exc}"[:400]}


def _off(reason: str) -> dict:
    return {"status": "off", "ms": 0, "detail": reason}


def _textract_probe() -> str:
    import pymupdf
    from ..providers.ocr import get_ocr
    doc = pymupdf.open()
    page = doc.new_page(width=220, height=80)
    page.insert_text((20, 50), "Cubby OK", fontsize=24)
    png = page.get_pixmap(dpi=150).tobytes("png")
    text = get_ocr().image_to_text(png)
    return f"read back: {text.strip()[:40]!r}"


def _status() -> list[dict]:
    from ..providers.email import get_email
    from ..providers.keys import get_key_provider
    from ..providers.llm import _provider, get_embedder
    from ..providers.storage import get_backend

    s = get_settings()
    uses = lambda name: name in (s.storage_primary, s.storage_backup)  # noqa: E731

    def embed_probe():
        get_embedder().embed(["health check"], kind="query")
        return s.gemini_embed_model

    def chat_probe(name):
        def run():
            _provider(name).generate("Reply with the single word OK.", "ping")
            return s.gemini_model if name == "gemini" else s.groq_model
        return run

    def key_probe():
        p = get_key_provider(s.key_provider)
        assert p.unwrap(p.wrap(b"x" * 32)) == b"x" * 32
        return f"wrap/unwrap round trip ({s.key_provider})"

    return [
        {"cloud": "AWS", "service": "S3", "role": "File storage",
         **(_check(lambda: get_backend("s3").health()) if uses("s3") else _off("Not selected"))},
        {"cloud": "AWS", "service": "Textract", "role": "OCR for scans",
         **(_check(_textract_probe) if s.ocr_provider == "textract" else _off("OCR_PROVIDER=none"))},
        {"cloud": "Azure" if s.key_provider == "azure" else "Local", "service": "Key Vault" if s.key_provider == "azure" else "Local key",
         "role": "Master key", **_check(key_probe)},
        {"cloud": "Azure", "service": "Blob Storage", "role": "Backup copies",
         **(_check(lambda: get_backend("azure").health()) if uses("azure") else _off("Not selected"))},
        {"cloud": "Azure", "service": "Communication Services", "role": "Email",
         **(_check(lambda: get_email().health()) if s.email_provider == "azure" else _off("Console mode"))},
        {"cloud": "Google Cloud", "service": "Gemini embeddings", "role": "Search",
         **(_check(embed_probe) if s.gcp_project_id else _off("GCP_PROJECT_ID empty"))},
        {"cloud": "Google Cloud", "service": "Gemini chat", "role": "Answers",
         **(_check(chat_probe("gemini")) if s.gcp_project_id else _off("GCP_PROJECT_ID empty"))},
        {"cloud": "Groq", "service": "Backup chat", "role": "Fallback answers",
         **(_check(chat_probe("groq")) if s.groq_api_key else _off("GROQ_API_KEY empty"))},
        {"cloud": "Google Cloud" if "/cloudsql/" in s.database_url else "Local", "service": "Database", "role": "Data and search index",
         "status": "ok", "ms": 0, "detail": "Cloud SQL" if "/cloudsql/" in s.database_url else "Local PostgreSQL"},
    ]


@router.get("/overview")
def overview(refresh: bool = False, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    if refresh or not _CACHE["data"] or time.time() - _CACHE["at"] > TTL:
        _CACHE.update(at=time.time(), data=_status())

    week = datetime.now(timezone.utc) - timedelta(days=7)
    by_status = dict(db.execute(select(Document.status, func.count()).group_by(Document.status)).all())
    providers = dict(db.execute(select(Message.provider, func.count())
                                .where(Message.role == "assistant", Message.created_at >= week)
                                .group_by(Message.provider)).all())
    failed = db.execute(select(Document, User.email).join(User, User.id == Document.user_id)
                        .where(Document.status == "failed").order_by(Document.created_at.desc()).limit(25))
    s = get_settings()
    return {
        "checked_at": datetime.fromtimestamp(_CACHE["at"], timezone.utc).isoformat(),
        "env": s.app_env,
        "services": _CACHE["data"],
        "problems": config_problems(),
        "warnings": config_warnings(),
        "stats": {
            "users": db.scalar(select(func.count()).select_from(User)) or 0,
            "new_users_7d": db.scalar(select(func.count()).select_from(User).where(User.created_at >= week)) or 0,
            "active_sessions": db.scalar(select(func.count()).select_from(UserSession).where(
                UserSession.revoked.is_(False), UserSession.expires_at > datetime.now(timezone.utc))) or 0,
            "documents": sum(by_status.values()),
            "documents_by_status": by_status,
            "answers_7d_by_provider": {k or "unknown": v for k, v in providers.items()},
        },
        "failed_documents": [{"id": d.id, "title": d.title, "owner": email, "error": d.error,
                              "detail": d.error_detail, "created_at": d.created_at.isoformat()}
                             for d, email in failed],
        "settings": {"AI": f"{s.llm_provider} ({s.gemini_model if s.llm_provider == 'gemini' else s.groq_model})",
                     "Backup AI": s.llm_fallback and bool(s.groq_api_key), "Storage": f"{s.storage_primary} + backup {s.storage_backup}",
                     "Master key": s.key_provider, "OCR": s.ocr_provider, "Email": s.email_provider},
    }
