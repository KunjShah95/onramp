"""Content moderation / guardrails for gateway traffic (flag-gated).

Baseline guardrails for the OpenAI-compatible gateway:

  - a curated input blocklist covering the categories no developer tool
    should ever generate (CSAM, non-consensual intimate imagery, weapon/
    malware attack tooling, doxxing, self-harm encouragement);
  - an optional hook into OpenRouter's free ``/moderations`` endpoint
    (OpenAI-compatible shape) for broader coverage when the platform
    opts in.

Both layers are best-effort and *fail open*: moderation infra must never
take the gateway down, and a moderation outage must not block traffic.
The whole feature is off by default (``ENABLE_MODERATION``) so it adds
zero latency until a deployment explicitly turns it on.
"""

import logging
import os
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("onramp.moderation")

MODERATIONS_URL = "https://openrouter.ai/api/v1/moderations"

# Curated blocklist — deliberately small and precise to avoid false
# positives on ordinary developer traffic. Each entry is (regex, category).
_BLOCKLIST: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"(?i)\b(child\s*(sexual|pornographic)|csam|child\s*porn(ography)?)\b"), "sexual_minors"),
    (re.compile(r"(?i)\b(non[- ]?consensual\s*(intimate|deepfake|imagery)|revenge\s*porn)\b"), "non_consensual_intimate"),
    (re.compile(r"(?i)\b(how\s+to\s+(make|build|synthesize)\s+(a\s+)?(bomb|pipe\s*bomb|explosive|ricin|sarin|nerve\s*agent|bioweapon))\b"), "weapons"),
    (re.compile(r"(?i)\b(steal\s+(credentials|passwords)|phishing\s*kit|keylogger|carding|credit\s*card\s*fraud\s+guide)\b"), "malware"),
    (re.compile(r"(?i)\b(doxx?ing|publish\s+someone.{0,25}(home\s*address|phone\s*number))\b"), "doxxing"),
    (re.compile(r"(?i)\b(how\s+to\s+commit\s+suicide|ways\s+to\s+kill\s+yourself)\b"), "self_harm"),
]


def is_enabled() -> bool:
    """Feature flag: ``ENABLE_MODERATION`` (1/true/yes) turns on screening."""
    return os.getenv("ENABLE_MODERATION", "").strip().lower() in ("1", "true", "yes")


def _moderation_api_enabled() -> bool:
    """Second flag: ``MODERATION_API`` additionally calls OpenRouter's
    free moderations endpoint for coverage beyond the blocklist."""
    return os.getenv("MODERATION_API", "").strip().lower() in ("1", "true", "yes")


def _blocklist_hit(text: str) -> Optional[dict]:
    for pattern, category in _BLOCKLIST:
        if pattern.search(text):
            return {"category": category, "reason": f"Blocked input: {category}"}
    return None


async def check_moderation(text: str, openrouter_key: Optional[str] = None) -> dict:
    """Screen ``text`` and return a moderation verdict. Never raises.

    Returns ``{"blocked": bool, "category": str|None, "reason": str|None,
    "source": "blocklist"|"openrouter"|"none", "flagged_categories": [...]}``.
    """
    verdict: dict = {
        "blocked": False,
        "category": None,
        "reason": None,
        "source": "none",
        "flagged_categories": [],
    }
    if not text or not is_enabled():
        return verdict

    hit = _blocklist_hit(text)
    if hit:
        return {
            **verdict,
            "blocked": True,
            "category": hit["category"],
            "reason": hit["reason"],
            "source": "blocklist",
            "flagged_categories": [hit["category"]],
        }

    if _moderation_api_enabled() and openrouter_key:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    MODERATIONS_URL,
                    json={"input": text},
                    headers={"Authorization": f"Bearer {openrouter_key}"},
                )
                resp.raise_for_status()
                results = (resp.json() or {}).get("results", [])
            if results and results[0].get("flagged"):
                cats = [
                    c for c, f in (results[0].get("categories") or {}).items() if f
                ]
                return {
                    **verdict,
                    "blocked": True,
                    "category": cats[0] if cats else "flagged",
                    "reason": "Flagged by the moderation API",
                    "source": "openrouter",
                    "flagged_categories": cats,
                }
            return {**verdict, "source": "openrouter"}
        except Exception:
            logger.exception("OpenRouter moderation call failed — failing open")

    return verdict
