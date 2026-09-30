"""Comprehension map: graph-derived checks, fog state, knowledge decay, walkthroughs."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.comprehension_service import (
    MAX_FAILED_ATTEMPTS,
    GraphFacts,
    annotate_walkthrough,
    build_checks,
    build_map,
    grade_checks,
    pin_steps,
    team_overview,
)

API = "/api/v1"


def _snapshot(extra_importer_of_core: bool = False) -> dict:
    # app/api.py -> app/service.py -> app/core.py ; app/cli.py -> app/core.py
    deps = {
        "app/service.py": ["app/api.py"],
        "app/core.py": ["app/api.py", "app/service.py", "app/cli.py"],
        "app/api.py": ["tests/test_api.py"],
    }
    if extra_importer_of_core:
        deps["app/core.py"] = deps["app/core.py"] + ["app/worker.py"]
    modules = sorted({*deps, *(s for v in deps.values() for s in v), "app/orphan.py"})
    return {
        "commit": "c1",
        "built_at": "2026-09-30T00:00:00+00:00",
        "services": [{"name": "app", "files": [m for m in modules if m.startswith("app/")]}],
        "graph": {"modules": modules, "dependencies": deps, "node_files": {}},
    }


# ── Pure logic ──────────────────────────────────────────────────────────────


def test_facts_invert_dependency_dict_into_imports():
    f = GraphFacts.from_snapshot(_snapshot())
    assert f.imports["app/api.py"] == {"app/service.py", "app/core.py"}
    assert f.importers["app/core.py"] == {"app/api.py", "app/service.py", "app/cli.py"}
    assert f.imports["app/orphan.py"] == set()


def test_critical_path_ranks_hubs_and_skips_tests_and_orphans():
    crit = GraphFacts.from_snapshot(_snapshot()).critical_nodes()
    assert crit[0] == "app/core.py"
    assert "tests/test_api.py" not in crit
    assert "app/orphan.py" not in crit


def test_checks_hide_answer_and_grade_against_graph():
    f = GraphFacts.from_snapshot(_snapshot())
    qs = build_checks(f, "app/api.py", "u1")
    assert {q["kind"] for q in qs} == {"imports", "importers"}
    imports_q = next(q for q in qs if q["kind"] == "imports")
    assert set(imports_q["_answer"]) == {"app/service.py", "app/core.py"}
    assert set(imports_q["_answer"]) <= set(imports_q["options"])

    answers = {q["id"]: q["_answer"] for q in qs}
    assert grade_checks(f, "app/api.py", "u1", answers)["passed"] is True

    wrong = {**answers, imports_q["id"]: ["app/service.py"]}
    graded = grade_checks(f, "app/api.py", "u1", wrong)
    assert graded["passed"] is False
    miss = next(r for r in graded["results"] if r["id"] == imports_q["id"])
    assert miss["answer"] is None  # key not leaked on a wrong answer


def test_checks_are_deterministic_per_user():
    f = GraphFacts.from_snapshot(_snapshot())
    assert build_checks(f, "app/core.py", "u1") == build_checks(f, "app/core.py", "u1")


def test_node_without_edges_has_no_checks():
    f = GraphFacts.from_snapshot(_snapshot())
    assert build_checks(f, "app/orphan.py", "u1") == []
    assert grade_checks(f, "app/orphan.py", "u1", {})["passed"] is False


def test_lit_node_decays_to_changed_when_neighbourhood_moves():
    before = GraphFacts.from_snapshot(_snapshot())
    state = {"lit": {"app/core.py": {"source": "check", "fingerprint": before.fingerprint("app/core.py")}}}
    assert next(n for n in build_map(before, state)["nodes"] if n["id"] == "app/core.py")["state"] == "lit"

    after = GraphFacts.from_snapshot(_snapshot(extra_importer_of_core=True))
    m = build_map(after, state)
    assert next(n for n in m["nodes"] if n["id"] == "app/core.py")["state"] == "changed"
    assert m["progress"]["changed"] == 1
    assert m["progress"]["critical_lit"] == 0


def test_walkthrough_steps_flag_stale_and_removed():
    before = GraphFacts.from_snapshot(_snapshot())
    steps, unknown = pin_steps(before, [{"node": "app/core.py"}, {"node": "app/api.py"}, {"node": "nope.py"}])
    assert unknown == ["nope.py"]
    after = GraphFacts.from_snapshot(_snapshot(extra_importer_of_core=True))
    annotated = annotate_walkthrough(after, {"steps": steps})
    statuses = {s["node"]: s["status"] for s in annotated["steps"]}
    assert statuses == {"app/core.py": "changed", "app/api.py": "fresh"}
    assert annotated["stale"] is True


def test_team_overview_ranks_stuck_nodes():
    f = GraphFacts.from_snapshot(_snapshot())
    states = [
        {"uid": "a", "lit": {}, "attempts": {"app/core.py": {"total_fails": 2}}},
        {"uid": "b", "lit": {}, "attempts": {"app/core.py": {"total_fails": 1}, "app/cli.py": {"total_fails": 1}}},
    ]
    view = team_overview(f, states, {"a": "Ann", "b": "Bo"})
    assert view["stuck"][0] == {"node": "app/core.py", "failed_checks": 3, "developers": 2, "critical": True}
    assert {m["name"] for m in view["members"]} == {"Ann", "Bo"}


# ── API ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def env(monkeypatch):
    """Seed a tracked repo + snapshot and return a client factory per role."""
    import asyncio

    from app.api.v1 import comprehension
    from app.services import team_service
    from app.services.architecture_store import architecture_store
    from app.services.postgres_db import get_storage

    suffix = uuid.uuid4().hex[:8]
    owner, name, team = f"acme{suffix}", "shop", f"team-{suffix}"
    repo_url = f"https://github.com/{owner}/{name}"

    async def seed():
        await get_storage().create_document(
            "repositories", f"repo-{suffix}",
            {"id": f"repo-{suffix}", "owner": owner, "name": name, "team_id": team, "url": repo_url},
        )
        await architecture_store.save(_snapshot(), repo_url=repo_url, branch="main", commit=f"c-{suffix}")

    asyncio.run(seed())

    roles = {"junior": "junior_dev", "senior": "senior_dev", "outsider": None}

    async def fake_teams(uid):
        role = roles.get(uid.split("-")[0])
        return [{"id": team, "team_id": team, "role": role}] if role else []

    monkeypatch.setattr(team_service, "get_user_teams", fake_teams)

    async def fake_members(team_id):
        return [{"id": f"junior-{suffix}", "name": "June"}, {"id": f"senior-{suffix}", "name": "Sam"}]

    monkeypatch.setattr(team_service, "get_team_members", fake_members)

    def client(who: str) -> TestClient:
        app = FastAPI()

        @app.middleware("http")
        async def _user(request, call_next):
            request.state.user = {"uid": f"{who}-{suffix}", "name": who.title()}
            return await call_next(request)

        app.include_router(comprehension.router, prefix=API)
        return TestClient(app)

    return {
        "client": client, "base": f"{API}/comprehension/{owner}/{name}", "suffix": suffix,
        "owner": owner, "name": name, "team": team,
    }


def test_map_starts_fogged_and_hides_answer_key(env):
    c = env["client"]("junior")
    m = c.get(f"{env['base']}/map").json()
    assert m["progress"]["critical_lit"] == 0
    assert all(n["state"] == "fog" for n in m["nodes"])
    assert m["next_up"] in m["critical_path"]

    qs = c.get(f"{env['base']}/checks", params={"node": "app/api.py"}).json()["questions"]
    assert qs and all("_answer" not in q for q in qs)


def test_passing_checks_lights_node(env):
    c = env["client"]("junior")
    uid = f"junior-{env['suffix']}"
    f = GraphFacts.from_snapshot(_snapshot())
    answers = {q["id"]: q["_answer"] for q in build_checks(f, "app/core.py", uid)}
    r = c.post(f"{env['base']}/checks/grade", json={"node": "app/core.py", "answers": answers})
    assert r.status_code == 200 and r.json()["passed"] is True
    node = next(n for n in c.get(f"{env['base']}/map").json()["nodes"] if n["id"] == "app/core.py")
    assert node["state"] == "lit" and node["lit_source"] == "check"


def test_repeated_failures_lock_the_node(env):
    c = env["client"]("junior")
    for _ in range(MAX_FAILED_ATTEMPTS):
        r = c.post(f"{env['base']}/checks/grade", json={"node": "app/core.py", "answers": {}})
        assert r.status_code == 200 and r.json()["passed"] is False
    r = c.post(f"{env['base']}/checks/grade", json={"node": "app/core.py", "answers": {}})
    assert r.status_code == 429


def test_only_seniors_author_walkthroughs_and_completion_lights_steps(env):
    body = {"title": "Request path", "steps": [{"node": "app/api.py", "note": "Entry"}, {"node": "app/core.py"}]}
    junior, senior = env["client"]("junior"), env["client"]("senior")

    assert junior.post(f"{env['base']}/walkthroughs", json=body).status_code == 403
    bad = senior.post(f"{env['base']}/walkthroughs", json={**body, "steps": [{"node": "ghost.py"}]})
    assert bad.status_code == 422

    created = senior.post(f"{env['base']}/walkthroughs", json=body)
    assert created.status_code == 201
    wid = created.json()["id"]
    assert created.json()["stale"] is False

    listed = junior.get(f"{env['base']}/walkthroughs").json()
    assert [w["id"] for w in listed["walkthroughs"]] == [wid]
    assert listed["can_author"] is False
    assert "app/core.py" not in listed["coverage_gaps"]

    done = junior.post(f"{env['base']}/walkthroughs/{wid}/complete").json()
    assert sorted(done["lit"]) == ["app/api.py", "app/core.py"]
    states = {n["id"]: n["state"] for n in junior.get(f"{env['base']}/map").json()["nodes"]}
    assert states["app/api.py"] == "lit"

    team = senior.get(f"{env['base']}/team").json()
    assert any(m["name"] == "June" and m["overall_lit"] == 2 for m in team["members"])
    assert junior.get(f"{env['base']}/team").status_code == 403


def test_outsider_is_denied(env):
    assert env["client"]("outsider").get(f"{env['base']}/map").status_code == 403


# ── Blast radius, PR lighting, impact ───────────────────────────────────────

DIFF = """diff --git a/app/core.py b/app/core.py
index 1..2 100644
--- a/app/core.py
+++ b/app/core.py
@@ -1 +1 @@
-x
+y
diff --git a/README.md b/README.md
"""


def test_changed_files_and_dependents():
    from app.services.comprehension_service import changed_files_from_diff

    assert changed_files_from_diff(DIFF) == ["app/core.py", "README.md"]
    f = GraphFacts.from_snapshot(_snapshot())
    # core <- api, service, cli ; api <- tests/test_api.py (transitive)
    assert f.dependents(["app/core.py"]) == {"app/api.py", "app/service.py", "app/cli.py", "tests/test_api.py"}
    assert f.dependents(["app/orphan.py"]) == set()


def test_starter_issues_prefer_known_small_radius_and_sink_unknown():
    from app.services.comprehension_service import rank_starter_issues

    f = GraphFacts.from_snapshot(_snapshot())
    lit = {"app/cli.py": {"fingerprint": f.fingerprint("app/cli.py")}}
    issues = [
        {"number": 1, "title": "Refactor", "body": "no files named here"},
        {"number": 2, "title": "Bug in app/core.py", "body": ""},
        {"number": 3, "title": "Typo in cli.py help text", "body": ""},
    ]
    ranked = rank_starter_issues(f, issues, lit)
    assert [r["number"] for r in ranked] == [3, 2, 1]
    assert ranked[0]["known_modules"] == ["app/cli.py"] and ranked[0]["blast_radius"] == 0
    assert ranked[1]["touches_critical"] is True
    assert ranked[2]["blast_radius"] is None


def test_pr_impact_suggests_reviewers_who_understand_changed_code():
    from app.services.comprehension_service import pr_impact

    f = GraphFacts.from_snapshot(_snapshot())
    fp = f.fingerprint
    states = [
        {"uid": "a", "lit": {"app/core.py": {"fingerprint": fp("app/core.py")}}},
        {"uid": "b", "lit": {"app/api.py": {"fingerprint": fp("app/api.py")}}},
        {"uid": "c", "lit": {"app/core.py": {"fingerprint": "stale"}}},  # decayed: not a reviewer
        {"uid": "me", "lit": {"app/core.py": {"fingerprint": fp("app/core.py")}}},
    ]
    out = pr_impact(f, ["app/core.py", "docs/x.md"], states, {"a": "Ann", "b": "Bo"}, exclude_uid="me")
    assert out["changed_modules"] == ["app/core.py"]
    assert out["blast_radius"] == 4
    assert out["unmapped_files"] == ["docs/x.md"]
    assert [r["uid"] for r in out["reviewers"]] == ["a", "b"]
    assert out["knowledge_gaps"] == []
    assert pr_impact(f, ["app/cli.py"], states, {})["knowledge_gaps"] == ["app/cli.py"]


def test_merged_pr_lights_touched_modules_for_team_member(env, monkeypatch):
    import asyncio

    from app.api.v1 import webhook_handler
    from app.services.github_service import GitHubService
    from app.services.postgres_db import get_storage

    uid = f"junior-{env['suffix']}"
    login = f"gh-{env['suffix']}"

    async def seed():
        s = get_storage()
        await s.create_document("users", uid, {"id": uid, "github_username": login})
        await s.create_document("team_members", f"tm-{env['suffix']}", {"team_id": env["team"], "user_id": uid})

    asyncio.run(seed())

    async def fake_diff(self, repo_url, pr_number):
        return DIFF

    monkeypatch.setattr(GitHubService, "get_pr_diff", fake_diff)
    payload = {
        "repository": {"owner": {"login": env["owner"]}, "name": env["name"]},
        "pull_request": {"number": 7, "user": {"login": login}, "base": {"ref": "main"}},
    }
    assert asyncio.run(webhook_handler._light_comprehension_from_pr(payload)) == ["app/core.py"]

    node = next(n for n in env["client"]("junior").get(f"{env['base']}/map").json()["nodes"] if n["id"] == "app/core.py")
    assert node["state"] == "lit" and node["lit_source"] == "pr:7"

    # An author outside the repo's team lights nothing.
    stranger = {**payload, "pull_request": {**payload["pull_request"], "user": {"login": "nobody"}}}
    assert asyncio.run(webhook_handler._light_comprehension_from_pr(stranger)) == []


def test_impact_and_starter_issue_endpoints(env, monkeypatch):
    from app.services.github_service import GitHubService, Issue

    async def fake_issues(self, repo_url, labels=None, limit=20):
        return [Issue(1, 11, "Fix app/core.py edge case", "", "u", ["good first issue"], "open")]

    monkeypatch.setattr(GitHubService, "get_issues", fake_issues)
    c = env["client"]("junior")
    issues = c.get(f"{env['base']}/starter-issues").json()
    assert issues["issues"][0]["modules"] == ["app/core.py"]
    assert issues["labelled_good_first_issue"] is True

    impact = c.post(f"{env['base']}/impact", json={"nodes": ["app/service.py"]}).json()
    assert impact["affected_modules"] == ["app/api.py", "tests/test_api.py"]
    assert c.post(f"{env['base']}/impact", json={}).status_code == 422


def test_mcp_change_briefing_includes_senior_notes(env):
    import asyncio

    from app.services.mcp_server import MCPError, mcp_server

    senior = env["client"]("senior")
    senior.post(f"{env['base']}/walkthroughs", json={
        "title": "Core rules", "steps": [{"node": "app/core.py", "note": "Never import api from here."}],
    })
    user = {"uid": f"junior-{env['suffix']}"}
    out = asyncio.run(mcp_server.call_tool(user, "change_briefing", {
        "owner": env["owner"], "repo": env["name"], "files": ["app/core.py"],
    }))
    assert out["blast_radius"] == 4
    assert out["senior_notes"] == [{
        "module": "app/core.py", "walkthrough": "Core rules", "author": "Senior",
        "note": "Never import api from here.", "status": "fresh",
    }]
    with pytest.raises(MCPError):
        asyncio.run(mcp_server.call_tool(user, "change_briefing", {"owner": env["owner"], "repo": env["name"], "files": []}))


def test_team_overview_reports_bus_factor_on_critical_path():
    f = GraphFacts.from_snapshot(_snapshot())
    fp = f.fingerprint("app/core.py")
    states = [
        {"uid": "a", "lit": {"app/core.py": {"fingerprint": fp}}},
        {"uid": "b", "lit": {"app/core.py": {"fingerprint": "old"}}},  # decayed doesn't count
    ]
    view = team_overview(f, states, {"a": "Ann", "b": "Bo"})
    core = next(b for b in view["bus_factor"] if b["node"] == "app/core.py")
    assert core == {"node": "app/core.py", "count": 1, "understood_by": ["Ann"]}
    assert view["bus_factor"][0]["count"] == 0  # least-understood first


# ── Why / who layer ─────────────────────────────────────────────────────────

EVOLUTION = {
    "file_history": {
        "app/core.py": [
            {"sha": "b2", "author": "Ann", "date": "1700000200", "subject": "Split pricing rules (#42)"},
            {"sha": "a1", "author": "Bo", "date": "1700000100", "subject": "Initial core"},
        ],
        "app/api.py": [{"sha": "b2", "author": "Ann", "date": "1700000200", "subject": "Split pricing rules (#42)"}],
    },
    "decision_records": [
        {"path": "docs/adr/0003-pricing.md", "title": "Pricing lives in core", "mentions": ["app/core.py"], "excerpt": "Rules stay in app/core.py"},
        {"path": "docs/adr/0004-api.md", "title": "API", "mentions": ["app/api.py"], "excerpt": ""},
    ],
}


def test_module_context_separates_who_wrote_from_who_understands():
    from app.services.comprehension_service import module_context

    f = GraphFacts.from_snapshot(_snapshot())
    states = [{"uid": "c", "lit": {"app/core.py": {"fingerprint": f.fingerprint("app/core.py")}}}]
    walks = [{"id": "w", "title": "Tour", "author_name": "Sam", "steps": [{"node": "app/core.py", "note": "Hot path", "fingerprint": f.fingerprint("app/core.py")}]}]
    ctx = module_context(
        f, "app/core.py", EVOLUTION, states=states, names={"c": "Cy"}, walkthroughs=walks,
        repo_url="https://github.com/acme/shop",
    )
    assert ctx["who"]["wrote"] == [{"name": "Ann", "commits": 1}, {"name": "Bo", "commits": 1}]
    assert ctx["who"]["understands"] == ["Cy"] and ctx["who"]["bus_factor"] == 1
    assert ctx["why"]["history"][0]["pr_url"] == "https://github.com/acme/shop/pull/42"
    assert ctx["why"]["history"][1]["pr_number"] is None
    assert [d["title"] for d in ctx["why"]["decisions"]] == ["Pricing lives in core"]
    assert ctx["why"]["walkthrough_notes"][0]["status"] == "fresh"


def test_decision_records_scan(tmp_path):
    from app.services.repo_context import RepoContextService

    (tmp_path / "docs" / "adr").mkdir(parents=True)
    (tmp_path / "docs" / "adr" / "0001-cache.md").write_text(
        "# Use Redis for caching\n\nWe cache in `app/cache.py` and read via util.py.\n", encoding="utf-8"
    )
    (tmp_path / "README.md").write_text("# Readme mentions app/cache.py\n", encoding="utf-8")
    code = ["app/cache.py", "a/util.py", "b/util.py"]
    recs = RepoContextService.decision_records(str(tmp_path), code)
    assert recs == [{
        "path": "docs/adr/0001-cache.md",
        "title": "Use Redis for caching",
        "mentions": ["app/cache.py"],  # ambiguous util.py is not guessed
        "excerpt": "We cache in `app/cache.py` and read via util.py.",
    }]


def test_git_evolution_records_file_history(monkeypatch):
    import asyncio

    from app.services.repo_context import RepoContextService

    class Proc:
        def __init__(self, out):
            self.returncode = 0
            self._out = out.encode()

        async def communicate(self):
            return self._out, b""

    async def fake_exec(*args, **kwargs):
        joined = " ".join(args)
        if "@@%h" in joined:
            return Proc("@@b2|Ann|1700000200|Split rules (#42)\napp/core.py\napp/api.py\n\n@@a1|Bo|1700000100|Init\napp/core.py\n")
        return Proc("")

    monkeypatch.setattr("asyncio.create_subprocess_exec", fake_exec)
    evo = asyncio.run(RepoContextService.git_evolution("/tmp/x"))
    assert [c["sha"] for c in evo["file_history"]["app/core.py"]] == ["b2", "a1"]
    assert evo["file_history"]["app/api.py"][0]["subject"] == "Split rules (#42)"


def test_context_endpoint_reads_snapshot_evolution(env):
    import asyncio

    from app.services.architecture_store import architecture_store

    repo_url = f"https://github.com/{env['owner']}/{env['name']}"
    asyncio.run(architecture_store.save(
        _snapshot(), repo_url=repo_url, branch="main", commit=f"c2-{env['suffix']}", evolution=EVOLUTION,
    ))
    ctx = env["client"]("junior").get(f"{env['base']}/context", params={"node": "app/core.py"}).json()
    assert ctx["has_history"] is True
    assert ctx["why"]["decisions"][0]["path"] == "docs/adr/0003-pricing.md"
    assert ctx["who"]["wrote"][0]["name"] == "Ann"


def test_select_discussions_drops_bots_and_one_liners():
    from app.services.comprehension_service import select_discussions

    out = select_discussions([
        {"path": "app/core.py", "body": "LGTM", "user": {"login": "ann"}},
        {"path": "app/core.py", "body": "Coverage report: 91% of lines covered here", "user": {"login": "codecov[bot]"}},
        {"path": "app/core.py", "body": "Keep pricing here so the API stays thin; see ADR 3.", "user": {"login": "sam"}, "created_at": "2026-09-01"},
        {"path": "", "body": "A general comment without a file path attached", "user": {"login": "sam"}},
    ])
    assert list(out) == ["app/core.py"]
    assert [d["author"] for d in out["app/core.py"]] == ["sam"]


def test_merged_pr_review_discussion_feeds_module_context(env, monkeypatch):
    import asyncio

    from app.api.v1 import webhook_handler
    from app.services.github_service import GitHubService

    async def fake_comments(self, repo_url, pr_number, limit=100):
        return [{"path": "app/core.py", "body": "Rules must stay pure: no I/O in core, callers do I/O.", "user": {"login": "sam"}, "created_at": "2026-09-02T10:00:00Z", "line": 12}]

    async def fake_diff(self, repo_url, pr_number):
        return ""

    monkeypatch.setattr(GitHubService, "get_pr_review_comments", fake_comments)
    monkeypatch.setattr(GitHubService, "get_pr_diff", fake_diff)
    payload = {
        "repository": {"owner": {"login": env["owner"]}, "name": env["name"]},
        "pull_request": {"number": 9, "user": {"login": "someone"}, "base": {"ref": "main"}},
    }
    asyncio.run(webhook_handler._light_comprehension_from_pr(payload))
    asyncio.run(webhook_handler._light_comprehension_from_pr(payload))  # redelivery: no duplicate

    ctx = env["client"]("junior").get(f"{env['base']}/context", params={"node": "app/core.py"}).json()
    discussions = ctx["why"]["discussions"]
    assert len(discussions) == 1
    assert discussions[0]["author"] == "sam"
    assert discussions[0]["pr_url"] == f"https://github.com/{env['owner']}/{env['name']}/pull/9"
