"""Vault Pulse: turn upcoming dates into in-app notifications, and (once a day)
email each person a short digest of what's coming up."""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Document, Family, FamilyDoc, FamilyKeyDate, FamilyMember, KeyDate, Notification, User
from ..providers.email import send_email

WINDOWS = (90, 30, 7, 1)


def _when(days: int) -> str:
    return "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"


def run_pulse(db: Session, user_id: str | None = None, send_emails: bool = False) -> int:
    today = date.today()
    stmt = (select(KeyDate, Document.title)
            .join(Document, Document.id == KeyDate.document_id)
            .where(KeyDate.date >= today, KeyDate.date <= today + timedelta(days=max(WINDOWS)),
                   Document.superseded_by.is_(None)))
    if user_id:
        stmt = stmt.where(KeyDate.user_id == user_id)

    created = 0
    for kd, title in db.execute(stmt):
        days = (kd.date - today).days
        window = min(w for w in WINDOWS if days <= w)
        row = insert(Notification).values(
            user_id=kd.user_id,
            title=f"{kd.label} {_when(days)}",
            body=f"From {title}, on {kd.date.strftime('%d %b %Y')}.",
            link=f"/app/documents/{kd.document_id}",
            read=False, emailed=False, dedupe_key=f"pulse:{kd.id}:{window}",
        ).on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"]).returning(Notification.id)
        created += len(db.execute(row).fetchall())

    # Shared family reminders: every member hears about dates in family documents.
    fstmt = (select(FamilyKeyDate, FamilyDoc.title, Family.name, FamilyMember.user_id)
             .join(FamilyDoc, FamilyDoc.id == FamilyKeyDate.family_doc_id)
             .join(Family, Family.id == FamilyKeyDate.family_id)
             .join(FamilyMember, FamilyMember.family_id == FamilyKeyDate.family_id)
             .where(FamilyKeyDate.date >= today, FamilyKeyDate.date <= today + timedelta(days=max(WINDOWS))))
    if user_id:
        fstmt = fstmt.where(FamilyMember.user_id == user_id)
    for kd, title, family_name, member_id in db.execute(fstmt):
        days = (kd.date - today).days
        window = min(w for w in WINDOWS if days <= w)
        row = insert(Notification).values(
            user_id=member_id,
            title=f"{kd.label} {_when(days)}",
            body=f"From {title}, shared in {family_name}, on {kd.date.strftime('%d %b %Y')}.",
            link=f"/app/family/{kd.family_id}",
            read=False, emailed=False, dedupe_key=f"pulse:fam:{kd.id}:{window}",
        ).on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"]).returning(Notification.id)
        created += len(db.execute(row).fetchall())
    db.commit()

    if send_emails:
        send_digests(db)
    return created


def send_digests(db: Session) -> int:
    """One email per person, listing reminders they haven't been emailed about yet."""
    rows = db.execute(select(Notification, User)
                      .join(User, User.id == Notification.user_id)
                      .where(Notification.emailed.is_(False), Notification.dedupe_key.like("pulse:%"))
                      .order_by(Notification.created_at)).all()
    by_user: dict[str, tuple[User, list[Notification]]] = {}
    for n, u in rows:
        by_user.setdefault(u.id, (u, []))[1].append(n)

    sent = 0
    origin = get_settings().frontend_origin
    for user, notes in by_user.values():
        if user.email_reminders:
            first = user.name.split(" ")[0]
            subject = notes[0].title if len(notes) == 1 else f"{len(notes)} things coming up in your vault"
            lines = [f"Hi {first}, here's what Cubby spotted in your documents:"]
            lines += [f"• {n.title}. {n.body}" for n in notes[:10]]
            if len(notes) > 10:
                lines.append(f"…and {len(notes) - 10} more.")
            lines.append("You can turn these emails off in Settings.")
            send_email(user.email, subject, lines, ("Open Cubby", f"{origin}/app/insights"))
            sent += 1
        db.execute(update(Notification).where(Notification.id.in_([n.id for n in notes])).values(emailed=True))
    db.commit()
    return sent
