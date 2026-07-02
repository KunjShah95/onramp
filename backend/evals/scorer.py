"""Offline scorer for golden eval cases.

Grading is deterministic string/regex checking — no LLM needed — so a failing
prompt change shows up as a hard CI failure, not a vibe. Supported checks per
case (all optional, all case-insensitive except `must_match` which is a regex
with re.IGNORECASE):

    must_contain:     [str]  — every string must appear in the answer
    must_contain_any: [str]  — at least one string must appear
    must_not_contain: [str]  — none of these may appear
    must_match:       [str]  — every regex must find a match
    min_length:       int    — answer must be at least this many characters
"""

import re

REQUIRED_FIELDS = ("id", "question")
CHECK_FIELDS = ("must_contain", "must_contain_any", "must_not_contain", "must_match", "min_length")


def validate_case(case: dict) -> list[str]:
    """Return a list of schema problems (empty = valid)."""
    problems = []
    for field in REQUIRED_FIELDS:
        if not case.get(field):
            problems.append(f"missing required field '{field}'")
    if not any(case.get(f) for f in CHECK_FIELDS):
        problems.append("case has no checks — it can never fail")
    for field in ("must_contain", "must_contain_any", "must_not_contain", "must_match"):
        value = case.get(field)
        if value is not None and (
            not isinstance(value, list) or not all(isinstance(s, str) for s in value)
        ):
            problems.append(f"'{field}' must be a list of strings")
    for pattern in case.get("must_match", []) or []:
        try:
            re.compile(pattern)
        except re.error as exc:
            problems.append(f"invalid regex '{pattern}': {exc}")
    if "min_length" in case and not isinstance(case["min_length"], int):
        problems.append("'min_length' must be an int")
    return problems


def score_case(case: dict, answer: str) -> dict:
    """Grade one answer against one golden case."""
    answer = answer or ""
    lowered = answer.lower()
    checks = []

    for needle in case.get("must_contain", []) or []:
        checks.append({
            "type": "must_contain",
            "target": needle,
            "passed": needle.lower() in lowered,
        })

    any_needles = case.get("must_contain_any", []) or []
    if any_needles:
        checks.append({
            "type": "must_contain_any",
            "target": any_needles,
            "passed": any(n.lower() in lowered for n in any_needles),
        })

    for needle in case.get("must_not_contain", []) or []:
        checks.append({
            "type": "must_not_contain",
            "target": needle,
            "passed": needle.lower() not in lowered,
        })

    for pattern in case.get("must_match", []) or []:
        checks.append({
            "type": "must_match",
            "target": pattern,
            "passed": re.search(pattern, answer, re.IGNORECASE) is not None,
        })

    min_length = case.get("min_length")
    if min_length is not None:
        checks.append({
            "type": "min_length",
            "target": min_length,
            "passed": len(answer) >= min_length,
        })

    return {
        "case_id": case.get("id", "?"),
        "passed": all(c["passed"] for c in checks),
        "checks": checks,
    }


def summarize(results: list[dict]) -> dict:
    passed = sum(1 for r in results if r["passed"])
    return {"total": len(results), "passed": passed, "failed": len(results) - passed}
