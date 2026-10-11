from fastapi import Request
from sqlalchemy.orm import Session

from ..models import AuditEvent


def audit(db: Session, user_id: str | None, action: str, request: Request | None = None, detail: str = "") -> None:
    ip = ""
    agent = ""
    if request is not None:
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
            request.client.host if request.client else "")
        agent = request.headers.get("user-agent", "")[:300]
    db.add(AuditEvent(user_id=user_id, action=action, detail=detail[:300], ip=ip, user_agent=agent))
    db.commit()
