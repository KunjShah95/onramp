"""Tests for the provider-agnostic AI evaluation harness."""

import pytest

from app.services.ai_eval import EvalCase, run_eval_suite, summarize_eval


@pytest.mark.asyncio
async def test_eval_suite_scores_grounded_answers():
    cases = [
        EvalCase(
            "auth",
            "Where is token validation?",
            expected_files=["src/auth.py"],
            required_terms=["token", "validation"],
        ),
        EvalCase(
            "unknown",
            "What is the retry policy?",
            expected_files=["src/queue.py"],
            required_terms=["retry", "backoff"],
        ),
    ]

    async def answer(case: EvalCase) -> str:
        if case.case_id == "auth":
            return "See `src/auth.py`: token validation is implemented there."
        return "The queue has no retry policy."

    results = await run_eval_suite(cases, answer)
    summary = summarize_eval(results)

    assert results[0].passed is True
    assert results[0].citation_precision == 1.0
    assert results[0].term_recall == 1.0
    assert results[1].passed is False
    assert "backoff" in results[1].missing_terms
    assert summary["cases"] == 2
    assert summary["pass_rate"] == 0.5


@pytest.mark.asyncio
async def test_eval_suite_supports_sync_answerers():
    case = EvalCase("term-only", "Explain the cache", required_terms=["cache"])
    results = await run_eval_suite([case], lambda _case: "The cache is Redis-backed.")
    assert results[0].passed is True
