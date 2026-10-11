from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create the pgvector extension and all tables. v1 keeps this simple;
    switch to Alembic migrations once the schema starts changing."""
    from . import models  # noqa: F401  (registers the tables)

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)

    # Small in-place upgrades for databases created by an earlier version.
    # (create_all makes new tables but never adds columns to existing ones.)
    with engine.begin() as conn:
        for stmt in UPGRADES:
            conn.execute(text(stmt))


UPGRADES = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes JSON DEFAULT '[]'",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_detail TEXT",
    # v1.2
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_reminders BOOLEAN DEFAULT TRUE",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT FALSE",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS id_fields_enc BYTEA",
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS superseded_by VARCHAR(32)",
    "CREATE INDEX IF NOT EXISTS ix_documents_content_hash ON documents (content_hash)",
    "ALTER TABLE key_dates ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE",
    # Existing reminders count as already emailed, so the first daily run doesn't resend old ones.
    "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS emailed BOOLEAN DEFAULT TRUE",
]
