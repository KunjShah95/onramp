"""Per-model token pricing and dollar-cost estimation.

Lets the router report not just *which* provider served a request but what it
*cost* — and how much the free-first routing saved compared to always using
the paid baseline model (the model the app historically called before the
router existed).

Prices are USD per 1M tokens (input/output), published rates for the models
configured in :data:`app.llm.LLMRouter.providers`. They are deliberately
centralized here so they can be updated in one place. Each request snapshots
the price into its route metadata, so historical cost numbers stay stable
even if the table changes later.
"""

from typing import Dict

import os

# USD per 1M tokens, keyed by the model id as configured in LLMRouter.providers.
# Free-tier / self-hosted models are priced at $0 — the whole point of the
# free-first router. Adjust these numbers if provider pricing changes.
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # Free / local providers
    "google/gemini-2.5-flash:free": {"input": 0.0, "output": 0.0},
    "gemini-2.5-flash":             {"input": 0.30, "output": 2.50},
    "llama-3.3-70b-versatile":      {"input": 0.59, "output": 0.79},
    "meta/llama-3.3-70b-instruct":  {"input": 0.10, "output": 0.20},
    "llama3.2:3b":                  {"input": 0.0, "output": 0.0},  # local Ollama
    # Paid providers
    "gpt-4o-mini":                  {"input": 0.15, "output": 0.60},
    "claude-3-5-sonnet-20241022":   {"input": 3.00, "output": 15.00},
    "mistral-large-latest":         {"input": 2.00, "output": 6.00},
    "Qwen/Qwen2.5-72B-Instruct":    {"input": 0.40, "output": 0.40},
    # Embedding models — USD and INR per 1M input tokens (embeddings have no
    # output tokens). Free/local models are $0 in both currencies.
    "text-embedding-3-small":  {"input": 0.02, "output": 0.0, "inr_input": 1.70,  "inr_output": 0.0},
    "text-embedding-004":      {"input": 0.0,   "output": 0.0, "inr_input": 0.0,   "inr_output": 0.0},
    "NV-Embed-QA":             {"input": 0.0,   "output": 0.0, "inr_input": 0.0,   "inr_output": 0.0},
    "nomic-embed-text":        {"input": 0.0,   "output": 0.0, "inr_input": 0.0,   "inr_output": 0.0},
    "all-MiniLM-L6-v2":        {"input": 0.0,   "output": 0.0, "inr_input": 0.0,   "inr_output": 0.0},
    "sentence-transformers/all-MiniLM-L6-v2": {"input": 0.0, "output": 0.0, "inr_input": 0.0, "inr_output": 0.0},
    "embed-english-v3.0":      {"input": 0.10,  "output": 0.0, "inr_input": 8.50,  "inr_output": 0.0},
    "voyage-code-3":           {"input": 0.12,  "output": 0.0, "inr_input": 10.20, "inr_output": 0.0},
}

# Conservative fallback for any model missing from the table above.
DEFAULT_PRICE: Dict[str, float] = {"input": 1.00, "output": 3.00}

# The model the app would historically have used before free-first routing.
# ``cost_avoided`` measures the dollar savings relative to always using this
# model for every request.
BASELINE_MODEL = "claude-3-5-sonnet-20241022"

# INR per 1 USD, used to derive INR pricing when a model has no explicit
# INR rate. Overridable via env for deployments that need a different rate.
USD_TO_INR = float(os.getenv("USD_TO_INR", "85.0"))


def get_price(model: str) -> Dict[str, float]:
    """Return ``{"input", "output", "inr_input", "inr_output"}`` for a model.

    INR fields default to the USD price × :data:`USD_TO_INR` when a model has
    no explicit INR rate. Unknown models fall back to :data:`DEFAULT_PRICE`.
    """
    entry = MODEL_PRICING.get(model)
    if entry is None:
        # Try matching the bare model id (e.g. an OpenRouter-style
        # "provider/model" served id) against known ids.
        for key, price in MODEL_PRICING.items():
            if model.endswith("/" + key) or key.endswith("/" + model):
                entry = price
                break
    if entry is None:
        entry = DEFAULT_PRICE
    result = dict(entry)
    result.setdefault("inr_input", round(result["input"] * USD_TO_INR, 4))
    result.setdefault("inr_output", round(result["output"] * USD_TO_INR, 4))
    return result


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars per token). Best-effort, never 0."""
    return max(1, len(text or "") // 4)


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    price: Dict[str, float] | None = None,
) -> float:
    """Actual dollar cost of a completion on ``model``.

    ``input_tokens``/``output_tokens`` are token counts (estimates are fine);
    prices come from :data:`MODEL_PRICING`. Pass ``price`` (a
    ``{"input": ..., "output": ...}`` dict) to use a price snapshot instead
    — e.g. the per-request prices persisted in the route metadata.
    """
    if price is None:
        price = get_price(model)
    return (
        price["input"] * input_tokens / 1_000_000
        + price["output"] * output_tokens / 1_000_000
    )


def calculate_cost_avoided(
    model: str,
    input_tokens: int,
    output_tokens: int,
    price: Dict[str, float] | None = None,
) -> float:
    """Dollars saved by routing to ``model`` instead of the baseline model.

    = (cost the request would have had on :data:`BASELINE_MODEL`)
      - (actual cost on ``model``)

    For free providers this equals the full baseline cost; for paid models it
    shrinks (or is ~0 when the paid model *is* the baseline). Pass ``price``
    to cost the actual side against a snapshot instead of the live table.
    """
    baseline_cost = calculate_cost(BASELINE_MODEL, input_tokens, output_tokens)
    actual_cost = calculate_cost(model, input_tokens, output_tokens, price=price)
    return max(0.0, baseline_cost - actual_cost)


def calculate_embedding_cost(
    model: str,
    input_tokens: int,
    price: Dict[str, float] | None = None,
) -> tuple[float, float]:
    """Dollar + INR cost of embedding ``input_tokens`` on ``model``.

    Embeddings have no output tokens. Returns ``(usd, inr)``; pass ``price``
    (a ``get_price`` snapshot) to cost against a persisted snapshot instead
    of the live table.
    """
    if price is None:
        price = get_price(model)
    usd = price["input"] * input_tokens / 1_000_000
    inr = price.get("inr_input", price["input"] * USD_TO_INR) * input_tokens / 1_000_000
    return round(usd, 6), round(inr, 6)
