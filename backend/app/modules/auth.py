from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession

from ..config import get_settings
from ..core.device import describe
from ..core.ratelimit import client_ip, hit, limit_ip
from ..database import get_db
from ..deps import current_user, setup_user
from ..models import PasswordReset, Session, User
from ..providers.email import send_email
from ..security import (SESSION_COOKIE, hash_password, looks_like_recovery_code, make_token,
                        new_recovery_codes, new_reset_token, new_totp_secret, normalize_code,
                        read_token, sha256, totp_uri, verify_password, verify_totp)
from ..services.audit import audit
from ..services.crypto import forget_key, new_wrapped_key

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILS = 5
LOCK_MINUTES = 15
RESET_MINUTES = 30


# ---------- Request bodies ----------
class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class CodeIn(BaseModel):
    code: str = Field(max_length=40)


class Login2faIn(BaseModel):
    pending_token: str
    code: str = Field(max_length=40)


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email_reminders: bool | None = None


class PasswordConfirmIn(BaseModel):
    password: str = Field(max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(min_length=10, max_length=200)


# ---------- Helpers ----------
def user_out(user: User, scope: str) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email,
            "totp_enabled": user.totp_enabled, "onboarded": user.onboarded,
            "created_at": user.created_at.isoformat(), "scope": scope,
            "is_admin": get_settings().is_admin_email(user.email),
            "recovery_codes_left": len(user.recovery_codes or []),
            "email_reminders": user.email_reminders is not False}


def _cookie(response: Response, token: str, minutes: int) -> None:
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=get_settings().cookie_secure,
                        samesite="lax", max_age=minutes * 60, path="/")


def set_setup_cookie(response: Response, user_id: str) -> None:
    _cookie(response, make_token(user_id, "setup", 30), 30)


def start_session(db: DbSession, request: Request, response: Response, user: User,
                  background: BackgroundTasks | None = None) -> Session:
    """Creates a revocable session and sets the login cookie."""
    s = get_settings()
    minutes = s.session_hours * 60
    ua = request.headers.get("user-agent", "")[:300]
    known_device = db.scalar(select(Session.id).where(Session.user_id == user.id, Session.user_agent == ua).limit(1))
    had_sessions = db.scalar(select(Session.id).where(Session.user_id == user.id).limit(1))
    sess = Session(user_id=user.id, ip=client_ip(request), user_agent=ua,
                   expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes))
    db.add(sess)
    db.commit()
    _cookie(response, make_token(user.id, "full", minutes, sid=sess.id), minutes)
    if background and had_sessions and not known_device:
        background.add_task(send_email, user.email, "New sign-in to your Cubby vault", [
            f"Hi {user.name.split(' ')[0]}, your vault was just opened from {describe(ua)} (IP {sess.ip}).",
            "If this was you, there's nothing to do. If not, change your password and sign out other devices now.",
        ], ("Review your devices", f"{s.frontend_origin}/app/settings"))
    return sess


def revoke_sessions(db: DbSession, user_id: str, keep: str | None = None) -> int:
    stmt = update(Session).where(Session.user_id == user_id, Session.revoked.is_(False))
    if keep:
        stmt = stmt.where(Session.id != keep)
    count = db.execute(stmt.values(revoked=True)).rowcount or 0
    db.commit()
    forget_key(user_id)
    return count


def _notify(background: BackgroundTasks, user: User, subject: str, line: str) -> None:
    background.add_task(send_email, user.email, subject, [
        f"Hi {user.name.split(' ')[0]}, {line}",
        "If this wasn't you, reset your password straight away and sign out other devices.",
    ], ("Open Cubby", f"{get_settings().frontend_origin}/login"))


# ---------- Sign up and log in ----------
@router.post("/signup", dependencies=[Depends(limit_ip("signup", 5, 3600))])
def signup(body: SignupIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists. Try logging in.")
    wrapped, provider = new_wrapped_key()
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password),
                wrapped_key=wrapped, key_provider=provider, recovery_codes=[])
    db.add(user)
    db.commit()
    audit(db, user.id, "signup", request)
    set_setup_cookie(response, user.id)
    return user_out(user, "setup")


