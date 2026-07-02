"""Tests for the offline eval scorer and golden-set schema validation."""

import json
from pathlib import Path

from evals.scorer import score_case, summarize, validate_case

GOLDEN_DIR = Path(__file__).resolve().parent.parent / "evals" / "golden"


def test_must_contain_all_required():
    case = {"id": "c", "question": "q", "must_contain": ["alpha", "beta"]}
    assert score_case(case, "Alpha and BETA are here")["passed"]
    assert not score_case(case, "only alpha")["passed"]


def test_must_contain_any():
    case = {"id": "c", "question": "q", "must_contain_any": ["redis", "postgres"]}
    assert score_case(case, "We use Redis for caching")["passed"]
    assert not score_case(case, "We use files")["passed"]


def test_must_not_contain():
    case = {"id": "c", "question": "q", "must_not_contain": ["i don't know"]}
    assert score_case(case, "The answer is 42")["passed"]
    assert not score_case(case, "Sorry, I don't KNOW that")["passed"]


def test_must_match_regex():
    case = {"id": "c", "question": "q", "must_match": [r"/health(/deep)?"]}
    assert score_case(case, "hit /health/deep for the full check")["passed"]
    assert not score_case(case, "no endpoint mentioned")["passed"]


def test_min_length():
    case = {"id": "c", "question": "q", "min_length": 10}
    assert score_case(case, "a" * 10)["passed"]
    assert not score_case(case, "short")["passed"]


def test_empty_answer_fails_gracefully():
    case = {"id": "c", "question": "q", "must_contain": ["x"], "min_length": 1}
    result = score_case(case, None)
    assert not result["passed"]


def test_validate_case_catches_problems():
    assert validate_case({"id": "c", "question": "q", "must_contain": ["x"]}) == []
    assert validate_case({"question": "q", "must_contain": ["x"]})  # missing id
    assert validate_case({"id": "c", "question": "q"})  # no checks
    assert validate_case({"id": "c", "question": "q", "must_contain": "not-a-list"})
    assert validate_case({"id": "c", "question": "q", "must_match": ["(unclosed"]})


def test_summarize():
    results = [{"passed": True}, {"passed": False}, {"passed": True}]
    assert summarize(results) == {"total": 3, "passed": 2, "failed": 1}


def test_checked_in_golden_sets_are_valid():
    suites = list(GOLDEN_DIR.glob("*.json"))
    assert suites, "no golden suites found"
    for path in suites:
        suite = json.loads(path.read_text())
        assert suite.get("suite") and suite.get("repo_path") and suite.get("cases"), path.name
        for case in suite["cases"]:
            assert validate_case(case) == [], f"{path.name}/{case.get('id')}: {validate_case(case)}"
