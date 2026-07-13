"""
QuizGenerator — Generates knowledge-check quizzes based on codebase modules
and learning paths. Follows the same pattern as LearningPathGenerator.

Supports:
- Module-level quizzes (targeted to a specific module/area)
- Repo-level comprehensive quizzes (covers the full codebase)
- Answer evaluation with score + explanations
"""

import json
from typing import Dict, Any, List
from app.agents.base_agent import BaseAgent
from app.llm import LLMRouter


class QuizGenerator(BaseAgent):
    """Generates and evaluates knowledge-check quizzes for codebase modules."""

    QUESTION_TYPES = [
        "multiple_choice",
        "true_false",
        "code_review",
        "fill_blank",
        "matching",
    ]

    def __init__(self, llm_client=None):
        """Initialize QuizGenerator with multi-provider LLM router."""
        super().__init__(llm_client)
        if llm_client is None:
            try:
                self.llm = LLMRouter()
            except RuntimeError:
                self.llm = None

    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute agent logic — delegates to generate_for_module or generate_for_repo."""
        mode = kwargs.get("mode", "module")
        if mode == "module":
            return await self.generate_for_module(
                module_name=kwargs.get("module_name", ""),
                repo_structure=kwargs.get("repo_structure", {}),
                num_questions=kwargs.get("num_questions", 5),
                difficulty=kwargs.get("difficulty", "mixed"),
            )
        elif mode == "repo":
            return await self.generate_for_repo(
                repo_structure=kwargs.get("repo_structure", {}),
                num_questions=kwargs.get("num_questions", 10),
                difficulty=kwargs.get("difficulty", "mixed"),
            )
        elif mode == "evaluate":
            return await self.evaluate_answers(
                quiz=kwargs.get("quiz", {}),
                answers=kwargs.get("answers", {}),
                user_level=kwargs.get("user_level", "junior"),
            )
        raise ValueError(f"Unknown mode: {mode}")

    async def generate_for_module(
        self,
        module_name: str,
        repo_structure: Dict[str, Any],
        num_questions: int = 5,
        difficulty: str = "mixed",
    ) -> Dict[str, Any]:
        """Generate a knowledge-check quiz for a specific module.

        Args:
            module_name: Name of the module (e.g. "Authentication", "API Core")
            repo_structure: Parsed repository entities (files, classes, functions)
            num_questions: How many questions to generate
            difficulty: "beginner", "intermediate", "advanced", or "mixed"

        Returns:
            Dict with quiz_id, module, questions list, metadata
        """
        try:
            if self.llm is None:
                return self._generate_default_quiz(module_name, repo_structure, num_questions, difficulty)
            return await self._generate_with_llm(module_name, repo_structure, num_questions, difficulty, mode="module")
        except Exception:
            return self._generate_default_quiz(module_name, repo_structure, num_questions, difficulty)

    async def generate_for_repo(
        self,
        repo_structure: Dict[str, Any],
        num_questions: int = 10,
        difficulty: str = "mixed",
    ) -> Dict[str, Any]:
        """Generate a comprehensive quiz covering the entire codebase."""
        try:
            if self.llm is None:
                return self._generate_default_quiz("full_codebase", repo_structure, num_questions, difficulty)
            return await self._generate_with_llm("full_codebase", repo_structure, num_questions, difficulty, mode="repo")
        except Exception:
            return self._generate_default_quiz("full_codebase", repo_structure, num_questions, difficulty)

    async def evaluate_answers(
        self,
        quiz: Dict[str, Any],
        answers: Dict[str, Any],
        user_level: str = "junior",
    ) -> Dict[str, Any]:
        """Evaluate user answers against a quiz.

        Args:
            quiz: The quiz dict with questions
            answers: Dict mapping question_id -> user's answer
            user_level: Developer expertise level for scoring context

        Returns:
            Dict with score, total, results per question, feedback
        """
        try:
            if self.llm is None:
                return self._evaluate_default(quiz, answers)
            return await self._evaluate_with_llm(quiz, answers, user_level)
        except Exception:
            return self._evaluate_default(quiz, answers)

    async def _generate_with_llm(
        self,
        module_name: str,
        repo_structure: Dict[str, Any],
        num_questions: int,
        difficulty: str,
        mode: str,
    ) -> Dict[str, Any]:
        """Use LLM to generate quiz questions."""
        files = [f.get("path", "") for f in repo_structure.get("files", [])][:40]
        classes = [c.get("name", "") for c in repo_structure.get("classes", [])][:25]
        functions = [f.get("name", "") for f in repo_structure.get("functions", [])][:25]

        if mode == "module":
            scope_desc = f"the '{module_name}' module/area of the codebase"
            # Filter files relevant to this module if possible
            module_keywords = module_name.lower().split()
            relevant_files = [f for f in files if any(kw in f.lower() for kw in module_keywords)]
            if relevant_files:
                files = relevant_files[:20]
        else:
            scope_desc = "the entire codebase"

        difficulty_desc = {
            "beginner": "Basic concepts, definitions, and straightforward facts",
            "intermediate": "Understanding of patterns, relationships, and practical usage",
            "advanced": "Deep architectural knowledge, edge cases, and design decisions",
            "mixed": "A mix of all difficulty levels",
        }.get(difficulty, "A mix of all difficulty levels")

        prompt = f"""You are a senior developer creating a knowledge-check quiz for {scope_desc}.

