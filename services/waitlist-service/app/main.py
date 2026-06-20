"""
Waitlist Service - pre-launch signup capture for CodeFlow
Writes to Google Sheets, sends SendGrid emails.
Port: 3008
"""

import asyncio
import json
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal

import gspread
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.oauth2.service_account import Credentials
from pydantic import BaseModel, EmailStr, field_validator
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(
    title="Waitlist Service",
    version="1.0.0",
    description="Pre-launch waitlist for CodeFlow",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


# ── Google Sheets ─────────────────────────────────────────────────────────────

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def get_sheet() -> gspread.Worksheet:
    creds_json = os.environ["GOOGLE_CREDENTIALS_JSON"]
    sheet_id = os.environ["GOOGLE_SHEET_ID"]
    creds = Credentials.from_service_account_info(json.loads(creds_json), scopes=SCOPES)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(sheet_id)
    worksheet = spreadsheet.sheet1
    if worksheet.row_count == 0 or worksheet.cell(1, 1).value != "Timestamp":
        worksheet.append_row([
            "Timestamp", "Name", "Email", "Role",
            "Company", "Team Size", "Use Case", "Position",
        ])
    return worksheet


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
            f"<p>Hi {name},</p>"
            f"<p>You're <strong>#{position}</strong> on the CodeFlow early access list.</p>"
            f"<p>We'll email you the moment we launch. Reply to tell us more about your team — we read every message.</p>"
            f"<p>— The CodeFlow Team</p>"
        ),
    )

    alert = Mail(
        from_email=from_email,
        to_emails=admin_email,
        subject=f"New waitlist signup — {name} from {company}",
        html_content=(
            f"<p><strong>Position:</strong> #{position}</p>"
            f"<p><strong>Name:</strong> {name}</p>"
            f"<p><strong>Email:</strong> {email}</p>"
            f"<p><strong>Role:</strong> {role}</p>"
            f"<p><strong>Company:</strong> {company}</p>"
            f"<p><strong>Team Size:</strong> {team_size}</p>"
            f"<p><strong>Use Case:</strong> {use_case}</p>"
            f"<p><strong>Timestamp:</strong> {datetime.now(timezone.utc).isoformat()}</p>"
        ),
    )

    try:
        sg.send(confirmation)
        if admin_email:
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
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class WaitlistJoinResponse(BaseModel):
    success: bool
    position: int
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "waitlist-service"}


@app.post("/api/v1/waitlist/join", response_model=WaitlistJoinResponse)
async def join_waitlist(body: WaitlistJoinRequest):
    sheet = get_sheet()
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

    asyncio.create_task(asyncio.to_thread(
        send_emails,
        body.name, body.email, body.role,
        body.company, body.team_size, body.use_case, position,
    ))

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
