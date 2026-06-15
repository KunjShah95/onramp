import os
from typing import List, Dict, Any
from pathlib import Path


class ParserService:
    """Extracts entities (classes, functions, imports) from code via AST."""

    def __init__(self):
        self.supported_languages = ["python", "javascript", "typescript"]

    async def parse_directory(self, repo_path: str) -> Dict[str, Any]:
        """
        Parse entire repo directory. Returns:
        {
            "files": [...],
            "classes": [...],
            "functions": [...],
            "imports": [...],
            "exports": [...]
        }
        """
        repo = Path(repo_path)
        entities = {
            "files": [],
            "classes": [],
            "functions": [],
            "imports": [],
            "exports": []
        }

        # Iterate files
        for file_path in repo.rglob("*"):
            if file_path.is_file() and self._is_code_file(file_path):
                parsed = await self._parse_file(file_path)
                entities["files"].append(str(file_path.relative_to(repo)))
                entities["classes"].extend(parsed.get("classes", []))
                entities["functions"].extend(parsed.get("functions", []))
                entities["imports"].extend(parsed.get("imports", []))
                entities["exports"].extend(parsed.get("exports", []))

        return entities

    def _is_code_file(self, file_path: Path) -> bool:
        """Check if file is a code file we care about."""
        code_extensions = {".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java"}
        return file_path.suffix in code_extensions

    async def _parse_file(self, file_path: Path) -> Dict[str, Any]:
        """Parse single file. Placeholder."""
        return {"classes": [], "functions": [], "imports": [], "exports": []}
