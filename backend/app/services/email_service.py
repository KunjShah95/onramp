"""Email Service — SendGrid-based transactional email delivery."""

import os
import logging
from typing import Optional

logger = logging.getLogger("codeflow.email")

SENDGRID_API_KEY_ENV = "SENDGRID_API_KEY"
DEFAULT_FROM = "noreply@codeflow.dev"


def is_enabled() -> bool:
    """Check if SendGrid is configured."""
    return bool(os.getenv(SENDGRID_API_KEY_ENV))


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    from_email: Optional[str] = None,
) -> bool:
    """Send an email via SendGrid. Returns True if sent, False if disabled or failed.

    Gracefully no-ops if SENDGRID_API_KEY is not set (dev mode).
    """
    api_key = os.getenv(SENDGRID_API_KEY_ENV)
    if not api_key:
        logger.debug("SendGrid not configured — skipping email to %s", to)
        return False

    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail, Email, To, Content

        sg = sendgrid.SendGridAPIClient(api_key=api_key)
        mail = Mail(
            from_email=Email(from_email or DEFAULT_FROM),
            to_emails=To(to),
            subject=subject,
            html_content=Content("text/html", html_body),
        )
        response = sg.client.mail.send.post(request_body=mail.get())
        logger.info("Email sent to %s: %s (status=%s)", to, subject, response.status_code)
        return 200 <= response.status_code < 300
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


async def send_invite_email(email: str, invite_link: str, team_name: str, invited_by_name: str) -> bool:
    """Send a team invitation email."""
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px">🚀</div>
<h1 style="color:#FDFBF8;font-size:20px;margin:0">You're invited to <span style="color:#FF8C00">{team_name}</span></h1>
</div>
<p style="color:rgba(253,251,248,0.6);font-size:14px;line-height:1.6;margin-bottom:24px">
{invited_by_name} has invited you to join <strong style="color:#FDFBF8">{team_name}</strong> on CodeFlow.
Click below to accept the invitation and start contributing.
</p>
<div style="text-align:center;margin-bottom:24px">
<a href="{invite_link}" style="display:inline-block;background:#FF8C00;color:#3D1C00;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:700;font-size:14px">Accept Invitation</a>
</div>
<p style="color:rgba(253,251,248,0.3);font-size:11px;text-align:center;margin:0">
This link expires in 48 hours. If you weren't expecting this, ignore this email.
</p>
</div></body></html>"""
    return await send_email(email, f"You're invited to join {team_name}", html)


async def send_task_assigned_email(email: str, task_title: str, team_name: str, assigned_by: str) -> bool:
    """Send a task assignment notification email."""
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px">📋</div>
<h1 style="color:#FDFBF8;font-size:20px;margin:0">New Task Assigned</h1>
</div>
<p style="color:rgba(253,251,248,0.6);font-size:14px;line-height:1.6">
<strong style="color:#FDFBF8">{assigned_by}</strong> assigned you a task in <strong style="color:#FF8C00">{team_name}</strong>:
</p>
<div style="background:#0D0906;border-radius:8px;padding:16px;margin:16px 0;border:1px solid rgba(253,251,248,0.08)">
<p style="color:#FDFBF8;font-size:14px;margin:0;font-weight:600">{task_title}</p>
</div>
<p style="color:rgba(253,251,248,0.3);font-size:11px;margin:0">Check your dashboard to start working on it.</p>
</div></body></html>"""
    return await send_email(email, f"New task assigned: {task_title}", html)


async def send_task_completed_email(email: str, task_title: str, team_name: str) -> bool:
    """Send a task completion notification email."""
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px">✅</div>
<h1 style="color:#FDFBF8;font-size:20px;margin:0">Task Completed</h1>
</div>
<p style="color:rgba(253,251,248,0.6);font-size:14px;line-height:1.6">
A task in <strong style="color:#FF8C00">{team_name}</strong> has been completed:
</p>
<div style="background:#0D0906;border-radius:8px;padding:16px;margin:16px 0;border:1px solid rgba(253,251,248,0.08)">
<p style="color:#FDFBF8;font-size:14px;margin:0;font-weight:600">{task_title}</p>
</div>
<p style="color:rgba(253,251,248,0.5);font-size:12px;margin:0">Well done! 🎉</p>
</div></body></html>"""
    return await send_email(email, f"Task completed: {task_title}", html)
