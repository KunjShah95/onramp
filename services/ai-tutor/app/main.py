from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(
    title="AI Tutor Service",
    version="2.0.0",
    description="Multi-provider AI integration - Gemini, Claude, GPT",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 30):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()

        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if current_time - t < 60
        ]

        if len(self.requests[client_ip]) >= self.requests_per_minute:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        self.requests[client_ip].append(current_time)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(
            self.requests_per_minute - len(self.requests[client_ip])
        )
        return response


app.add_middleware(RateLimitMiddleware, requests_per_minute=30)


class Question(BaseModel):
    question: str
    context: Optional[str] = None
    repo_url: Optional[str] = None


class AIResponse(BaseModel):
    answer: str
    provider: str
    model: str
    sources: List[str] = []


class CodeExplanation(BaseModel):
    code: str
    language: str


# Simple in-memory cache for demo
qa_cache = {}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-tutor"}


def build_prompt(question: Question) -> str:
    prompt = "You are an expert software engineer tutoring someone about a codebase.\n"
    if question.context:
        prompt += f"Context:\n{question.context}\n"
    prompt += f"\nQuestion: {question.question}"
    return prompt


async def try_ollama(prompt: str, cache_key: str):
    try:
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": "llama3.1",
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                },
                timeout=30.0,
            )
            if response.status_code == 200:
                data = response.json()
                result = AIResponse(
                    answer=data["message"]["content"],
                    provider="ollama",
                    model="llama3.1",
                    sources=[],
                )
                qa_cache[cache_key] = result
                return result
    except Exception:
        pass
    return None


async def try_groq(prompt: str, cache_key: str):
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=groq_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
        )
        result = AIResponse(
            answer=response.choices[0].message.content,
            provider="groq",
            model="llama-3.3-70b-versatile",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


async def try_mistral(prompt: str, cache_key: str):
    mistral_key = os.getenv("MISTRAL_API_KEY", "")
    if not mistral_key:
        return None
    try:
        from mistralai import Mistral

        client = Mistral(api_key=mistral_key)
        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
        )
        result = AIResponse(
            answer=response.choices[0].message.content,
            provider="mistral",
            model="mistral-small-latest",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


async def try_cohere(prompt: str, cache_key: str):
    cohere_key = os.getenv("COHERE_API_KEY", "")
    if not cohere_key:
        return None
    try:
        import cohere

        client = cohere.Client(api_key=cohere_key)
        response = client.generate(
            prompt=prompt,
            model="command-r-plus",
            max_tokens=1024,
        )
        result = AIResponse(
            answer=response.generations[0].text,
            provider="cohere",
            model="command-r-plus",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


async def try_openrouter(prompt: str, cache_key: str):
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
    if not openrouter_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1",
        )
        response = client.chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
        )
        result = AIResponse(
            answer=response.choices[0].message.content or "",
            provider="openrouter",
            model="openai/gpt-4o-mini",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


async def try_custom(prompt: str, cache_key: str):
    custom_endpoint = os.getenv("CUSTOM_LLM_ENDPOINT", "")
    if not custom_endpoint:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY", "not-needed"),
            base_url=custom_endpoint,
        )
        response = client.chat.completions.create(
            model=os.getenv("CUSTOM_LLM_MODEL", "gpt-3.5-turbo"),
            messages=[{"role": "user", "content": prompt}],
        )
        result = AIResponse(
            answer=response.choices[0].message.content or "",
            provider="custom",
            model=os.getenv("CUSTOM_LLM_MODEL", "custom"),
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


@app.post("/api/v1/ask", response_model=AIResponse)
async def ask_question(question: Question):
    """Ask the AI tutor a question about a codebase"""
    cache_key = f"{question.question}:{question.context}"

    if cache_key in qa_cache:
        return qa_cache[cache_key]

    prompt = build_prompt(question)

    providers = [
        ("google", os.getenv("GEMINI_API_KEY"), try_gemini),
        ("openai", os.getenv("OPENAI_API_KEY"), try_openai),
        ("anthropic", os.getenv("ANTHROPIC_API_KEY"), try_anthropic),
        ("groq", os.getenv("GROQ_API_KEY"), try_groq),
        ("mistral", os.getenv("MISTRAL_API_KEY"), try_mistral),
        ("cohere", os.getenv("COHERE_API_KEY"), try_cohere),
        ("openrouter", os.getenv("OPENROUTER_API_KEY"), try_openrouter),
        ("custom", os.getenv("CUSTOM_LLM_ENDPOINT"), try_custom),
    ]

    for name, key, try_func in providers:
        if key:
            result = await try_func(prompt, cache_key)
            if result:
                return result

    result = await try_ollama(prompt, cache_key)
    if result:
        return result

    fallback_answer = AIResponse(
        answer="I can help explain codebases, generate learning paths, and answer technical questions. Configure an AI provider to get started.",
        provider="demo",
        model="demo",
        sources=[],
    )
    qa_cache[cache_key] = fallback_answer
    return fallback_answer


async def try_gemini(prompt: str, cache_key: str):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        result = AIResponse(
            answer=response.text,
            provider="google",
            model="gemini-1.5-flash",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


async def try_openai(prompt: str, cache_key: str):
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=openai_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
        )
        result = AIResponse(
            answer=response.choices[0].message.content or "",
            provider="openai",
            model="gpt-4o-mini",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


async def try_anthropic(prompt: str, cache_key: str):
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        return None
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=anthropic_key)
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        result = AIResponse(
            answer=response.content[0].text,
            provider="anthropic",
            model="claude-3-haiku",
            sources=[],
        )
        qa_cache[cache_key] = result
        return result
    except Exception:
        pass
    return None


@app.post("/api/v1/explain", response_model=AIResponse)
async def explain_code(explanation: CodeExplanation):
    """Explain a piece of code"""
    prompt = f"Explain this {explanation.language} code clearly and concisely:\n\n{explanation.code}"

    question = Question(question=prompt)
    return await ask_question(question)


@app.post("/api/v1/refactor")
async def refactor_code(code: str, language: str = "python"):
    """Get code refactoring suggestions"""
    prompt = (
        f"Refactor this {language} code to be cleaner and more maintainable:\n\n{code}"
    )

    question = Question(question=prompt)
    response = await ask_question(question)

    return {"suggestions": response.answer, "provider": response.provider}


PROVIDER_MODELS = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307",
    ],
    "google": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
    "groq": [
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "mixtral-8x7b-32768",
    ],
    "cohere": ["command-r-plus", "command-r"],
    "mistral": ["mistral-large-latest", "mistral-small-latest"],
    "ollama": ["llama3.3", "llama3.1", "mistral", "codellama"],
    "azure": ["gpt-4", "gpt-35-turbo"],
    "openrouter": [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "meta-llama/llama-3.3-70b-instruct",
        "google/gemini-2.0-flash",
        "mistralai/mistral-small",
        "deepseek/deepseek-chat",
    ],
    "custom": ["custom"],
}


