"""Build onramp-live-site-check.json from onramp-live-site-check.js.

    python n8n/workflows/build_live_check_workflow.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
code = (HERE / "onramp-live-site-check.js").read_text(encoding="utf-8")

workflow = {
    "name": "Onramp — Live Site Check",
    "nodes": [
        {
            "parameters": {"httpMethod": "GET", "path": "live-check", "responseMode": "lastNode", "options": {}},
            "id": "6a1f3c52-8d0b-4c0e-9d7a-1f0e2c3b4a01",
            "name": "Run on demand",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [240, 220],
            "webhookId": "6a1f3c52-8d0b-4c0e-9d7a-1f0e2c3b4a02",
        },
        {
            "parameters": {"rule": {"interval": [{"field": "hours", "hoursInterval": 6}]}},
            "id": "6a1f3c52-8d0b-4c0e-9d7a-1f0e2c3b4a03",
            "name": "Every 6 hours",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.2,
            "position": [240, 420],
        },
        {
            "parameters": {"jsCode": code},
            "id": "6a1f3c52-8d0b-4c0e-9d7a-1f0e2c3b4a04",
            "name": "Run Live Checks",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [520, 320],
        },
        {
            "parameters": {
                "content": (
                    "## Onramp live site check\n"
                    "GET `/webhook/live-check` → JSON report (also runs every 6h; see Executions).\n\n"
                    "Env (optional): `LIVE_FRONTEND_URL`, `LIVE_API_URL`, `LOCAL_API_URL`.\n"
                    "`N8N_INBOUND_SECRET` must match the backend for the signed-ping checks.\n"
                    "Requires `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`."
                ),
                "height": 220,
                "width": 420,
            },
            "id": "6a1f3c52-8d0b-4c0e-9d7a-1f0e2c3b4a05",
            "name": "About",
            "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1,
            "position": [760, 180],
        },
    ],
    "connections": {
        "Run on demand": {"main": [[{"node": "Run Live Checks", "type": "main", "index": 0}]]},
        "Every 6 hours": {"main": [[{"node": "Run Live Checks", "type": "main", "index": 0}]]},
    },
    "active": False,
    "settings": {"executionOrder": "v1"},
    "staticData": None,
    "pinData": {},
}

out = HERE / "onramp-live-site-check.json"
out.write_text(json.dumps(workflow, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {out}")
