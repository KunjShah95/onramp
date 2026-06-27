"""Simple runner that loads .env and starts uvicorn."""
import json
import os
import re

# Load root .env file
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        content = f.read()
    for match in re.finditer(r'^(GOOGLE_CREDENTIALS_JSON|GOOGLE_SHEET_ID|SENDGRID_API_KEY|ADMIN_EMAIL)=(.*)$', content, re.MULTILINE):
        key, val = match.group(1), match.group(2)
        os.environ[key] = val
        print(f"  {key} set ({len(val)} chars)")

# Verify
import os as _os
cj = _os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
print(f"  VERIFY: GOOGLE_CREDENTIALS_JSON exists={bool(cj)}, len={len(cj)}")
if cj:
    try:
        import json
        _ = json.loads(cj)
        print(f"  VERIFY: JSON is valid")
    except json.JSONDecodeError as e:
        print(f"  VERIFY: JSON ERROR: {e}")
        print(f"  First 100: {repr(cj[:100])}")

print("Starting waitlist service on http://0.0.0.0:3008")
import uvicorn
uvicorn.run("app.main:app", host="0.0.0.0", port=3008)
