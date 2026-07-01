"""Simple runner that loads .env and starts uvicorn."""
import json
import os
from dotenv import load_dotenv

# Try backend/.env first, then fall back to root .env
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
backend_env = os.path.join(base_dir, "backend", ".env")
root_env = os.path.join(base_dir, ".env")

if os.path.exists(backend_env):
    load_dotenv(backend_env, override=True)
    print(f"Loaded environment from {backend_env}")
elif os.path.exists(root_env):
    load_dotenv(root_env, override=True)
    print(f"Loaded environment from {root_env}")

# Verify
cj = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
print(f"  VERIFY: GOOGLE_CREDENTIALS_JSON exists={bool(cj)}, len={len(cj)}")
if cj:
    try:
        if cj.strip().startswith("<"):
            print("  VERIFY: GOOGLE_CREDENTIALS_JSON is a placeholder")
        else:
            _ = json.loads(cj)
            print("  VERIFY: JSON is valid")
    except json.JSONDecodeError as e:
        print(f"  VERIFY: JSON ERROR: {e}")
        print(f"  First 100: {repr(cj[:100])}")

print("Starting waitlist service on http://0.0.0.0:3008")
import uvicorn
uvicorn.run("app.main:app", host="0.0.0.0", port=3008)
