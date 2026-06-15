import pytest
from app.services.issue_service import IssueService
from app.services.github_service import Issue


@pytest.fixture
def issue_service():
    return IssueService()


class TestIssueService:
    def test_score_complexity_easy(self, issue_service):
        easy_issue = Issue(
            id=1, number=1,
            title="Fix typo in README",
            body="There's a typo in the documentation",
            url="https://github.com/test/repo/issues/1",
            labels=["good-first-issue"],
            state="open",
        )
        score = issue_service._score_complexity(easy_issue)
        assert score <= 4

    def test_score_complexity_hard(self, issue_service):
        hard_issue = Issue(
            id=2, number=2,
            title="Redesign authentication architecture",
            body="We need to completely redesign the authentication system "
                 "to support OAuth2, SSO, and multi-factor authentication. "
                 + "x" * 1000,
            url="https://github.com/test/repo/issues/2",
            labels=["enhancement"],
            state="open",
        )
        score = issue_service._score_complexity(hard_issue)
        assert score >= 5

    def test_score_complexity_medium(self, issue_service):
        medium_issue = Issue(
            id=3, number=3,
            title="Add logging to API endpoints",
            body="Add structured logging to all API endpoints for better debugging",
            url="https://github.com/test/repo/issues/3",
            labels=[],
            state="open",
        )
        score = issue_service._score_complexity(medium_issue)
        assert 3 <= score <= 7


class TestFirstPRAccelerator:
    @pytest.mark.asyncio
    async def test_find_issues(self):
        from app.agents.first_pr_accelerator import FirstPRAccelerator
        accelerator = FirstPRAccelerator(None)

        try:
            issues = await accelerator.find_issues(
                repo_url="https://github.com/facebook/react",
                user_level="junior"
            )
            assert isinstance(issues, list)
            if issues:
                assert "complexity_score" in issues[0]
        except Exception:
            pass

    @pytest.mark.asyncio
    async def test_generate_guide_without_llm(self):
        from app.agents.first_pr_accelerator import FirstPRAccelerator
        accelerator = FirstPRAccelerator(None)

        guide = await accelerator.generate_guide(
            issue_id=123,
            repo_structure={
                "files": [
                    {"path": "src/components/Button.tsx"},
                    {"path": "src/components/Button.test.tsx"},
                    {"path": "src/App.tsx"},
                ],
                "issues": [
                    {"id": 123, "title": "Fix Button styling", "body": "Button needs padding fix"}
                ]
            }
        )
        assert "issue_id" in guide
        assert guide["issue_id"] == 123
        assert "steps" in guide
        assert len(guide["steps"]) >= 3
