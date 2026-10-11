import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .core.checks import run_startup_checks
from .core.errors import install_error_handlers
from .database import init_db
from .modules import admin, auth, chat, documents, insights, internal, search, shares, studio, trust, vault, family

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_startup_checks()  # refuses to start in production if settings are missing
    init_db()
    yield


settings = get_settings()
app = FastAPI(
    title="Cubby Vault API", version="1.3.0", lifespan=lifespan,
    # Don't publish the API map in production.
    docs_url=None if settings.app_env == "production" else "/docs",
    redoc_url=None, openapi_url=None if settings.app_env == "production" else "/openapi.json",
)
install_error_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    """Browsers can't add custom headers to cross-site form posts, so requiring
    X-Cubby on every change blocks cross-site request forgery."""
    path = request.url.path
    if (request.method in ("POST", "PUT", "PATCH", "DELETE") and path.startswith("/api/")
            and not path.startswith("/api/internal/") and request.headers.get("x-cubby") != "1"):
        return JSONResponse({"detail": "This request was blocked for your security. Reload the page and try again."},
                            status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "DENY"
    if path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


for module in (auth, documents, shares, search, chat, insights, studio, vault, trust, internal, admin, family):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    return {"ok": True}
