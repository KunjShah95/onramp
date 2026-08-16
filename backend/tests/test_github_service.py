"""Tests for GitHubService label helpers (ensure_labels / add_labels)."""

import asyncio

from app.services.github_service import GitHubService


class _FakeGH:
    """GitHubService with a recorded _gh_request — no network."""

    def __init__(self, existing_labels=None):
        self.service = GitHubService(token="fake-token")
        self.calls = []
        self.existing_labels = set(existing_labels or [])
        self.created_labels = []
        self.labeled = []

    def install(self):
        async def _gh_request(method, path, json_body=None):
            self.calls.append((method, path, json_body))
            if method == "GET" and "/labels?per_page=100" in path:
                return [{"name": name} for name in self.existing_labels]
            if method == "POST" and "/issues/" in path and path.endswith("/labels"):
                self.labeled.append(path.split("/issues/")[1].split("/labels")[0])
                return {"labels": json_body["labels"]}
            if method == "POST" and path.endswith("/labels"):
                self.created_labels.append(json_body["name"])
                return {"name": json_body["name"], "color": json_body["color"]}
            raise AssertionError(f"unexpected call: {method} {path}")

        self.service._gh_request = _gh_request  # type: ignore[assignment]
        return self.service


class TestEnsureLabels:
    def test_creates_only_missing_labels(self):
        gh = _FakeGH(existing_labels=["good-first-issue"])
        svc = gh.install()

        res = asyncio.run(svc.ensure_labels(
            "acme", "app",
            {"good-first-issue": "7057ff", "senior-review": "d4a72c"},
        ))

        assert res["created"] == ["senior-review"]
        assert res["existing"] == ["good-first-issue"]
        assert gh.created_labels == ["senior-review"]
        # Existing label was listed once, only the missing one POSTed.
        assert gh.calls[0][0] == "GET"
        assert gh.calls[0][1] == "/repos/acme/app/labels?per_page=100"
        assert gh.calls[1] == ("POST", "/repos/acme/app/labels",
                               {"name": "senior-review", "color": "d4a72c"})

    def test_color_normalized(self):
        gh = _FakeGH()
        svc = gh.install()
        asyncio.run(svc.ensure_labels("acme", "app", {"senior-review": "#d4a72c"}))
        assert gh.created_labels == ["senior-review"]
        assert gh.calls[1][2]["color"] == "d4a72c"

    def test_list_failure_is_non_fatal(self):
        gh = _FakeGH()
        svc = gh.install()

        async def _boom(method, path, json_body=None):
            raise RuntimeError("rate limited")
        svc._gh_request = _boom  # type: ignore[assignment]

        res = asyncio.run(svc.ensure_labels("acme", "app", {"senior-review": "d4a72c"}))
        assert res == {"created": [], "existing": []}


class TestAddLabels:
    def test_adds_labels_to_issue(self):
        gh = _FakeGH()
        svc = gh.install()
        ok = asyncio.run(svc.add_labels("acme", "app", 42, ["good-first-issue"]))
        assert ok is True
        assert gh.labeled == ["42"]
        assert gh.calls[0] == ("POST", "/repos/acme/app/issues/42/labels",
                               {"labels": ["good-first-issue"]})

    def test_empty_labels_short_circuits(self):
        gh = _FakeGH()
        svc = gh.install()
        ok = asyncio.run(svc.add_labels("acme", "app", 42, []))
        assert ok is True
        assert gh.calls == []

    def test_failure_is_non_fatal(self):
        gh = _FakeGH()
        svc = gh.install()

        async def _boom(method, path, json_body=None):
            raise RuntimeError("rate limited")
        svc._gh_request = _boom  # type: ignore[assignment]

        ok = asyncio.run(svc.add_labels("acme", "app", 42, ["senior-review"]))
        assert ok is False


class TestCloseIssue:
    """GitHubService.close_issue — PATCH state=closed (+ optional comment)."""

    @staticmethod
    def _install(closed_state="closed"):
        service = GitHubService(token="fake-token")
        calls = []

        async def _gh_request(method, path, json_body=None):
            calls.append((method, path, json_body))
            if method == "PATCH" and path.endswith("/issues/42"):
                return {"state": closed_state, "number": 42}
            raise AssertionError(f"unexpected call: {method} {path}")

        service._gh_request = _gh_request  # type: ignore[assignment]
        return service, calls

    def test_closes_issue(self):
        svc, calls = self._install()
        ok = asyncio.run(svc.close_issue("https://github.com/acme/app", 42))
        assert ok is True
        assert calls == [("PATCH", "/repos/acme/app/issues/42", {"state": "closed"})]

    def test_posts_comment_before_closing(self):
        svc, calls = self._install()
        ok = asyncio.run(svc.close_issue(
            "https://github.com/acme/app", 42, comment="Fixed and merged",
        ))
        assert ok is True
        assert calls[0] == ("POST", "/repos/acme/app/issues/42/comments",
                            {"body": "Fixed and merged"})
        assert calls[1] == ("PATCH", "/repos/acme/app/issues/42", {"state": "closed"})

    def test_already_closed_returns_true(self):
        svc, _ = self._install(closed_state="closed")
        ok = asyncio.run(svc.close_issue("https://github.com/acme/app", 42))
        assert ok is True

    def test_failure_is_non_fatal(self):
        svc, _ = self._install()

        async def _boom(method, path, json_body=None):
            raise RuntimeError("rate limited")
        svc._gh_request = _boom  # type: ignore[assignment]

        ok = asyncio.run(svc.close_issue("https://github.com/acme/app", 42))
        assert ok is False
