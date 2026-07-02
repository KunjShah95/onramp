import logging
import hashlib
from typing import Dict, Any
from app.agents.base_agent import BaseAgent
from app.services.embeddings_service import EmbeddingsService

logger = logging.getLogger(__name__)

class TaskQA(BaseAgent):
    """Specialized QA agent for reviewing agent 1's task completion."""

    def __init__(self, llm_client):
        super().__init__(llm_client)
        self.embeddings = EmbeddingsService()

    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute task QA review."""
        task_id = kwargs.get('task_id')
        agent_work = kwargs.get('agent_work', '')
        requirements = kwargs.get('requirements', '')

        if not task_id:
            return {"status": "error", "message": "Task ID is required"}

        # Perform QA review
        review_result = await self._review_task_completion(
            task_id=task_id,
            agent_work=agent_work,
            requirements=requirements
        )

        return {
            "status": "ok",
            "task_id": task_id,
            "review": review_result
        }

    async def _review_task_completion(self, task_id: str, agent_work: str, requirements: str) -> Dict[str, Any]:
        """Review task completion against requirements."""
        # Build prompt for task review
        prompt = self._build_review_prompt(task_id, agent_work, requirements)

        # Try to use LLM if available
        if self.llm:
            try:
                result = await self._call_claude(prompt)
                return self._parse_review_result(result)
            except Exception:
                logger.exception("LLM call failed for task QA review, using fallback")

        # Fallback review
        return self._fallback_review(agent_work, requirements)

    def _build_review_prompt(self, task_id: str, agent_work: str, requirements: str) -> str:
        """Build prompt for task QA review."""
        return f"""
        You are a specialized QA agent tasked with reviewing the work completed by another agent (Agent 1).
        Your job is to evaluate whether the assigned task has been properly completed according to the requirements.

        TASK ID: {task_id}

        REQUIREMENTS:
        {requirements}

        AGENT WORK TO REVIEW:
        {agent_work}

        Please provide a detailed review including:
        1. Completion Status: Is the task fully completed? Partially completed? Not completed?
        2. Requirement Adherence: How well does the work meet each requirement?
        3. Quality Assessment: Code quality, best practices, readability
        4. Missing Elements: What requirements are not met or partially met?
        5. Recommendations: Specific suggestions for improvement
        6. Overall Score: Rate the completion on a scale of 1-10

        Be thorough, objective, and constructive in your review.
        """

    def _parse_review_result(self, result: str) -> Dict[str, Any]:
        """Parse LLM review result into structured format."""
        # Simple parsing - in a real implementation, this would be more sophisticated
        lines = result.split('\n')
        review_data = {
            "completion_status": "unknown",
            "requirement_adherence": {},
            "quality_assessment": "",
            "missing_elements": [],
            "recommendations": [],
            "overall_score": 5,
            "raw_review": result
        }

        # Extract key information (simplified)
        for line in lines:
            line_lower = line.lower()
            if "completion" in line_lower or "status" in line_lower:
                if "full" in line_lower or "complete" in line_lower:
                    review_data["completion_status"] = "completed"
                elif "partial" in line_lower:
                    review_data["completion_status"] = "partially_completed"
                else:
                    review_data["completion_status"] = "not_completed"
            elif "score" in line_lower or "rating" in line_lower:
                # Try to extract a number
                import re
                numbers = re.findall(r'\d+', line)
                if numbers:
                    try:
                        score = int(numbers[0])
                        if 1 <= score <= 10:
                            review_data["overall_score"] = score
                    except ValueError:
                        logger.warning("Failed to parse score from line: %s", line.strip())
            elif "recommend" in line_lower or "suggest" in line_lower:
                review_data["recommendations"].append(line.strip())
            elif "missing" in line_lower:
                review_data["missing_elements"].append(line.strip())

        return review_data

    def _fallback_review(self, agent_work: str, requirements: str) -> Dict[str, Any]:
        """Provide fallback review when LLM is not available."""
        # Simple heuristic-based review
        work_length = len(agent_work.strip())
        req_length = len(requirements.strip())

        # Basic completion assessment
        if work_length == 0:
            completion_status = "not_completed"
            score = 1
        elif work_length < req_length * 0.3:
            completion_status = "partially_completed"
            score = 3
        elif work_length < req_length * 0.7:
            completion_status = "partially_completed"
            score = 5
        else:
            completion_status = "completed"
            score = 7

        return {
            "completion_status": completion_status,
            "requirement_adherence": {"basic": f"Work length: {work_length} vs required: {req_length}"},
            "quality_assessment": "Basic length-based assessment performed",
            "missing_elements": ["Detailed LLM review not available"] if not self.llm else [],
            "recommendations": ["Enable LLM for detailed review"] if not self.llm else ["Review completed successfully"],
            "overall_score": score,
            "raw_review": f"Fallback review: Task work length {work_length} chars, requirements {req_length} chars"
        }

    @staticmethod
    def _build_prompt(question: str, context: str, memory: str = "", mode: str = "normal") -> str:
        """Build prompt for general QA (inherited pattern from RepoQA)."""
        memory_block = f"{memory}\n\n" if memory else ""

        if mode == "roast":
            return (
                f"{memory_block}"
                f"You are 'Task QA Review Bot' — a brutally honest, sarcastic, but technically accurate "
                f"senior engineer reviewing another agent's work. Your job is to review the work "
                f"with witty, sarcastic humor while still being HELPFUL and ACCURATE. Roast the work when "
                f"appropriate but always give correct advice. Use jokes, memes, and developer humor. "
                f"Never be mean-spirited — it's all in good fun.\n\n"
                f"Question from a developer: {question}\n\n"
                f"Agent work to review:\n{context}\n\n"
                "Answer with your signature blend of roast and wisdom. Include specific references."
            )

        return (
            f"{memory_block}"
            f"Based on this agent work, answer the question: {question}\n\n"
            f"Agent work:\n{context}\n\n"
            "Provide a clear answer with specific references where applicable."
        )

    async def review_task(self, task_id: str, agent_work: str, requirements: str, memory: str = "", mode: str = "normal") -> str:
        """Review a task and return formatted response."""
        review_result = await self._review_task_completion(task_id, agent_work, requirements)

        if self.llm and mode != "normal":
            # Use LLM for formatted response in special modes
            prompt = self._build_prompt(
                f"Review task {task_id} completion",
                f"Work: {agent_work}\nRequirements: {requirements}\nReview: {review_result}",
                memory,
                mode
            )
            try:
                result = await self._call_claude(prompt)
                return result.strip()
            except Exception:
                logger.exception("LLM call failed for task QA text review, using fallback")

        # Return formatted text review
        return self._format_review_text(review_result)

    def _format_review_text(self, review_result: Dict[str, Any]) -> str:
        """Format review result as readable text."""
        status = review_result.get("completion_status", "unknown")
        score = review_result.get("overall_score", 0)
        quality = review_result.get("quality_assessment", "")
        missing = review_result.get("missing_elements", [])
        recommendations = review_result.get("recommendations", [])

        text = f"TASK QA REVIEW\n"
        text += f"Completion Status: {status.upper().replace('_', ' ')}\n"
        text += f"Overall Score: {score}/10\n\n"

        if quality:
            text += f"QUALITY ASSESSMENT:\n{quality}\n\n"

        if missing:
            text += f"MISSING ELEMENTS:\n"
            for item in missing:
                text += f"- {item}\n"
            text += "\n"

        if recommendations:
            text += f"RECOMMENDATIONS:\n"
            for rec in recommendations:
                text += f"- {rec}\n"
            text += "\n"

        raw_review = review_result.get("raw_review", "")
        if raw_review:
            text += f"DETAILED REVIEW:\n{raw_review}\n"

        return text