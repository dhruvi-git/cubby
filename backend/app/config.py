"""All settings come from environment variables (or the .env file).

Every cloud is optional at first: the app runs fully on your laptop with
"local" providers, and you switch each one to the real cloud as you set it up.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    app_env: str = "local"                      # local | production
    app_secret: str = "change-me"               # signs login sessions (JWT)
    frontend_origin: str = "http://localhost:5173"
    cookie_secure: bool = False                 # True in production (HTTPS)
    session_hours: int = 12
    max_upload_mb: int = 20
    cron_secret: str = "change-me-too"          # protects the Cloud Scheduler endpoint
    admin_emails: str = ""                      # comma-separated; these accounts see the admin page

    # --- Email (password resets, security alerts) ---
    email_provider: str = "console"             # console (prints to logs) | azure
    acs_connection_string: str = ""             # Azure Communication Services
    email_sender: str = ""                      # e.g. DoNotReply@xxxx.azurecomm.net

    # --- Database (PostgreSQL + pgvector) ---
    database_url: str = "postgresql+psycopg://cubby:cubby@localhost:5432/cubby"

    # --- Storage: where encrypted files live ---
    storage_primary: str = "local"              # local | s3
    storage_backup: str = "none"                # none | azure | local
    local_storage_dir: str = "./data/files"

    # --- Keys: who holds the master key ---
    key_provider: str = "local"                 # local | azure
    local_master_key: str = ""                  # base64, 32 bytes (local dev only)

    # --- OCR for scanned files ---
    ocr_provider: str = "none"                  # none | textract
    max_ocr_pages: int = 25

    # --- AWS ---
    aws_region: str = "ap-south-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_bucket: str = ""

    # --- Azure ---
    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""
    azure_key_vault_url: str = ""
    azure_key_name: str = "cubby-master-key"
    azure_storage_connection_string: str = ""
    azure_blob_container: str = "cubby-backup"

    # --- AI ---
    llm_provider: str = "gemini"                # gemini | groq
    llm_fallback: bool = True                   # try the other provider if one fails
    gcp_project_id: str = ""
    gcp_location: str = "global"
    gemini_model: str = "gemini-3.5-flash"
    gemini_embed_model: str = "gemini-embedding-2"
    embed_dim: int = 768
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"


    def is_admin_email(self, email: str) -> bool:
        admins = {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}
        return email.lower() in admins


@lru_cache
def get_settings() -> Settings:
    return Settings()