Codebase Context:
- Key Files: {files}
- Main Classes: {classes}
- Main Functions: {functions}

Generate {num_questions} questions with difficulty: {difficulty_desc}

Mix of question types: multiple_choice, true_false, code_review, fill_blank, and matching.

For each question provide:
1. Unique question_id (e.g. "q1", "q2")
2. question_type: one of "multiple_choice", "true_false", "code_review", "fill_blank", "matching"
3. question_text: The actual question
4. options: Array of answer choices (for multiple_choice and matching)
5. correct_answer: The correct answer
6. explanation: Why this is the correct answer
7. difficulty: "beginner" | "intermediate" | "advanced"
8. related_files: Which files the question tests knowledge of

Format as JSON:
{{
  "module": "{module_name}",
  "difficulty": "{difficulty}",
  "total_questions": {num_questions},
  "questions": [
    {{
      "question_id": "q1",
      "question_type": "multiple_choice",
      "question_text": "What is the purpose of the main entry point?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Because...",
      "difficulty": "beginner",
      "related_files": ["src/main.py"]
    }}
  ]
}}"""

        result = await self.llm.json_chat(prompt)
        if result.get("questions"):
            return result
        return self._generate_default_quiz(module_name, repo_structure, num_questions, difficulty)

    async def _evaluate_with_llm(
        self,
        quiz: Dict[str, Any],
        answers: Dict[str, Any],
        user_level: str,
    ) -> Dict[str, Any]:
        """Use LLM to evaluate answers with contextual feedback."""
        questions_json = json.dumps(quiz.get("questions", []), indent=2)
        answers_json = json.dumps(answers, indent=2)

        prompt = f"""You are a senior developer mentor evaluating a {user_level}-level developer's quiz answers.

Quiz Questions:
{questions_json}

User's Answers:
{answers_json}

For each question, determine if the answer is correct and provide constructive feedback.
Score each answer and calculate the total.

