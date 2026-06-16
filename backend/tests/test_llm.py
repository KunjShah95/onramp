import pytest
import os
from unittest.mock import patch, AsyncMock
import httpx
from app.llm import LLMClient


@pytest.mark.asyncio
async def test_llm_client_fallback_success():
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test_gemini_key"}):
        client = LLMClient()
        mock_response = httpx.Response(
            status_code=200,
            json={
                "candidates": [{
                    "content": {
                        "parts": [{
                            "text": "Gemini response text"
                        }]
                    }
                }]
            },
            request=httpx.Request("POST", "https://generativelanguage.googleapis.com")
        )
        
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            res = await client.chat("Hello")
            assert res == "Gemini response text"
            assert mock_post.called
            called_url = mock_post.call_args[0][0]
            assert "generativelanguage.googleapis.com" in called_url


@pytest.mark.asyncio
async def test_llm_client_fallback_to_openai():
    with patch.dict(os.environ, {
        "GEMINI_API_KEY": "test_gemini_key",
        "OPENAI_API_KEY": "test_openai_key"
    }):
        client = LLMClient()
        gemini_fail = httpx.Response(
            status_code=500,
            request=httpx.Request("POST", "https://generativelanguage.googleapis.com")
        )
        openai_success = httpx.Response(
            status_code=200,
            json={
                "choices": [{
                    "message": {
                        "content": "OpenAI response text"
                    }
                }]
            },
            request=httpx.Request("POST", "https://api.openai.com")
        )
        
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [gemini_fail, openai_success]
            
            res = await client.chat("Hello")
            assert res == "OpenAI response text"
            assert mock_post.call_count == 2
            
            # Verify the first call was Gemini, and second was OpenAI
            first_url = mock_post.call_args_list[0][0][0]
            second_url = mock_post.call_args_list[1][0][0]
            assert "generativelanguage.googleapis.com" in first_url
            assert "api.openai.com" in second_url
