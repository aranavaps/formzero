import subprocess
import sys
import os
import logging
import urllib.request
import json
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
    Send an OTP verification email. 
    First attempts to proxy the request to the Next.js API route on Vercel (bypassing Render's port blocks).
    Falls back to spawning a local SMTP subprocess.
    """
    if not smtp_host or not smtp_user or not smtp_password:
        logger.warning("SMTP not configured — OTP will only be shown in console/dev mode.")
        return False

    sender = from_email or smtp_user
    settings = get_settings()

    # 1. Try sending via Vercel proxy API (To bypass Render SMTP port blocks)
    if settings.frontend_url:
        url = f"{settings.frontend_url.rstrip('/')}/api/send-email"
        payload = {
            "to_email": to_email,
            "otp_code": otp_code,
            "smtp_host": smtp_host,
            "smtp_port": smtp_port,
            "smtp_user": smtp_user,
            "smtp_password": smtp_password,
            "from_email": from_email
        }
        try:
            logger.info("Attempting to send OTP email via Vercel proxy: %s", url)
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                res_data = json.loads(response.read().decode())
                if response.status == 200 and res_data.get("status") == "success":
                    logger.info("OTP email sent successfully via Vercel proxy to %s", to_email)
                    return True
                else:
                    logger.warning("Vercel proxy returned error response: %s", res_data)
        except Exception as exc:
            logger.warning("Failed to send email via Vercel proxy (%s). Falling back to direct SMTP...", exc)

    # 2. Local Fallback: Direct SMTP sending via subprocess
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
            logger.info("OTP email sent successfully to %s via direct SMTP", to_email)
            return True
        else:
            error_msg = result.stderr.strip() or result.stdout.strip()
            logger.error("Failed to send OTP email directly to %s: %s", to_email, error_msg)
            return False

    except subprocess.TimeoutExpired:
        logger.error("OTP email subprocess timed out for %s", to_email)
        return False
    except Exception as exc:
        logger.error("Failed to send OTP email directly to %s: %s", to_email, exc)
        return False