Format as JSON:
{{
  "score": <number>,
  "total": <number>,
  "percentage": <number>,
  "passed": <bool>,
  "results": [
    {{
      "question_id": "q1",
      "correct": <bool>,
      "correct_answer": "...",
      "user_answer": "...",
      "feedback": "Explain why they got it right or wrong, and what to study"
    }}
  ],
  "summary": "Overall assessment and recommendations"
}}"""

        result = await self.llm.json_chat(prompt)
        if result.get("results") is not None:
            return result
        return self._evaluate_default(quiz, answers)

    # ── Default/fallback generators ─────────────────────────────

    def _generate_default_quiz(
        self,
        module_name: str,
        repo_structure: Dict[str, Any],
        num_questions: int,
        difficulty: str,
    ) -> Dict[str, Any]:
        """Generate a quiz from templates when LLM is unavailable."""
        files = [f.get("path", "") for f in repo_structure.get("files", [])][:30]
        classes = [c.get("name", "") for c in repo_structure.get("classes", [])][:20]
        functions = [f.get("name", "") for f in repo_structure.get("functions", [])][:20]

        templates = self._get_question_templates(module_name, files, classes, functions)
        questions = templates[:num_questions]

        # Ensure we have enough questions
        while len(questions) < num_questions:
            idx = len(questions) % len(templates)
            q = dict(templates[idx])
            q["question_id"] = f"q{len(questions) + 1}"
            questions.append(q)

        return {
            "module": module_name,
            "difficulty": difficulty,
            "total_questions": len(questions),
            "questions": questions,
        }

    def _get_question_templates(
        self,
        module_name: str,
        files: List[str],
        classes: List[str],
        functions: List[str],
    ) -> List[Dict]:
        """Generate template questions based on available codebase info."""
        templates = []

        # Architecture question
        if files:
            main_files = [f for f in files if any(kw in f.lower() for kw in ["main", "app", "index", "server", "cli"])][:3]
            if main_files:
                templates.append({
                    "question_id": "q_arch",
                    "question_type": "multiple_choice",
                    "question_text": "Which file is most likely the main entry point of the codebase?",
                    "options": main_files[:4] + ["None of the above"],
                    "correct_answer": main_files[0],
                    "explanation": f"Based on naming conventions, '{main_files[0]}' is the primary entry point.",
                    "difficulty": "beginner",
                    "related_files": main_files[:2],
                })

        # Class/function knowledge
        if classes:
            sample = classes[0]
            templates.append({
                "question_id": "q_class",
                "question_type": "multiple_choice",
                "question_text": f"What is the primary purpose of the '{sample}' class?",
                "options": [
                    "Data management and persistence",
                    "API endpoint handling",
                    "Business logic orchestration",
                    "Configuration and setup",
                ],
                "correct_answer": "Business logic orchestration",
                "explanation": f"'{sample}' is a core class that orchestrates business logic in this codebase.",
                "difficulty": "intermediate",
                "related_files": [f for f in files if sample.lower() in f.lower()][:2],
            })

        # Tech stack
        exts = set()
        for f in files:
            if "." in f:
                exts.add(f.split(".")[-1])
        tech_questions = {
            "py": ("Python", "Flask/FastAPI", "PyPI/pip"),
            "js": ("JavaScript", "Express/Node.js", "npm"),
            "ts": ("TypeScript", "React/Next.js", "npm"),
            "tsx": ("TypeScript/React", "React", "npm"),
            "jsx": ("JavaScript/React", "React", "npm"),
            "go": ("Go", "Gin/Chi", "Go modules"),
            "rs": ("Rust", "Actix/Rocket", "Cargo"),
            "java": ("Java", "Spring Boot", "Maven/Gradle"),
        }
        primary_ext = None
        for ext in ["tsx", "ts", "jsx", "js", "py", "go", "rs", "java"]:
            if ext in exts:
                primary_ext = ext
                break

        if primary_ext and primary_ext in tech_questions:
            lang, framework, pkg_mgr = tech_questions[primary_ext]
            templates.append({
                "question_id": "q_tech",
                "question_type": "multiple_choice",
                "question_text": f"What programming language is primarily used in this codebase?",
                "options": [lang, "Java", "Go", "Rust"],
                "correct_answer": lang,
                "explanation": f"The codebase uses {lang} as its primary language based on file extensions (.{primary_ext}).",
                "difficulty": "beginner",
                "related_files": [],
            })

        # Dependency/package manager
        pkg_files = [f for f in files if f.endswith(("package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod"))]
        if pkg_files:
            templates.append({
                "question_id": "q_deps",
                "question_type": "true_false",
                "question_text": f"The file '{pkg_files[0]}' defines the project's dependencies.",
                "options": ["True", "False"],
                "correct_answer": "True",
                "explanation": f"'{pkg_files[0]}' is the dependency manifest for this project.",
                "difficulty": "beginner",
                "related_files": [pkg_files[0]],
            })

        # Database/Storage
        db_files = [f for f in files if any(kw in f.lower() for kw in ["db", "database", "migration", "schema", "model", "sql", "alembic"])]
        if db_files:
            templates.append({
                "question_id": "q_db",
                "question_type": "fill_blank",
                "question_text": f"The database schema is defined in the __________ directory.",
                "options": ["models/", "database/", "db/", "schema/", db_files[0].split("/")[-2] if "/" in db_files[0] else "db/"],
                "correct_answer": db_files[0].split("/")[-2] if "/" in db_files[0] else db_files[0],
                "explanation": f"Database schema files are located in the '{db_files[0].split('/')[-2] if '/' in db_files[0] else db_files[0]}' directory.",
                "difficulty": "intermediate",
                "related_files": db_files[:3],
            })

        # API layer
        api_files = [f for f in files if any(kw in f.lower() for kw in ["api", "route", "router", "controller", "endpoint"])]
        if api_files:
            templates.append({
                "question_id": "q_api",
                "question_type": "multiple_choice",
                "question_text": "How are API routes organized in this codebase?",
                "options": [
                    "Single file with all routes",
                    "Separate router modules by feature",
                    "Decorator-based inline routes",
                    "Configuration-driven routing",
                ],
                "correct_answer": "Separate router modules by feature",
                "explanation": f"Routes are split across files like {api_files[0]} and {api_files[1] if len(api_files) > 1 else 'others'}, organized by feature.",
                "difficulty": "intermediate",
                "related_files": api_files[:3],
            })

        # Testing
        test_files = [f for f in files if any(kw in f.lower() for kw in ["test", "spec", "__tests__"])]
        if test_files:
            templates.append({
                "question_id": "q_test",
                "question_type": "true_false",
                "question_text": f"The project has tests located in the '{test_files[0].split('/')[0] if '/' in test_files[0] else 'tests'}' directory.",
                "options": ["True", "False"],
                "correct_answer": "True",
                "explanation": f"Test files like '{test_files[0]}' confirm the project has test coverage.",
                "difficulty": "beginner",
                "related_files": test_files[:2],
            })

        # CI/CD
        ci_files = [f for f in files if any(kw in f.lower() for kw in [".github", "gitlab-ci", "jenkins", "docker", "deploy"])]
        if ci_files:
            templates.append({
                "question_id": "q_cicd",
                "question_type": "multiple_choice",
                "question_text": "What CI/CD system does this project use?",
                "options": [
                    "GitHub Actions",
                    "GitLab CI",
                    "Jenkins",
                    "Custom scripts",
                ],
                "correct_answer": "GitHub Actions" if any(".github" in f.lower() for f in ci_files) else "Custom scripts",
                "explanation": f"Files like '{ci_files[0]}' indicate the CI/CD approach used.",
                "difficulty": "advanced",
                "related_files": ci_files[:2],
            })

        # Module-specific questions
        if module_name and module_name != "full_codebase":
            module_files = [f for f in files if module_name.lower() in f.lower()]
            if module_files:
                templates.append({
                    "question_id": "q_module",
                    "question_type": "fill_blank",
                    "question_text": f"The '{module_name}' area contains approximately how many files?",
                    "options": [str(len(module_files)), str(max(1, len(module_files) - 2)), str(len(module_files) + 2), "Unknown"],
                    "correct_answer": str(len(module_files)),
                    "explanation": f"There are {len(module_files)} files related to '{module_name}' in the codebase.",
                    "difficulty": "intermediate",
                    "related_files": module_files[:3],
                })

        return templates

    def _evaluate_default(
        self,
        quiz: Dict[str, Any],
        answers: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Evaluate answers by comparing against correct_answer field."""
        questions = quiz.get("questions", [])
        results = []
        score = 0

        for q in questions:
            qid = q.get("question_id")
            user_ans = answers.get(qid)
            correct = q.get("correct_answer")

            is_correct = False
            if user_ans is not None and correct is not None:
                # Case-insensitive comparison, strip whitespace
                is_correct = str(user_ans).strip().lower() == str(correct).strip().lower()

            if is_correct:
                score += 1

            results.append({
                "question_id": qid,
                "correct": is_correct,
                "correct_answer": correct,
                "user_answer": user_ans,
                "feedback": "Correct!" if is_correct else f"The correct answer is: {correct}",
            })

        total = len(questions)
        percentage = round((score / total) * 100, 1) if total > 0 else 0

        return {
            "score": score,
            "total": total,
            "percentage": percentage,
            "passed": percentage >= 70,
            "results": results,
            "summary": f"Scored {score}/{total} ({percentage}%). {'Passed!' if percentage >= 70 else 'Needs improvement.'}",
        }
