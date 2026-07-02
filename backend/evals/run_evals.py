#!/usr/bin/env python
"""Golden eval runner — the regression net for prompt/model changes.

Runs every suite in evals/golden/ through the real RepoQA agent and grades
answers with the deterministic offline scorer. Intended to run on every
prompt change (locally or in CI):

    cd backend && python evals/run_evals.py              # full run (needs an LLM key)
    cd backend && python evals/run_evals.py --offline    # schema validation only, no LLM
    cd backend && python evals/run_evals.py --suite codeflow-backend

Behavior without any LLM API key: prints SKIPPED and exits 0, so CI without
secrets (e.g. fork PRs) stays green instead of failing on missing keys.
Exit codes: 0 = all passed (or skipped), 1 = at least one case failed,
2 = golden set itself is invalid.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

EVALS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = EVALS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

# Evals never touch a real database; keep indexing in-process.
os.environ.setdefault("STORAGE_BACKEND", "memory")

from evals.scorer import score_case, summarize, validate_case  # noqa: E402

LLM_KEY_VARS = (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
)


def load_suites(suite_filter: str | None = None) -> list[dict]:
    suites = []
    for path in sorted((EVALS_DIR / "golden").glob("*.json")):
        with open(path) as f:
            suite = json.load(f)
        suite["_path"] = str(path)
        if suite_filter and suite.get("suite") != suite_filter:
            continue
        suites.append(suite)
    return suites


def validate_suites(suites: list[dict]) -> bool:
    ok = True
    for suite in suites:
        if not suite.get("suite") or not suite.get("repo_path") or not suite.get("cases"):
            print(f"INVALID {suite['_path']}: needs 'suite', 'repo_path', and 'cases'")
            ok = False
            continue
        for case in suite["cases"]:
            problems = validate_case(case)
            if problems:
                ok = False
                for p in problems:
                    print(f"INVALID {suite['suite']}/{case.get('id', '?')}: {p}")
    return ok


async def run_suite(suite: dict) -> list[dict]:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")

    from app.llm import LLMRouter
    from app.agents.repo_qa import RepoQA

    llm = LLMRouter()
    qa = RepoQA(llm)
    repo_path = (REPO_ROOT / suite["repo_path"]).resolve()
    print(f"\n=== Suite: {suite['suite']} (indexing {repo_path}) ===")
    index_id = await qa.index_repo(str(repo_path))

    results = []
    for case in suite["cases"]:
        answer = await qa.ask(index_id, case["question"])
        result = score_case(case, answer)
        result["answer_preview"] = (answer or "")[:160].replace("\n", " ")
        results.append(result)
        marker = "PASS" if result["passed"] else "FAIL"
        print(f"[{marker}] {case['id']}")
        if not result["passed"]:
            for check in result["checks"]:
                if not check["passed"]:
                    print(f"       failed {check['type']}: {check['target']}")
            print(f"       answer: {result['answer_preview']}")
    return results


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="validate golden sets only, no LLM calls")
    parser.add_argument("--suite", help="run only the named suite")
    args = parser.parse_args()

    suites = load_suites(args.suite)
    if not suites:
        print(f"No golden suites found{' matching ' + args.suite if args.suite else ''}.")
        return 2

    if not validate_suites(suites):
        return 2
    print(f"Golden sets valid: {sum(len(s['cases']) for s in suites)} cases in {len(suites)} suite(s).")

    if args.offline:
        return 0

    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
    if not any(os.getenv(var) for var in LLM_KEY_VARS):
        print("SKIPPED: no LLM API key configured (set one of "
              f"{', '.join(LLM_KEY_VARS)}). Exiting 0.")
        return 0

    all_results = []
    for suite in suites:
        all_results.extend(await run_suite(suite))

    stats = summarize(all_results)
    print(f"\n=== Eval summary: {stats['passed']}/{stats['total']} passed, {stats['failed']} failed ===")
    return 1 if stats["failed"] else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
