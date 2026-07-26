"""
CodebaseTrailer — generates a fun, shareable "movie trailer" for a repository.

Given a repo URL (and optionally an existing architecture analysis), produces a
movie-trailer-style summary: a booming title, a tagline, a handful of dramatic
scenes, a "cast" of key modules, and a genre. Built on the shared LLM router
with a deterministic fallback so it never hard-fails.
"""

import logging
from typing import Any, Dict, Optional

from app.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class CodebaseTrailer(BaseAgent):
    async def execute(
        self, repo_url: str, analysis: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        return await self.generate(repo_url, analysis)

    async def generate(
        self, repo_url: str, analysis: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        repo_name = self._repo_name(repo_url)

        if self.llm:
            context = ""
            if analysis:
                pattern = analysis.get("pattern") or analysis.get("architecture") or ""
                services = analysis.get("services") or []
                service_names = ", ".join(
                    s.get("name", "") if isinstance(s, dict) else str(s)
                    for s in services[:8]
                )
                context = (
                    f"Architecture pattern: {pattern}. Key services/modules: {service_names}."
                )
            prompt = (
                f"Write a dramatic, funny movie-trailer script for the codebase "
                f"'{repo_name}' ({repo_url}). {context}\n\n"
                "Channel a booming movie-trailer voice. Keep it witty but grounded in "
                "what the repo actually does.\n\n"
                "Return ONLY JSON in this exact shape:\n"
                "{\n"
                '  "title": "IN A WORLD... (all-caps dramatic title)",\n'
                '  "tagline": "one punchy tagline",\n'
                '  "scenes": ["scene 1", "scene 2", "scene 3", "scene 4"],\n'
                '  "cast": [{"name": "ModuleName", "role": "what it plays in the story"}],\n'
                '  "genre": "e.g. Epic Async Thriller"\n'
                "}"
            )
            try:
                result = await self.llm.json_chat(prompt)
                if result.get("title") and result.get("scenes"):
                    result.setdefault("repo", repo_name)
                    return result
            except Exception:
                logger.exception("LLM json_chat failed for codebase trailer, using fallback")

        return self._fallback(repo_name, repo_url, analysis)

    def _fallback(
        self, repo_name: str, repo_url: str, analysis: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        cast = []
        if analysis:
            for svc in (analysis.get("services") or [])[:4]:
                name = svc.get("name") if isinstance(svc, dict) else str(svc)
                if name:
                    cast.append({"name": name, "role": "a critical system under pressure"})
        if not cast:
            cast = [{"name": repo_name, "role": "the unlikely hero"}]

        return {
            "repo": repo_name,
            "title": f"IN A WORLD... RULED BY {repo_name.upper()}",
            "tagline": "One repository. Infinite commits. No turning back.",
            "scenes": [
                f"It began with a single git init in {repo_name}.",
                "Then the dependencies grew... and grew...",
                "One pull request would change everything.",
                "This summer, the build must pass.",
            ],
            "cast": cast,
            "genre": "Epic Async Thriller",
        }

    @staticmethod
    def _repo_name(repo_url: str) -> str:
        name = (repo_url or "").rstrip("/").split("/")[-1]
        return name.removesuffix(".git") or "this-codebase"
