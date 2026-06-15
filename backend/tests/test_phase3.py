import pytest
from app.agents.silent_pair_programming import SilentPairProgramming
from app.agents.pattern_recognition import PatternRecognition
from app.agents.regression_test_generator import RegressionTestGenerator


class TestSilentPairProgramming:
    def setup_method(self):
        self.agent = SilentPairProgramming(None)

    @pytest.mark.asyncio
    async def test_generate_walkthrough(self):
        result = await self.agent.generate_walkthrough(
            issue_title="Fix button loading state",
            issue_body="The button doesn't show loading indicator",
            repo_structure={
                "files": [
                    {"path": "src/components/Button.tsx"},
                    {"path": "src/components/Button.test.tsx"},
                ]
            },
        )
        assert "thought_process" in result
        assert "files_to_examine" in result
        assert "solution_steps" in result
        assert len(result["solution_steps"]) >= 3
        assert "key_insights" in result

    @pytest.mark.asyncio
    async def test_files_to_examine(self):
        result = await self.agent.generate_walkthrough(
            issue_title="Test",
            issue_body="Test body",
            repo_structure={
                "files": [{"path": f"src/mod{i}.py"} for i in range(10)]
            },
        )
        assert len(result["files_to_examine"]) <= 5

    @pytest.mark.asyncio
    async def test_basic_structure(self):
        result = await self.agent.generate_walkthrough(
            issue_title="", issue_body="", repo_structure={"files": []}
        )
        assert "testing_approach" in result


class TestPatternRecognition:
    def setup_method(self):
        self.agent = PatternRecognition(None)

    @pytest.mark.asyncio
    async def test_known_pattern(self):
        result = await self.agent.find_similar(
            pattern="authentication",
            repo_structure={"files": [{"path": "auth.py"}, {"path": "middleware.py"}]},
        )
        assert result["pattern"] == "authentication"
        assert len(result["similar_solutions"]) > 0
        assert "your_approach" in result

    @pytest.mark.asyncio
    async def test_unknown_pattern(self):
        result = await self.agent.find_similar(
            pattern="quantum_computing",
            repo_structure={"files": [{"path": "main.py"}]},
        )
        assert "pattern" in result

    @pytest.mark.asyncio
    async def test_detected_pattern(self):
        result = await self.agent.find_similar(
            pattern="testing",
            repo_structure={
                "files": [{"path": "tests/test_auth.py"}, {"path": "src/auth.py"}]
            },
        )
        assert result["pattern"] in ("testing", "authentication")


class TestRegressionTestGenerator:
    def setup_method(self):
        self.agent = RegressionTestGenerator(None)

    @pytest.mark.asyncio
    async def test_generate_from_diff(self):
        diff = "--- a/src/button.tsx\n+++ b/src/button.tsx\n@@ -10,5 +10,8 @@\n function Button() {\n-  return <button>Click</button>;\n+  return <button onClick={handleClick}>Click</button>;\n }"
        result = await self.agent.generate(
            pr_diff=diff,
            repo_structure={"files": [{"path": "src/button.tsx"}]},
        )
        assert "must_test" in result
        assert len(result["must_test"]) >= 1
        assert "edge_cases" in result
        assert len(result["edge_cases"]) >= 1

    @pytest.mark.asyncio
    async def test_empty_diff(self):
        result = await self.agent.generate(
            pr_diff="",
            repo_structure={"files": []},
        )
        assert "must_test" in result
        assert "test_code_template" in result

    @pytest.mark.asyncio
    async def test_multiple_files(self):
        diff = "--- a/src/a.py\n+++ b/src/a.py\n@@ -1 +1 @@\n-old\n+new\n--- a/src/b.py\n+++ b/src/b.py\n@@ -1 +1 @@\n-old\n+new"
        result = await self.agent.generate(
            pr_diff=diff,
            repo_structure={"files": [{"path": "src/a.py"}, {"path": "src/b.py"}]},
        )
        assert len(result["must_test"]) >= 3
