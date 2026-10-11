"""Errors people see vs. errors we log.

Users get a short, friendly message (plus a reference code for unexpected
failures). The full technical detail goes to the server logs, where the admin
can find it by that reference code.
"""
import logging
import secrets

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("cubby")


def new_ref() -> str:
    return secrets.token_hex(3).upper()  # e.g. "4F2A9C"


def log_exception(where: str, exc: BaseException) -> str:
    ref = new_ref()
    log.error("[ref %s] %s failed: %s", ref, where, exc, exc_info=exc)
    return ref


# Friendly messages for things that commonly go wrong while reading a document.
def friendly_processing_error(exc: BaseException) -> str:
    text = f"{type(exc).__name__} {exc}".lower()
    if "textract" in text or "subscriptionrequired" in text or "detectdocumenttext" in text:
        return "Cubby couldn't read this image right now. Try again later, or upload a PDF instead."
    if "no readable text" in text or "scanned pdf" in text or "photos need ocr" in text:
        return "Cubby couldn't find any text in this file. Try a clearer scan, or a PDF with selectable text."
    if "pdf" in text and ("password" in text or "encrypted" in text):
        return "This PDF is password-protected. Remove the password and upload it again."
    if "aiunavailable" in text or "ai provider" in text or "gemini" in text or "groq" in text:
        return "Cubby couldn't analyse this file right now. Press Reprocess in a few minutes."
    if "unavailable in all locations" in text:
        return "Cubby couldn't open the stored copy of this file. Press Reprocess, or upload it again."
    return "Something went wrong while reading this file. Press Reprocess to try again."


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation(_: Request, exc: RequestValidationError):
        msgs = []
        for err in exc.errors():
            field = str(err.get("loc", ["", ""])[-1]).replace("_", " ")
            msg = str(err.get("msg", "")).replace("Value error, ", "")
            msgs.append(f"{field.capitalize()}: {msg}" if field else msg)
        return JSONResponse({"detail": " ".join(msgs) or "Please check the form and try again."}, status_code=422)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        if isinstance(exc, HTTPException):  # pragma: no cover (handled by FastAPI)
            raise exc
        ref = log_exception(f"{request.method} {request.url.path}", exc)
        return JSONResponse(
            {"detail": f"Something went wrong on our side. Please try again. (Reference {ref})", "ref": ref},
            status_code=500,
        )
