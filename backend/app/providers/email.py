"""Sending email. "console" prints messages to the backend logs (handy locally);
"azure" sends real email through Azure Communication Services."""
import html
import logging
from functools import lru_cache

from ..config import get_settings

log = logging.getLogger("cubby")


class ConsoleEmail:
    name = "console"

    def send(self, to: str, subject: str, text: str, html_body: str) -> None:
        print(f"\n===== EMAIL (not sent, EMAIL_PROVIDER=console) =====\nTo: {to}\nSubject: {subject}\n\n{text}\n"
              "====================================================\n", flush=True)

    def health(self) -> bool:
        return True


class AzureEmail:
    name = "azure"

    def __init__(self) -> None:
        from azure.communication.email import EmailClient
        s = get_settings()
        if not (s.acs_connection_string and s.email_sender):
            raise RuntimeError("ACS_CONNECTION_STRING and EMAIL_SENDER are required for EMAIL_PROVIDER=azure.")
        self.client = EmailClient.from_connection_string(s.acs_connection_string)
        self.sender = s.email_sender

    def send(self, to: str, subject: str, text: str, html_body: str) -> None:
        message = {
            "senderAddress": self.sender,
            "recipients": {"to": [{"address": to}]},
            "content": {"subject": subject, "plainText": text, "html": html_body},
        }
        self.client.begin_send(message).result()

    def health(self) -> bool:
        return True


@lru_cache
def get_email():
    return AzureEmail() if get_settings().email_provider == "azure" else ConsoleEmail()


def _wrap(title: str, paragraphs: list[str], button: tuple[str, str] | None = None) -> str:
    body = "".join(f'<p style="margin:0 0 14px;line-height:1.55">{p}</p>' for p in paragraphs)
    btn = ""
    if button:
        label, url = button
        btn = (f'<p style="margin:22px 0"><a href="{html.escape(url)}" style="background:#232326;color:#fff;'
               f'padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">{html.escape(label)}</a></p>')
    return (f'<div style="background:#e3eefb;padding:32px 12px;font-family:Segoe UI,Arial,sans-serif;color:#232326">'
            f'<div style="max-width:520px;margin:auto;background:#fff;border-radius:24px;padding:32px">'
            f'<div style="font-size:20px;font-weight:800;margin-bottom:18px">Cubby</div>'
            f'<h1 style="font-size:22px;margin:0 0 16px">{html.escape(title)}</h1>{body}{btn}'
            f'<p style="color:#7b8291;font-size:13px;margin-top:26px">You got this email because of activity on your Cubby vault. '
            f"If it wasn't you, change your password and sign out other devices in Settings.</p></div></div>")


def send_email(to: str, subject: str, paragraphs: list[str], button: tuple[str, str] | None = None) -> None:
    """Never raises: a failed email must not break the action that triggered it."""
    text = "\n\n".join(paragraphs) + (f"\n\n{button[0]}: {button[1]}" if button else "")
    try:
        get_email().send(to, subject, text, _wrap(subject, [html.escape(p) for p in paragraphs], button))
    except Exception as exc:
        log.error("email to %s failed: %s", to, exc)
