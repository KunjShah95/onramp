from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.agents.base_agent import BaseAgent
from app.llm import QueryType

class ProposedFix(BaseModel):
    file_path: str = Field(..., description="Path to the file to be modified")
    search_string: str = Field(..., description="The exact code block to be replaced")
    replace_string: str = Field(..., description="The new code block to insert")
    reasoning: str = Field(..., description="Technical justification for this specific change")

class AnalysisResult(BaseModel):
    root_cause: str = Field(..., description="Technical explanation of the bug/issue")
    affected_entities: List[str] = Field(default_factory=list, description="List of entity IDs affected")
    blast_radius: str = Field(..., description="Description of how this issue affects other parts of the system")
    confidence: float = Field(..., description="Confidence score from 0.0 to 1.0")

class IssueResolutionAgent(BaseAgent):
    """Specialized agent for analyzing codebase issues and proposing precise fixes.

    Uses REASONING for root cause analysis and CODE for generating fixes.
    """

    # Default to reasoning for general agent execution
    query_type = QueryType.REASONING

    async def analyze(self, issue_description: str, codebase_slice: str) -> AnalysisResult:
        """Analyzes a specific issue against a slice of the codebase.

        Args:
            issue_description: The issue report or bug description.
            codebase_slice: A structured representation (JSON/Text) of the relevant files and entities.
        """
        system_prompt = (
            "You are a world-class senior software engineer. Your task is to perform deep root-cause analysis "
            "on a reported issue using the provided codebase slice. Be precise, technical, and objective."
        )

        prompt = (
            f"ISSUE DESCRIPTION:\n{issue_description}\n\n"
            f"CODEBASE SLICE:\n{codebase_slice}\n\n"
            "Perform a deep analysis to identify the root cause. Output in JSON format matching the AnalysisResult schema."
        )

        # Use json_chat to get structured output
        result_json = await self.llm.json_chat(
            prompt,
            system=system_prompt,
            query_type=QueryType.REASONING
        )
        return AnalysisResult(**result_json)

    async def propose_fix(self, analysis: AnalysisResult, codebase_slice: str) -> List[ProposedFix]:
        """Generates precise code changes to resolve the identified root cause.

        Args:
            analysis: The result from the analyze() method.
            codebase_slice: The relevant code for applying the fix.
        """
        system_prompt = (
            "You are an expert developer. Your task is to propose the most minimal and correct fix for a bug. "
            "Ensure the fix preserves existing functionality and follows the project's style."
        )

        prompt = (
            f"ROOT CAUSE ANALYSIS:\n{analysis.root_cause}\n\n"
            f"AFFECTED ENTITIES:\n{analysis.affected_entities}\n\n"
            f"CODEBASE SLICE:\n{codebase_slice}\n\n"
            "Propose a list of precise changes. Each change must include an exact search string and a replace string. "
            "Output as a JSON list of ProposedFix objects."
        )

        # Use CODE query type for the fix generation
        result_json = await self.llm.json_chat(
            prompt,
            system=system_prompt,
            query_type=QueryType.CODE
        )

        # Handle both list and single object returns
        if isinstance(result_json, dict) and "fixes" in result_json:
            fixes_data = result_json["fixes"]
        elif isinstance(result_json, list):
            fixes_data = result_json
        else:
            fixes_data = [result_json]

        return [ProposedFix(**fix) for fix in fixes_data]

    async def execute(self, **kwargs) -> Dict[str, Any]:
        """
        Standard execution path for the agent.
        Expects 'issue_description' and 'codebase_slice' in kwargs.
        """
        issue = kwargs.get("issue_description")
        slice_data = kwargs.get("codebase_slice")

        if not issue or not slice_data:
            return {"error": "Missing issue_description or codebase_slice"}

        analysis = await self.analyze(issue, slice_data)
        fixes = await self.propose_fix(analysis, slice_data)

        return {
            "analysis": analysis.dict(),
            "proposed_fixes": [fix.dict() for fix in fixes]
        }
