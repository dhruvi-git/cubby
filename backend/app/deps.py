from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DbSession

from .config import get_settings
from .database import get_db
from .models import Session, User
from .security import SESSION_COOKIE, read_token


def _claims(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    claims = read_token(token) if token else None
    if not claims:
        raise HTTPException(401, "Please log in.")
    return claims


def _load(db: DbSession, claims: dict) -> User:
    user = db.get(User, claims["sub"])
    if not user:
        raise HTTPException(401, "Please log in.")
    return user


def _check_session(request: Request, db: DbSession, claims: dict) -> None:
    sess = db.get(Session, claims.get("sid", "")) if claims.get("sid") else None
    now = datetime.now(timezone.utc)
    if not sess or sess.revoked or sess.user_id != claims["sub"] or sess.expires_at < now:
        raise HTTPException(401, "You were signed out. Please log in again.")
    request.state.session_id = sess.id
    if now - sess.last_seen > timedelta(minutes=5):  # don't write on every request
        sess.last_seen = now
        db.commit()


def current_user(request: Request, db: DbSession = Depends(get_db)) -> User:
    """A fully logged-in user (password + 2FA) on a session that hasn't been revoked."""
    claims = _claims(request)
    if claims.get("scope") != "full":
        raise HTTPException(403, "Finish setting up two-factor sign-in first.")
    _check_session(request, db, claims)
    return _load(db, claims)


def setup_user(request: Request, db: DbSession = Depends(get_db)) -> User:
    """A user who has a password session but may not have finished 2FA setup."""
    claims = _claims(request)
    if claims.get("scope") not in ("setup", "full"):
        raise HTTPException(401, "Please log in.")
    if claims.get("scope") == "full":
        _check_session(request, db, claims)
    return _load(db, claims)


def admin_user(user: User = Depends(current_user)) -> User:
    if not get_settings().is_admin_email(user.email):
        raise HTTPException(404, "Not found.")
    return user
