import hashlib
from typing import Dict, Any
from app.agents.base_agent import BaseAgent
from app.services.embeddings_service import EmbeddingsService


class RepoQA(BaseAgent):
    def __init__(self, llm_client):
        super().__init__(llm_client)
        self.embeddings = EmbeddingsService()

    async def execute(self, **kwargs) -> Dict[str, Any]:
        return {"status": "ok"}

    async def index_repo(self, repo_path: str) -> str:
        index_id = hashlib.md5(repo_path.encode()).hexdigest()[:12]
        await self.embeddings.index_documents(index_id, repo_path)
        return index_id

    async def ask(self, index_id: str, question: str) -> str:
        documents = await self.embeddings.search(index_id, question)

        if not documents:
            return "No relevant documents found in the indexed codebase."

        context_parts = []
        for doc in documents:
            context_parts.append(f"File: {doc.filename} ({doc.doc_type})\nContent:\n{doc.content[:1500]}\n")

        context = "\n---\n".join(context_parts)

        if self.llm:
            prompt = (
                f"Based on this codebase, answer the question: {question}\n\n"
                f"Relevant files:\n{context}\n\n"
                "Provide a clear answer with file references where applicable."
            )
            try:
                result = await self._call_claude(prompt)
                return result.strip()
            except Exception:
                pass

        best_doc = documents[0]
        return (
            f"Based on {best_doc.filename}:\n\n"
            f"Relevant content from {best_doc.filename}:\n"
            f"{best_doc.content[:1000]}"
        )
