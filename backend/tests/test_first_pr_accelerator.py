import pytest
from unittest.mock import patch, AsyncMock
from app.agents.first_pr_accelerator import FirstPRAccelerator


@pytest.mark.asyncio
async def test_find_beginner_issues():
    """Test finding beginner-friendly issues with mocked IssueService."""
    accelerator = FirstPRAccelerator(llm_client=None)

    mock_issues = [
        {
            "id": 1,
            "number": 1,
            "title": "Fix typo in README",
            "body": "There is a typo here",
            "url": "https://github.com/facebook/react/issues/1",
            "labels": ["good-first-issue"],
            "complexity_score": 2,
            "estimated_hours": 1.0,
        },
        {
            "id": 2,
            "number": 2,
            "title": "Refactor Button component",
            "body": "Clean up code style",
            "url": "https://github.com/facebook/react/issues/2",
            "labels": ["refactor"],
            "complexity_score": 7,
            "estimated_hours": 3.5,
        },
    ]

    with patch.object(accelerator.issue_service, 'get_beginner_issues', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_issues
        
        issues = await accelerator.find_issues(
            repo_url="https://github.com/facebook/react",
            user_level="junior"
        )

        assert isinstance(issues, list)
        # For junior user level, only complexity <= 4 is returned. So only the first mock issue.
        assert len(issues) == 1
        assert issues[0]["id"] == 1
