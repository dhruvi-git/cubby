# Cubby: your private document vault

Upload your important documents, search them by meaning, chat with them (every answer cites the exact page), and get reminded before anything expires. Built across three clouds so that **no single cloud ever holds both your files and the key to read them.**

**New here? Open [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) and follow it from Part 0.** It walks through everything click by click.

**Upgrading?** From v1.1 follow [`docs/UPGRADE_v1.2.md`](docs/UPGRADE_v1.2.md). From v1.0, do [`UPGRADE_v1.1.md`](docs/UPGRADE_v1.1.md) first.

## Features

- **Vault:** encrypted uploads, OCR for scans, automatic shelves, important dates, stars, sorting and bulk actions, duplicate detection
- **ID cards:** passports, Aadhaar, PAN, driving licences and voter IDs recognised; numbers checked with official checksums, masked, and revealed only after a password check; old versions detected
- **Ask:** search by meaning, streaming chat with page citations that open the in-app viewer with the passage highlighted, plus a floating chat on every page
- **Privacy shield:** sensitive numbers are masked before any text reaches the AI
- **Studio:** notes, AI reports with citations, exact data reports, a printable vault infographic
- **Family vaults:** a private group chat per household: share documents as cards (each family has its own encryption key and copy), request documents with one-tap cards, ask @Cubby about the family's shared documents, shared reminders for everyone
- **Password vault:** zero-knowledge (encrypted in the browser), generator, health and breach check
- **Sharing:** time-limited, view-limited, revocable links with a public viewer page
- **Reminders:** in-app and email digests before expiries and renewals
- **Account safety:** mandatory 2FA, recovery codes, password reset, device list, security emails, auto-lock

## What each cloud does

| Cloud | Services | Job |
|---|---|---|
| AWS | S3, Textract | Stores encrypted files, reads scanned documents (OCR) |
| Azure | Key Vault, Blob Storage, Communication Services | Holds the master key, keeps a backup copy of files, sends account emails |
| Google Cloud | Agent Platform (Gemini), Cloud Run, Cloud SQL, Cloud Scheduler | AI answers and search, runs the backend, database, daily reminders |
| Groq | `gpt-oss-120b` | Backup AI if Gemini is down |

## Tech stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS v4, Framer Motion, Recharts, lucide icons
- **Backend:** FastAPI, SQLAlchemy, Pydantic, PostgreSQL + pgvector
- **Security:** Argon2 password hashing, mandatory TOTP 2FA with one-time recovery codes, revocable sessions (JWT in an httpOnly `__session` cookie), AES-256-GCM envelope encryption, CSRF header check, rate limiting, login lockout, 15-minute auto-lock, password reset by email, security alert emails, file-type checks, security headers
- **Operations:** admin dashboard with live health checks, startup settings check, friendly user errors with reference codes in the logs
- **Hosting:** Docker on Cloud Run (backend), Firebase Hosting (frontend)

## How a document flows

1. You upload a file. The backend encrypts it with your personal data key (AES-256-GCM).
2. Your data key is itself encrypted ("wrapped") by a master key in Azure Key Vault.
3. The encrypted file goes to AWS S3, with a backup copy in Azure Blob Storage.
4. Text is extracted (PyMuPDF for normal PDFs, AWS Textract for scans and photos).
5. Gemini sorts it onto a shelf, writes a summary and finds important dates.
6. The text is split into passages, embedded by Gemini, encrypted, and stored in PostgreSQL with pgvector.
7. Search and chat embed your question, find the closest passages, and answer from them with page citations.

## Project layout

```
cubby/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CSRF guard, routers
│   │   ├── config.py          # every setting, read from .env
│   │   ├── models.py          # database tables
│   │   ├── security.py        # passwords, sessions, 2FA
│   │   ├── core/              # errors, rate limits, startup checks
│   │   ├── providers/         # swappable cloud services (+ email.py)
│   │   │   ├── keys.py        #   local key / Azure Key Vault
│   │   │   ├── storage.py     #   local / S3 / Azure Blob
│   │   │   ├── ocr.py         #   AWS Textract
│   │   │   └── llm.py         #   Gemini / Groq (+ automatic fallback)
│   │   ├── services/          # encryption, extraction, RAG, reminders, ID cards, privacy shield
│   │   └── modules/           # API routes, one file per feature
│   ├── scripts/make_secrets.py
│   ├── Dockerfile
│   ├── .env.example
│   └── env.prod.example.yaml
├── frontend/
│   ├── src/
│   │   ├── pages/             # one file per screen
│   │   ├── components/        # Mascot, layout, shared UI
│   │   └── lib/               # API client, auth, formatting
│   └── firebase.json
├── docker-compose.yml         # local PostgreSQL + pgvector
└── docs/SETUP_GUIDE.md
```

## Quick start (after Part 0 of the guide)

```bash
docker compose up -d --build               # database + backend (in Docker)
# backend/.env must exist first: copy .env.example and fill it in (guide, Part 1)

# new terminal
cd frontend && npm install && npm run dev  # open http://localhost:5173
```

## Adding features later

- **New AI provider:** add a class with `generate()` in `providers/llm.py` and register it in `_CHAT`.
- **New storage or key service:** add a class with the same methods in `providers/storage.py` or `providers/keys.py`.
- **New feature (password vault, Studio…):** add a router in `backend/app/modules/` and a page in `frontend/src/pages/`.
- **Schema changes:** v1 creates tables automatically. Before changing existing tables, add Alembic migrations.

## Known v1 limits

- Rate limits are counted per server instance, not globally.
- Embedding vectors and file names are stored unencrypted (passage text, summaries and chats are encrypted).
- Text is decrypted in server memory while it's being processed or answered.
- Changing `GEMINI_EMBED_MODEL` after uploading means pressing **Reprocess** on each document.
