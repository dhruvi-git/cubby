"""Simple in-memory rate limiting.

Each Cloud Run instance keeps its own counters, so with up to 3 instances the
real limit can be up to 3x higher. That's fine for stopping abuse and runaway
AI costs; move to Redis/Memorystore if you ever need exact global limits.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def hit(key: str, limit: int, per_seconds: int) -> None:
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and q[0] <= now - per_seconds:
            q.popleft()
        if len(q) >= limit:
            wait = int(q[0] + per_seconds - now) + 1
            mins = (wait + 59) // 60
            when = f"{wait} seconds" if wait < 90 else f"{mins} minutes"
            raise HTTPException(429, f"Too many attempts. Please wait {when} and try again.")
        q.append(now)


def limit_ip(name: str, limit: int, per_seconds: int):
    """FastAPI dependency: limit requests per IP address."""
    def dep(request: Request) -> None:
        hit(f"{name}:ip:{client_ip(request)}", limit, per_seconds)
    return dep


def reset_all() -> None:  # used by tests
    with _lock:
        _hits.clear()
