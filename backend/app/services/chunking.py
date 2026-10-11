"""Split page text into overlapping passages (~900 characters each)."""
import re

SIZE = 900
OVERLAP = 150


def chunk_pages(pages: list[tuple[int, str]]) -> list[tuple[int, str]]:
    chunks: list[tuple[int, str]] = []
    for page_no, text in pages:
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(start + SIZE, len(text))
            if end < len(text):  # try to end on a sentence or line break
                cut = max(text.rfind(". ", start, end), text.rfind("\n", start, end))
                if cut > start + SIZE // 2:
                    end = cut + 1
            piece = text[start:end].strip()
            if len(piece) > 20:
                chunks.append((page_no, piece))
            if end >= len(text):
                break
            start = max(end - OVERLAP, start + 1)
    return chunks
