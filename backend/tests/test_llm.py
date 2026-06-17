import pytest
import os
from unittest.mock import patch, AsyncMock
from app.llm import LLMClient


@pytest.mark.asyncio
async def test_llm_client_fallback_success():
    """Primary free provider (Gemini) is used when it succeeds."""
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}, clear=False):
        client = LLMClient()
        with patch.object(
            client, "_call_gemini_sdk", new=AsyncMock(return_value="Gemini response text")
        ) as mock_gemini:
            res = await client.chat("Hello")
            assert res == "Gemini response text"
            assert mock_gemini.called


@pytest.mark.asyncio
async def test_llm_client_fallback_to_openai():
    """When the free provider fails, the chain falls back to the paid provider."""
    with patch.dict(
        os.environ,
        {"GEMINI_API_KEY": "test_gemini_key", "OPENAI_API_KEY": "test_openai_key"},
        clear=False,
    ):
        client = LLMClient()
        with patch.object(
            client, "_call_gemini_sdk", new=AsyncMock(side_effect=Exception("gemini down"))
        ) as mock_gemini, patch.object(
            client, "_call_openai_sdk", new=AsyncMock(return_value="OpenAI response text")
        ) as mock_openai:
            res = await client.chat("Hello")
            assert res == "OpenAI response text"
            # Free provider attempted first, then fell back to paid.
            assert mock_gemini.called
            assert mock_openai.called
