"""Identity document recognition.

The AI suggests what kind of ID a document is and reads names and dates. The ID
*numbers* are found locally with exact rules (never sent to the AI) and checked:
  - Aadhaar: 12 digits with a Verhoeff checksum
  - PAN: 5 letters, 4 digits, 1 letter
  - Passport: the machine-readable zone (MRZ) with its check digits
"""
import re
from datetime import date

ID_TYPES = {
    "passport": "Passport",
    "aadhaar": "Aadhaar card",
    "pan": "PAN card",
    "driving_licence": "Driving licence",
    "voter_id": "Voter ID",
    "other_id": "ID card",
}

# ---------- Verhoeff (Aadhaar checksum) ----------
_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]


def verhoeff_ok(number: str) -> bool:
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def find_aadhaar(text: str) -> str | None:
    """Prefer numbers printed the official way (4-4-4 with spaces), and never start
    inside a date like 02/01/2004."""
    candidates = []
    for m in re.finditer(r"(?<![\d/.\-])([2-9]\d{3})([ ]?)(\d{4})\2(\d{4})(?![\d/])", text):
        num = m.group(1) + m.group(3) + m.group(4)
        if verhoeff_ok(num):
            candidates.append((m.group(2) != " ", m.start(), num))
    return min(candidates)[2] if candidates else None


def find_pan(text: str) -> str | None:
    m = re.search(r"\b([A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z])\b", text.upper())
    return m.group(1) if m else None


# ---------- Passport MRZ (ICAO 9303, TD3) ----------
def _mrz_check(field: str) -> int:
    weights = (7, 3, 1)
    total = 0
    for i, ch in enumerate(field):
        v = int(ch) if ch.isdigit() else (ord(ch) - 55 if ch.isalpha() else 0)
        total += v * weights[i % 3]
    return total % 10


def _mrz_date(yymmdd: str, future: bool) -> str | None:
    try:
        yy, mm, dd = int(yymmdd[:2]), int(yymmdd[2:4]), int(yymmdd[4:6])
        century = 2000 if (future or yy <= date.today().year % 100) else 1900
        return date(century + yy, mm, dd).isoformat()
    except ValueError:
        return None


def parse_mrz(text: str) -> dict | None:
    lines = [ln.replace(" ", "").upper() for ln in text.splitlines()]
    lines = [ln for ln in lines if len(ln) >= 40 and re.fullmatch(r"[A-Z0-9<]+", ln)]
    for i in range(len(lines) - 1):
        l1, l2 = lines[i].ljust(44, "<")[:44], lines[i + 1].ljust(44, "<")[:44]
        if not l1.startswith("P"):
            continue
        num, dob, exp = l2[0:9], l2[13:19], l2[21:27]
        if not (_mrz_check(num) == int(l2[9]) if l2[9].isdigit() else False):
            continue
        dob_ok = l2[19].isdigit() and _mrz_check(dob) == int(l2[19])
        exp_ok = l2[27].isdigit() and _mrz_check(exp) == int(l2[27])
        names = l1[5:].split("<<", 1)
        surname = names[0].replace("<", " ").strip().title()
        given = names[1].replace("<", " ").strip().title() if len(names) > 1 else ""
        return {
            "number": num.replace("<", ""),
            "nationality": l2[10:13].replace("<", ""),
            "date_of_birth": _mrz_date(dob, False) if dob_ok else None,
            "expiry_date": _mrz_date(exp, True) if exp_ok else None,
            "holder_name": f"{given} {surname}".strip(),
        }
    return None


def _clean_date(value) -> str | None:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat() if value else None
    except ValueError:
        return None


def extract_id(id_type: str, text: str, ai: dict | None) -> dict:
    """Merge the AI's reading (names, dates) with exact local checks (numbers)."""
    ai = ai or {}
    fields = {
        "id_type": id_type,
        "label": ID_TYPES.get(id_type, "ID card"),
        "holder_name": str(ai.get("holder_name") or "").strip()[:120] or None,
        "number": None,
        "date_of_birth": _clean_date(ai.get("date_of_birth")),
        "issue_date": _clean_date(ai.get("issue_date")),
        "expiry_date": _clean_date(ai.get("expiry_date")),
        "nationality": str(ai.get("nationality") or "").strip()[:40] or None,
        "verified": False,
        "verified_by": None,
    }
    if id_type == "aadhaar":
        num = find_aadhaar(text)
        if num:
            fields.update(number=f"{num[:4]} {num[4:8]} {num[8:]}", verified=True, verified_by="Aadhaar checksum")
    elif id_type == "pan":
        num = find_pan(text)
        if num:
            fields.update(number=num, verified=True, verified_by="PAN format")
    elif id_type == "passport":
        mrz = parse_mrz(text)
        if mrz:
            fields.update({k: v for k, v in mrz.items() if v})
            fields.update(verified=True, verified_by="Passport machine-readable zone")
        else:
            # No machine-readable lines (e.g. only the photo page was scanned): read the
            # printed number, but don't mark it verified since there's no check digit.
            m = re.search(r"\b([A-PR-WY][1-9][0-9]\s?[0-9]{4}[1-9])\b", text.upper())
            if m:
                fields["number"] = m.group(1).replace(" ", "")
    return fields


def masked(number: str | None) -> str | None:
    if not number:
        return None
    raw = re.sub(r"\s", "", number)
    return "•" * max(len(raw) - 4, 2) + raw[-4:]


def holder_key(name: str | None) -> str:
    return " ".join(sorted(re.sub(r"[^a-z ]", "", (name or "").lower()).split()))
