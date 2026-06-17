"""
Conversation memory for the Ask feature.

Persists Q&A turns per (user, index) and retrieves relevant past turns so the
assistant has memory of the conversation (lightweight RAG via keyword scoring,
matching the existing EmbeddingsService approach).
"""

from datetime import datetime, timezone
from typing import List, Dict, Any
from app.services.postgres_db import get_storage, generate_id


class ConversationService:
    COLLECTION = "codeflow_conversations"

    def __init__(self):
        self.storage = get_storage()

    async def add_turn(self, user_id: str, index_id: str, question: str, answer: str) -> Dict[str, Any]:
        turn = {
            "user_id": user_id,
            "index_id": index_id,
            "question": question,
            "answer": answer,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return await self.storage.create_document(self.COLLECTION, generate_id(), turn)

    async def _all_turns(self, user_id: str, index_id: str) -> List[dict]:
        return await self.storage.query_documents(
            self.COLLECTION,
            [("user_id", "==", user_id), ("index_id", "==", index_id)],
        )

    async def get_history(self, user_id: str, index_id: str, limit: int = 10) -> List[dict]:
        """Most recent turns, oldest-first."""
        turns = await self._all_turns(user_id, index_id)
        turns.sort(key=lambda t: t.get("created_at", ""))
        return turns[-limit:]

    async def get_relevant(self, user_id: str, index_id: str, query: str, top_k: int = 3) -> List[dict]:
        """Past turns most relevant to `query` (keyword overlap scoring)."""
        turns = await self._all_turns(user_id, index_id)
        if not turns:
            return []
        tokens = [t for t in query.lower().split() if len(t) > 2]
        scored = []
        for turn in turns:
            blob = f"{turn.get('question', '')} {turn.get('answer', '')}".lower()
            score = sum(blob.count(tok) for tok in tokens)
            if score > 0:
                scored.append((score, turn))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in scored[:top_k]]

    async def clear(self, user_id: str, index_id: str) -> int:
        turns = await self._all_turns(user_id, index_id)
        for turn in turns:
            await self.storage.delete_document(self.COLLECTION, turn["id"])
        return len(turns)

    @staticmethod
    def format_memory(turns: List[dict]) -> str:
        """Render past turns as a prompt-ready memory block."""
        if not turns:
            return ""
        lines = ["Previous conversation (for context):"]
        for t in turns:
            lines.append(f"Q: {t.get('question', '')}\nA: {t.get('answer', '')[:500]}")
        return "\n".join(lines)
