"""Account Provisioning Router — admin/senior creates dev accounts."""

import csv
import io
import os
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.api.v1.auth import get_current_user
from app.middleware.access_guard import ROLE_HIERARCHY
from app.services.account_service import create_provisioned_user, check_email_exists
from app.services.team_service import get_user_teams
from app.services.email_service import send_email, is_enabled as email_is_enabled

router = APIRouter(prefix="/admin/accounts", tags=["admin-accounts"])

logger = logging.getLogger("onramp.accounts")

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
)

# Roles that can create accounts
CREATOR_ROLES = {"ceo", "cto", "senior_dev", "hr"}
# Roles that can be assigned to created accounts
CREATABLE_ROLES = {"new_dev": 2, "developer": 4, "tester": 3, "hr": 4}


class CreateAccountRequest(BaseModel):
    name: str
    email: EmailStr
    role: str = "new_dev"
    team_id: str | None = None
    message: str | None = None


class CreateAccountResponse(BaseModel):
    success: bool
    uid: str
    email: str
    name: str
    role: str
    temp_password: str
    team_id: str | None = None


class CsvPreviewRequest(BaseModel):
    csv_data: str


class BulkCreateRow(BaseModel):
    name: str
    email: EmailStr
    role: str = "new_dev"
    team_id: str | None = None


class BulkCreateRequest(BaseModel):
    rows: List[BulkCreateRow]


class BulkCreateResult(BaseModel):
    email: str
    uid: str
    temp_password: str
    role: str


class BulkCreateResponse(BaseModel):
    success: bool
    created: List[BulkCreateResult]
    skipped: List[dict]
    total_created: int
    total_skipped: int


class CsvPreviewRow(BaseModel):
    row_number: int
    name: str
    email: str
    role: str
    valid: bool
    error: str | None = None


class CsvPreviewResponse(BaseModel):
    rows: List[CsvPreviewRow]
    total_valid: int
    total_errors: int


async def _get_creator_role(user: dict) -> tuple[str, int]:
    """Get the creator's highest role level across all teams."""
    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    max_role = "member"
    max_level = 0
    for t in teams:
        r = t.get("role", "member")
        level = ROLE_HIERARCHY.get(r, 0)
        if level > max_level:
            max_level = level
            max_role = r
    return max_role, max_level


def _can_create_role(creator_level: int, target_role: str) -> bool:
    """Check if creator can assign a given role.

    ceo/cto/owner (6): can create any creatable role.
    senior_dev/senior (5): can create new_dev/developer/tester.
    hr (4): can create new_dev/developer/tester.
    """
    target_level = CREATABLE_ROLES.get(target_role, 0)
    if target_level == 0:
        return False
    if creator_level < 4:
        return False
    if creator_level < target_level:
        return False
    return True


@router.post("/create", response_model=CreateAccountResponse)
async def create_account(
    body: CreateAccountRequest,
    user: dict = Depends(get_current_user),
):
    """Create a single provisioned developer account.

    Requires the creator to have ceo/cto/senior_dev/hr role.
    """
    creator_role, creator_level = await _get_creator_role(user)

    if creator_role not in CREATOR_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only ceo, cto, senior_dev, or hr can create accounts",
        )

    if not _can_create_role(creator_level, body.role):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot create account with role '{body.role}' from your role level",
        )

    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    exists = await check_email_exists(body.email)
    if exists:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    creator_uid = user.get("uid", "")
    if body.team_id:
        teams = await get_user_teams(creator_uid)
        team_ids = [t.get("team_id") or t.get("id") for t in teams]
        if body.team_id not in team_ids:
            raise HTTPException(status_code=403, detail="You are not a member of the specified team")

    result = await create_provisioned_user(
        name=body.name,
        email=body.email,
        role=body.role,
        team_id=body.team_id,
    )

    # Send welcome email
    login_url = f"{FRONTEND_URL}/login"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px">🚀</div>
