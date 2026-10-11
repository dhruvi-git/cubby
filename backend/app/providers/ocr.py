"""OCR for scanned PDFs and photos, using AWS Textract.

We send one rendered page image at a time (synchronous API), so Textract never
needs access to S3 and never sees the encrypted originals.
"""
from functools import lru_cache

from ..config import get_settings


class TextractOCR:
    name = "textract"

    def __init__(self) -> None:
        import boto3
        s = get_settings()
        self.client = boto3.client(
            "textract", region_name=s.aws_region,
            aws_access_key_id=s.aws_access_key_id or None,
            aws_secret_access_key=s.aws_secret_access_key or None,
        )

    def image_to_text(self, image_bytes: bytes) -> str:
        resp = self.client.detect_document_text(Document={"Bytes": image_bytes})
        lines = [b["Text"] for b in resp.get("Blocks", []) if b.get("BlockType") == "LINE"]
        return "\n".join(lines)


@lru_cache
def get_ocr():
    """Returns the OCR engine, or None when OCR is switched off."""
    if get_settings().ocr_provider == "textract":
        return TextractOCR()
    return None
