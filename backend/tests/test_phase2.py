import pytest
from app.agents.health_scorer import HealthScorer
from app.agents.onboarding_report_generator import OnboardingReportGenerator
from app.services.slack_service import SlackService
from app.services.contributor_tracker import ContributorTracker
from app.services.report_generator import ReportGenerator


class TestHealthScorer:
    def setup_method(self):
        self.scorer = HealthScorer(None)

    @pytest.mark.asyncio
    async def test_score_healthy_repo(self):
        result = await self.scorer.score({
            "files": [
                {"path": "main.py", "language": "python"},
                {"path": "test_main.py", "language": "python"},
                {"path": "README.md", "language": "markdown"},
                {"path": "auth.py", "language": "python"},
                {"path": "test_auth.py", "language": "python"},
            ],
            "classes": [{"name": "AuthService", "file": "auth.py"}],
            "functions": [{"name": "login", "file": "auth.py"}],
            "imports": [{"module": "flask", "file": "auth.py"}],
            "circular_dependencies": [],
        })
        assert result["overall_score"] > 0
        assert result["test_coverage"] >= 40
        assert "recommendations" in result
        assert len(result["recommendations"]) >= 0

    @pytest.mark.asyncio
    async def test_score_unhealthy_repo(self):
        result = await self.scorer.score({
            "files": [
                {"path": "main.py", "language": "python"},
                {"path": "auth.py", "language": "python"},
                {"path": "db.py", "language": "python"},
            ],
            "classes": [{"name": "AuthService", "file": "auth.py"}],
            "functions": [{"name": "login", "file": "auth.py"}, {"name": "connect", "file": "db.py"}, {"name": "handle", "file": "main.py"}],
            "imports": [{"module": "flask", "file": "auth.py"}, {"module": "sql", "file": "db.py"}, {"module": "os", "file": "main.py"}, {"module": "sys", "file": "main.py"}],
            "circular_dependencies": [["auth.py", "db.py", "auth.py"]],
        })
        assert "overall_score" in result
        assert result["test_files"] == 0
        assert len(result["recommendations"]) > 0

    @pytest.mark.asyncio
    async def test_avg_deps_affects_score(self):
        high_deps = await self.scorer.score({
            "files": [{"path": "f.py", "language": "python"} for _ in range(10)],
            "classes": [],
            "functions": [],
            "imports": [{"module": f"mod{i}", "file": "f.py"} for i in range(50)],
            "circular_dependencies": [],
        })
        assert high_deps["dependency_freshness"] < 80


class TestOnboardingReportGenerator:
    def setup_method(self):
        self.gen = OnboardingReportGenerator(None)

    @pytest.mark.asyncio
    async def test_generate_junior_report(self):
        result = await self.gen.generate("https://github.com/test/repo", "junior")
        assert result["repo"] == "https://github.com/test/repo"
        assert result["user_level"] == "junior"
        assert len(result["report"]) >= 5
        sections = [s["title"] for s in result["report"]]
        assert "Repository Overview" in sections
        assert "Learning Path" in sections
        assert "Estimated Onboarding Time" in sections

    @pytest.mark.asyncio
    async def test_generate_senior_less_time(self):
        junior = await self.gen.generate("https://github.com/test/repo", "junior")
        senior = await self.gen.generate("https://github.com/test/repo", "senior")
        j_summary = next(s for s in junior["report"] if s["type"] == "summary")
        s_summary = next(s for s in senior["report"] if s["type"] == "summary")
        assert s_summary["content"]["total_hours"] <= j_summary["content"]["total_hours"]


class TestSlackService:
    def test_format_issues(self):
        slack = SlackService()
        issues = [
            {"title": "Fix typo", "estimated_hours": 1.5, "url": "https://github.com/test/1", "complexity_score": 2},
            {"title": "Add tests", "estimated_hours": 2.0, "url": "https://github.com/test/2", "complexity_score": 3},
        ]
        msg = slack.format_good_first_issues(issues)
        assert "Fix typo" in msg
        assert "Add tests" in msg

    def test_format_empty_issues(self):
        slack = SlackService()
        msg = slack.format_good_first_issues([])
        assert "No good first issues" in msg

    def test_format_health_report(self):
        slack = SlackService()
        health = {"overall_score": 75, "test_coverage": 80, "maintainability": 7.2, "complexity": "medium", "recommendations": ["Add more tests"]}
        msg = slack.format_health_report("test/repo", health)
        assert "75" in msg
        assert "80%" in msg


class TestContributorTracker:
    def setup_method(self):
        self.tracker = ContributorTracker()

    @pytest.mark.asyncio
    async def test_track_first_commit(self):
        result = await self.tracker.track_event("push", {"sender": {"login": "alice"}, "repository": {"full_name": "test/repo"}})
        assert result["tracked"] is True
        assert result["milestone"] == "first_commit"

    @pytest.mark.asyncio
    async def test_track_duplicate(self):
        payload = {"sender": {"login": "alice"}, "repository": {"full_name": "test/repo"}}
        await self.tracker.track_event("push", payload)
        result = await self.tracker.track_event("push", payload)
        assert result["is_first"] is False

    @pytest.mark.asyncio
    async def test_get_user_milestones(self):
        await self.tracker.track_event("push", {"sender": {"login": "bob"}, "repository": {"full_name": "test/repo"}})
        await self.tracker.track_event("pull_request", {"sender": {"login": "bob"}, "repository": {"full_name": "test/repo"}})
        ms = await self.tracker.get_user_milestones("bob")
        assert len(ms) == 2

    @pytest.mark.asyncio
    async def test_summary(self):
        await self.tracker.track_event("push", {"sender": {"login": "charlie"}, "repository": {"full_name": "test/repo"}})
        summary = await self.tracker.get_milestone_summary()
        assert summary["total_milestones"] >= 1
        assert summary["unique_users"] >= 1


class TestReportGenerator:
    @pytest.mark.asyncio
    async def test_generate_html(self):
        gen = ReportGenerator()
        data = {
            "repo": "test/repo",
            "user_level": "junior",
            "report": [
                {"title": "Overview", "type": "overview", "content": {"repo": "test/repo", "user_level": "junior"}},
                {"title": "Modules", "type": "modules", "content": {"modules": [{"name": "Getting Started", "time": 2, "items": ["Clone repo"]}]}},
                {"title": "FAQ", "type": "faq", "content": {"questions": [{"q": "How?", "a": "Like this"}]}},
                {"title": "Summary", "type": "summary", "content": {"total_hours": 10, "difficulty": "junior"}},
            ],
        }
        html = await gen.generate_html(data)
        assert "<html>" in html
        assert "test/repo" in html
        assert "Getting Started" in html
        assert "Clone repo" in html
        assert "10 hours" in html
