"""
notification_service.py — Event-Driven Notification Dispatcher for Samadhan Setu
Provides asynchronous SMTP email alerts and civic communications without commercial SaaS dependencies.
Supports standard SMTP (NIC Mail, Gmail App Passwords, local Postfix/Sendmail) with graceful console fallback.
"""
import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings

logger = logging.getLogger("samadhan.notifications")


def _send_smtp_sync(to_email: str, subject: str, body_text: str, body_html: Optional[str] = None) -> bool:
    """Synchronous SMTP email delivery."""
    if not settings.SMTP_HOST:
        logger.info(
            f"[NOTIFICATION CONSOLE DISPATCH] To: {to_email} | Subject: {subject} | Body: {body_text}"
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"Samadhan Setu <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = to_email
        msg["Subject"] = f"[Samadhan Setu] {subject}"

        part_text = MIMEText(body_text, "plain", "utf-8")
        msg.attach(part_text)

        if body_html:
            part_html = MIMEText(body_html, "html", "utf-8")
            msg.attach(part_html)

        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        if settings.SMTP_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"Notification email dispatched successfully to {to_email} via {settings.SMTP_HOST}.")
        return True
    except Exception as exc:
        logger.warning(f"Failed to dispatch email to {to_email} via SMTP ({exc}). Logged to console.")
        return False


async def dispatch_notification(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
) -> bool:
    """Dispatch an email notification asynchronously in a background thread."""
    if not to_email:
        return False
    return await asyncio.to_thread(_send_smtp_sync, to_email, subject, body_text, body_html)


async def notify_complaint_lodged(to_email: str, complaint_number: str, title: str):
    subject = f"Grievance Lodged Successfully (#{complaint_number})"
    text = (
        f"Dear Citizen,\n\n"
        f"Your grievance '{title}' has been registered in the Samadhan Setu civic system.\n"
        f"Reference Number: {complaint_number}\n"
        f"You can track the progress and SLA timeline of your grievance online anytime.\n\n"
        f"Samadhan Setu Municipal Administration"
    )
    await dispatch_notification(to_email, subject, text)


async def notify_complaint_resolved(to_email: str, complaint_number: str, resolution_remarks: str):
    subject = f"Grievance Resolved (#{complaint_number})"
    text = (
        f"Dear Citizen,\n\n"
        f"Your grievance #{complaint_number} has been marked as RESOLVED by the field officer.\n"
        f"Resolution Remarks: {resolution_remarks}\n\n"
        f"Please log in to inspect field proof photos and rate the resolution, or lodge a Level-1 Appeal within 7 days if unsatisfied.\n\n"
        f"Samadhan Setu Municipal Administration"
    )
    await dispatch_notification(to_email, subject, text)


async def notify_sla_warning(to_email: str, complaint_number: str):
    subject = f"SLA Urgency Alert (#{complaint_number})"
    text = (
        f"Dear Citizen,\n\n"
        f"Your grievance #{complaint_number} has reached 75% of its statutory resolution window.\n"
        f"An automated SLA escalation reminder has been dispatched to the assigned departmental authorities.\n\n"
        f"Samadhan Setu Autonomous SLA Monitor"
    )
    await dispatch_notification(to_email, subject, text)
