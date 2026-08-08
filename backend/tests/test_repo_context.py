"""Tests for the repo-context index (parse-once) + requirement selection.

Covers the parse-once pipeline (Stage 1), requirement-driven slicing
(Stage 2) and token-budget enforcement (Stage 4) without any network I/O:
the clone/parse step is monkeypatched to return a fixed fixture.
"""

import pytest

from app.services.repo_context import (
    RepoContextService,
    index_id_for,
    select_context,
)

# ── Fixtures ────────────────────────────────────────────────────────────

SAMPLE_ENTITIES = {
    "files": [
        {
            "path": "src/auth/login.py",
            "language": "python",
            "classes": [{"name": "LoginHandler"}],
            "functions": [{"name": "validate_credentials"}],
            "imports": ["flask"],
            "exports": [],
            "dependencies": ["flask"],
        },
        {
            "path": "src/auth/token.py",
            "language": "python",
            "classes": [{"name": "TokenService"}],
            "functions": [{"name": "issue_token"}],
            "imports": ["jwt"],
            "exports": [],
            "dependencies": ["jwt"],
        },
        {
            "path": "src/db/models.py",
            "language": "python",
            "classes": [{"name": "User"}],
            "functions": [{"name": "get_user_by_email"}],
            "imports": ["sqlalchemy"],
            "exports": [],
            "dependencies": ["sqlalchemy"],
        },
        {
            "path": "src/ui/dashboard.py",
            "language": "python",
            "classes": [{"name": "DashboardView"}],
            "functions": [{"name": "render_chart"}],
            "imports": ["chartlib"],
            "exports": [],
            "dependencies": ["chartlib"],
        },
    ],
    "classes": [
        {"name": "LoginHandler", "file": "src/auth/login.py", "language": "python"},
        {"name": "TokenService", "file": "src/auth/token.py", "language": "python"},
        {"name": "User", "file": "src/db/models.py", "language": "python"},
        {"name": "DashboardView", "file": "src/ui/dashboard.py", "language": "python"},
    ],
    "functions": [
        {"name": "validate_credentials", "file": "src/auth/login.py", "language": "python"},
        {"name": "issue_token", "file": "src/auth/token.py", "language": "python"},
        {"name": "get_user_by_email", "file": "src/db/models.py", "language": "python"},
        {"name": "render_chart", "file": "src/ui/dashboard.py", "language": "python"},
    ],
    "imports": [
        {"module": "flask", "file": "src/auth/login.py", "language": "python"},
        {"module": "jwt", "file": "src/auth/token.py", "language": "python"},
        {"module": "sqlalchemy", "file": "src/db/models.py", "language": "python"},
        {"module": "chartlib", "file": "src/ui/dashboard.py", "language": "python"},
    ],
    "exports": [],
    "module_map": {
        "login": "src/auth/login.py",
        "token": "src/auth/token.py",
        "models": "src/db/models.py",
        "dashboard": "src/ui/dashboard.py",
    },
}

SAMPLE_GRAPH = {
    "modules": ["src/auth/login.py", "src/auth/token.py", "src/db/models.py", "src/ui/dashboard.py"],
    "dependencies": {
        "src/auth/login.py": ["flask"],
        "src/auth/token.py": ["jwt"],
    },
    "topology": ["src/auth/login.py", "src/auth/token.py"],
    "circular_dependencies": [],
    "services": [{"name": "service_1", "files": ["src/auth/login.py"]}],
    "architecture_pattern": "monolith",
    "architecture_diagram": "graph TD",
    "is_collapsed": False,
}

SAMPLE_DOC = {
    "index_id": index_id_for("https://github.com/acme/app", "main"),
    "repo_url": "https://github.com/acme/app",
    "branch": "main",
    "commit": "abc123",
    "built_at": "2026-08-08T00:00:00+00:00",
    "cached": False,
    "stats": {"file_count": 4, "class_count": 4, "function_count": 4, "import_count": 4},
    "entities": SAMPLE_ENTITIES,
    "graph": SAMPLE_GRAPH,
}


@pytest.fixture(autouse=True)
def _clean_local_cache():
    """Reset the in-process cache between tests (Redis is unset in CI)."""
    import app.services.repo_context as rc

    rc._LOCAL_CACHE.clear()
    yield
    rc._LOCAL_CACHE.clear()


class TestIndexId:
    def test_stable_across_calls(self):
        a = index_id_for("https://github.com/acme/app", "main")
        b = index_id_for("https://github.com/acme/app", "main")
        assert a == b

    def test_differs_by_repo_and_branch(self):
        assert index_id_for("https://github.com/acme/app", "main") != index_id_for("https://github.com/acme/app", "dev")
        assert index_id_for("https://github.com/acme/app", "main") != index_id_for("https://github.com/acme/other", "main")

    def test_normalizes_trailing_slash(self):
        assert index_id_for("https://github.com/acme/app/") == index_id_for("https://github.com/acme/app")


