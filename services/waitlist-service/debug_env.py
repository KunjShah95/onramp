"""Debug: check if env vars are properly parseable"""
import os, re, json

# Method 1: Direct from .env file
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
with open(env_path, encoding="utf-8") as f:
    content = f.read()

for match in re.finditer(r"^(GOOGLE_CREDENTIALS_JSON)=(.*)$", content, re.MULTILINE):
    val = match.group(2)
    print(f"From .env: len={len(val)}")

    # Simulate _fix_env_json from main.py
    result = []
    in_string = False
    i = 0
    while i < len(val):
        if val[i] == '"':
            in_string = not in_string
            result.append(val[i])
        elif val[i:i+2] == "\\n" and not in_string:
            result.append("\n")
            i += 2
            continue
        else:
            result.append(val[i])
        i += 1
    fixed = "".join(result)

    try:
        data = json.loads(fixed)
        print(f"JSON parsed OK: {list(data.keys())}")
        print(f"client_email: {data.get('client_email')}")
    except json.JSONDecodeError as e:
        print(f"JSON Error: {e}")
        print(f"Fixed first 200: {repr(fixed[:200])}")

# Method 2: From os.environ (if running within run.py context)
cj = os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
if cj:
    print(f"\nFrom os.environ: exists=True, len={len(cj)}")
else:
    print(f"\nFrom os.environ: NOT SET")