@router.post("/login", dependencies=[Depends(limit_ip("login", 10, 60))])
def login(body: LoginIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    now = datetime.now(timezone.utc)
    if user and user.locked_until and user.locked_until > now:
        mins = int((user.locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(429, f"Too many wrong attempts. Try again in {mins} minutes, or reset your password.")
    if not user or not verify_password(body.password, user.password_hash):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILS:
                user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
                user.failed_logins = 0
            db.commit()
            audit(db, user.id, "login_failed", request, "Wrong password")
        raise HTTPException(401, "That email and password don't match.")

    user.failed_logins = 0
    db.commit()
    if not user.totp_enabled:  # never finished 2FA setup: send them there
        set_setup_cookie(response, user.id)
        return {"requires_2fa": False, "user": user_out(user, "setup")}
    return {"requires_2fa": True, "pending_token": make_token(user.id, "pending_2fa", 5)}


@router.post("/login/2fa", dependencies=[Depends(limit_ip("login2fa", 10, 300))])
def login_2fa(body: Login2faIn, request: Request, response: Response, background: BackgroundTasks,
              db: DbSession = Depends(get_db)):
    claims = read_token(body.pending_token)
    if not claims or claims.get("scope") != "pending_2fa":
        raise HTTPException(401, "This login attempt expired. Enter your password again.")
    user = db.get(User, claims["sub"])
    if not user or not user.totp_secret:
        raise HTTPException(401, "This login attempt expired. Enter your password again.")
    hit(f"2fa:user:{user.id}", 8, 300)  # also limit per account, not just per IP

    used_recovery = False
    if looks_like_recovery_code(body.code):
        h = sha256(normalize_code(body.code))
        if h not in (user.recovery_codes or []):
            audit(db, user.id, "login_failed", request, "Wrong recovery code")
            raise HTTPException(401, "That recovery code isn't valid, or it was already used.")
        user.recovery_codes = [c for c in user.recovery_codes if c != h]
        db.commit()
        used_recovery = True
    elif not verify_totp(user.totp_secret, body.code):
        audit(db, user.id, "login_failed", request, "Wrong 2FA code")
        raise HTTPException(401, "That code didn't work. Codes change every 30 seconds.")

    start_session(db, request, response, user, background)
    audit(db, user.id, "login", request, "with a recovery code" if used_recovery else "")
    if used_recovery:
        left = len(user.recovery_codes)
        _notify(background, user, "A recovery code was used",
                f"one of your recovery codes was just used to open your vault. You have {left} left.")
    return {"user": user_out(user, "full"), "used_recovery_code": used_recovery}


# ---------- Two-factor setup and recovery codes ----------
@router.get("/2fa/setup")
def twofa_setup(user: User = Depends(setup_user), db: DbSession = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(400, "Two-factor sign-in is already on.")
    if not user.totp_secret:
        user.totp_secret = new_totp_secret()
        db.commit()
    return {"otpauth_uri": totp_uri(user.totp_secret, user.email), "secret": user.totp_secret}


@router.post("/2fa/enable", dependencies=[Depends(limit_ip("2faenable", 10, 300))])
def twofa_enable(body: CodeIn, request: Request, response: Response,
                 user: User = Depends(setup_user), db: DbSession = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(400, "Two-factor sign-in is already on.")
    if not user.totp_secret or not verify_totp(user.totp_secret, body.code):
        raise HTTPException(400, "That code didn't match. Check your authenticator app and try again.")
    codes, hashes = new_recovery_codes()
    user.totp_enabled = True
    user.recovery_codes = hashes
    db.commit()
    audit(db, user.id, "2fa_enabled", request)
    start_session(db, request, response, user)
    return {"user": user_out(user, "full"), "recovery_codes": codes}


@router.post("/2fa/recovery-codes")
def regenerate_codes(body: PasswordConfirmIn, request: Request, background: BackgroundTasks,
                     user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That password isn't right.")
    codes, hashes = new_recovery_codes()
    user.recovery_codes = hashes
    db.commit()
    audit(db, user.id, "recovery_codes_regenerated", request)
    _notify(background, user, "New recovery codes created",
            "new recovery codes were just created for your vault. Your old codes no longer work.")
    return {"recovery_codes": codes}


@router.post("/2fa/restart")
def twofa_restart(body: PasswordConfirmIn, request: Request, response: Response, background: BackgroundTasks,
                  user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Move two-factor sign-in to a new phone: turns it off and sends the user back to setup."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That password isn't right.")
    user.totp_enabled = False
    user.totp_secret = None
    user.recovery_codes = []
    db.commit()
    revoke_sessions(db, user.id)
    audit(db, user.id, "2fa_reset", request)
    _notify(background, user, "Two-factor sign-in is being moved",
            "two-factor sign-in was reset so it can be set up on a new device.")
    set_setup_cookie(response, user.id)
    return {"user": user_out(user, "setup")}


# ---------- Profile ----------
@router.get("/me")
def me(request: Request, user: User = Depends(setup_user)):
    claims = read_token(request.cookies.get(SESSION_COOKIE, "")) or {}
    return user_out(user, claims.get("scope", "setup"))


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if body.name is not None:
        user.name = body.name.strip()
    if body.email_reminders is not None:
        user.email_reminders = body.email_reminders
    db.commit()
    return user_out(user, "full")


@router.post("/onboarded")
def onboarded(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    user.onboarded = True
    db.commit()
    return user_out(user, "full")


# ---------- Passwords ----------
@router.post("/password", dependencies=[Depends(limit_ip("password", 10, 3600))])
def change_password(body: ChangePasswordIn, request: Request, background: BackgroundTasks,
                    user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "Your current password isn't right.")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    revoke_sessions(db, user.id, keep=getattr(request.state, "session_id", None))
    audit(db, user.id, "password_changed", request)
    _notify(background, user, "Your password was changed",
            "the password for your vault was just changed, and other devices were signed out.")
    return {"ok": True}


@router.post("/forgot", dependencies=[Depends(limit_ip("forgot", 5, 3600))])
def forgot(body: ForgotIn, request: Request, background: BackgroundTasks, db: DbSession = Depends(get_db)):
    # Always the same answer, so nobody can use this to find out who has an account.
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user:
        token = new_reset_token()
        db.add(PasswordReset(user_id=user.id, token_hash=sha256(token),
                             expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_MINUTES)))
        db.commit()
        audit(db, user.id, "password_reset_requested", request)
        link = f"{get_settings().frontend_origin}/reset-password?token={token}"
        background.add_task(send_email, user.email, "Reset your Cubby password", [
            f"Hi {user.name.split(' ')[0]}, someone asked to reset the password for your vault.",
            f"The link works once and expires in {RESET_MINUTES} minutes. You'll still need your "
            "authenticator code (or a recovery code) to log in afterwards.",
            "If you didn't ask for this, you can ignore this email.",
        ], ("Choose a new password", link))
    return {"ok": True}


@router.post("/reset", dependencies=[Depends(limit_ip("reset", 10, 3600))])
def reset_password(body: ResetIn, request: Request, background: BackgroundTasks, db: DbSession = Depends(get_db)):
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == sha256(body.token)))
    if not row or row.used or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user = db.get(User, row.user_id)
    user.password_hash = hash_password(body.password)
    user.failed_logins = 0
    user.locked_until = None
    row.used = True
    db.commit()
    revoke_sessions(db, user.id)
    audit(db, user.id, "password_reset", request)
    _notify(background, user, "Your password was reset",
            "the password for your vault was just reset, and every device was signed out.")
    return {"ok": True}


# ---------- Sessions (devices) ----------
@router.get("/sessions")
def sessions(request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    rows = db.scalars(select(Session).where(Session.user_id == user.id, Session.revoked.is_(False),
                                            Session.expires_at > now).order_by(Session.last_seen.desc()))
    current = getattr(request.state, "session_id", None)
    return [{"id": s.id, "device": describe(s.user_agent), "ip": s.ip, "created_at": s.created_at.isoformat(),
             "last_seen": s.last_seen.isoformat(), "current": s.id == current} for s in rows]


@router.delete("/sessions/{sid}")
def revoke_one(sid: str, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    sess = db.get(Session, sid)
    if not sess or sess.user_id != user.id:
        raise HTTPException(404, "Device not found.")
    sess.revoked = True
    db.commit()
    audit(db, user.id, "session_revoked", request, describe(sess.user_agent))
    return {"ok": True}


@router.post("/sessions/revoke-others")
def revoke_others(request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    count = revoke_sessions(db, user.id, keep=getattr(request.state, "session_id", None))
    audit(db, user.id, "sessions_revoked", request, f"{count} other devices")
    return {"revoked": count}


@router.post("/logout")
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    claims = read_token(request.cookies.get(SESSION_COOKIE, ""))
    if claims:
        if claims.get("sid"):
            sess = db.get(Session, claims["sid"])
            if sess:
                sess.revoked = True
                db.commit()
        forget_key(claims["sub"])
        audit(db, claims["sub"], "logout", request)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
