"""Grounding: AI answers' structural claims are checked against the import graph."""

import asyncio

from app.services.comprehension_service import GraphFacts
from app.services.grounding_service import ground_answer, ground_for_index


def _facts() -> GraphFacts:
    # api -> service -> core ; cli -> core ; worker isolated
    deps = {
        "backend/app/service.py": ["backend/app/api.py"],
        "backend/app/core.py": ["backend/app/service.py", "backend/app/cli.py"],
    }
    modules = sorted({*deps, *(s for v in deps.values() for s in v), "backend/app/worker.py"})
    return GraphFacts.from_snapshot({"graph": {"modules": modules, "dependencies": deps}})


def test_direct_indirect_and_unsupported_claims():
    answer = (
        "The request enters at backend/app/api.py, which imports backend/app/service.py. "
        "Ultimately backend/app/api.py depends on backend/app/core.py for the rules. "
        "Background jobs in backend/app/worker.py call backend/app/core.py directly."
    )
    out = ground_answer(_facts(), answer)
    verdicts = [(c["source"], c["target"], c["verdict"]) for c in out["claims"]]
    assert verdicts == [
        ("backend/app/api.py", "backend/app/service.py", "direct"),
        ("backend/app/api.py", "backend/app/core.py", "indirect"),
        ("backend/app/worker.py", "backend/app/core.py", "unsupported"),
    ]
    assert out["summary"]["unsupported_claims"] == 1
    assert out["unknown_paths"] == []


def test_invented_files_are_flagged_and_partial_paths_resolve():
    answer = "Auth lives in app/auth/jwt_helpers.py and the rules are in app/core.py."
    out = ground_answer(_facts(), answer)
    assert out["unknown_paths"] == ["app/auth/jwt_helpers.py"]
    assert out["known_paths"] == ["backend/app/core.py"]


def test_prose_without_structure_is_not_scored():
    out = ground_answer(_facts(), "Use descriptive names and keep functions small.")
    assert out["claims"] == [] and out["summary"]["score"] is None


def test_ambiguous_basename_is_not_guessed():
    deps = {"a/util.py": ["a/x.py"], "b/util.py": ["b/y.py"]}
    facts = GraphFacts.from_snapshot({"graph": {"modules": sorted({*deps, "a/x.py", "b/y.py"}), "dependencies": deps}})
    out = ground_answer(facts, "util.py imports stuff")
    assert out["unknown_paths"] == ["util.py"]


def test_ground_for_index_uses_snapshot_when_cache_is_gone(monkeypatch):
    from app.services import repo_context
    from app.services.architecture_store import architecture_store

    async def fake_get(self, index_id):
        return {"repo_url": "https://github.com/acme/ground", "branch": "main"}

    monkeypatch.setattr(repo_context.RepoContextService, "get", fake_get)
    snap = {"graph": {"modules": ["x/a.py", "x/b.py"], "dependencies": {"x/b.py": ["x/a.py"]}}}
    asyncio.run(architecture_store.save(snap, repo_url="https://github.com/acme/ground", branch="main", commit="g1"))

    out = asyncio.run(ground_for_index("idx", "x/a.py imports x/b.py"))
    assert out["claims"][0]["verdict"] == "direct"


def test_ground_for_index_reports_unavailable(monkeypatch):
    from app.services import repo_context

    async def fake_get(self, index_id):
        return None

    monkeypatch.setattr(repo_context.RepoContextService, "get", fake_get)
    assert asyncio.run(ground_for_index("missing", "a.py imports b.py"))["available"] is False
