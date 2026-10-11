"""Password vault, zero-knowledge.

Everything is encrypted in the browser with a key made from the vault passphrase
(PBKDF2-SHA256 + AES-GCM). The server only ever stores scrambled blobs, a random
salt, and an encrypted check value used to confirm the passphrase. It cannot
read, search or recover the items, and the AI never touches them.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..core.ratelimit import hit
from ..database import get_db
from ..deps import current_user
from ..models import User, VaultItem, VaultSetup
from ..security import verify_password
from ..services.audit import audit

router = APIRouter(prefix="/api/vault", tags=["vault"])

MAX_ITEMS = 1000
MAX_BLOB = 20000


class SetupIn(BaseModel):
    salt: str = Field(min_length=16, max_length=64)
    iterations: int = Field(ge=200_000, le=5_000_000)
    check: str = Field(min_length=16, max_length=2000)


class ItemIn(BaseModel):
    blob: str = Field(min_length=16, max_length=MAX_BLOB)


class ResetIn(BaseModel):
    password: str = Field(max_length=200)


@router.get("")
def status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    setup = db.get(VaultSetup, user.id)
    if not setup:
        return {"set_up": False}
    count = db.scalar(select(func.count()).select_from(VaultItem).where(VaultItem.user_id == user.id))
    return {"set_up": True, "salt": setup.salt, "iterations": setup.iterations, "check": setup.check, "items": count}


@router.post("/setup")
def setup(body: SetupIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if db.get(VaultSetup, user.id):
        raise HTTPException(409, "Your password vault is already set up.")
    db.add(VaultSetup(user_id=user.id, salt=body.salt, iterations=body.iterations, check=body.check))
    db.commit()
    audit(db, user.id, "vault_created", request)
    return {"ok": True}


@router.get("/items")
def items(user: User = Depends(current_user), db: Session = Depends(get_db)):
    hit(f"vault-read:user:{user.id}", 120, 600)
    rows = db.scalars(select(VaultItem).where(VaultItem.user_id == user.id).order_by(VaultItem.created_at))
    return [{"id": i.id, "blob": i.blob, "updated_at": i.updated_at.isoformat()} for i in rows]


@router.post("/items")
def add_item(body: ItemIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not db.get(VaultSetup, user.id):
        raise HTTPException(400, "Set up your password vault first.")
    count = db.scalar(select(func.count()).select_from(VaultItem).where(VaultItem.user_id == user.id))
    if count >= MAX_ITEMS:
        raise HTTPException(400, f"Your vault can hold up to {MAX_ITEMS} items.")
    item = VaultItem(user_id=user.id, blob=body.blob)
    db.add(item)
    db.commit()
    return {"id": item.id, "blob": item.blob, "updated_at": item.updated_at.isoformat()}


@router.put("/items/{item_id}")
def update_item(item_id: str, body: ItemIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(VaultItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Item not found.")
    item.blob = body.blob
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": item.id, "blob": item.blob, "updated_at": item.updated_at.isoformat()}


@router.delete("/items/{item_id}")
def delete_item(item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(VaultItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Item not found.")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/reset")
def reset(body: ResetIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Forgot the vault passphrase: the items can't be recovered, so start fresh."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "That password isn't right.")
    db.execute(delete(VaultItem).where(VaultItem.user_id == user.id))
    db.execute(delete(VaultSetup).where(VaultSetup.user_id == user.id))
    db.commit()
    audit(db, user.id, "vault_reset", request)
    return {"ok": True}
