import json
import os
from pathlib import Path
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

# Load environment
base_dir = Path(__file__).resolve().parents[2]
backend_env = base_dir / "backend" / ".env"
load_dotenv(backend_env)

creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
sheet_id = os.environ.get("GOOGLE_SHEET_ID")

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

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
creds = Credentials.from_service_account_info(json.loads(_fix_env_json(creds_json)), scopes=SCOPES)
client = gspread.authorize(creds)
spreadsheet = client.open_by_key(sheet_id)
worksheet = spreadsheet.sheet1

# Load mock JSON
mock_json_path = Path(__file__).resolve().parent / "app" / "waitlist_mock.json"
if mock_json_path.exists():
    with open(mock_json_path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    
    # Skip header
    records = rows[1:]
    
    # Get existing emails in sheets to avoid duplicates
    existing_emails = [e.lower() for e in worksheet.col_values(3)[1:]]
    
    migrated_count = 0
    for row in records:
        # Pad row to at least 8 elements if elements are missing
        while len(row) < 8:
            row.append("")
        timestamp, name, email, role, company, team_size, use_case, position = row
        if email.lower() not in existing_emails:
            print(f"Migrating: {name} ({email})")
            worksheet.append_row([
                timestamp, name, email, role, company, team_size, use_case, position
            ])
            existing_emails.append(email.lower())
            migrated_count += 1
        else:
            print(f"Skipping (already in sheet): {email}")
    print(f"Successfully migrated {migrated_count} records to Google Sheets.")
else:
    print("No mock waitlist file found.")