class TestParseOnceBuild:
    @pytest.mark.asyncio
    async def test_build_persists_and_reuses_cache(self, monkeypatch):
        service = RepoContextService()
        calls = {"n": 0}

        async def fake_clone(self, url, branch="main"):
            calls["n"] += 1
            return "/tmp/fake_repo"

        async def fake_head(path):
            return "abc123"

        async def fake_parse(self, path, max_files=1000):
            return SAMPLE_ENTITIES

        monkeypatch.setattr("app.services.github_service.GitHubService.clone_repo", fake_clone)
        monkeypatch.setattr(RepoContextService, "_head_commit", staticmethod(fake_head))
        monkeypatch.setattr("app.services.parser_service.ParserService.parse_directory", fake_parse)

        # First build parses.
        doc1 = await service.build("https://github.com/acme/app", "main")
        assert doc1["cached"] is False
        assert doc1["stats"]["file_count"] == 4
        assert calls["n"] == 1

        # Second build is a cache hit — clone must NOT be called again.
        doc2 = await service.build("https://github.com/acme/app", "main")
        assert doc2["cached"] is True
        assert doc2["entities"]["files"][0]["path"] == "src/auth/login.py"
        assert calls["n"] == 1

        # force=True re-parses.
        doc3 = await service.build("https://github.com/acme/app", "main", force=True)
        assert doc3["cached"] is False
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_evict_removes_cache(self, monkeypatch):
        service = RepoContextService()

        async def fake_clone(self, url, branch="main"):
            return "/tmp/fake_repo"

        async def fake_head(path):
            return "abc123"

        async def fake_parse(self, path, max_files=1000):
            return SAMPLE_ENTITIES

        monkeypatch.setattr("app.services.github_service.GitHubService.clone_repo", fake_clone)
        monkeypatch.setattr(RepoContextService, "_head_commit", staticmethod(fake_head))
        monkeypatch.setattr("app.services.parser_service.ParserService.parse_directory", fake_parse)

        idx = index_id_for("https://github.com/acme/app", "main")
        await service.build("https://github.com/acme/app", "main")
        assert await service.get(idx) is not None
        assert await service.evict(idx) is True
        assert await service.get(idx) is None
        assert await service.evict(idx) is False

    @pytest.mark.asyncio
    async def test_get_missing_returns_none(self):
        service = RepoContextService()
        assert await service.get("does-not-exist") is None

    @pytest.mark.asyncio
    async def test_build_embeds_evolution_metadata(self, monkeypatch):
        """The index doc carries git-evolution signals (evolution layer)."""
        service = RepoContextService()

        async def fake_clone(self, url, branch="main"):
            return "/tmp/fake_repo"

        async def fake_head(path):
            return "abc123"

        async def fake_parse(self, path, max_files=1000):
            return SAMPLE_ENTITIES

        async def fake_evolution(path):
            return {
                "commit_count": 3,
                "recent_commits": [{"sha": "abc", "author": "Kunj"}],
                "top_contributors": ["Kunj"],
                "file_ownership": {"src/auth/login.py": {"changes": 5, "top_author": "Kunj", "authors": ["Kunj"]}},
                "head_changed_files": ["src/auth/login.py"],
            }

        monkeypatch.setattr("app.services.github_service.GitHubService.clone_repo", fake_clone)
        monkeypatch.setattr(RepoContextService, "_head_commit", staticmethod(fake_head))
        monkeypatch.setattr("app.services.parser_service.ParserService.parse_directory", fake_parse)
        monkeypatch.setattr(RepoContextService, "git_evolution", staticmethod(fake_evolution))

        doc = await service.build("https://github.com/acme/app", "main")
        assert doc["evolution"]["commit_count"] == 3
        assert doc["evolution"]["file_ownership"]["src/auth/login.py"]["top_author"] == "Kunj"


