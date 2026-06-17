import os
import pytest
from unittest.mock import patch
from app.llm import LLMClient


@pytest.mark.asyncio
async def test_chat_stream_yields_tokens():
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}, clear=False):
        client = LLMClient()

        async def fake_stream(*args, **kwargs):
            for tok in ["Hel", "lo ", "world"]:
                yield tok

        with patch.object(client, "_stream_gemini_sdk", fake_stream):
            tokens = [t async for t in client.chat_stream("hi")]
        assert "".join(tokens) == "Hello world"


@pytest.mark.asyncio
async def test_chat_stream_falls_back_before_first_token():
    with patch.dict(
        os.environ,
        {"GEMINI_API_KEY": "k", "OPENAI_API_KEY": "k2"},
        clear=False,
    ):
        client = LLMClient()

        async def failing(*args, **kwargs):
            raise RuntimeError("gemini down")
            yield  # pragma: no cover - makes this an async generator

        async def ok(*args, **kwargs):
            yield "from-openai"

        with patch.object(client, "_stream_gemini_sdk", failing), patch.object(
            client, "_stream_openai_sdk", ok
        ):
            tokens = [t async for t in client.chat_stream("hi")]
        assert tokens == ["from-openai"]
