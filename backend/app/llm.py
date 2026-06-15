import os
from typing import Dict, Optional
import httpx


class LLMClient:
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self.model = model
        self.base_url = "https://api.anthropic.com/v1/messages"
        self.max_retries = 3

    async def chat(self, prompt: str, system: str = "", max_tokens: int = 2048) -> str:
        if not self.api_key:
            return "LLM not configured - set ANTHROPIC_API_KEY"

        messages = [{"role": "user", "content": prompt}]
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            body["system"] = system

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(self.base_url, json=body, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    return data["content"][0]["text"]
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return f"LLM error: {str(e)}"

    async def json_chat(self, prompt: str, system: str = "") -> Dict:
        result = await self.chat(prompt, system=system, max_tokens=4096)
        import json
        try:
            start = result.index("{")
            end = result.rindex("}") + 1
            return json.loads(result[start:end])
        except (ValueError, json.JSONDecodeError):
            return {"error": "Failed to parse LLM response", "raw": result}
