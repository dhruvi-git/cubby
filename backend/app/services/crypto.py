"""Envelope encryption.

Each user has a random 256-bit data key (DEK). Files, passages, summaries and
chat messages are encrypted with it using AES-256-GCM. The DEK itself is only
stored wrapped by the master key (Azure Key Vault in production).
"""
import os
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import User
from ..providers.keys import get_key_provider

_CACHE: dict[str, tuple[bytes, float]] = {}
_TTL = 600  # keep unwrapped keys in memory for 10 minutes max


def encrypt(key: bytes, data: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, data, None)


def decrypt(key: bytes, blob: bytes) -> bytes:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def enc_text(key: bytes, text: str) -> bytes:
    return encrypt(key, text.encode("utf-8"))


def dec_text(key: bytes, blob: bytes | None) -> str:
    return decrypt(key, blob).decode("utf-8") if blob else ""


def new_wrapped_key() -> tuple[bytes, str]:
    """Create a data key for a new user. Returns (wrapped_key, provider_name)."""
    provider = get_key_provider()
    return provider.wrap(os.urandom(32)), provider.name


def user_key(db: Session, user: User) -> bytes:
    hit = _CACHE.get(user.id)
    if hit and hit[1] > time.time():
        return hit[0]
    dek = get_key_provider(user.key_provider).unwrap(user.wrapped_key)

    # If you switched KEY_PROVIDER (e.g. local -> azure), move this user's key over.
    wanted = get_settings().key_provider
    if user.key_provider != wanted:
        try:
            user.wrapped_key = get_key_provider(wanted).wrap(dek)
            user.key_provider = wanted
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[crypto] could not re-wrap key with {wanted}: {exc}")

    _CACHE[user.id] = (dek, time.time() + _TTL)
    return dek


def forget_key(user_id: str) -> None:
    _CACHE.pop(user_id, None)


def family_key(db: Session, family) -> bytes:
    """The family's shared data key. Same envelope as a user's key: stored wrapped
    by the master key, unwrapped on demand and cached for 10 minutes."""
    cache_id = f"family:{family.id}"
    hit = _CACHE.get(cache_id)
    if hit and hit[1] > time.time():
        return hit[0]
    dek = get_key_provider(family.key_provider).unwrap(family.wrapped_key)
    wanted = get_settings().key_provider
    if family.key_provider != wanted:
        try:
            family.wrapped_key = get_key_provider(wanted).wrap(dek)
            family.key_provider = wanted
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[crypto] could not re-wrap family key with {wanted}: {exc}")
    _CACHE[cache_id] = (dek, time.time() + _TTL)
    return dek
