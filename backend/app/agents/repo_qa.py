import logging
import hashlib
import random
from typing import Dict, Any
from app.agents.base_agent import BaseAgent
from app.services.embeddings_service import EmbeddingsService

logger = logging.getLogger(__name__)

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

    @staticmethod
    def _build_prompt(question: str, context: str, memory: str = "", mode: str = "normal") -> str:
        memory_block = f"{memory}\n\n" if memory else ""

        if mode == "roast":
            response_examples = [
                '"Oh look, another `data` variable. Very creative naming. Shakespeare would be proud."',
                '"This function is 200 lines long. It\'s not a function, it\'s a novel. Publish it."',
                '"Who wrote this? Was it you at 3 AM or was it an AI having a stroke?"',
                '"Missing semicolons? In this economy? Bold strategy, Cotton."',
                '"The test coverage here is like my gym attendance — technically non-zero but we all know the truth."',
                '"This code is so tightly coupled it needs couples therapy."',
            ]
            example = random.choice(response_examples)

            return (
                f"{memory_block}"
                f"You are 'Senior Dev Roast Bot' — the engineer who's seen it all, fixed it all, "
                f"and has zero patience for bad variable names. You answer coding questions with a "
                f"perfect 50/50 split of savage humor and legitimately good technical advice.\n\n"
                f"YOUR PERSONALITY:\n"
                f"- You've been doing this since before Docker was cool\n"
                f"- You call out bad practices but always explain WHY they're bad\n"
                f"- You use developer humor: inside jokes about frameworks, naming conventions, "
                f"  over-engineering, copy-pasta, premature optimization, and 'it works on my machine'\n"
                f"- You reference specific files and code patterns from the codebase in your roasts\n"
                f"- You're brutally honest but never actually mean — the code gets roasted, not the person\n"
                f"- You drop one-liners that would make Linus Torvalds nod approvingly\n"
                f"- End EVERY roast response with a genuinely helpful, actionable suggestion\n\n"
                f"ROAST TIERS (match intensity to code quality):\n"
                f"1. Light roast: Clean code with minor quirks → playful teasing\n"
                f"2. Medium roast: Messy but functional → pointed sarcasm with good advice\n"
                f"3. Dark roast: Technical debt galore → brutal honesty with a survival guide\n"
                f"4. Burnt offering: copy-paste galore → memes and tough love with a refactor plan\n\n"
                f"Example tone: {example}\n\n"
                f"Question from a developer: {question}\n\n"
                f"Relevant codebase files:\n{context}\n\n"
                "Answer with your signature blend of roast and wisdom. Reference specific files and line patterns."
            )

        return (
            f"{memory_block}"
            f"Based on this codebase, answer the question: {question}\n\n"
            f"Relevant files:\n{context}\n\n"
            "Provide a clear answer with file references where applicable."
        )

    async def ask(self, index_id: str, question: str, memory: str = "", mode: str = "normal") -> str:
        documents = await self.embeddings.search(index_id, question)

        if not documents:
            return "No relevant documents found in the indexed codebase."

        context_parts = []
        for doc in documents:
            context_parts.append(f"File: {doc.filename} ({doc.doc_type})\nContent:\n{doc.content[:1500]}\n")

        context = "\n---\n".join(context_parts)

        if self.llm:
            prompt = self._build_prompt(question, context, memory, mode)
            try:
                result = await self._call_claude(prompt)
                return result.strip()
            except Exception:
                logger.exception("LLM call failed for repo QA, using fallback")

        best_doc = documents[0]
        return (
            f"Based on {best_doc.filename}:\n\n"
            f"Relevant content from {best_doc.filename}:\n"
            f"{best_doc.content[:1000]}"
        )

    async def ask_stream(self, index_id: str, question: str, memory: str = "", mode: str = "normal"):
        """Stream an answer token-by-token (async generator)."""
        documents = await self.embeddings.search(index_id, question)

        if not documents:
            yield "No relevant documents found in the indexed codebase."
            return

        context_parts = [
            f"File: {doc.filename} ({doc.doc_type})\nContent:\n{doc.content[:1500]}\n"
            for doc in documents
        ]
        context = "\n---\n".join(context_parts)

        if self.llm and hasattr(self.llm, "chat_stream"):
            prompt = self._build_prompt(question, context, memory, mode)
            try:
                async for token in self.llm.chat_stream(prompt):
                    yield token
                return
            except Exception:
                logger.exception("LLM stream failed for repo QA, using fallback")

        best_doc = documents[0]
        yield (
            f"Based on {best_doc.filename}:\n\n"
            f"Relevant content from {best_doc.filename}:\n"
            f"{best_doc.content[:1000]}"
        )
