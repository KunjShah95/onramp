import logging
from typing import Dict, Any
from app.agents.base_agent import BaseAgent
from app.llm import QueryType

logger = logging.getLogger(__name__)

PATTERN_TEMPLATES = {
    "authentication": {
        "approaches": [
            {"name": "JWT + HttpOnly cookies", "pros": "Secure, stateless", "cons": "Token revocation is hard"},
            {"name": "Session-based auth", "pros": "Easy to invalidate", "cons": "Requires server state"},
            {"name": "OAuth2 / OIDC", "pros": "Industry standard, SSO", "cons": "Complex setup"},
        ]
    },
    "api_design": {
        "approaches": [
            {"name": "RESTful API", "pros": "Familiar, cacheable", "cons": "Over-fetching"},
            {"name": "GraphQL", "pros": "Flexible queries", "cons": "Complex caching"},
            {"name": "gRPC", "pros": "Fast, typed", "cons": "Limited browser support"},
        ]
    },
    "database": {
        "approaches": [
            {"name": "SQL + ORM", "pros": "Consistent, ACID", "cons": "Schema migrations"},
            {"name": "Document DB", "pros": "Flexible schema", "cons": "No joins"},
            {"name": "Key-Value store", "pros": "Fast, simple", "cons": "Limited queries"},
        ]
    },
    "testing": {
        "approaches": [
            {"name": "Unit tests + pytest", "pros": "Fast, isolated", "cons": "Miss integration bugs"},
            {"name": "Integration tests", "pros": "Catch real issues", "cons": "Slow"},
            {"name": "E2E tests", "pros": "User perspective", "cons": "Fragile"},
        ]
    },
}


class PatternRecognition(BaseAgent):
    agent_type = "pattern_recognition"
    query_type = QueryType.REASONING
    async def execute(
        self,
        pattern: str,
        repo_structure: Dict = None,
        mode: str = "normal",
        index_id: str = None,
        context_max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        return await self.find_similar(
            pattern, repo_structure or {}, mode, index_id=index_id, context_max_tokens=context_max_tokens
        )

    async def find_similar(
        self,
        pattern: str,
        repo_structure: Dict,
        mode: str = "normal",
        index_id: str = None,
        context_max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        from app.services.repo_context import resolve_for_agent

        full, sliced, context_text = await resolve_for_agent(
            index_id,
            repo_structure or {},
            requirement=f"{pattern} code pattern, implementation, architecture",
            max_tokens=context_max_tokens,
            llm=self.llm,
        )
        if index_id:
            repo_structure = full
        pattern_lower = pattern.lower()

        detected = self._detect_pattern_from_structure(repo_structure)
        selected = detected if detected else pattern_lower

        template = None
        for key, val in PATTERN_TEMPLATES.items():
            if key in selected or selected in key:
                template = val
                break

        if self.llm:
            files_summary = context_text or "\n".join(
                f.get("path", "") for f in repo_structure.get("files", [])
            )[:2000]

            if mode == "roast":
                prompt = (
                    f"I'm analyzing a codebase that implements '{selected}'. "
                    f"Repository files:\n{files_summary}\n\n"
                    "You are 'Pattern Roast Bot' — you find similar patterns in other repos "
                    "and roast the current implementation while suggesting better approaches. "
                    "Be funny but technically accurate.\n\n"
                    "Return as JSON:\n"
                    "{\n"
                    '  "pattern": "identified pattern",\n'
                    '  "your_approach": {"approach": "— roasted version of current approach", "files": [...]},\n'
                    '  "roast_comment": "A funny one-liner about the current implementation",\n'
                    '  "similar_solutions": [{"repo": "org/repo", "approach": "...", "why_different": "...", "roast": "why theirs is better (funny)"}]\n'
                    "}"
                )
            else:
                prompt = (
                    f"I'm analyzing a codebase that implements '{selected}'. "
                    f"Repository files:\n{files_summary}\n\n"
                    "Find similar solutions in other open-source repos. "
                    "For each, explain the approach and why it differs.\n\n"
                    "Return as JSON:\n"
                    "{\n"
                    '  "pattern": "identified pattern",\n'
                    '  "your_approach": {"approach": "...", "files": [...]},\n'
                    '  "similar_solutions": [{"repo": "org/repo", "approach": "...", "why_different": "..."}]\n'
                    "}"
                )
            try:
                result = await self.llm.json_chat(prompt)
                if result.get("pattern"):
                    return result
            except Exception:
                logger.exception("LLM json_chat failed for pattern recognition, using fallback")

        result = {
            "pattern": selected,
            "your_approach": {
                "files": [f.get("path", "") for f in repo_structure.get("files", [])[:3]],
                "approach": f"Current implementation of {selected} in this codebase",
            },
            "similar_solutions": [],
        }

        if template:
            for approach in template.get("approaches", []):
                result["similar_solutions"].append({
                    "repo": f"github.com/example/{approach['name'].lower().replace(' ', '-')}",
                    "approach": approach["name"],
                    "why_different": f"{approach['pros']} — {approach['cons']}",
                })

        return result

    def _detect_pattern_from_structure(self, repo_structure: Dict) -> str:
        files = [f.get("path", "").lower() for f in repo_structure.get("files", [])]
        all_text = " ".join(files)

        for pattern in PATTERN_TEMPLATES:
            if pattern in all_text:
                return pattern
        return ""
