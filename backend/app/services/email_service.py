"""
Email service for sending OTP verification codes via SMTP.
Uses a detached subprocess with CREATE_NEW_PROCESS_GROUP to avoid
Windows socket inheritance issues inside long-lived uvicorn processes.
Falls back gracefully to console-only mode if SMTP credentials are not configured.
"""

import subprocess
import sys
import os
import logging
from pathlib import Path
from app.core.config import get_settings

logger = logging.getLogger("formzero.email")

# Path to the standalone email sender script
SEND_EMAIL_SCRIPT = str(Path(__file__).parent / "send_email.py")

# Absolute path to the venv Python — avoids sys.executable pointing to
# a different binary inside the uvicorn reloader process.
_PYTHON_EXE = os.environ.get(
    "PYTHON_EXE",
    str(Path(sys.executable).resolve()),
)


def send_otp_email(
    to_email: str,
    otp_code: str,
    smtp_host: str | None = None,
    smtp_port: int = 587,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    from_email: str | None = None,
) -> bool:
    """
    Send an OTP verification email by using Resend API (if configured) or spawning a fully detached SMTP subprocess.
    Returns True if the email was sent successfully, False otherwise.
    """
    settings = get_settings()

    # 1. Use Resend HTTPS API if configured (Highly recommended for production/Render to bypass SMTP port blocking)
    if settings.resend_api_key:
        logger.info("Resend API key configured — Sending OTP email via Resend API")
        try:
            import urllib.request
            import json

            url = "https://api.resend.com/emails"
            headers = {
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json"
            }
            # Use onboarding domain if no verified domain is configured
            from_sender = from_email or "FormZero <onboarding@resend.dev>"

            html_body = f"""
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8" />
              <style>
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }}
                .container {{ max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
                .header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px 24px; text-align: center; }}
                .header h1 {{ color: #e0c097; font-size: 22px; margin: 0; letter-spacing: 1px; }}
                .body {{ padding: 32px 24px; text-align: center; }}
                .body p {{ color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; }}
                .otp-box {{ display: inline-block; background: #f0f4ff; border: 2px dashed #4a6cf7; border-radius: 12px; padding: 16px 32px; margin: 8px 0 24px 0; }}
                .otp-code {{ font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; color: #1a1a2e; letter-spacing: 8px; }}
                .footer {{ background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #eee; }}
                .footer p {{ color: #999; font-size: 12px; margin: 0; }}
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>FormZero</h1>
                </div>
                <div class="body">
                  <p>Your email verification code is:</p>
                  <div class="otp-box">
                    <span class="otp-code">{otp_code}</span>
                  </div>
                  <p>This code expires in <strong>10 minutes</strong>.<br/>If you didn't request this, you can safely ignore this email.</p>
                </div>
                <div class="footer">
                  <p>&copy; 2026 FormZero. All rights reserved.</p>
                </div>
              </div>
            </body>
            </html>
            """
            
            payload = {
                "from": from_sender,
                "to": [to_email],
                "subject": "FormZero — Your Email Verification Code",
                "html": html_body
            }
            
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                if response.status in (200, 201):
                    logger.info("OTP email sent successfully to %s via Resend API", to_email)
                    return True
                else:
                    logger.error("Resend API returned status %s", response.status)
        except Exception as exc:
            logger.error("Failed to send OTP email via Resend: %s. Falling back to SMTP...", exc)

    # 2. Fall back to SMTP subprocess
    if not smtp_host or not smtp_user or not smtp_password:
        logger.warning("SMTP not configured — OTP will only be shown in console/dev mode.")
        return False

    sender = from_email or smtp_user

    try:
        # On Windows, CREATE_NEW_PROCESS_GROUP detaches the child from
        # the parent's console and network handle table. Build a clean
        # environment to avoid socket inheritance issues inside uvicorn.
        # On Linux/other, inherit env variables normally.
        creation_flags = 0
        run_env = os.environ.copy()
        if sys.platform == "win32":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP
            run_env = {
                "PATH": os.environ.get("PATH", ""),
                "SYSTEMROOT": os.environ.get("SYSTEMROOT", r"C:\Windows"),
                "TEMP": os.environ.get("TEMP", ""),
                "TMP": os.environ.get("TMP", ""),
            }

        result = subprocess.run(
            [
                _PYTHON_EXE,
                SEND_EMAIL_SCRIPT,
                to_email,
                otp_code,
                smtp_host,
                str(smtp_port),
                smtp_user,
                smtp_password,
                sender,
            ],
            capture_output=True,
            text=True,
            timeout=45,
            env=run_env,
            creationflags=creation_flags,
        )

        if result.returncode == 0 and "OK" in result.stdout:
            logger.info("OTP email sent successfully to %s", to_email)
            return True
        else:
            error_msg = result.stderr.strip() or result.stdout.strip()
            logger.error("Failed to send OTP email to %s: %s", to_email, error_msg)
            return False

    except subprocess.TimeoutExpired:
        logger.error("OTP email subprocess timed out for %s", to_email)
        return False
    except Exception as exc:
        logger.error("Failed to send OTP email to %s: %s", to_email, exc)
        return False
