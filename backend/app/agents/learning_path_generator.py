from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent
from app.llm import LLMRouter


class LearningPathGenerator(BaseAgent):
    """Generates personalized learning paths based on repository structure and user expertise level."""

    MODULE_TEMPLATES = [
        {
            "name": "Project Overview & Architecture",
            "objectives": [
                "Understand project directory structure",
                "Identify main entry points and configuration",
                "Learn the tech stack and dependencies",
            ],
            "description": "Get a high-level understanding of how the project is organized and the technologies used",
        },
        {
            "name": "Core Data Models & Types",
            "objectives": [
                "Understand core data structures and models",
                "Learn type definitions and interfaces",
                "Identify key domain entities",
            ],
            "description": "Deep dive into the data models and type system used throughout the codebase",
        },
        {
            "name": "API & Route Layer",
            "objectives": [
                "Understand API endpoint structure",
                "Learn request/response patterns",
                "Identify middleware and error handling",
            ],
            "description": "Explore how the API layer is structured and how requests flow through the system",
        },
        {
            "name": "Business Logic & Services",
            "objectives": [
                "Understand core business logic",
                "Learn service layer patterns",
                "Identify key algorithms and workflows",
            ],
            "description": "Examine the core business logic and how services orchestrate operations",
        },
        {
            "name": "Database & Storage Layer",
            "objectives": [
                "Understand database schema and models",
                "Learn query patterns and migrations",
                "Identify caching and optimization strategies",
            ],
            "description": "Learn how data is persisted, queried, and optimized in the codebase",
        },
        {
            "name": "Testing Strategy",
            "objectives": [
                "Understand testing patterns used",
                "Learn how to write and run tests",
                "Identify test coverage gaps",
            ],
            "description": "Understand the testing approach and how to contribute with confidence",
        },
        {
            "name": "Authentication & Authorization",
            "objectives": [
                "Understand auth flows and security",
                "Learn permission models",
                "Identify security best practices",
            ],
            "description": "Learn how authentication and authorization are implemented",
        },
        {
            "name": "Deployment & DevOps",
            "objectives": [
                "Understand CI/CD pipeline",
                "Learn deployment process",
                "Identify monitoring and logging",
            ],
            "description": "Understand how the project is deployed and maintained in production",
        },
    ]

    def __init__(self):
        """Initialize LearningPathGenerator with multi-provider LLM router."""
        super().__init__(None)
        self.llm = LLMRouter()

    async def execute(self, repo_structure: Dict, user_level: str = "junior") -> Dict[str, Any]:
        """
        Generate personalized learning path based on repository structure and user expertise level.

        Args:
            repo_structure: Dictionary containing parsed repository entities
                - files: List of file dicts with 'path' key
                - classes: List of class dicts with 'name' key
                - functions: List of function dicts with 'name' key
            user_level: Developer expertise level ("junior", "mid", "senior")

        Returns:
            Dictionary with keys:
                - user_level: The expertise level passed in
                - total_estimated_hours: Sum of all module hours
                - path: List of module dicts with order, name, files, time_hours, objectives, description
        """
        try:
            return await self._generate_with_llm(repo_structure, user_level)
        except Exception:
            # Gracefully fall back to default path if LLM fails
            return self._generate_default(repo_structure, user_level)

    async def _generate_with_llm(self, repo_structure: Dict, user_level: str) -> Dict:
        """
        Use LLMRouter to generate personalized learning path with multi-provider fallback.

        Args:
            repo_structure: Parsed repository entities
            user_level: Developer expertise level

        Returns:
            Dictionary with learning path modules and metadata
        """
        # Summarize repository structure (limit to first 30/20/30 as per spec)
        files = [f.get("path", "") for f in repo_structure.get("files", [])][:30]
        classes = [c.get("name", "") for c in repo_structure.get("classes", [])][:20]
        functions = [f.get("name", "") for f in repo_structure.get("functions", [])][:30]

        prompt = f"""You are an expert developer onboarding coach. A {user_level} developer wants to learn this codebase.

Repository Files: {files}
Main Classes: {classes}
Main Functions: {functions}

Create a personalized learning path with 5-8 modules. For each module:
1. Name (e.g., "Authentication Module")
2. Key files to read
3. Estimated time
4. Learning objectives
5. Why it matters

Format as JSON:
{{
  "user_level": "{user_level}",
  "total_estimated_hours": <number>,
  "modules": [
    {{
      "order": 1,
      "name": "...",
      "files": [...],
      "time_hours": <number>,
      "objectives": ["...", "..."],
      "description": "..."
    }}
  ]
}}"""

        # Use LLMRouter's json_chat for automatic fallback and JSON parsing
        result = await self.llm.json_chat(prompt)

        # Validate response structure
        if result.get("modules"):
            return {
                "user_level": user_level,
                "total_estimated_hours": result.get("total_estimated_hours", 0),
                "path": result.get("modules", []),
            }

        # If LLM response doesn't have modules, fall back to default
        return self._generate_default(repo_structure, user_level)

    def _generate_default(self, repo_structure: Dict, user_level: str) -> Dict:
        files = repo_structure.get("files", [])
        classes = repo_structure.get("classes", [])
        functions = repo_structure.get("functions", [])

        modules = []
        used_files = set()

        time_map = {"junior": 4, "mid": 3, "senior": 2}

        for i, template in enumerate(self.MODULE_TEMPLATES):
            module_files = self._find_files_for_module(template, files, used_files)
            if not module_files and i >= 4:
                module_files = self._fill_remaining_files(files, used_files)

            if not module_files and i < 4:
                module_files = [f.get("path", "") for f in files[:3]]

            used_files.update(module_files)

            hours = time_map.get(user_level, 3)
            modules.append({
                "order": i + 1,
                "name": template["name"],
                "files": module_files[:5],
                "time_hours": hours,
                "objectives": template["objectives"],
                "description": template["description"],
            })

            if i >= 4 and not self._has_unused_files(files, used_files):
                break

        total_hours = sum(m["time_hours"] for m in modules)

        return {
            "user_level": user_level,
            "total_estimated_hours": total_hours,
            "path": modules,
        }

    def _find_files_for_module(self, template: Dict, files: List[Dict], used: set) -> List[str]:
        keywords = template["name"].lower().split()
        matched = []
        for f in files:
            path = f.get("path", "").lower()
            if path in used:
                continue
            if any(kw in path for kw in keywords):
                matched.append(f.get("path", ""))
        return matched[:5]

    def _fill_remaining_files(self, files: List[Dict], used: set) -> List[str]:
        result = []
        for f in files:
            path = f.get("path", "")
            if path not in used:
                result.append(path)
                if len(result) >= 3:
                    break
        return result

    def _has_unused_files(self, files: List[Dict], used: set) -> bool:
        return any(f.get("path", "") not in used for f in files)
