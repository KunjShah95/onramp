import pytest
from app.agents.learning_path_generator import LearningPathGenerator


@pytest.fixture
def sample_repo():
    return {
        "files": [
            {"path": "src/auth/login.py", "language": "python"},
            {"path": "src/auth/register.py", "language": "python"},
            {"path": "src/api/routes.py", "language": "python"},
            {"path": "src/database/models.py", "language": "python"},
            {"path": "src/database/migrations.py", "language": "python"},
            {"path": "src/utils/helpers.py", "language": "python"},
            {"path": "src/config/settings.py", "language": "python"},
            {"path": "tests/test_auth.py", "language": "python"},
        ],
        "classes": [
            {"name": "AuthService", "file": "src/auth/login.py"},
            {"name": "Database", "file": "src/database/models.py"},
            {"name": "UserModel", "file": "src/database/models.py"},
            {"name": "Settings", "file": "src/config/settings.py"},
        ],
        "functions": [
            {"name": "login", "file": "src/auth/login.py"},
            {"name": "register", "file": "src/auth/register.py"},
            {"name": "handle_request", "file": "src/api/routes.py"},
            {"name": "connect", "file": "src/database/models.py"},
            {"name": "format_date", "file": "src/utils/helpers.py"},
        ],
        "imports": [
            {"module": "flask", "file": "src/api/routes.py"},
            {"module": "sqlalchemy", "file": "src/database/models.py"},
        ],
    }


class TestLearningPathGenerator:
    def setup_method(self):
        self.generator = LearningPathGenerator()

    @pytest.mark.asyncio
    async def test_generate_junior_path(self, sample_repo):
        result = await self.generator.execute(sample_repo, "junior")
        assert result["user_level"] == "junior"
        assert "path" in result
        assert len(result["path"]) >= 5
        assert result["total_estimated_hours"] > 0

    @pytest.mark.asyncio
    async def test_generate_mid_path(self, sample_repo):
        result = await self.generator.execute(sample_repo, "mid")
        assert result["user_level"] == "mid"
        assert len(result["path"]) >= 5

    @pytest.mark.asyncio
    async def test_path_module_structure(self, sample_repo):
        result = await self.generator.execute(sample_repo, "junior")
        for module in result["path"]:
            assert "order" in module
            assert "name" in module
            assert "files" in module
            assert "objectives" in module
            assert len(module.get("objectives", [])) >= 2
            assert "description" in module
            assert "time_hours" in module

    @pytest.mark.asyncio
    async def test_path_with_empty_repo(self):
        result = await self.generator.execute(
            {"files": [], "classes": [], "functions": [], "imports": []},
            "junior",
        )
        assert "path" in result
        assert len(result["path"]) >= 4

    @pytest.mark.asyncio
    async def test_different_levels_different_hours(self, sample_repo):
        junior = await self.generator.execute(sample_repo, "junior")
        mid = await self.generator.execute(sample_repo, "mid")
        senior = await self.generator.execute(sample_repo, "senior")
        assert junior["total_estimated_hours"] >= mid["total_estimated_hours"]
