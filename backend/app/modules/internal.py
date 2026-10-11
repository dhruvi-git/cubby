import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..services.pulse import run_pulse

router = APIRouter(prefix="/api/internal", tags=["internal"])


@router.post("/pulse")
def pulse(x_cron_secret: str = Header(default=""), db: Session = Depends(get_db)):
    """Called once a day by Google Cloud Scheduler."""
    if not hmac.compare_digest(x_cron_secret, get_settings().cron_secret):
        raise HTTPException(403, "Forbidden")
    return {"notifications_created": run_pulse(db, send_emails=True)}
