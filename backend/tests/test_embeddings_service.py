"""EmbeddingsService integration tests (memory storage backend)."""

import os
import re

import pytest

from app.services.embeddings_service import EmbeddingsService
from app.embeddings import EmbeddingProvider

_VOCAB = ["auth", "login", "token", "database", "cache", "user", "api", "test"]


class FakeEmbeddingRouter:
    """Deterministic bag-of-words router so tests don't hit the network."""

    is_available = True
    primary = EmbeddingProvider.OPENAI
    providers = {
        EmbeddingProvider.OPENAI: {"model": "text-embedding-3-small"},
    }

    @staticmethod
    def _embed(text: str):
        words = set(re.findall(r"\w+", text.lower()))
        return [1.0 if w in words else 0.0 for w in _VOCAB]

    async def embed(self, text):
        return self._embed(text), EmbeddingProvider.OPENAI, {
            "provider": "openai", "model": "text-embedding-3-small",
            "served": "openai/text-embedding-3-small", "price_usd": 0.02,
            "price_inr": 1.70,
        }

    async def embed_batch(self, texts):
        return [self._embed(t) for t in texts], EmbeddingProvider.OPENAI, {
            "provider": "openai", "model": "text-embedding-3-small",
            "served": "openai/text-embedding-3-small", "price_usd": 0.02,
            "price_inr": 1.70,
        }


@pytest.fixture
def repo_dir(tmp_path):
    (tmp_path / "auth.py").write_text(
        "def login(): return 'token'  # user authentication logic\n"
    )
    (tmp_path / "db.py").write_text(
        "def connect(): return 'database connection'\n"
    )
    return str(tmp_path)


class TestIndexAndSearch:
    async def test_index_stores_vectors_and_search_ranks(self, repo_dir):
        svc = EmbeddingsService(embeddings_router=FakeEmbeddingRouter())
        index_id = await svc.index_documents("idx1", repo_dir)

        rows = await svc.storage.list_embedding_chunks(index_id)
        assert rows, "expected vector chunks to be persisted"

        docs = await svc.search(index_id, "how does login and token auth work?")
        assert docs, "expected vector search to return documents"
        assert docs[0].filename == "auth.py"

    async def test_keyword_fallback_when_router_unavailable(self, repo_dir):
        class NoRouter:
            is_available = False

        svc = EmbeddingsService(embeddings_router=NoRouter())
        index_id = await svc.index_documents("idx2", repo_dir)
        # No vectors stored when the router is unavailable.
        assert await svc.storage.list_embedding_chunks(index_id) == []

        docs = await svc.search(index_id, "how does auth login work?")
        assert docs, "keyword fallback must still return documents"
        assert docs[0].filename in ("auth.py", "db.py")

    async def test_absent_index_returns_empty(self):
        svc = EmbeddingsService(embeddings_router=FakeEmbeddingRouter())
        assert await svc.search("missing", "anything") == []

    async def test_delete_index_removes_chunks(self, repo_dir):
        svc = EmbeddingsService(embeddings_router=FakeEmbeddingRouter())
        index_id = await svc.index_documents("idx3", repo_dir)
        assert await svc.storage.list_embedding_chunks(index_id)
        await svc.delete_index(index_id)
        assert await svc.storage.list_embedding_chunks(index_id) == []
