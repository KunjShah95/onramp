from typing import Dict, Any
from app.agents.base_agent import BaseAgent


class OnboardingReportGenerator(BaseAgent):
    async def execute(self, repo_url: str, user_level: str = "junior") -> Dict[str, Any]:
        return await self.generate(repo_url, user_level)

    async def generate(self, repo_url: str, user_level: str) -> Dict[str, Any]:
        repo_name = repo_url.rstrip("/").split("/")[-1] if "/" in repo_url else repo_url

        sections = []

        sections.append({
            "title": "Repository Overview",
            "type": "overview",
            "content": {
                "repo": repo_url,
                "name": repo_name,
                "user_level": user_level,
                "generated_at": __import__("datetime").datetime.now().isoformat(),
            },
        })

        sections.append({
            "title": "Architecture Summary",
            "type": "placeholder",
            "content": {
                "note": "Run the Architecture Explorer to populate this section",
                "files_to_analyze": ["Run POST /api/v1/explore/analyze"],
            },
        })

        modules = [
            {"name": "Getting Started", "time": 2, "items": ["Set up development environment", "Clone the repository", "Install dependencies"]},
            {"name": "Codebase Walkthrough", "time": 4, "items": ["Explore directory structure", "Identify main entry points", "Understand tech stack"]},
            {"name": "Core Features", "time": 8, "items": ["Understand main feature areas", "Review key modules", "Examine data flow"]},
        ]

        if user_level == "junior":
            modules.extend([
                {"name": "Testing & QA", "time": 4, "items": ["Run existing tests", "Write a simple test", "Understand test patterns"]},
            ])

        sections.append({
            "title": "Learning Path",
            "type": "modules",
            "content": {"modules": modules, "total_estimated_hours": sum(m["time"] for m in modules)},
        })

        sections.append({
            "title": "Good First Issues",
            "type": "placeholder",
            "content": {"note": "Run the First PR Accelerator to find beginner-friendly issues"},
        })

        sections.append({
            "title": "FAQ",
            "type": "faq",
            "content": {
                "questions": [
                    {"q": "How do I set up the project?", "a": "Check the README or docs/ folder for setup instructions."},
                    {"q": "Where are the main entry points?", "a": "Look for main.py, app.py, index.js, or server.go files."},
                    {"q": "How do I run tests?", "a": "Check package.json (npm test), Makefile, or pytest configuration."},
                    {"q": "What coding style is used?", "a": "Review existing code for patterns and check for linter config files."},
                ]
            },
        })

        sections.append({
            "title": "Estimated Onboarding Time",
            "type": "summary",
            "content": {
                "total_hours": 18 if user_level == "junior" else 12,
                "difficulty": user_level,
                "note": "Times are estimates. Adjust based on familiarity with the tech stack.",
            },
        })

        return {
            "repo": repo_url,
            "user_level": user_level,
            "report": sections,
        }
