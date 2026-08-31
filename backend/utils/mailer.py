"""Unified email sender: uses the SMTP settings saved in Settings when
configured, otherwise falls back to the Resend helper. Never raises."""
import logging
from email.message import EmailMessage

from utils.smtp import load_smtp_credentials
from utils.email import send_email_with_attachment

logger = logging.getLogger(__name__)


async def send_email(db, *, to: str, subject: str, html: str, from_name: str | None = None) -> dict:
    creds = await load_smtp_credentials(db)
    if creds:
        try:
            import aiosmtplib
            frm = creds.get("from_email") or creds.get("username")
            msg = EmailMessage()
            msg["From"] = f"{from_name} <{frm}>" if from_name else frm
            msg["To"] = to
            msg["Subject"] = subject
            msg.set_content("This message requires an HTML-capable email client.")
            msg.add_alternative(html, subtype="html")
            port = int(creds.get("port") or 587)
            kwargs = dict(hostname=creds["host"], port=port,
                          username=creds["username"], password=creds["password"], timeout=15)
            if port == 465:
                await aiosmtplib.send(msg, use_tls=True, **kwargs)
            else:
                await aiosmtplib.send(msg, start_tls=True, **kwargs)
            return {"sent": True, "transport": "smtp", "reason": None}
        except Exception as e:  # noqa: BLE001
            logger.error("SMTP send to %s failed: %s", to, e)
            return {"sent": False, "transport": "smtp", "reason": str(e)}

    r = await send_email_with_attachment(to=to, subject=subject, html=html)
    return {"sent": r.get("sent"), "transport": "resend", "reason": r.get("reason")}
