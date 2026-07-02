import os
import hashlib
import logging
from typing import Dict, List, Optional
from pathlib import Path
from app.services.postgres_db import get_storage, generate_id

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
    COLLECTION_INDEXES = "codeflow_embeddings"
    COLLECTION_DOCS = "codeflow_documents"

    SUPPORTED_EXTS = {
        ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java",
        ".md", ".rst", ".txt", ".yaml", ".yml", ".toml", ".json",
        ".css", ".scss", ".html", ".sql",
    }
    IGNORE_DIRS = {"node_modules", "__pycache__", ".git", "venv", "dist", "build", ".next", "vendor", ".tox", "target", "egg-info"}

    def __init__(self):
        self.storage = get_storage()

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

        # Persist each document in a subcollection pattern: codeflow_embeddings/{index_id}/docs/{doc_id}
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

        return index_id

    async def search(self, index_id: str, query: str, top_k: int = 5) -> List[Document]:
        """Search indexed documents by keyword matching."""
        doc_collection = f"{self.COLLECTION_INDEXES}/{index_id}/docs"
        raw_docs = await self.storage.list_documents(doc_collection)

        if not raw_docs:
            return []

        # Rehydrate Document objects
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
        doc_collection = f"{self.COLLECTION_INDEXES}/{index_id}/docs"
        raw_docs = await self.storage.list_documents(doc_collection)
        for raw in raw_docs:
            await self.storage.delete_document(doc_collection, raw.get("id", raw.get("doc_id", "")))
        await self.storage.delete_document(self.COLLECTION_INDEXES, index_id)
