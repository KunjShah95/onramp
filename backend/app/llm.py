import os
import json
import logging
from typing import Dict, Any
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
    """Multi-provider LLM with fallback chain. Priority: free first, paid second.

    Each provider is called through its official AI SDK (OpenAI SDK for all
    OpenAI-compatible endpoints, google-genai for Gemini, anthropic for Claude).
    SDKs are imported lazily inside each call so a missing optional SDK only
    disables that one provider instead of breaking application startup.
    """

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

        # Provider config: api_key, model, base_url (for OpenAI-compatible), type, free flag
        self.providers = {
            ModelProvider.OPENROUTER: {
                "api_key": os.getenv("OPENROUTER_API_KEY"),
                "model": "google/gemini-2.5-flash:free",
                "base_url": "https://openrouter.ai/api/v1",
                "type": "openai_sdk",
                "free": True,
            },
            ModelProvider.GEMINI: {
                "api_key": os.getenv("GEMINI_API_KEY"),
                "model": "gemini-2.5-flash",
                "base_url": None,
                "type": "gemini_sdk",
                "free": True,
            },
            ModelProvider.GROQ: {
                "api_key": os.getenv("GROQ_API_KEY"),
                "model": "llama-3.3-70b-versatile",
                "base_url": "https://api.groq.com/openai/v1",
                "type": "openai_sdk",
                "free": True,
            },
            ModelProvider.NVIDIA: {
                "api_key": os.getenv("NVIDIA_API_KEY"),
                "model": "meta/llama-3.3-70b-instruct",
                "base_url": "https://integrate.api.nvidia.com/v1",
                "type": "openai_sdk",
                "free": True,
            },
            ModelProvider.OPENAI: {
                "api_key": os.getenv("OPENAI_API_KEY"),
                "model": "gpt-4o-mini",
                "base_url": "https://api.openai.com/v1",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.ANTHROPIC: {
                "api_key": os.getenv("ANTHROPIC_API_KEY"),
                "model": "claude-3-5-sonnet-20241022",
                "base_url": None,
                "type": "anthropic_sdk",
                "free": False,
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
        """Call LLM with automatic fallback on error. Free providers tried first."""
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

        raise RuntimeError(f"All LLM providers exhausted. Errors: {'; '.join(errors)}")

    async def json_chat(self, prompt: str, system: str = None) -> dict:
        """Call LLM expecting JSON response with automatic fallback."""
        response = await self.chat(prompt, system)
        try:
            return json.loads(response)
        except json.JSONDecodeError:
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
        max_tokens: int,
    ) -> str:
        """Dispatch to the right SDK for this provider type."""
        config = self.providers[provider]
        ptype = config["type"]

        if ptype == "openai_sdk":
            return await self._call_openai_sdk(provider, config, prompt, system, max_tokens)
        elif ptype == "gemini_sdk":
            return await self._call_gemini_sdk(config, prompt, system, max_tokens)
        elif ptype == "anthropic_sdk":
            return await self._call_anthropic_sdk(config, prompt, system, max_tokens)
        raise NotImplementedError(f"Provider type {ptype} not implemented")

    async def _call_openai_sdk(
        self,
        provider: ModelProvider,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """OpenAI Python SDK — covers OpenAI, OpenRouter, Groq, NVIDIA (OpenAI-compatible)."""
        from openai import AsyncOpenAI

        default_headers = None
        if provider == ModelProvider.OPENROUTER:
            # OpenRouter attribution headers (recommended, not required)
            default_headers = {
                "HTTP-Referer": "https://github.com/KunjShah95/codegenome",
                "X-Title": "CodeGenome",
            }

        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            default_headers=default_headers,
            timeout=30.0,
        )

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = await client.chat.completions.create(
            model=config["model"],
            messages=messages,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content

    async def _call_gemini_sdk(
        self,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """Google Gen AI SDK (google-genai)."""
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=config["api_key"])

        gen_config = None
        if system:
            gen_config = types.GenerateContentConfig(system_instruction=system)

        resp = await client.aio.models.generate_content(
            model=config["model"],
            contents=prompt,
            config=gen_config,
        )
        return resp.text

    async def _call_anthropic_sdk(
        self,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """Anthropic SDK (Claude)."""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=config["api_key"], timeout=30.0)

        kwargs = {
            "model": config["model"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        resp = await client.messages.create(**kwargs)
        return resp.content[0].text


    # ── Streaming ────────────────────────────────────────────────────────────

    async def chat_stream(self, prompt: str, system: str = None, max_tokens: int = 2000):
        """Stream a response token-by-token with provider fallback.

        Fallback only applies *before* the first token of a provider is emitted;
        once a provider starts streaming we commit to it (can't cleanly resume
        a half-emitted answer on another provider).
        """
        errors = []
        for provider in self.fallback_chain:
            config = self.providers[provider]
            if not config["api_key"]:
                continue
            yielded = False
            try:
                async for token in self._stream_provider(provider, prompt, system, max_tokens):
                    yielded = True
                    yield token
                if self.current_provider != provider:
                    logger.info(f"Switched to provider (stream): {provider.value}")
                    self.current_provider = provider
                return
            except Exception as e:
                if yielded:
                    raise
                err_msg = f"{provider.value} failed: {str(e)}"
                logger.warning(err_msg)
                errors.append(err_msg)
        raise RuntimeError(f"All LLM providers exhausted (stream). Errors: {'; '.join(errors)}")

    async def _stream_provider(self, provider, prompt, system, max_tokens):
        config = self.providers[provider]
        ptype = config["type"]
        if ptype == "openai_sdk":
            async for t in self._stream_openai_sdk(provider, config, prompt, system, max_tokens):
                yield t
        elif ptype == "gemini_sdk":
            async for t in self._stream_gemini_sdk(config, prompt, system, max_tokens):
                yield t
        elif ptype == "anthropic_sdk":
            async for t in self._stream_anthropic_sdk(config, prompt, system, max_tokens):
                yield t
        else:
            raise NotImplementedError(f"Provider type {ptype} not implemented")

    async def _stream_openai_sdk(self, provider, config, prompt, system, max_tokens):
        from openai import AsyncOpenAI

        default_headers = None
        if provider == ModelProvider.OPENROUTER:
            default_headers = {
                "HTTP-Referer": "https://github.com/KunjShah95/codegenome",
                "X-Title": "CodeGenome",
            }
        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            default_headers=default_headers,
            timeout=60.0,
        )
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        stream = await client.chat.completions.create(
            model=config["model"], messages=messages, max_tokens=max_tokens, stream=True
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_gemini_sdk(self, config, prompt, system, max_tokens):
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=config["api_key"])
        gen_config = types.GenerateContentConfig(system_instruction=system) if system else None
        stream = await client.aio.models.generate_content_stream(
            model=config["model"], contents=prompt, config=gen_config
        )
        async for chunk in stream:
            if getattr(chunk, "text", None):
                yield chunk.text

    async def _stream_anthropic_sdk(self, config, prompt, system, max_tokens):
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=config["api_key"], timeout=60.0)
        kwargs = {
            "model": config["model"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text


# For backward compatibility, maintain LLMClient as an alias
LLMClient = LLMRouter