@app.get("/api/v1/providers")
async def list_providers():
    """List available AI providers"""
    providers = [
        {
            "name": "openai",
            "configured": bool(os.getenv("OPENAI_API_KEY")),
            "free": False,
            "models": PROVIDER_MODELS["openai"],
        },
        {
            "name": "anthropic",
            "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
            "free": False,
            "models": PROVIDER_MODELS["anthropic"],
        },
        {
            "name": "google",
            "configured": bool(os.getenv("GEMINI_API_KEY")),
            "free": True,
            "models": PROVIDER_MODELS["google"],
        },
        {
            "name": "groq",
            "configured": bool(os.getenv("GROQ_API_KEY")),
            "free": True,
            "models": PROVIDER_MODELS["groq"],
        },
        {
            "name": "cohere",
            "configured": bool(os.getenv("COHERE_API_KEY")),
            "free": False,
            "models": PROVIDER_MODELS["cohere"],
        },
        {
            "name": "mistral",
            "configured": bool(os.getenv("MISTRAL_API_KEY")),
            "free": True,
            "models": PROVIDER_MODELS["mistral"],
        },
        {
            "name": "ollama",
            "configured": True,
            "free": True,
            "models": PROVIDER_MODELS["ollama"],
            "note": "Local",
        },
        {
            "name": "azure",
            "configured": bool(os.getenv("AZURE_OPENAI_API_KEY")),
            "free": False,
            "models": PROVIDER_MODELS["azure"],
        },
        {
            "name": "openrouter",
            "configured": bool(os.getenv("OPENROUTER_API_KEY")),
            "free": True,
            "models": PROVIDER_MODELS["openrouter"],
            "note": "300+ models via unified API",
        },
        {
            "name": "custom",
            "configured": bool(os.getenv("CUSTOM_LLM_ENDPOINT")),
            "free": True,
            "models": ["any OpenAI-compatible model"],
            "note": "Set CUSTOM_LLM_ENDPOINT for LM Studio, LocalAI, etc.",
        },
    ]
    return {"available": providers}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3004"))
    uvicorn.run(app, host="0.0.0.0", port=port)
