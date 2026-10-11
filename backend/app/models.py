import uuid
from datetime import date, datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer,
                        LargeBinary, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column

from .config import get_settings
from .database import Base


def _id() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    recovery_codes: Mapped[list] = mapped_column(JSON, default=list)  # sha256 hashes of unused codes
    email_reminders: Mapped[bool] = mapped_column(Boolean, default=True)
    # The user's data key, encrypted ("wrapped") by the master key.
    wrapped_key: Mapped[bytes] = mapped_column(LargeBinary)
    key_provider: Mapped[str] = mapped_column(String(20))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    shelf: Mapped[str] = mapped_column(String(40), default="Other")
    doc_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing|ready|failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)         # friendly, shown to the user
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # technical, admin only
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    used_ocr: Mapped[bool] = mapped_column(Boolean, default=False)
    summary_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # spots duplicate uploads
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)   # how sure the AI was about the type
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    id_fields_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)  # ID card fields, encrypted
    superseded_by: Mapped[str | None] = mapped_column(String(32), nullable=True)     # newer version of this ID
    storage_key: Mapped[str] = mapped_column(String(255))
    storage_locations: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Chunk(Base):
    """One searchable passage of a document."""
    __tablename__ = "chunks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    page: Mapped[int] = mapped_column(Integer)
    idx: Mapped[int] = mapped_column(Integer)
    text_enc: Mapped[bytes] = mapped_column(LargeBinary)  # passage text, encrypted
    embedding = mapped_column(Vector(get_settings().embed_dim))

    __table_args__ = (
        Index("ix_chunks_embedding", "embedding", postgresql_using="hnsw",
              postgresql_with={"m": 16, "ef_construction": 64},
              postgresql_ops={"embedding": "vector_cosine_ops"}),
    )


class KeyDate(Base):
    """Important dates the vault found inside a document (expiry, renewal, due)."""
    __tablename__ = "key_dates"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="other")  # expiry|renewal|due|other
    date: Mapped[date] = mapped_column(Date, index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(12))  # user|assistant
    content_enc: Mapped[bytes] = mapped_column(LargeBinary)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(String(300), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(400), default="")
    link: Mapped[str] = mapped_column(String(200), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    dedupe_key: Mapped[str] = mapped_column(String(120))
    emailed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("user_id", "dedupe_key"),)


class Session(Base):
    """One signed-in device. Lets people see where they're logged in and sign others out."""
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ip: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ShareLink(Base):
    """A time-limited, revocable link to one document."""
    __tablename__ = "share_links"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    allow_download: Mapped[bool] = mapped_column(Boolean, default=True)
    max_views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Note(Base):
    """Studio: personal notes and AI-written reports. Body is encrypted."""
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="note")  # note | report
    template: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    body_enc: Mapped[bytes] = mapped_column(LargeBinary)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class VaultSetup(Base):
    """Password vault settings. The server never sees the vault passphrase or the key
    derived from it: everything is encrypted in the browser."""
    __tablename__ = "vault_setup"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    salt: Mapped[str] = mapped_column(String(64))           # base64
    iterations: Mapped[int] = mapped_column(Integer)
    check: Mapped[str] = mapped_column(Text)                # a known value encrypted in the browser
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VaultItem(Base):
    __tablename__ = "vault_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    blob: Mapped[str] = mapped_column(Text)                 # browser-encrypted JSON, base64
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------- Family vaults ----------------

class Family(Base):
    """A family group: a shared chat plus shared documents. Shared content is
    encrypted with the family's own data key, wrapped by the master key."""
    __tablename__ = "families"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(80))
    emoji: Mapped[str] = mapped_column(String(16), default="🏠")
    color: Mapped[str] = mapped_column(String(12), default="cream")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    wrapped_key: Mapped[bytes] = mapped_column(LargeBinary)
    key_provider: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class FamilyMember(Base):
    __tablename__ = "family_members"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(12), default="member")  # admin | member
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("family_id", "user_id"),)


class FamilyInvite(Base):
    __tablename__ = "family_invites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    invited_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | accepted | declined | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FamilyDoc(Base):
    """A family's own encrypted copy of a document someone shared into the group."""
    __tablename__ = "family_docs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    shared_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    source_doc_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    shelf: Mapped[str] = mapped_column(String(40), default="Other")
    doc_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    summary_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    id_fields_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)  # number already masked
    storage_key: Mapped[str] = mapped_column(String(255))
    storage_locations: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FamilyChunk(Base):
    """Searchable passages of a family document, so @Cubby can answer in the group."""
    __tablename__ = "family_chunks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    family_doc_id: Mapped[str] = mapped_column(ForeignKey("family_docs.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[str] = mapped_column(String(32), index=True)
    page: Mapped[int] = mapped_column(Integer)
    idx: Mapped[int] = mapped_column(Integer)
    text_enc: Mapped[bytes] = mapped_column(LargeBinary)
    embedding = mapped_column(Vector(get_settings().embed_dim))

    __table_args__ = (
        Index("ix_family_chunks_embedding", "embedding", postgresql_using="hnsw",
              postgresql_with={"m": 16, "ef_construction": 64},
              postgresql_ops={"embedding": "vector_cosine_ops"}),
    )


class FamilyKeyDate(Base):
    """Shared reminders: dates from family documents, sent to every member."""
    __tablename__ = "family_key_dates"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(String(32), index=True)
    family_doc_id: Mapped[str] = mapped_column(ForeignKey("family_docs.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="other")
    date: Mapped[date] = mapped_column(Date, index=True)


class FamilyMessage(Base):
    __tablename__ = "family_messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(12), default="text")  # text | doc | request | cubby | system
    body_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    reply_to: Mapped[str | None] = mapped_column(String(32), nullable=True)
    family_doc_id: Mapped[str | None] = mapped_column(ForeignKey("family_docs.id", ondelete="SET NULL"), nullable=True)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    # Document requests
    request_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    request_target: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    request_status: Mapped[str | None] = mapped_column(String(12), nullable=True)  # open | fulfilled | declined | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
