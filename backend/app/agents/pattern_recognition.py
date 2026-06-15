from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent


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
    async def execute(self, pattern: str, repo_structure: Dict) -> Dict[str, Any]:
        return await self.find_similar(pattern, repo_structure)

    async def find_similar(self, pattern: str, repo_structure: Dict) -> Dict[str, Any]:
        pattern_lower = pattern.lower()

        detected = self._detect_pattern_from_structure(repo_structure)
        selected = detected if detected else pattern_lower

        template = None
        for key, val in PATTERN_TEMPLATES.items():
            if key in selected or selected in key:
                template = val
                break

        if self.llm:
            files_summary = "\n".join(
                f.get("path", "") for f in repo_structure.get("files", [])
            )[:2000]
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
                pass

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
