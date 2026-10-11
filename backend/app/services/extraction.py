"""Turn a file into text, page by page.

Normal PDFs are read for free with PyMuPDF. Scanned PDFs and photos go to
AWS Textract (when OCR is switched on).
"""
import pymupdf

from ..config import get_settings
from ..providers.ocr import get_ocr

ALLOWED = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


class ExtractionResult:
    def __init__(self, pages: list[tuple[int, str]], page_count: int, used_ocr: bool, note: str = ""):
        self.pages = pages
        self.page_count = page_count
        self.used_ocr = used_ocr
        self.note = note


def _ocr_or_none():
    try:
        return get_ocr()
    except Exception as exc:
        print(f"[ocr] unavailable: {exc}")
        return None


def extract(data: bytes, mime: str) -> ExtractionResult:
    if mime in ("text/plain", "text/markdown"):
        return ExtractionResult([(1, data.decode("utf-8", errors="ignore"))], 1, False)

    if mime.startswith("image/"):
        ocr = _ocr_or_none()
        if not ocr:
            return ExtractionResult([], 1, False, "Photos need OCR. Turn on Textract to read them.")
        return ExtractionResult([(1, ocr.image_to_text(data))], 1, True)

    # PDF
    doc = pymupdf.open(stream=data, filetype="pdf")
    pages = [(i + 1, page.get_text("text")) for i, page in enumerate(doc)]
    text_chars = sum(len(t.strip()) for _, t in pages)
    if text_chars >= 40 * max(len(pages), 1):
        return ExtractionResult(pages, len(doc), False)

    # Looks scanned: render pages to images and OCR them.
    ocr = _ocr_or_none()
    if not ocr:
        note = "This looks like a scanned PDF. Turn on Textract OCR to read it."
        return ExtractionResult([p for p in pages if p[1].strip()], len(doc), False, note)
    limit = get_settings().max_ocr_pages
    ocr_pages = []
    for i, page in enumerate(doc):
        if i >= limit:
            break
        png = page.get_pixmap(dpi=150).tobytes("png")
        ocr_pages.append((i + 1, ocr.image_to_text(png)))
    return ExtractionResult(ocr_pages, len(doc), True)
