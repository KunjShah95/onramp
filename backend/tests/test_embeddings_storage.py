"""Storage-layer tests for pgvector embedding chunk methods (memory backend)."""

import pytest

from app.services.postgres_db import get_storage, cosine_similarity


class TestCosineSimilarity:
    def test_identical(self):
        assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)

    def test_orthogonal(self):
        assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)

    def test_length_mismatch_is_zero(self):
        assert cosine_similarity([1.0], [1.0, 2.0]) == 0.0

    def test_empty_is_zero(self):
        assert cosine_similarity([], []) == 0.0


class TestEmbeddingChunkStorage:
    async def test_save_search_list_delete(self, storage):
        await storage.save_embedding_chunks("idx1", [
            {
                "chunk_id": "c1", "filename": "a.py", "content": "auth token",
                "doc_type": "code", "vector": [1.0, 0.0],
                "embedding_model": "text-embedding-3-small", "embedding_dims": 2,
            },
            {
                "chunk_id": "c2", "filename": "b.py", "content": "database",
                "doc_type": "code", "vector": [0.0, 1.0],
                "embedding_model": "text-embedding-3-small", "embedding_dims": 2,
            },
        ])

        # Query vector closest to c1
        results = await storage.vector_search("idx1", [1.0, 0.1], top_k=2)
        assert results[0]["chunk_id"] == "c1"
        assert results[0]["similarity"] == pytest.approx(1.0, abs=0.01)
        assert results[1]["chunk_id"] == "c2"

        listed = await storage.list_embedding_chunks("idx1")
        assert len(listed) == 2

        deleted = await storage.delete_index_chunks("idx1")
        assert deleted == 2
        assert await storage.vector_search("idx1", [1.0, 0.1]) == []

    async def test_absent_index_returns_empty(self, storage):
        assert await storage.vector_search("missing", [1.0]) == []
        assert await storage.delete_index_chunks("missing") == 0
