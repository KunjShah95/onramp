import logging
import httpx
from datetime import datetime, timezone

logger = logging.getLogger("onramp.wiki")

WIKI_SECTIONS = [
    "overview", "quick_start", "architecture", "tech_stack",
    "directory_structure", "workflow", "first_tasks", "conventions", "resources",
]


async def _github_get(url: str, token: str | None = None) -> dict | list | None:
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "Onramp-2.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            return r.json()
        except Exception:
            return None


async def generate_wiki(repo_owner: str, repo_name: str) -> dict:
    from app.services.github_service import GitHubService
    from app.llm import LLMRouter

    gh = GitHubService()
    llm = LLMRouter()

    repo_data = await gh.get_repo_stats(repo_owner, repo_name) or {}

    readme_raw = await _github_get(
        f"https://api.github.com/repos/{repo_owner}/{repo_name}/readme"
    )
    readme_text = ""
    if readme_raw and isinstance(readme_raw, dict):
        import base64
        try:
            readme_text = base64.b64decode(readme_raw.get("content", "")).decode("utf-8")
        except Exception:
            readme_text = str(readme_raw.get("text", ""))

    contents = await _github_get(
        f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents"
    )
    tree_lines = ""
    if contents and isinstance(contents, list):
        tree_lines = "\n".join(
            f"{'' if c.get('type') == 'dir' else ''} {c.get('name')}" for c in contents[:30]
        )

    contributing_text = ""
    for fname in ("CONTRIBUTING.md", "CONTRIBUTING", "contributing.md"):
        c = await _github_get(
            f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/{fname}"
        )
        if c and isinstance(c, dict):
            import base64
            try:
                contributing_text = base64.b64decode(c.get("content", "")).decode("utf-8")[:2000]
            except Exception:
                contributing_text = ""
            break

    issues = await gh.get_issues(
        f"https://github.com/{repo_owner}/{repo_name}",
        labels=["good-first-issue", "good first issue", "beginner", "help wanted"],
        limit=10
    )
    first_issues = issues[:5] if issues else []

    prompt = f"""You are a senior developer writing an onboarding wiki for a new developer joining {repo_owner}/{repo_name}.

Repository info:
- Description: {repo_data.get('description', 'N/A')}
- Language: {repo_data.get('language', 'N/A')}
- Stars: {repo_data.get('stars', 0)}
- Default branch: {repo_data.get('default_branch', 'main')}

README:
{readme_text[:3000] if readme_text else "No README found"}

Top-level files:
{tree_lines[:1500] if tree_lines else "No file listing"}

Contributing guide:
{contributing_text[:1500] if contributing_text else "No contributing guide"}

Good first issues:
{chr(10).join(f"- #{i.get('number')} {i.get('title')}" for i in first_issues) if first_issues else "None currently labeled"}

Write a complete onboarding wiki with these markdown sections:

## 1. Overview & Welcome
Warm intro, what this project does, its value.

## 2. Quick Start
Step-by-step setup: clone, install deps, configure, run locally.

## 3. Architecture Overview
Key directories, entry points, data flow.

## 4. Tech Stack
Languages, frameworks, databases, services.

## 5. Directory Structure
What each major directory contains.

## 6. Development Workflow
Branch strategy, testing, CI/CD, code review.

## 7. Suggested First Tasks
Actionable starting points, referencing the good first issues if available.

## 8. Conventions & Patterns
Style, naming, testing patterns, commit format.

## 9. Resources & Links
Useful docs, tools, contacts.

Write specific, actionable guidance. No filler."""

    try:
        wiki_content = await llm.chat(prompt, max_tokens=4000)
    except Exception as e:
        logger.exception("LLM wiki generation failed")
        wiki_content = f"# Onboarding Wiki for {repo_owner}/{repo_name}\n\nWiki generation failed: {e}"

    return {
        "repo": f"{repo_owner}/{repo_name}",
        "sections": WIKI_SECTIONS,
        "content": wiki_content,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "stars": repo_data.get("stars", 0),
            "language": repo_data.get("language", "N/A"),
            "open_issues": repo_data.get("open_issues", 0),
            "first_issues_found": len(first_issues),
        },
    }
