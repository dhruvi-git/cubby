"""Privacy shield: hide sensitive numbers before any text is sent to an AI model.

Long digit runs (Aadhaar, account and card numbers), PAN numbers, Indian passport
numbers and passport MRZ lines are replaced with a masked form that keeps only
the last 4 characters, e.g. "XXXX XXXX 1234". The AI can still say *which*
number it is, but never sees the whole thing.
"""
import re

_MRZ = re.compile(r"^[A-Z0-9<]{30,44}$")
_PAN = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
_PASSPORT_IN = re.compile(r"\b[A-PR-WY][1-9][0-9]\s?[0-9]{4}[1-9]\b")
_LONG_DIGITS = re.compile(r"(?<![\d])(?:\d[ -]?){8,18}\d(?![\d])")


def _keep_last4(raw: str) -> str:
    digits = re.sub(r"[^0-9A-Z]", "", raw.upper())
    return f"XXXX{digits[-4:]}" if len(digits) > 4 else "XXXX"


def mask_sensitive(text: str) -> str:
    lines = []
    for line in text.splitlines():
        compact = line.replace(" ", "")
        if _MRZ.match(compact) and compact.count("<") >= 4:
            lines.append("[machine-readable passport line hidden]")
            continue
        lines.append(line)
    text = "\n".join(lines)
    text = _PAN.sub(lambda m: _keep_last4(m.group()), text)
    text = _PASSPORT_IN.sub(lambda m: _keep_last4(m.group()), text)
    text = _LONG_DIGITS.sub(lambda m: _keep_last4(m.group()), text)
    return text
