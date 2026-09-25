"""IDE workspace service + orchestrator propose/PR behaviour, against a fake GitHub."""
import base64

import pytest

from app.services import repo_ide_service as svc
from app.services.repo_ide_service import IdeError, RepoIde, safe_path


class FakeGitHub:
    """Records calls; answers the Git Data API like GitHub would."""

    def __init__(self, branches=None):
        self.branches = dict(branches or {"main": "base-sha"})
        self.calls = []
        self.pulls = []

    async def __call__(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == "GET" and path.startswith("/git/ref/heads/"):
            name = path.split("/git/ref/heads/", 1)[1]
            if name not in self.branches:
                raise IdeError("GitHub 404: Not Found", 404)
            return {"object": {"sha": self.branches[name]}}
        if method == "GET" and path.startswith("/git/commits/"):
            return {"tree": {"sha": "tree-of-" + path.rsplit("/", 1)[1]}}
        if method == "GET" and path.startswith("/git/trees/"):
            return {"truncated": False, "tree": [
                {"path": "src", "type": "tree"},
                {"path": "src/app.py", "type": "blob", "size": 12},
                {"path": "sub", "type": "commit"},
            ]}
        if method == "GET" and path.startswith("/contents/"):
            name = path.split("?")[0]
            if name.endswith(".png"):
                return {"type": "file", "size": 4, "encoding": "base64", "content": base64.b64encode(b"\x89PNG\x00").decode()}
            return {"type": "file", "size": 11, "encoding": "base64", "content": base64.b64encode(b"print('hi')").decode()}
        if method == "POST" and path == "/git/blobs":
            return {"sha": "blob-" + str(len(self.calls))}
        if method == "POST" and path == "/git/trees":
            return {"sha": "new-tree"}
        if method == "POST" and path == "/git/commits":
            return {"sha": "new-commit"}
        if method == "POST" and path == "/git/refs":
            self.branches[body["ref"].split("refs/heads/")[1]] = body["sha"]
            return {}
        if method == "PATCH" and path.startswith("/git/refs/heads/"):
            return {}
        if method == "POST" and path == "/pulls":
            if self.pulls:
                raise IdeError("GitHub 422: A pull request already exists", 502)
            self.pulls.append(body)
            return {"number": 7, "html_url": "https://github.com/o/r/pull/7"}
        if method == "GET" and path.startswith("/pulls?head="):
            return [{"number": 7, "html_url": "https://github.com/o/r/pull/7"}]
        raise AssertionError(f"unexpected {method} {path}")


@pytest.fixture
def ide(monkeypatch):
    fake = FakeGitHub()
    w = RepoIde("o", "r", "tok")
    monkeypatch.setattr(w, "_req", fake)
    return w, fake


@pytest.mark.parametrize("raw,expected", [
    ("src/app.py", "src/app.py"),
    ("./src//app.py", "src/app.py"),
    (".github/workflows/ci.yml", ".github/workflows/ci.yml"),
])
def test_safe_path_normalises(raw, expected):
    assert safe_path(raw) == expected


@pytest.mark.parametrize("raw", ["", "/etc/passwd", "../x", "a/../../b"])
def test_safe_path_rejects(raw):
    with pytest.raises(IdeError):
        safe_path(raw)


async def test_tree_maps_entries(ide):
    w, _ = ide
    t = await w.tree("main")
    assert t["sha"] == "base-sha"
    assert t["entries"] == [
        {"path": "src", "type": "dir", "size": None},
        {"path": "src/app.py", "type": "file", "size": 12},
    ]


async def test_file_text_and_binary(ide):
    w, _ = ide
    assert (await w.file("src/app.py", "main"))["content"] == "print('hi')"
    img = await w.file("logo.png", "main")
    assert img["binary"] is True and img["content"] == ""


async def test_commit_creates_new_branch_in_one_commit(ide):
    w, fake = ide
    res = await w.commit("main", "feature/x", "msg", [
        {"path": "src/app.py", "content": "print('bye')"},
        {"path": "old.txt", "content": None},
    ])
    assert res["branch"] == "feature/x" and res["commit_sha"] == "new-commit" and res["files"] == 2
    tree_call = next(c for c in fake.calls if c[1] == "/git/trees")
    items = tree_call[2]["tree"]
    assert tree_call[2]["base_tree"] == "tree-of-base-sha"
    assert items[1] == {"path": "old.txt", "mode": "100644", "type": "blob", "sha": None}
    commit_call = next(c for c in fake.calls if c[1] == "/git/commits")
    assert commit_call[2]["parents"] == ["base-sha"]
    assert fake.branches["feature/x"] == "new-commit"
    assert not any(c[0] == "PATCH" for c in fake.calls)


async def test_commit_fast_forwards_existing_branch(ide):
    w, fake = ide
    fake.branches["feature/x"] = "head-sha"
    await w.commit("main", "feature/x", "msg", [{"path": "a.txt", "content": "a"}])
    commit_call = next(c for c in fake.calls if c[1] == "/git/commits")
    assert commit_call[2]["parents"] == ["head-sha"]
    assert any(c[0] == "PATCH" and c[1] == "/git/refs/heads/feature/x" for c in fake.calls)


async def test_commit_validates_input(ide):
    w, _ = ide
    with pytest.raises(IdeError):
        await w.commit("main", "bad..branch", "m", [{"path": "a", "content": "x"}])
    with pytest.raises(IdeError):
        await w.commit("main", "ok", "m", [])
    with pytest.raises(IdeError):
        await w.commit("main", "ok", "m", [{"path": "../escape", "content": "x"}])


async def test_open_pr_reuses_existing(ide):
    w, _ = ide
    first = await w.open_pr("feature/x", "main", "t")
    again = await w.open_pr("feature/x", "main", "t")
    assert first == again == {"pr_number": 7, "pr_url": "https://github.com/o/r/pull/7"}


async def test_resolve_token_prefers_saved_integration(monkeypatch):
    from app.services import webhook_service

    async def cfg(uid, integration):
        return {"config": {"token": "user-token"}}

    monkeypatch.setattr(webhook_service, "get_integration_config", cfg)
    monkeypatch.setenv("GITHUB_TOKEN", "server-token")
    assert await svc.resolve_token({"uid": "u1"}) == "user-token"
    assert await svc.resolve_token({"uid": "api:key"}) == "server-token"


# ── Orchestrator: propose-only never writes; apply opens a PR ───────────────

class _Agent:
    def bind_session(self, *_):
        pass

    async def analyze(self, issue, code):
        from app.agents.issue_resolution_agent import AnalysisResult
        return AnalysisResult(root_cause="x", affected_entities=[], blast_radius="small", confidence=0.9)

    async def propose_fix(self, analysis, code):
        from app.agents.issue_resolution_agent import ProposedFix
        return [ProposedFix(file_path="src/app.py", search_string="hi", replace_string="bye", reasoning="greeting")]


class _Context:
    async def build(self, *a, **k):
        return {}

    async def select_context(self, **k):
        return {"context_text": "code"}


class _GitHub:
    def __init__(self):
        self.writes = []

    async def create_branch(self, *a):
        self.writes.append("branch")
        return a[-1]

    async def commit_to_branch(self, **k):
        self.writes.append("commit")
        return {"commit_sha": "c"}

    async def create_pr(self, owner, repo, head, base, title, body=""):
        self.writes.append("pr")
        return {"pr_number": 3, "pr_url": "https://github.com/o/r/pull/3"}


@pytest.fixture
def orch():
    from app.services.issue_orchestrator import IssueOrchestrator

    o = IssueOrchestrator.__new__(IssueOrchestrator)
    o.agent, o.context, o.github, o.llm = _Agent(), _Context(), _GitHub(), None
    return o


async def test_propose_only_does_not_touch_github(orch):
    res = await orch.resolve_issue("https://github.com/o/r", "fix greeting", apply=False)
    assert res["status"] == "proposed" and res["success"] is True
    assert res["fixes"][0]["file_path"] == "src/app.py"
    assert orch.github.writes == []


async def test_apply_opens_pr_and_reports_success(orch):
    res = await orch.resolve_issue("https://github.com/o/r", "fix greeting")
    assert orch.github.writes == ["branch", "commit", "pr"]
    assert res["success"] is True and res["pr_number"] == 3 and res["files_changed"] == 1
    assert res["branch"].startswith("fix/issue-")


async def test_follows_github_redirect_for_moved_repos(monkeypatch):
    """Renamed/transferred repos answer 301 — must follow, not parse the redirect body."""
    import httpx

    def handler(request):
        if "/repos/old/name/" in str(request.url):
            return httpx.Response(301, headers={"Location": "https://api.github.com/repositories/1/git/ref/heads/main"},
                                  json={"message": "Moved Permanently"})
        return httpx.Response(200, json={"object": {"sha": "moved-sha"}})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    assert await RepoIde("old", "name", None).branch_sha("main") == "moved-sha"


async def test_network_error_becomes_ide_error(monkeypatch):
    import httpx

    def handler(request):
        raise httpx.ConnectError("down")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(svc.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    with pytest.raises(IdeError) as exc:
        await RepoIde("o", "r", None).branch_sha("main")
    assert exc.value.status == 502
