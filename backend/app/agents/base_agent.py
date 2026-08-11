from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from app.llm import QueryType


class _RoutedLLM:
    """Wraps an LLMRouter, injecting the agent's query_type into LLM calls.

    Keeps model routing declarative per agent: each agent declares what kind
    of prompt it produces (code, reasoning, structured, creative, ...) and
    every chat/json_chat/chat_stream call automatically routes through the
    best provider chain for that type — unless the caller overrides
    ``query_type`` explicitly.
    """

    def __init__(self, llm, query_type: Optional[QueryType]):
        self._llm = llm
        self._query_type = query_type
        # Per-repo cache scope, set by resolve_for_agent() when the agent
        # runs against an indexed repo — every cached answer then lives
        # under the repo's index scope, which the push webhook evicts on
        # new commits (so stale repo knowledge is dropped automatically).
        self.cache_scope: Optional[str] = None

    def _resolve(self, query_type: Optional[QueryType]) -> Optional[QueryType]:
        return query_type if query_type is not None else self._query_type

    def _scope(self, cache_scope: Optional[str]) -> Optional[str]:
        return cache_scope or self.cache_scope

    async def chat(self, prompt, system=None, max_tokens=2000, query_type=None, cache_scope=None, **kwargs):
        return await self._llm.chat(
            prompt,
            system=system,
            max_tokens=max_tokens,
            query_type=self._resolve(query_type),
            cache_scope=self._scope(cache_scope),
            **kwargs,
        )

    async def json_chat(self, prompt, system=None, query_type=None, cache_scope=None, **kwargs):
        return await self._llm.json_chat(
            prompt,
            system=system,
            query_type=self._resolve(query_type),
            cache_scope=self._scope(cache_scope),
            **kwargs,
        )

    def chat_stream(self, prompt, system=None, max_tokens=2000, query_type=None, cache_scope=None, **kwargs):
        # Not async def: returns the underlying async generator directly so
        # callers can ``async for`` over the result.
        return self._llm.chat_stream(
            prompt,
            system=system,
            max_tokens=max_tokens,
            query_type=self._resolve(query_type),
            cache_scope=self._scope(cache_scope),
            **kwargs,
        )


class BaseAgent(ABC):
    """Abstract base class for all Onramp agents.

    ``query_type`` declares what kind of prompt this agent produces and
    drives OpenRouter-style model routing (code -> Claude, reasoning ->
    Gemini, structured -> Groq, creative -> Claude, ...). ``None`` falls
    back to automatic classification of each prompt.
    """

    query_type: Optional[QueryType] = None

    def __init__(self, llm_client):
        self.llm = self._wrap_llm(llm_client)
        self.cache = {}

    def _wrap_llm(self, llm_client):
        """Wrap a raw router so its calls carry this agent's query_type."""
        if llm_client is None:
            return None
        return _RoutedLLM(llm_client, self.query_type)

    @abstractmethod
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute agent logic. Implement in subclass."""
        pass

    async def _call_claude(self, prompt: str, context: str = "", model: Optional[str] = None) -> str:
        """Call Claude API with prompt and context.

        ``model`` (optional) names an explicit model id / query type / provider
        that wins over this agent's declared query_type — see LLMRouter.chat.
        """
        full_prompt = f"{context}\n\n{prompt}"
        response = await self.llm.chat(full_prompt, model=model)
        return response
