import logging
from typing import Any, Dict, List, Optional
from app.services.github_service import GitHubService
from app.services.repo_context import RepoContextService, index_id_for
from app.agents.issue_resolution_agent import IssueResolutionAgent, AnalysisResult, ProposedFix
from app.llm import LLMRouter

logger = logging.getLogger("onramp.issue_orchestrator")

class IssueOrchestrator:
    """Coordinates the autonomous loop for resolving repository issues.

    Flow: Repo Analysis -> Issue Mapping -> AI Analysis -> Proposed Fix ->
          Apply Change -> Validation -> Review.
    """

    def __init__(self, llm_client: LLMRouter):
        self.github = GitHubService()
        self.context = RepoContextService()
        self.agent = IssueResolutionAgent(llm_client)
        self.llm = llm_client

    async def resolve_issue(
        self,
        repo_url: str,
        issue_description: str,
        branch: str = "main"
    ) -> Dict[str, Any]:
        """The main entry point for resolving a specific issue.

        Returns a detailed result containing the analysis, fixes, and validation status.
        """
        try:
            # 1. Ensure we have a fresh index for the repository
            index_id = index_id_for(repo_url, branch)
            # Force build to ensure we are working with latest state
            context_doc = await self.context.build(repo_url, branch=branch, force=True)

            # 2. Select relevant code slice for the issue
            # We use the issue description as the 'requirement' for selection
            slice_doc = await self.context.select_context(
                index_id=index_id,
                requirement=issue_description
            )

            if not slice_doc:
                return {"error": "Could not resolve repository context"}

            codebase_slice = slice_doc.get("context_text", "")

            # 3. AI Analysis: Identify root cause
            logger.info("Analyzing issue: %s", issue_description[:100])
            analysis = await self.agent.analyze(issue_description, codebase_slice)

            # 4. AI Fix: Propose precise code changes
            logger.info("Proposing fix for root cause: %s", analysis.root_cause[:100])
            fixes = await self.agent.propose_fix(analysis, codebase_slice)

            if not fixes:
                return {
                    "status": "no_fix_proposed",
                    "analysis": analysis.dict()
                }

            # 5. Apply Fixes (to a temporary branch for validation)
            # The branch must exist before commit_to_branch can push to it.
            owner, repo = self._extract_owner_repo(repo_url)
            fix_branch = f"fix/issue-{index_id[:8]}"
            branch_ok = await self.github.create_branch(owner, repo, branch, fix_branch)
            if not branch_ok:
                # No write access (or branch creation failed) — try a fork flow is
                # out of scope here; report honestly instead of a silent 404.
                return {
                    "status": "branch_creation_failed",
                    "analysis": analysis.dict(),
                    "error": f"Could not create branch {fix_branch} on {owner}/{repo} — "
                             "check write access or GITHUB_TOKEN.",
                }

            applied_results = []
            for fix in fixes:
                try:
                    res = await self.github.commit_to_branch(
                        owner=owner,
                        repo=repo,
                        branch=fix_branch,
                        file_path=fix.file_path,
                        old_string=fix.search_string,
                        new_string=fix.replace_string,
                        commit_message=f"fix: {fix.reasoning[:50]}..."
                    )
                    applied_results.append({"status": "success", "result": res})
                except Exception as e:
                    applied_results.append({"status": "failed", "error": str(e)})

            # 6. Validation (Placeholder for ValidationEngine)
            # We would call ValidationEngine().verify(repo_url, branch, analysis)
            validation_status = "pending_manual_verification"

            # 7. Generate Summary (Placeholder for SummaryGenerator)
            summary = self._generate_basic_summary(issue_description, analysis, fixes)

            return {
                "status": "proposed_and_applied",
                "analysis": analysis.dict(),
                "fixes": [f.dict() for f in fixes],
                "application": applied_results,
                "validation": validation_status,
                "summary": summary
            }

        except Exception as e:
            logger.exception("Issue resolution failed")
            return {"error": str(e)}

    def _extract_owner_repo(self, repo_url: str) -> tuple[str, str]:
        cleaned = repo_url.strip().rstrip("/").replace(".git", "")
        parts = cleaned.split("/")
        return parts[-2], parts[-1]

    def _generate_basic_summary(self, issue: str, analysis: AnalysisResult, fixes: List[ProposedFix]) -> str:
        fix_details = "\n".join([f"- {f.file_path}: {f.reasoning}" for f in fixes])
        return (
            f"ISSUE: {issue}\n"
            f"ROOT CAUSE: {analysis.root_cause}\n"
            f"FIXES APPLIED:\n{fix_details}"
        )
