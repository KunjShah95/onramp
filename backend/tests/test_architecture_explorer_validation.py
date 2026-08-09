"""Input validation for ArchitectureExplorer (features review item).

Malformed parameters must fail fast with a ValueError instead of surfacing
an obscure clone/parse error.
"""
import pytest

from app.agents.architecture_explorer import (
    ArchitectureExplorer,
    _is_valid_github_url,
    _validate_positive_int,
)


class TestValidatePositiveInt:
    def test_valid_values(self):
        assert _validate_positive_int(10, "files", 100) == 10
        assert _validate_positive_int("25", "nodes", 100) == 25
        assert _validate_positive_int(1, "x", 100) == 1

    @pytest.mark.parametrize("bad", [None, 0, -1, "abc", 1.5, True, "nan"])
    def test_rejects_bad_values(self, bad):
        with pytest.raises(ValueError):
            _validate_positive_int(bad, "files", 100)

    def test_rejects_above_maximum(self):
        with pytest.raises(ValueError, match="exceeds maximum"):
            _validate_positive_int(999_999, "files", 500_000)


class TestIsValidGithubUrl:
    @pytest.mark.parametrize(
        "url",
        [
            "https://github.com/owner/repo",
            "https://github.com/owner/repo.git",
            "https://www.github.com/owner/repo",
        ],
    )
    def test_accepts_github_https_urls(self, url):
        assert _is_valid_github_url(url) is True

    @pytest.mark.parametrize(
        "url",
        [
            "",
            "   ",
            None,
            "not a url",
            "ftp://github.com/owner/repo",
            "http://github.com/owner/repo",
            "https://gitlab.com/owner/repo",
            "https://github.com/",
        ],
    )
    def test_rejects_bad_urls(self, url):
        assert _is_valid_github_url(url) is False


class TestExecuteValidation:
    """execute() must reject bad params before any clone/parse work."""

    @pytest.fixture
    def agent(self, monkeypatch):
        agent = object.__new__(ArchitectureExplorer)
        return agent

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"repo_url": "", "branch": "main"},
            {"repo_url": None, "branch": "main"},
            {"repo_url": "https://gitlab.com/owner/repo", "branch": "main"},
        ],
    )
    async def test_rejects_bad_repo_url(self, agent, kwargs):
        with pytest.raises(ValueError, match="repository URL"):
            await agent.execute(**kwargs)

    async def test_rejects_missing_int_params(self, agent):
        with pytest.raises(ValueError):
            await agent.execute(
                repo_url="https://github.com/owner/repo", max_files=None
            )

    async def test_rejects_bad_branch(self, agent):
        with pytest.raises(ValueError, match="branch"):
            await agent.execute(
                repo_url="https://github.com/owner/repo", branch="  "
            )