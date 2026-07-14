from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseAgent(ABC):
    """Abstract base class for all Onramp agents."""

    def __init__(self, llm_client):
        self.llm = llm_client
        self.cache = {}

    @abstractmethod
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute agent logic. Implement in subclass."""
        pass

    async def _call_claude(self, prompt: str, context: str = "") -> str:
        """Call Claude API with prompt and context."""
        full_prompt = f"{context}\n\n{prompt}"
        response = await self.llm.chat(full_prompt)
        return response
