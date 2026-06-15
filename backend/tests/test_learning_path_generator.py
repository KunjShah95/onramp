import pytest
from unittest.mock import patch, AsyncMock
from app.agents.learning_path_generator import LearningPathGenerator


@pytest.mark.asyncio
async def test_generate_learning_path():
    """Test generating a learning path."""
    with patch("app.agents.learning_path_generator.LLMRouter") as mock_llm_class:
        # Mock the LLMRouter instance and its json_chat method
        mock_llm_instance = AsyncMock()
        mock_llm_class.return_value = mock_llm_instance
        mock_llm_instance.json_chat = AsyncMock(return_value={
            "user_level": "junior",
            "total_estimated_hours": 20,
            "modules": [
                {
                    "order": 1,
                    "name": "Project Overview & Architecture",
                    "files": ["auth.py"],
                    "time_hours": 4,
                    "objectives": ["Understand project structure", "Learn tech stack"],
                    "description": "Get a high-level understanding of the project"
                },
                {
                    "order": 2,
                    "name": "Core Data Models & Types",
                    "files": ["database.py"],
                    "time_hours": 4,
                    "objectives": ["Understand data structures", "Learn type definitions"],
                    "description": "Deep dive into data models"
                }
            ]
        })

        generator = LearningPathGenerator()

        repo_structure = {
            "files": [
                {"path": "auth.py"},
                {"path": "api.py"},
                {"path": "database.py"},
            ],
            "classes": [
                {"name": "User"},
                {"name": "DatabaseConnection"},
            ],
            "functions": [
                {"name": "authenticate"},
                {"name": "fetch_data"},
            ],
        }

        result = await generator.execute(repo_structure, user_level="junior")

        assert result["user_level"] == "junior"
        assert "path" in result
        assert isinstance(result["path"], list)
        assert len(result["path"]) > 0
