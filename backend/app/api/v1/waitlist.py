"""
Waitlist API Router - pre-launch signup capture for CodeFlow.
Writes to Google Sheets (if configured), sends SendGrid emails (if configured).
Exposes /api/v1/waitlist/join and /api/v1/waitlist/count.
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
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from google.oauth2.service_account import Credentials
from pydantic import BaseModel, EmailStr, field_validator
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

router = APIRouter(prefix="/waitlist", tags=["waitlist"])

# Rate limit tracking (local in-memory store for waitlist signups)
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_REQUESTS_PER_HOUR = 5

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
_worksheet = None


def _e(s: str) -> str:
    return html_lib.escape(str(s))


class MockWorksheet:
    def __init__(self, filepath: Path):
        self.filepath = filepath
        self._load()

    def _load(self):
        if self.filepath.exists():
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self.rows = json.load(f)
                    return
            except Exception:
                pass
        self.rows = [
            ["Timestamp", "Name", "Email", "Role", "Company", "Team Size", "Use Case", "Position"]
        ]
        self._save()

    def _save(self):
        try:
            self.filepath.parent.mkdir(parents=True, exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.rows, f, indent=2)
        except Exception:
            pass

    def col_values(self, col: int) -> list[str]:
        idx = col - 1
        return [row[idx] for row in self.rows if len(row) > idx]

    def append_row(self, row: list):
        self.rows.append([str(item) for item in row])
        self._save()


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


def is_placeholder(val: str | None) -> bool:
    if not val:
        return True
    val_stripped = val.strip()
    return (
        val_stripped.startswith("<") and val_stripped.endswith(">")
    ) or val_stripped in ("your-firebase-project-id", "your-google-sheet-id", "sheet-id-123")


def get_sheet():
    global _worksheet
    if _worksheet is not None:
        return _worksheet
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if is_placeholder(creds_json) or is_placeholder(sheet_id):
        print("Google Sheets credentials not fully configured. Using local JSON mock database.")
        _worksheet = MockWorksheet(Path(__file__).resolve().parents[2] / "waitlist_mock.json")
        return _worksheet
    try:
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
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}. Falling back to local JSON mock database.")
        _worksheet = MockWorksheet(Path(__file__).resolve().parents[2] / "waitlist_mock.json")
        return _worksheet


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


# Rate limit enforcement function
def check_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip] if now - t < 3600
    ]
    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_REQUESTS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    _rate_limit_store[client_ip].append(now)


@router.post("/join", response_model=WaitlistJoinResponse)
async def join_waitlist(body: WaitlistJoinRequest, request: Request, background_tasks: BackgroundTasks):
    check_rate_limit(request)
    sheet = get_sheet()
    
    # Col 3 = Email. col_values returns 1-indexed elements, so we skip header at index 0.
    existing_emails = [e.lower() for e in sheet.col_values(3)[1:]]
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


@router.get("/count")
async def get_count():
    sheet = get_sheet()
    count = max(0, len(sheet.col_values(3)) - 1)  # subtract header row
    return {"success": True, "count": count}
