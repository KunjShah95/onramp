import os
import hashlib
import logging
from typing import Dict, List, Optional
from pathlib import Path
from app.services.postgres_db import get_storage

logger = logging.getLogger(__name__)


class Document:
    def __init__(self, filename: str, content: str, doc_type: str = "code"):
        self.filename = filename
        self.content = content
        self.doc_type = doc_type
        self.id = hashlib.md5(f"{filename}:{content[:100]}".encode()).hexdigest()
        self.chunks = self._chunk_content(content)

    def _chunk_content(self, content: str, max_chars: int = 1500) -> List[str]:
        if len(content) <= max_chars:
            return [content]
        chunks = []
        lines = content.split("\n")
        current = []
        current_len = 0
        for line in lines:
            current.append(line)
            current_len += len(line) + 1
            if current_len >= max_chars:
                chunks.append("\n".join(current))
                current = []
                current_len = 0
        if current:
            chunks.append("\n".join(current))
        return chunks

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "content": self.content[:2000],
            "type": self.doc_type,
        }


class EmbeddingsService:
    COLLECTION_INDEXES = "onramp_embeddings"
    COLLECTION_DOCS = "onramp_documents"

    SUPPORTED_EXTS = {
        ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java",
        ".md", ".rst", ".txt", ".yaml", ".yml", ".toml", ".json",
        ".css", ".scss", ".html", ".sql",
    }
    IGNORE_DIRS = {"node_modules", "__pycache__", ".git", "venv", "dist", "build", ".next", "vendor", ".tox", "target", "egg-info"}

    def __init__(self, embeddings_router=None):
        self.storage = get_storage()
        from app.embeddings import EmbeddingRouter

        self.embeddings = embeddings_router or EmbeddingRouter()

    async def index_documents(self, index_id: str, repo_path: str) -> str:
        """Walk repo_path, parse files, and persist each file as a stored document."""
        documents = []

        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in self.IGNORE_DIRS]
            for fname in files:
                ext = Path(fname).suffix.lower()
                if ext not in self.SUPPORTED_EXTS:
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    if len(content.strip()) < 10:
                        continue
                    doc_type = "doc" if ext in {".md", ".rst", ".txt"} else "code"
                    doc = Document(
                        filename=os.path.relpath(fpath, repo_path),
                        content=content,
                        doc_type=doc_type,
                    )
                    documents.append(doc)
                except Exception:
                    logger.exception("Failed to process file %s", fpath)

        # Persist index metadata
        await self.storage.create_document(
            self.COLLECTION_INDEXES,
            index_id,
            {
                "index_id": index_id,
                "doc_count": len(documents),
                "created_at": None,  # will be set with real timestamp in production
            },
        )

        # Persist each document in a subcollection pattern: onramp_embeddings/{index_id}/docs/{doc_id}
        doc_collection = f"{self.COLLECTION_INDEXES}/{index_id}/docs"
        for doc in documents:
            await self.storage.create_document(
                doc_collection,
                doc.id,
                {
                    "doc_id": doc.id,
                    "filename": doc.filename,
                    "content": doc.content,
                    "type": doc.doc_type,
                },
            )

        # Persist vector chunks for semantic search (best-effort: a missing
        # embedding provider just means the index stays keyword-only).
        try:
            if getattr(self.embeddings, "is_available", False):
                chunks = []
                for doc in documents:
                    for i, chunk_text in enumerate(doc.chunks):
                        chunks.append({
                            "chunk_id": f"{doc.id}:{i}",
                            "filename": doc.filename,
                            "content": chunk_text,
                            "doc_type": doc.doc_type,
                        })
                vectors, provider, _route = await self.embeddings.embed_batch(
                    [c["content"] for c in chunks]
                )
                dims = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
                stored = 0
                for chunk, vector in zip(chunks, vectors):
                    if len(vector) != dims:
                        logger.warning(
                            "Skipping chunk %s: model returned %d dims, column expects %d",
                            chunk["chunk_id"], len(vector), dims,
                        )
                        continue
                    chunk["vector"] = vector
                    chunk["embedding_model"] = self.embeddings.providers[provider]["model"]
                    chunk["embedding_dims"] = len(vector)
                    stored += 1
                await self.storage.save_embedding_chunks(index_id, chunks)
                logger.info("Indexed %d vector chunks for %s", stored, index_id)
        except Exception:
            logger.exception("Embedding index failed for %s, keeping keyword-only", index_id)

        return index_id

    async def search(self, index_id: str, query: str, top_k: int = 5) -> List[Document]:
        """Search indexed documents — vector cosine first, keyword fallback."""
        # Vector tier: embed the query and ANN-search if the router is available.
        if getattr(self.embeddings, "is_available", False):
            try:
                query_vector, _provider, _route = await self.embeddings.embed(query)
                rows = await self.storage.vector_search(index_id, query_vector, top_k)
                threshold = float(os.getenv("EMBEDDINGS_MIN_SIMILARITY", "0.0"))
                docs = []
                for row in rows:
                    if row.get("similarity", 0.0) >= threshold:
                        docs.append(self._doc_from_row(row))
                if docs:
                    return docs
            except Exception:
                logger.exception("Vector search failed, falling back to keyword")

        # Keyword tier: existing lexical scoring.
        doc_collection = f"{self.COLLECTION_INDEXES}/{index_id}/docs"
        raw_docs = await self.storage.list_documents(doc_collection)

        if not raw_docs:
            return []

        documents = []
        for raw in raw_docs:
            doc = Document(
                filename=raw.get("filename", ""),
                content=raw.get("content", ""),
                doc_type=raw.get("type", "code"),
            )
            doc.id = raw.get("doc_id", raw.get("id", ""))
            documents.append(doc)

        query_lower = query.lower()
        query_tokens = [t for t in query_lower.split() if len(t) > 1]

        scored = []
        for doc in documents:
            score = self._score_document(doc, query_lower, query_tokens)
            scored.append((score, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored[:top_k] if score > 0]

    @staticmethod
    def _doc_from_row(row: dict) -> Document:
        """Rehydrate a Document from a vector-search row dict."""
        doc = Document(
            filename=row.get("filename", ""),
            content=row.get("content", ""),
            doc_type=row.get("doc_type", "code"),
        )
        doc.id = row.get("chunk_id", "")
        return doc

    def _score_document(self, doc: Document, query_lower: str, query_tokens: List[str]) -> float:
        score = 0.0
        name_lower = doc.filename.lower()
        content_lower = doc.content.lower()

        if query_lower in name_lower:
            score += 10.0

        for token in query_tokens:
            if token in name_lower:
                score += 5.0
            count = content_lower.count(token)
            if count > 0:
                score += min(count * 0.5, 10.0)

        if doc.doc_type == "doc":
            score *= 0.8

        for chunk in doc.chunks:
            chunk_lower = chunk.lower()
            if query_lower in chunk_lower:
                score += 8.0

        return score

    async def get_index_document(self, index_id: str, doc_id: str) -> Optional[dict]:
        """Retrieve a single indexed document by its doc_id."""
        doc_collection = f"{self.COLLECTION_INDEXES}/{index_id}/docs"
        return await self.storage.get_document(doc_collection, doc_id)

    async def delete_index(self, index_id: str) -> None:
        """Remove all documents and the index metadata."""
        try:
            await self.storage.delete_index_chunks(index_id)
        except Exception:
            logger.exception("Failed to delete embedding chunks for %s", index_id)
        doc_collection = f"{self.COLLECTION_INDEXES}/{index_id}/docs"
        raw_docs = await self.storage.list_documents(doc_collection)
        for raw in raw_docs:
            await self.storage.delete_document(doc_collection, raw.get("id", raw.get("doc_id", "")))
        await self.storage.delete_document(self.COLLECTION_INDEXES, index_id)
