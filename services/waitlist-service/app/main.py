"""
Waitlist Service - pre-launch signup capture for CodeFlow
Writes to Google Sheets, sends SendGrid emails.
Port: 3008
"""

import html as html_lib
import json
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import gspread
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.oauth2.service_account import Credentials
from pydantic import BaseModel, EmailStr, field_validator
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from starlette.middleware.base import BaseHTTPMiddleware


def _e(s: str) -> str:
    return html_lib.escape(str(s))


env_path = Path(__file__).resolve().parents[3] / "backend" / ".env"
load_dotenv(env_path)

app = FastAPI(
    title="Waitlist Service",
    version="1.0.0",
    description="Pre-launch waitlist for CodeFlow",
)


# ── Rate limiting ─────────────────────────────────────────────────────────────

# Module-level store so it can be cleared between test sessions if needed.
_rate_limit_store: dict[str, list[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_hour: int = 5):
        super().__init__(app)
        self.requests_per_hour = requests_per_hour

    async def dispatch(self, request: Request, call_next):
        if request.method != "POST":
            return await call_next(request)
        # Read limit from env at dispatch time so it can be overridden (e.g. in tests).
        limit = int(os.environ.get("RATE_LIMIT_REQUESTS_PER_HOUR", self.requests_per_hour))
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        _rate_limit_store[client_ip] = [
            t for t in _rate_limit_store[client_ip] if now - t < 3600
        ]
        if len(_rate_limit_store[client_ip]) >= limit:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded."})
        _rate_limit_store[client_ip].append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware, requests_per_hour=5)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Google Sheets ─────────────────────────────────────────────────────────────

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

_worksheet: gspread.Worksheet | None = None


def _fix_env_json(s: str) -> str:
    result = []
    in_string = False
    i = 0
    while i < len(s):
        if s[i] == '"':
            in_string = not in_string
            result.append(s[i])
        elif s[i:i+2] == '\\n' and not in_string:
            result.append('\n')
            i += 2
            continue
        else:
            result.append(s[i])
        i += 1
    return ''.join(result)


def get_sheet() -> gspread.Worksheet:
    global _worksheet
    if _worksheet is not None:
        return _worksheet
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if not creds_json or not sheet_id:
        raise HTTPException(status_code=503, detail="Google Sheets not configured")
    creds = Credentials.from_service_account_info(json.loads(_fix_env_json(creds_json)), scopes=SCOPES)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(sheet_id)
    worksheet = spreadsheet.sheet1
    if worksheet.row_count == 0 or worksheet.cell(1, 1).value != "Timestamp":
        worksheet.append_row([
            "Timestamp", "Name", "Email", "Role",
            "Company", "Team Size", "Use Case", "Position",
        ])
    _worksheet = worksheet
    return _worksheet


# ── Email ─────────────────────────────────────────────────────────────────────

def send_emails(name: str, email: str, role: str, company: str,
                team_size: str, use_case: str, position: int) -> None:
    api_key = os.environ.get("SENDGRID_API_KEY", "")
    from_email = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@codeflow.dev")
    admin_email = os.environ.get("ADMIN_EMAIL", "")
    if not api_key:
        return

    sg = SendGridAPIClient(api_key)

    confirmation = Mail(
        from_email=from_email,
        to_emails=email,
        subject="You're on the CodeFlow waitlist!",
        html_content=(
            f"<p>Hi {_e(name)},</p>"
            f"<p>You're <strong>#{position}</strong> on the CodeFlow early access list.</p>"
            f"<p>We'll email you the moment we launch. Reply to tell us more about your team — we read every message.</p>"
            f"<p>— The CodeFlow Team</p>"
        ),
    )

    try:
        sg.send(confirmation)
    except Exception:
        pass

    if admin_email:
        alert = Mail(
            from_email=from_email,
            to_emails=admin_email,
            subject=f"New waitlist signup — {_e(name)} from {_e(company)}",
            html_content=(
                f"<p><strong>Position:</strong> #{position}</p>"
                f"<p><strong>Name:</strong> {_e(name)}</p>"
                f"<p><strong>Email:</strong> {_e(email)}</p>"
                f"<p><strong>Role:</strong> {_e(role)}</p>"
                f"<p><strong>Company:</strong> {_e(company)}</p>"
                f"<p><strong>Team Size:</strong> {_e(team_size)}</p>"
                f"<p><strong>Use Case:</strong> {_e(use_case)}</p>"
                f"<p><strong>Timestamp:</strong> {datetime.now(timezone.utc).isoformat()}</p>"
            ),
        )
        try:
            sg.send(alert)
        except Exception:
            pass


# ── Models ────────────────────────────────────────────────────────────────────

class WaitlistJoinRequest(BaseModel):
    email: EmailStr
    name: str
    role: Literal["developer", "manager", "cto"]
    company: str
    team_size: Literal["1-10", "11-50", "51-200", "200+"]
    use_case: str

    @field_validator("use_case")
    @classmethod
    def use_case_max_length(cls, v: str) -> str:
        if len(v) > 500:
            raise ValueError("use_case must be 500 characters or fewer")
        return v

    @field_validator("name", "company")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty")
        if len(v) > 200:
            raise ValueError("Field must be 200 characters or fewer")
        return v


class WaitlistJoinResponse(BaseModel):
    success: bool
    position: int
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "waitlist-service"}


@app.post("/api/v1/waitlist/join", response_model=WaitlistJoinResponse)
async def join_waitlist(body: WaitlistJoinRequest, background_tasks: BackgroundTasks):
    sheet = get_sheet()
    # Non-atomic read-check-write: acceptable for low-volume pre-launch waitlist
    existing_emails = [e.lower() for e in sheet.col_values(3)[1:]]  # col 3 = Email, skip header
    if body.email.lower() in existing_emails:
        raise HTTPException(status_code=409, detail="Already on the list")

    position = len(existing_emails) + 1
    sheet.append_row([
        datetime.now(timezone.utc).isoformat(),
        body.name,
        body.email,
        body.role,
        body.company,
        body.team_size,
        body.use_case,
        position,
    ])

    background_tasks.add_task(
        send_emails,
        body.name, body.email, body.role,
        body.company, body.team_size, body.use_case, position,
    )

    return WaitlistJoinResponse(
        success=True,
        position=position,
        message=f"You're #{position} on the list!",
    )


@app.get("/api/v1/waitlist/count")
async def get_count():
    sheet = get_sheet()
    count = max(0, len(sheet.col_values(3)) - 1)  # subtract header row
    return {"count": count}
