from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Document, KeyDate, Notification, User
from ..services.pulse import run_pulse

router = APIRouter(prefix="/api", tags=["insights"])


def _dates(db: Session, user: User, start: date, end: date | None = None) -> list[dict]:
    stmt = (select(KeyDate, Document.title, Document.shelf)
            .join(Document, Document.id == KeyDate.document_id)
            .where(KeyDate.user_id == user.id, KeyDate.date >= start, Document.superseded_by.is_(None))
            .order_by(KeyDate.date))
    if end:
        stmt = stmt.where(KeyDate.date <= end)
    today = date.today()
    return [{"id": kd.id, "label": kd.label, "kind": kd.kind, "date": kd.date.isoformat(), "pinned": bool(kd.pinned),
             "days_left": (kd.date - today).days, "document_id": kd.document_id,
             "document_title": title, "shelf": shelf} for kd, title, shelf in db.execute(stmt)]


@router.get("/insights/overview")
def overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    run_pulse(db, user.id)  # keeps alerts fresh even without Cloud Scheduler
    docs = list(db.scalars(select(Document).where(Document.user_id == user.id)))
    today = date.today()
    since = today - timedelta(days=29)
    per_day = {since + timedelta(days=i): 0 for i in range(30)}
    for d in docs:
        day = d.created_at.astimezone(timezone.utc).date()
        if day in per_day:
            per_day[day] += 1
    running, timeline = 0, []
    before = sum(1 for d in docs if d.created_at.astimezone(timezone.utc).date() < since)
    running = before
    for day, n in per_day.items():
        running += n
        timeline.append({"date": day.isoformat(), "added": n, "total": running})

    shelves: dict[str, int] = {}
    for d in docs:
        shelves[d.shelf] = shelves.get(d.shelf, 0) + 1

    recent = sorted(docs, key=lambda d: d.created_at, reverse=True)[:5]
    return {
        "total": len(docs),
        "ready": sum(1 for d in docs if d.status == "ready"),
        "processing": sum(1 for d in docs if d.status == "processing"),
        "failed": sum(1 for d in docs if d.status == "failed"),
        "bytes": sum(d.size_bytes for d in docs),
        "pages": sum(d.page_count for d in docs),
        "timeline": timeline,
        "shelves": [{"name": k, "count": v} for k, v in sorted(shelves.items(), key=lambda x: -x[1])],
        "upcoming": sorted(_dates(db, user, today - timedelta(days=30), today + timedelta(days=365)),
                           key=lambda d: (not d["pinned"], d["date"]))[:8],
        "recent": [{"id": d.id, "title": d.title, "shelf": d.shelf, "status": d.status,
                    "created_at": d.created_at.isoformat()} for d in recent],
    }


class PinIn(BaseModel):
    pinned: bool


@router.patch("/insights/dates/{date_id}")
def pin_date(date_id: str, body: PinIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    kd = db.get(KeyDate, date_id)
    if not kd or kd.user_id != user.id:
        raise HTTPException(404, "Reminder not found.")
    kd.pinned = body.pinned
    db.commit()
    return {"ok": True, "pinned": kd.pinned}


@router.get("/insights/dates")
def all_dates(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _dates(db, user, date(1900, 1, 1))


@router.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.created_at.desc()).limit(30))
    unread = db.scalar(select(func.count()).select_from(Notification)
                       .where(Notification.user_id == user.id, Notification.read.is_(False)))
    return {"unread": unread, "items": [{"id": n.id, "title": n.title, "body": n.body, "link": n.link,
                                         "read": n.read, "created_at": n.created_at.isoformat()} for n in rows]}


@router.post("/notifications/read-all")
def read_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))
    db.commit()
    return {"ok": True}
