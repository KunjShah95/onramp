"""Tests for per-model token pricing and dollar cost estimation."""

import pytest

from app.services.llm_costs import (
    BASELINE_MODEL,
    DEFAULT_PRICE,
    MODEL_PRICING,
    USD_TO_INR,
    calculate_cost,
    calculate_cost_avoided,
    calculate_embedding_cost,
    estimate_tokens,
    get_price,
)


class TestGetPrice:
    def test_known_model(self):
        price = get_price("claude-3-5-sonnet-20241022")
        assert price["input"] == 3.00
        assert price["output"] == 15.00

    def test_free_model_is_zero(self):
        price = get_price("google/gemini-2.5-flash:free")
        assert price["input"] == 0.0
        assert price["output"] == 0.0

    def test_served_id_matches_bare_model(self):
        # route["served"] is "groq/llama-3.3-70b-versatile" — bare-id fallback.
        price = get_price("groq/llama-3.3-70b-versatile")
        assert price["input"] == MODEL_PRICING["llama-3.3-70b-versatile"]["input"]
        assert price["output"] == MODEL_PRICING["llama-3.3-70b-versatile"]["output"]

    def test_unknown_model_uses_default_price(self):
        price = get_price("some-future-model")
        assert price["input"] == DEFAULT_PRICE["input"]
        assert price["output"] == DEFAULT_PRICE["output"]

    def test_get_price_returns_copy(self):
        price = get_price("gpt-4o-mini")
        price["input"] = 999.0
        assert get_price("gpt-4o-mini")["input"] == 0.15


class TestEstimateTokens:
    def test_never_zero(self):
        assert estimate_tokens("") == 1
        assert estimate_tokens("x") == 1

    def test_rough_char_based(self):
        assert estimate_tokens("a" * 400) == 100


class TestCalculateCost:
    def test_claude_cost(self):
        # 1_000 input tokens * $3/1M + 500 output * $15/1M
        assert calculate_cost("claude-3-5-sonnet-20241022", 1000, 500) == pytest.approx(0.0105)

    def test_gpt4o_mini_cost(self):
        assert calculate_cost("gpt-4o-mini", 1_000_000, 1_000_000) == pytest.approx(0.75)

    def test_free_model_costs_nothing(self):
        assert calculate_cost("google/gemini-2.5-flash:free", 10_000, 10_000) == 0.0


class TestCalculateCostAvoided:
    def test_free_provider_saves_full_baseline_cost(self):
        # A free request avoids the entire Claude-baseline price.
        saved = calculate_cost_avoided("google/gemini-2.5-flash:free", 2000, 800)
        baseline = calculate_cost(BASELINE_MODEL, 2000, 800)
        assert saved == pytest.approx(baseline)
        assert saved > 0.0

    def test_baseline_model_itself_avoids_nothing(self):
        assert calculate_cost_avoided(BASELINE_MODEL, 5000, 1200) == 0.0

    def test_paid_cheaper_model_saves_partial(self):
        # gpt-4o-mini is cheaper than the Claude baseline.
        saved = calculate_cost_avoided("gpt-4o-mini", 10_000, 10_000)
        assert 0.0 < saved < calculate_cost(BASELINE_MODEL, 10_000, 10_000)

    def test_never_negative(self):
        assert calculate_cost_avoided("claude-3-5-sonnet-20241022", 0, 0) == 0.0


class TestEmbeddingPricing:
    """USD + INR pricing for embedding models."""

    def test_get_price_returns_inr_fields(self):
        price = get_price("text-embedding-3-small")
        assert price["input"] == 0.02
        assert price["inr_input"] > 0

    def test_get_price_derives_inr_from_usd(self):
        # text-embedding-004 has no explicit inr_input; INR is derived from USD.
        price = get_price("text-embedding-004")
        assert price["input"] == 0.0
        assert price["inr_input"] == 0.0

    def test_embedding_cost_usd_and_inr(self):
        usd, inr = calculate_embedding_cost("text-embedding-3-small", 1_000_000)
        assert usd == 0.02
        assert inr == pytest.approx(0.02 * USD_TO_INR, rel=0.01)

    def test_unknown_model_embedding_cost_uses_default(self):
        usd, inr = calculate_embedding_cost("nope-embed", 1_000_000)
        assert usd > 0 and inr > 0
