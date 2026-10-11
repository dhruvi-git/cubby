"""Startup self-check: catch missing settings before any user does."""
import logging

from ..config import get_settings

log = logging.getLogger("cubby")

REQUIRED = {
    ("key_provider", "azure"): ["azure_tenant_id", "azure_client_id", "azure_client_secret", "azure_key_vault_url", "azure_key_name"],
    ("key_provider", "local"): ["local_master_key"],
    ("storage_primary", "s3"): ["s3_bucket", "aws_region"],
    ("storage_backup", "s3"): ["s3_bucket", "aws_region"],
    ("storage_primary", "azure"): ["azure_storage_connection_string", "azure_blob_container"],
    ("storage_backup", "azure"): ["azure_storage_connection_string", "azure_blob_container"],
    ("ocr_provider", "textract"): ["aws_region"],
    ("llm_provider", "gemini"): ["gcp_project_id"],
    ("llm_provider", "groq"): ["groq_api_key", "gcp_project_id"],  # embeddings still use Gemini
    ("email_provider", "azure"): ["acs_connection_string", "email_sender"],
}


def config_problems() -> list[str]:
    s = get_settings()
    problems: list[str] = []
    for (field, value), needed in REQUIRED.items():
        if getattr(s, field) == value:
            for name in needed:
                if not str(getattr(s, name) or "").strip():
                    problems.append(f"{name.upper()} is empty, but {field.upper()}={value} needs it.")
    if s.app_env == "production":
        for name in ("app_secret", "cron_secret"):
            if getattr(s, name).startswith("change-me") or len(getattr(s, name)) < 24:
                problems.append(f"{name.upper()} must be a long random value in production.")
        if not s.cookie_secure:
            problems.append("COOKIE_SECURE must be true in production.")
    return sorted(set(problems))


def config_warnings() -> list[str]:
    """Not fatal, but worth knowing. Shown on the admin page."""
    s = get_settings()
    out = []
    if s.email_provider != "azure":
        out.append("Email is in console mode: password-reset and security emails only appear in the server logs.")
    if s.storage_backup in ("", "none"):
        out.append("No backup copy: files are stored in one place only.")
    if s.key_provider == "local":
        out.append("The master key is held locally, not in Azure Key Vault.")
    if s.ocr_provider != "textract":
        out.append("OCR is off: photos and scanned PDFs can't be read.")
    if not s.groq_api_key:
        out.append("No backup AI: if Gemini is down, answers fail.")
    if not s.admin_emails:
        out.append("ADMIN_EMAILS is empty, so nobody can open this page in a fresh deploy.")
    return out


def run_startup_checks() -> None:
    problems = config_problems()
    if not problems:
        return
    msg = "Cubby settings problem:\n  - " + "\n  - ".join(problems)
    if get_settings().app_env == "production":
        # Refuse to start: Cloud Run then keeps the previous working version
        # and the deploy command prints this message.
        raise RuntimeError(msg)
    log.warning(msg)
    print(f"\n⚠️  {msg}\n(The app will still start in local mode.)\n", flush=True)
