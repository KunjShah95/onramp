"""Lightweight, provider-agnostic evaluation primitives for AI features.

The evaluator is intentionally deterministic and side-effect free.  It can be
used by unit tests, a CLI, or a future evaluation API without sending data to
an external service.  Production model runs should add their own latency/cost
metadata to the answerer wrapper.
"""

from __future__ import annotations

import inspect
import re
import time
from dataclasses import asdict, dataclass, field
from typing import Awaitable, Callable, Iterable, Sequence


@dataclass(frozen=True)
class EvalCase:
    """One grounded-answer expectation."""

    case_id: str
    question: str
    expected_files: Sequence[str] = ()
    required_terms: Sequence[str] = ()


@dataclass
class EvalResult:
    case_id: str
    passed: bool
    citation_precision: float
    term_recall: float
    latency_ms: float
    answer: str = ""
    cited_files: list[str] = field(default_factory=list)
    missing_terms: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


Answerer = Callable[[EvalCase], str | Awaitable[str]]


_FILE_RE = re.compile(r"(?:File|Source|src/)?\s*[:(]?\s*`?([\w./-]+\.[A-Za-z0-9]+)`?", re.IGNORECASE)


def _extract_files(answer: str) -> set[str]:
    found: set[str] = set()
    for match in _FILE_RE.finditer(answer or ""):
        value = match.group(1).replace("\\", "/").lstrip("./")
        if "/" in value or "." in value:
            found.add(value)
    return found


def _score_case(case: EvalCase, answer: str, latency_ms: float) -> EvalResult:
    expected = {str(path).replace("\\", "/").lstrip("./") for path in case.expected_files}
    cited = _extract_files(answer)
    # A citation is precise when it names an expected file.  Unknown paths are
    # treated as false citations; empty expected sets receive a neutral 1.0
    # so term-only cases are not penalized for omitting file references.
    precision = 1.0 if not expected else (len(expected & cited) / max(len(cited), 1))
    required = {str(term).casefold() for term in case.required_terms if str(term).strip()}
    answer_folded = (answer or "").casefold()
    present = {term for term in required if term in answer_folded}
    recall = len(present) / len(required) if required else 1.0
    missing = sorted(required - present)
    passed = precision >= 0.999 and recall >= 0.999
    return EvalResult(
        case_id=case.case_id,
        passed=passed,
        citation_precision=round(precision, 4),
        term_recall=round(recall, 4),
        latency_ms=round(latency_ms, 2),
        answer=answer or "",
        cited_files=sorted(cited),
        missing_terms=missing,
    )


async def run_eval_suite(
    cases: Iterable[EvalCase],
    answerer: Answerer,
) -> list[EvalResult]:
    """Run cases sequentially so latency measurements remain meaningful."""
    results: list[EvalResult] = []
    for case in cases:
        started = time.perf_counter()
        value = answerer(case)
        if inspect.isawaitable(value):
            answer = await value
        else:
            answer = value
        results.append(_score_case(case, str(answer), (time.perf_counter() - started) * 1000))
    return results


def summarize_eval(results: Sequence[EvalResult]) -> dict:
    """Return aggregate quality metrics for CI or an operations dashboard."""
    if not results:
        return {
            "cases": 0,
            "pass_rate": 0.0,
            "avg_citation_precision": 0.0,
            "avg_term_recall": 0.0,
            "avg_latency_ms": 0.0,
        }
    count = len(results)
    return {
        "cases": count,
        "pass_rate": round(sum(result.passed for result in results) / count, 4),
        "avg_citation_precision": round(
            sum(result.citation_precision for result in results) / count, 4
        ),
        "avg_term_recall": round(sum(result.term_recall for result in results) / count, 4),
        "avg_latency_ms": round(sum(result.latency_ms for result in results) / count, 2),
    }