<h1 style="color:#FDFBF8;font-size:20px;margin:0">Welcome to Onramp</h1>
</div>
<p style="color:rgba(253,251,248,0.6);font-size:14px;line-height:1.6">
Your account has been created by your team lead.
</p>
<p style="color:rgba(253,251,248,0.8);font-size:14px;line-height:1.6">
<strong>Email:</strong> {body.email}<br>
<strong>Temporary password:</strong> <code style="background:#0D0906;padding:2px 6px;border-radius:4px;font-size:13px">{result['temp_password']}</code>
</p>
<p style="color:rgba(253,251,248,0.5);font-size:12px;line-height:1.6">
You'll be asked to set a new password on first login.
</p>
<div style="text-align:center;margin-top:24px">
<a href="{login_url}" style="display:inline-block;background:#FF8C00;color:#3D1C00;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:700;font-size:14px">Sign In</a>
</div>
{body.message and f'<p style="color:rgba(253,251,248,0.4);font-size:12px;margin-top:20px;font-style:italic">"{body.message}"</p>' or ''}
</div></body></html>"""

    try:
        sent = await send_email(to=body.email, subject="Welcome to Onramp — your account is ready", html_body=html)
        if not sent:
            logger.info("Welcome email to %s (SendGrid not configured)", body.email)
    except Exception:
        logger.exception("Failed to send welcome email to %s", body.email)

    return CreateAccountResponse(
        success=True,
        **result,
    )


@router.post("/preview-csv", response_model=CsvPreviewResponse)
async def preview_csv(
    body: CsvPreviewRequest,
    user: dict = Depends(get_current_user),
):
    """Validate a CSV before bulk importing."""
    creator_role, creator_level = await _get_creator_role(user)
    if creator_role not in CREATOR_ROLES:
        raise HTTPException(status_code=403, detail="Only ceo/cto/senior_dev/hr can create accounts")

    try:
        reader = csv.DictReader(io.StringIO(body.csv_data))
        rows = []
        for i, row in enumerate(reader, start=1):
            name = row.get("name", "").strip()
            email = row.get("email", "").strip()
            role = row.get("role", "new_dev").strip()
            error = None
            valid = True

            if not name:
                error = "Name is required"
                valid = False
            elif not email or "@" not in email:
                error = "Valid email is required"
                valid = False
            elif role not in CREATABLE_ROLES:
                error = f"Invalid role: {role}"
                valid = False
            elif not _can_create_role(creator_level, role):
                error = f"Cannot create role '{role}' from your role level"
                valid = False
            else:
                exists = await check_email_exists(email)
                if exists:
                    error = "Email already registered"
                    valid = False

            rows.append(CsvPreviewRow(
                row_number=i,
                name=name,
                email=email,
                role=role,
                valid=valid,
                error=error,
            ))

        total_valid = sum(1 for r in rows if r.valid)
        total_errors = len(rows) - total_valid
        return CsvPreviewResponse(rows=rows, total_valid=total_valid, total_errors=total_errors)

    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse CSV: {str(e)}")


@router.post("/create-bulk", response_model=BulkCreateResponse)
async def create_accounts_bulk(
    body: BulkCreateRequest,
    user: dict = Depends(get_current_user),
):
    """Create multiple provisioned accounts from a list of rows."""
    creator_role, creator_level = await _get_creator_role(user)
    if creator_role not in CREATOR_ROLES:
        raise HTTPException(status_code=403, detail="Only ceo/cto/senior_dev/hr can create accounts")

    if len(body.rows) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 accounts per batch")

    created = []
    skipped = []

    for row in body.rows:
        if not _can_create_role(creator_level, row.role):
            skipped.append({"email": row.email, "reason": f"Cannot create role '{row.role}'"})
            continue

        exists = await check_email_exists(row.email)
        if exists:
            skipped.append({"email": row.email, "reason": "Email already registered"})
            continue

        try:
            result = await create_provisioned_user(
                name=row.name,
                email=row.email,
                role=row.role,
                team_id=row.team_id,
            )
            created.append(BulkCreateResult(
                email=result["email"],
                uid=result["uid"],
                temp_password=result["temp_password"],
                role=result["role"],
            ))
        except Exception as e:
            skipped.append({"email": row.email, "reason": str(e)})

    return BulkCreateResponse(
        success=True,
        created=created,
        skipped=skipped,
        total_created=len(created),
        total_skipped=len(skipped),
    )

