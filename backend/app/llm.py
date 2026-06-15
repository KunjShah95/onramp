import os
import json
import httpx
import logging
from typing import Optional, Dict, Any
from enum import Enum

logger = logging.getLogger("codeflow.llm")


class ModelProvider(Enum):
    """Available LLM providers ordered by priority (free first, paid last)."""
    OPENROUTER = "openrouter"  # Free
    GEMINI = "gemini"          # Free
    GROQ = "groq"              # Free
    NVIDIA = "nvidia"          # Free
    OPENAI = "openai"          # Paid fallback
    ANTHROPIC = "anthropic"    # Paid fallback


class LLMRouter:
    """Multi-provider LLM with fallback chain. Priority: free first, paid second."""

    def __init__(self):
        # Fallback chain: free providers first → paid providers second
        self.fallback_chain = [
            ModelProvider.OPENROUTER,
            ModelProvider.GEMINI,
            ModelProvider.GROQ,
            ModelProvider.NVIDIA,
            ModelProvider.OPENAI,
            ModelProvider.ANTHROPIC,
        ]

        # Provider configuration: api_key, endpoint, model, free/paid flag
        self.providers = {
            ModelProvider.OPENROUTER: {
                "api_key": os.getenv("OPENROUTER_API_KEY"),
                "model": "google/gemini-2.5-flash:free",
                "url": "https://openrouter.ai/api/v1/chat/completions",
                "type": "openai_compatible",
                "free": True
            },
            ModelProvider.GEMINI: {
                "api_key": os.getenv("GEMINI_API_KEY"),
                "model": "gemini-2.5-flash",
                "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                "type": "gemini",
                "free": True
            },
            ModelProvider.GROQ: {
                "api_key": os.getenv("GROQ_API_KEY"),
                "model": "llama-3.3-70b-versatile",
                "url": "https://api.groq.com/openai/v1/chat/completions",
                "type": "openai_compatible",
                "free": True
            },
            ModelProvider.NVIDIA: {
                "api_key": os.getenv("NVIDIA_API_KEY"),
                "model": "meta/llama-3.3-70b-instruct",
                "url": "https://integrate.api.nvidia.com/v1/chat/completions",
                "type": "openai_compatible",
                "free": True
            },
            ModelProvider.OPENAI: {
                "api_key": os.getenv("OPENAI_API_KEY"),
                "model": "gpt-4o-mini",
                "url": "https://api.openai.com/v1/chat/completions",
                "type": "openai_compatible",
                "free": False
            },
            ModelProvider.ANTHROPIC: {
                "api_key": os.getenv("ANTHROPIC_API_KEY"),
                "model": "claude-3-5-sonnet-20241022",
                "url": "https://api.anthropic.com/v1/messages",
                "type": "anthropic",
                "free": False
            },
        }

        self.current_provider = None
        self._initialize_providers()

    def _initialize_providers(self):
        """Check which providers have API keys available and set primary."""
        available = [p for p in self.fallback_chain if self.providers[p]["api_key"]]
        if not available:
            raise RuntimeError(
                "No LLM provider API keys configured. Set at least one: "
                "OPENROUTER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, "
                "OPENAI_API_KEY, or ANTHROPIC_API_KEY"
            )
        self.current_provider = available[0]
        fallback_list = [p.value for p in available[1:]]
        logger.info(
            f"LLMRouter initialized. Primary: {self.current_provider.value}, "
            f"Fallbacks: {fallback_list if fallback_list else 'none'}"
        )

    async def chat(self, prompt: str, system: str = None, max_tokens: int = 2000) -> str:
        """
        Call LLM with automatic fallback on error.
        Tries each provider in fallback_chain until success.
        """
        errors = []
        for provider in self.fallback_chain:
            config = self.providers[provider]
            if not config["api_key"]:
                continue

            try:
                response = await self._call_provider(provider, prompt, system, max_tokens)
                if self.current_provider != provider:
                    logger.info(f"Switched to provider: {provider.value}")
                    self.current_provider = provider
                return response
            except Exception as e:
                err_msg = f"{provider.value} failed: {str(e)}"
                logger.warning(err_msg)
                errors.append(err_msg)

        # All providers exhausted
        raise RuntimeError(
            f"All LLM providers exhausted. Errors: {'; '.join(errors)}"
        )

    async def json_chat(self, prompt: str, system: str = None) -> dict:
        """
        Call LLM expecting JSON response with automatic fallback.
        Extracts JSON from response or raises ValueError.
        """
        response = await self.chat(prompt, system)
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            # Try to extract JSON from response (handle markdown backticks, etc.)
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(response[start:end])
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"Could not parse JSON from response: {response[:200]}")

    async def _call_provider(
        self,
        provider: ModelProvider,
        prompt: str,
        system: str,
        max_tokens: int
    ) -> str:
        """
        Call specific provider with its API.
        Provider-specific implementation for each API type.
        """
        config = self.providers[provider]

        async with httpx.AsyncClient(timeout=30.0) as client:
            if config["type"] == "gemini":
                return await self._call_gemini(client, config, prompt, system)
            elif config["type"] == "openai_compatible":
                return await self._call_openai_compatible(client, config, prompt, system, max_tokens)
            elif config["type"] == "anthropic":
                return await self._call_anthropic(client, config, prompt, system, max_tokens)
            else:
                raise NotImplementedError(f"Provider type {config['type']} not implemented")

    async def _call_gemini(
        self,
        client: httpx.AsyncClient,
        config: Dict[str, Any],
        prompt: str,
        system: str
    ) -> str:
        """Call Google Gemini API."""
        url = f"{config['url']}?key={config['api_key']}"
        headers = {"Content-Type": "application/json"}
        body = {"contents": [{"parts": [{"text": prompt}]}]}

        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}

        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
        res_json = response.json()
        return res_json["candidates"][0]["content"]["parts"][0]["text"]

    async def _call_openai_compatible(
        self,
        client: httpx.AsyncClient,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int
    ) -> str:
        """Call OpenAI-compatible API (Groq, OpenRouter, Nvidia NIM)."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config['api_key']}"
        }

        # OpenRouter requires special headers
        if config["api_key"] and os.getenv("OPENROUTER_API_KEY"):
            headers["HTTP-Referer"] = "https://github.com/KunjShah95/codegenome"
            headers["X-Title"] = "CodeGenome"

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body = {
            "model": config["model"],
            "messages": messages,
            "max_tokens": max_tokens
        }

        response = await client.post(config["url"], headers=headers, json=body)
        response.raise_for_status()
        res_json = response.json()
        return res_json["choices"][0]["message"]["content"]

    async def _call_anthropic(
        self,
        client: httpx.AsyncClient,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int
    ) -> str:
        """Call Anthropic Claude API."""
        headers = {
            "Content-Type": "application/json",
            "x-api-key": config["api_key"],
            "anthropic-version": "2023-06-01"
        }

        body = {
            "model": config["model"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        }

        if system:
            body["system"] = system

        response = await client.post(config["url"], headers=headers, json=body)
        response.raise_for_status()
        res_json = response.json()
        return res_json["content"][0]["text"]


# For backward compatibility, maintain LLMClient as an alias
LLMClient = LLMRouter
