import os
import tempfile
import pytest
from app.services.embeddings_service import EmbeddingsService
from app.agents.repo_qa import RepoQA


@pytest.fixture
def sample_repo():
    tmpdir = tempfile.mkdtemp()
    files = {
        "auth.py": "def login(username, password):\n    pass\n\ndef logout():\n    pass\n\nclass AuthService:\n    def validate_token(self): pass\n",
        "api.py": "from auth import login\n\ndef handle_request(request):\n    return login(request.user, request.pass)\n",
        "README.md": "# My Project\n\nThis project handles authentication and API requests.\n",
        "config.py": "API_KEY = 'test'\nDATABASE_URL = 'sqlite:///test.db'\n",
    }
    for name, content in files.items():
        with open(os.path.join(tmpdir, name), "w") as f:
            f.write(content)
    return tmpdir


class TestEmbeddingsService:
    def setup_method(self):
        self.service = EmbeddingsService()

    @pytest.mark.asyncio
    async def test_index_and_search(self, sample_repo):
        index_id = "test_idx"
        await self.service.index_documents(index_id, sample_repo)
        results = await self.service.search(index_id, "login validate token")
        assert len(results) >= 1
        filenames = {r.filename for r in results}
        assert "auth.py" in filenames

    @pytest.mark.asyncio
    async def test_search_code_queries(self, sample_repo):
        index_id = "code_idx"
        await self.service.index_documents(index_id, sample_repo)
        results = await self.service.search(index_id, "login user")
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_search_no_results(self, sample_repo):
        index_id = "empty_test"
        await self.service.index_documents(index_id, sample_repo)
        results = await self.service.search(index_id, "nonexistent_keyword_xyz")
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_search_unknown_index(self):
        results = await self.service.search("unknown", "test")
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_search_with_multiple_tokens(self, sample_repo):
        index_id = "multi"
        await self.service.index_documents(index_id, sample_repo)
        results = await self.service.search(index_id, "database url sqlite")
        assert len(results) >= 1
        assert "config.py" in {r.filename for r in results}


class TestRepoQA:
    def setup_method(self):
        self.qa = RepoQA(None)

    @pytest.mark.asyncio
    async def test_index_repo(self, sample_repo):
        index_id = await self.qa.index_repo(sample_repo)
        assert index_id is not None
        assert len(index_id) > 0

    @pytest.mark.asyncio
    async def test_ask_without_llm(self, sample_repo):
        index_id = await self.qa.index_repo(sample_repo)
        answer = await self.qa.ask(index_id, "login validate")
        assert answer is not None
        assert len(answer) > 0
        assert "auth.py" in answer or "login" in answer

    @pytest.mark.asyncio
    async def test_ask_no_match(self, sample_repo):
        index_id = await self.qa.index_repo(sample_repo)
        answer = await self.qa.ask(index_id, "completely_unknown_topic_xyz")
        msg = "No relevant documents found"
        assert msg in answer

    @pytest.mark.asyncio
    async def test_index_and_ask_roundtrip(self, sample_repo):
        index_id = await self.qa.index_repo(sample_repo)
        # Verify documents were indexed by searching for known content
        results = await self.qa.embeddings.search(index_id, "login validate")
        assert len(results) >= 1
        filenames = {r.filename for r in results}
        assert "auth.py" in filenames
