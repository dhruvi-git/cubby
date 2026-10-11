"""Passwords, sessions and 2FA."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import get_settings

_hasher = PasswordHasher()

# Firebase Hosting only forwards ONE cookie to Cloud Run, and it must be
# named "__session". Using that name works both locally and in production.
SESSION_COOKIE = "__session"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except VerifyMismatchError:
        return False


def make_token(user_id: str, scope: str, minutes: int | None = None, sid: str | None = None) -> str:
    """scope = "full" (normal session), "setup" (only 2FA setup), "pending_2fa".
    Full sessions carry a session id (sid) so they can be listed and revoked."""
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes or s.session_hours * 60)
    claims = {"sub": user_id, "scope": scope, "exp": exp}
    if sid:
        claims["sid"] = sid
    return jwt.encode(claims, s.app_secret, algorithm="HS256")


def read_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().app_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Cubby Vault")


def verify_totp(secret: str, code: str) -> bool:
    code = "".join(ch for ch in code if ch.isdigit())
    return len(code) == 6 and pyotp.TOTP(secret).verify(code, valid_window=1)


# ---------- Recovery codes and one-time tokens ----------
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid mix-ups


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def new_recovery_codes(n: int = 10) -> tuple[list[str], list[str]]:
    """Returns (codes to show once, hashes to store). Codes look like 7KQ2M-X9DPA."""
    codes = []
    for _ in range(n):
        raw = "".join(secrets.choice(_ALPHABET) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes, [sha256(normalize_code(c)) for c in codes]


def looks_like_recovery_code(code: str) -> bool:
    return len(normalize_code(code)) == 10 and not code.strip().isdigit()


def new_reset_token() -> str:
    return secrets.token_urlsafe(32)