class TestGitEvolution:
    """Parse of git log / shortlog output (subprocess mocked, no real repo)."""

    @staticmethod
    def _fake_proc(out: str):
        class _Proc:
            returncode = 0

            async def communicate(self):
                return out.encode(), b""
        return _Proc()

    @pytest.mark.asyncio
    async def test_parses_commits_and_ownership(self, monkeypatch):
        calls = []

        async def fake_exec(*args, **kwargs):
            calls.append(list(args))
            joined = " ".join(args)
            if "--pretty=format:%H|%an|%ae|%at|%s" in joined:
                return self._fake_proc(
                    "aa11|Kunj Shah|kunj@x.com|1700000000|fix auth\n"
                    "bb22|Varad|varad@x.com|1700000100|add payments\n"
                )
            if "diff-tree" in joined:
                return self._fake_proc("src/auth/login.py\nsrc/auth/token.py\n")
            if "--name-only" in joined:
                # Real `git log --pretty=format:%an --name-only` format:
                # author, its files, blank line, next author, its files...
                return self._fake_proc(
                    "Kunj Shah\n"
                    "src/auth/login.py\n"
                    "src/auth/token.py\n"
                    "\n"
                    "Varad\n"
                    "src/payments/api.py\n"
                )
            return self._fake_proc("")

        monkeypatch.setattr("asyncio.create_subprocess_exec", fake_exec)

        evo = await RepoContextService.git_evolution("/tmp/fake_repo")

        assert evo["commit_count"] == 2
        assert evo["recent_commits"][0]["sha"] == "aa11"
        assert evo["recent_commits"][0]["author"] == "Kunj Shah"
        assert evo["top_contributors"] == ["Kunj Shah", "Varad"]
        # Ownership: per-file change tallies + strongest author.
        assert evo["file_ownership"]["src/auth/login.py"]["changes"] == 1
        assert evo["file_ownership"]["src/auth/login.py"]["top_author"] == "Kunj Shah"
        assert evo["head_changed_files"] == ["src/auth/login.py", "src/auth/token.py"]

    @pytest.mark.asyncio
    async def test_handles_empty_git_output(self, monkeypatch):
        def fake_exec(*args, **kwargs):
            return self._fake_proc("")

        monkeypatch.setattr("asyncio.create_subprocess_exec", fake_exec)
        evo = await RepoContextService.git_evolution("/tmp/not_a_repo")
        assert evo["commit_count"] == 0
        assert evo["recent_commits"] == []
        assert evo["top_contributors"] == []
        assert evo["file_ownership"] == {}


class TestSelectContext:
    def test_selects_relevant_files(self):
        slice_doc = select_context(SAMPLE_DOC, "authentication login tokens", max_tokens=4000)
        selected = slice_doc["selected_files"]
        assert "src/auth/login.py" in selected
        assert "src/auth/token.py" in selected
        # Unrelated UI files are dropped.
        assert "src/ui/dashboard.py" not in selected

    def test_entities_filtered_to_selection(self):
        slice_doc = select_context(SAMPLE_DOC, "auth login", max_tokens=4000)
        paths = {f["path"] for f in slice_doc["entities"]["files"]}
        assert paths <= {"src/auth/login.py", "src/auth/token.py", "src/db/models.py", "src/ui/dashboard.py"}
        assert all(c["file"] in paths for c in slice_doc["entities"]["classes"])

    def test_context_text_respects_token_budget(self):
        # A small budget forces the renderer to drop files: with ~103 chars per
        # file and a ~340-char budget (100 tokens), not all 4 files fit.
        slice_doc = select_context(SAMPLE_DOC, "everything about the repo", max_tokens=100)
        text = slice_doc["context_text"]
        # budget_chars = 100 * 4 * 0.85 = 340
        assert len(text) <= 340
        assert slice_doc["truncated"] is True
        # The 4 files can't all fit in 340 chars, so at least one path is absent.
        rendered_paths = [p for p in ["src/auth/login.py", "src/auth/token.py", "src/db/models.py", "src/ui/dashboard.py"] if p in text]
        assert len(rendered_paths) < 4

    def test_falls_back_to_sample_when_nothing_matches(self):
        slice_doc = select_context(SAMPLE_DOC, "zzzz no matches here", max_tokens=4000)
        assert slice_doc["file_count"] >= 1  # representative sample, not empty
        assert slice_doc["selected_files"]

    def test_empty_entities_returns_empty_slice(self):
        doc = dict(SAMPLE_DOC, entities={"files": [], "classes": [], "functions": [], "imports": [], "exports": [], "module_map": {}})
        slice_doc = select_context(doc, "auth")
        assert slice_doc["file_count"] == 0
        assert slice_doc["context_text"] == ""

    def test_rendered_context_includes_paths_and_symbols(self):
        slice_doc = select_context(SAMPLE_DOC, "auth login", max_tokens=4000)
        text = slice_doc["context_text"]
        assert "src/auth/login.py" in text
        assert "LoginHandler" in text or "validate_credentials" in text

    def test_graph_filtered_to_selection(self):
        slice_doc = select_context(SAMPLE_DOC, "auth", max_tokens=4000)
        deps = slice_doc["graph"].get("dependencies", {})
        for node, preds in deps.items():
            assert node in slice_doc["selected_files"] or any(p in slice_doc["selected_files"] for p in preds)


class TestSelectEndpointBehavior:
    @pytest.mark.asyncio
    async def test_service_select_returns_none_for_missing_index(self):
        service = RepoContextService()
        assert await service.select_context("nope", "auth") is None
