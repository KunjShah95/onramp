import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class OnboardingReportGenerator(BaseAgent):
    async def execute(self, repo_url: str, user_level: str = "junior", repo_structure: Optional[Dict] = None) -> Dict[str, Any]:
        return await self.generate(repo_url, user_level, repo_structure)

    async def generate(self, repo_url: str, user_level: str, repo_structure: Optional[Dict] = None) -> Dict[str, Any]:
        repo_name = repo_url.rstrip("/").split("/")[-1] if "/" in repo_url else repo_url

        sections = []

        # ── Repository Overview ──────────────────────────────────────
        tech_stack = self._detect_tech_stack(repo_structure)
        sections.append({
            "title": "Repository Overview",
            "type": "overview",
            "content": {
                "repo": repo_url,
                "name": repo_name,
                "user_level": user_level,
                "generated_at": datetime.now().isoformat(),
                "tech_stack": tech_stack,
                "file_count": len(repo_structure.get("files", [])) if repo_structure else 0,
            },
        })

        # ── Architecture Summary ─────────────────────────────────────
        sections.append({
            "title": "Architecture Summary",
            "type": "architecture",
            "content": self._generate_architecture_summary(repo_structure, repo_name),
        })

        # ── Learning Path ────────────────────────────────────────────
        modules = self._generate_learning_modules(repo_structure, user_level)
        sections.append({
            "title": "Learning Path",
            "type": "modules",
            "content": {"modules": modules, "total_estimated_hours": sum(m["time"] for m in modules)},
        })

        # ── Key Files to Understand ──────────────────────────────────
        sections.append({
            "title": "Key Files to Understand",
            "type": "key_files",
            "content": self._extract_key_files(repo_structure),
        })

        # ── First Issues ─────────────────────────────────────────────
        sections.append({
            "title": "Good First Issues",
            "type": "first_issues",
            "content": self._generate_first_issue_suggestions(repo_structure, user_level, repo_name),
        })

        # ── FAQ ──────────────────────────────────────────────────────
        sections.append({
            "title": "FAQ",
            "type": "faq",
            "content": {
                "questions": [
                    {"q": "How do I set up the project?", "a": self._find_setup_instructions(repo_structure)},
                    {"q": "Where are the main entry points?", "a": self._find_entry_points(repo_structure)},
                    {"q": "How do I run tests?", "a": self._find_test_instructions(repo_structure)},
                    {"q": "What technologies are used?", "a": f"Tech stack detected: {', '.join(tech_stack[:5]) if tech_stack else 'See configuration files'}"},
                    {"q": "What's the architecture pattern?", "a": self._guess_architecture(repo_structure)},
                ]
            },
        })

        # ── Summary ──────────────────────────────────────────────────
        total_hours = sum(m["time"] for m in modules)
        sections.append({
            "title": "Estimated Onboarding Time",
            "type": "summary",
            "content": {
                "total_hours": total_hours,
                "difficulty": user_level,
                "note": f"Based on {len(modules)} learning modules across the {repo_name} codebase.",
            },
        })

        return {
            "repo": repo_url,
            "user_level": user_level,
            "report": sections,
        }

    def _detect_tech_stack(self, repo_structure: Optional[Dict]) -> List[str]:
        """Detect technologies from file extensions and config files."""
        if not repo_structure:
            return ["See configuration files for details"]
        
        stack = []
        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        all_paths = " ".join(files).lower()

        tech_map = {
            "Python/FastAPI": ["requirements.txt", "pyproject.toml", ".py", "fastapi"],
            "React": ["package.json", "tsx", "jsx", "react"],
            "TypeScript": ["tsconfig.json", ".ts"],
            "Node.js": ["package.json", "node_modules", ".js"],
            "Go": ["go.mod", ".go"],
            "Rust": ["cargo.toml", ".rs"],
            "Java": ["pom.xml", "build.gradle", ".java"],
            "Docker": ["dockerfile", "docker-compose.yml"],
            "PostgreSQL": ["postgres", "psql", "alembic"],
            "Redis": ["redis"],
            "Kubernetes": ["kubernetes/", "k8s", "deployment.yaml"],
            "Terraform": [".tf", "terraform"],
            "Firebase": ["firebase.json", "firestore"],
        }

        for tech, keywords in tech_map.items():
            if any(kw in all_paths for kw in keywords):
                stack.append(tech)

        return stack[:8] if stack else ["See configuration files"]

    def _generate_architecture_summary(self, repo_structure: Optional[Dict], repo_name: str) -> Dict:
        """Generate architecture summary from repo structure."""
        if not repo_structure:
            return {
                "note": f"{repo_name} is structured as a standard software project. Run the Architecture Explorer for detailed analysis.",
                "estimated_pattern": "unknown",
                "key_directories": [],
            }

        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        classes = [c.get("name", "") for c in repo_structure.get("classes", [])]

        # Detect top-level directories
        dirs = set()
        for f in files:
            parts = f.split("/")
            if len(parts) > 1:
                dirs.add(parts[0])

        # Guess architecture pattern
        patterns = {
            "backend/": "backend",
            "frontend/": "frontend",
            "api/": "api-layer",
            "services/": "microservices",
            "src/": "src-based",
            "app/": "app-based",
            "cmd/": "cmd-based",
        }

        detected = []
        all_paths = " ".join(files).lower()
        for keyword, pattern in patterns.items():
            if keyword in all_paths:
                detected.append(pattern)

        arch_pattern = "/".join(detected[:3]) if detected else "standard project layout"

        return {
            "note": f"{repo_name} has {len(files)} files, {len(classes)} classes across {len(dirs)} top-level directories.",
            "estimated_pattern": arch_pattern,
            "top_directories": sorted(list(dirs))[:10],
            "total_files": len(files),
            "total_classes": len(classes),
        }

    def _generate_learning_modules(self, repo_structure: Optional[Dict], user_level: str) -> List[Dict]:
        """Generate learning modules dynamically from repo structure."""
        if not repo_structure:
            return self._default_modules(user_level)

        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        classes = [c.get("name", "") for c in repo_structure.get("classes", [])]
        all_paths = " ".join(files).lower()

        time_map = {"junior": 4, "mid": 3, "senior": 2}
        base_hours = time_map.get(user_level, 3)

        modules = []

        # Module 1: Project Setup
        setup_files = [f for f in files if any(kw in f.lower() for kw in ["readme", "docker", "dockerfile", "setup", "install", "config", ".env"])]
        modules.append({
            "name": "Project Setup & Configuration",
            "time": base_hours,
            "items": [
                f"Clone and set up {'the development environment' if not setup_files else setup_files[0]}",
                "Configure environment variables and dependencies",
                "Run the project locally and verify it works",
            ],
            "files": setup_files[:5],
        })

        # Module 2: Directory Structure
        dirs = set()
        for f in files[:100]:
            parts = f.split("/")
            if len(parts) > 1:
                dirs.add(parts[0])
        modules.append({
            "name": "Codebase Organization",
            "time": base_hours,
            "items": [
                f"Explore {len(dirs)} top-level directories: {', '.join(sorted(list(dirs))[:6])}",
                "Identify main entry points and application bootstrap",
                "Understand the module/package structure",
            ],
            "files": sorted(list(dirs))[:8],
        })

        # Module 3: Core Data Models
        model_files = [f for f in files if any(kw in f.lower() for kw in ["model", "schema", "type", "entity", "dto"])]
        modules.append({
            "name": "Core Data Models & Types",
            "time": base_hours,
            "items": [
                f"Examine {'the data models' if not model_files else model_files[0]}",
                f"Key classes: {', '.join(classes[:5]) if classes else 'Review core types'}",
                "Understand the relationships between entities",
            ],
            "files": model_files[:5],
        })

        # Module 4: API Layer
        api_files = [f for f in files if any(kw in f.lower() for kw in ["api", "route", "endpoint", "controller", "handler"])]
        modules.append({
            "name": "API & Route Layer",
            "time": base_hours,
            "items": [
                f"Explore {'API routes' if not api_files else f'{len(api_files)} API files'}",
                "Understand request/response patterns",
                "Review middleware and error handling",
            ],
            "files": api_files[:5],
        })

        # Module 5: Business Logic
        service_files = [f for f in files if any(kw in f.lower() for kw in ["service", "logic", "business", "core", "util", "helper"])]
        modules.append({
            "name": "Business Logic & Services",
            "time": base_hours + 1,
            "items": [
                "Understand core business logic and service patterns",
                "Identify key algorithms and workflows",
                "Trace a request through the full stack",
            ],
            "files": service_files[:5],
        })

        # Module 6: Database & Storage
        db_files = [f for f in files if any(kw in f.lower() for kw in ["db", "database", "sql", "migration", "alembic", "schema", "query", "repository", "store"])]
        if db_files or "migration" in all_paths:
            modules.append({
                "name": "Database & Storage",
                "time": base_hours,
                "items": [
                    f"Review {'database schema' if not db_files else f'{len(db_files)} database files'}",
                    "Understand query patterns and migrations",
                    "Identify caching and optimization strategies",
                ],
                "files": db_files[:5],
            })

        # Module 7: Testing
        test_files = [f for f in files if any(kw in f.lower() for kw in ["test", "spec", "__tests__", "cypress"])]
        modules.append({
            "name": "Testing Strategy",
            "time": base_hours,
            "items": [
                f"Examine {'testing infrastructure' if not test_files else f'{len(test_files)} test files'}",
                "Understand testing patterns used in the project",
                "Learn how to write and run tests",
            ],
            "files": test_files[:5],
        })

        # Module 8: Deployment (if applicable)
        deploy_files = [f for f in files if any(kw in f.lower() for kw in ["deploy", "ci", "cd", "docker", "kubernetes", "helm", "terraform", "cloud", "pipeline"])]
        if deploy_files:
            modules.append({
                "name": "Deployment & DevOps",
                "time": base_hours,
                "items": [
                    f"Review {'deployment config' if not deploy_files else f'{len(deploy_files)} deployment files'}",
                    "Understand CI/CD pipeline",
                    "Learn the deployment process",
                ],
                "files": deploy_files[:5],
            })

        return modules

    def _default_modules(self, user_level: str) -> List[Dict]:
        """Default modules when no repo structure is available."""
        time_map = {"junior": 4, "mid": 3, "senior": 2}
        h = time_map.get(user_level, 3)
        return [
            {"name": "Getting Started", "time": h, "items": ["Set up development environment", "Clone the repository", "Install dependencies"], "files": []},
            {"name": "Codebase Walkthrough", "time": h, "items": ["Explore directory structure", "Identify main entry points", "Understand tech stack"], "files": []},
            {"name": "Core Features", "time": h + 2, "items": ["Understand main feature areas", "Review key modules", "Examine data flow"], "files": []},
            {"name": "Testing & QA", "time": h, "items": ["Run existing tests", "Write a simple test", "Understand test patterns"], "files": []},
        ]

    def _extract_key_files(self, repo_structure: Optional[Dict]) -> Dict:
        """Extract key files a new developer should read first."""
        if not repo_structure:
            return {"files": ["README.md", "package.json or requirements.txt", "main entry point"], "note": "Check the repository root for setup instructions."}

        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        all_paths_lower = " ".join(files).lower()

        key_files = []

        # Priority list of files to find
        priority_patterns = [
            ("Readme", ["readme"]),
            ("Configuration", ["package.json", "pyproject.toml", "cargo.toml", "go.mod", "requirements.txt", "pom.xml"]),
            ("Main Entry", ["main.py", "main.ts", "index.js", "app.py", "server.js", "main.go", "main.rs"]),
            ("Environment", [".env.example", ".env"]),
            ("Docker", ["dockerfile", "docker-compose"]),
            ("CI/CD", [".github/workflows", ".gitlab-ci", "jenkinsfile"]),
            ("Database", ["alembic", "migrations", "schema"]),
            ("Tests", ["pytest.ini", "jest.config", "vitest.config", "cypress"]),
        ]

        for label, patterns in priority_patterns:
            for f in files:
                if any(p in f.lower() for p in patterns):
                    key_files.append({"path": f, "label": label, "reason": self._file_reason(label)})
                    break

        return {
            "files": key_files[:10],
            "total_files": len(files),
            "note": "Start with these files to build a mental model of the project.",
        }

    def _file_reason(self, label: str) -> str:
        reasons = {
            "Readme": "Project overview and setup instructions",
            "Configuration": "Dependencies and project metadata",
            "Main Entry": "Application bootstrap and entry point",
            "Environment": "Required configuration variables",
            "Docker": "Containerization and local development",
            "CI/CD": "Automated build and deployment pipeline",
            "Database": "Database schema and migrations",
            "Tests": "Testing framework configuration",
        }
        return reasons.get(label, "Key file for understanding the project")

    def _generate_first_issue_suggestions(self, repo_structure: Optional[Dict], user_level: str, repo_name: str) -> Dict:
        """Generate suggested first issues based on repo structure."""
        if not repo_structure:
            return {
                "note": f"Run the First PR Accelerator to find beginner-friendly issues in {repo_name}.",
                "suggestions": [],
            }

        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        suggestions = []

        # Suggest based on common patterns
        if any("test" in f.lower() for f in files):
            suggestions.append("Add a unit test for an uncovered function or module")
        if any("readme" in f.lower() for f in files):
            suggestions.append("Improve documentation or add examples to the README")
        if any(".md" in f.lower() for f in files):
            suggestions.append("Fix typos or outdated information in documentation")
        if any("config" in f.lower() for f in files):
            suggestions.append("Add environment variable validation on startup")
        if any("error" in f.lower() or "exception" in f.lower() for f in files):
            suggestions.append("Improve error messages with actionable guidance")
        if any("docker" in f.lower() for f in files):
            suggestions.append("Optimize Dockerfile layers for faster builds")

        if not suggestions:
            suggestions = ["Improve code documentation with docstrings",
                          "Add input validation to an API endpoint",
                          "Fix linting warnings across the codebase"]

        return {
            "note": f"Based on analysis of {repo_name}, here are suggested first contributions:",
            "suggestions": suggestions[:5],
            "estimated_difficulty": user_level,
        }

    def _find_setup_instructions(self, repo_structure: Optional[Dict]) -> str:
        """Find setup instructions from the repo."""
        if not repo_structure:
            return "Check the README or docs/ folder for setup instructions."
        
        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        
        if any("docker-compose" in f.lower() for f in files):
            return "Run `docker-compose up` to start the development environment."
        if any("makefile" in f.lower() for f in files):
            return "Run `make setup` or `make install` to set up the project."
        if any("package.json" in f.lower() for f in files):
            return "Run `npm install` to install dependencies, then `npm run dev` to start."
        if any("requirements.txt" in f.lower() for f in files):
            return "Create a virtual environment, run `pip install -r requirements.txt`, then run the main entry point."
        
        return "Check the README or docs/ folder for setup instructions."

    def _find_entry_points(self, repo_structure: Optional[Dict]) -> str:
        """Identify main entry points."""
        if not repo_structure:
            return "Look for main.py, app.py, index.js, or server.go files."
        
        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        entry_keywords = ["main", "app", "index", "server", "entry", "cli"]
        
        entries = []
        for f in files:
            name = f.split("/")[-1].lower()
            if any(kw in name for kw in entry_keywords) and name.endswith((".py", ".js", ".ts", ".go", ".rs")):
                entries.append(f)
        
        if entries:
            return f"Main entry points detected: {', '.join(entries[:5])}"
        return "Look for main.py, app.py, index.js, or server.go files."

    def _find_test_instructions(self, repo_structure: Optional[Dict]) -> str:
        """Find how to run tests."""
        if not repo_structure:
            return "Check package.json (npm test), Makefile, or pytest configuration."
        
        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        all_paths = " ".join(files).lower()
        
        if "pytest" in all_paths:
            return "Run `pytest` or `python -m pytest tests/ -v` to run the test suite."
        if "package.json" in all_paths:
            return "Run `npm test` or `npm run test` to execute tests."
        if "jest.config" in all_paths:
            return "Run `npx jest` or `npm test` to run Jest tests."
        if "makefile" in all_paths:
            return "Run `make test` to execute the test suite."
        
        return "Check package.json (npm test), Makefile, or pytest configuration."

    def _guess_architecture(self, repo_structure: Optional[Dict]) -> str:
        """Guess architecture pattern."""
        if not repo_structure:
            return "Run the Architecture Explorer for detailed analysis."
        
        files = [f.get("path", "") for f in repo_structure.get("files", [])]
        all_paths = " ".join(files).lower()
        
        # Check for microservices
        if "microservice" in all_paths or "service/" in all_paths:
            return "Appears to use a microservices or service-oriented architecture."
        # Check for layered
        if all(kw in all_paths for kw in ["api/", "models/", "services/"]):
            return "Appears to use a layered architecture (API → Services → Models)."
        # Check for MVC
        if all(kw in all_paths for kw in ["controllers", "models", "views"]) or all(kw in all_paths for kw in ["controllers", "models", "routes"]):
            return "Appears to use MVC (Model-View-Controller) architecture."
        # Check for frontend/backend
        if "frontend" in all_paths and "backend" in all_paths:
            return "Appears to be a full-stack application with separate frontend and backend."
        # Check for monorepo
        if "packages/" in all_paths:
            return "Appears to be a monorepo with multiple packages."
        
        return "Review the directory structure and configuration files to determine the architecture pattern."
