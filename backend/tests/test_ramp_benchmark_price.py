"""The cost model's benchmark price must track what we actually charge.

This was a hardcoded $99/mo while the plan we sell is 2999 INR/mo (~$36 at the
platform rate). Because the benchmark only falls back to the platform default
when a team has no live subscription, the wrong number was shown to prospects —
the people evaluating us — and every ROI figure built on it was wrong.

The test below pins the derived default to billing_service.TIER_PRICING so the
two cannot drift apart silently again.
"""
import importlib

import pytest

from app.services import billing_service, ramp_service, team_cost_settings

# The plan the benchmark is meant to represent.
BENCHMARK_TIER = "professional"


def test_benchmark_price_matches_the_plan_we_actually_sell():
    inr = billing_service.TIER_PRICING[BENCHMARK_TIER]["price_monthly"]
    assert inr > 0, "benchmark tier must have a real price"

    expected_usd = round(inr / ramp_service.ONRAMP_INR_TO_USD_RATE, 2)
    assert ramp_service.ONRAMP_PRICE_INR_PER_MONTH == inr, (
        f"ONRAMP_PRICE_INR_PER_MONTH ({ramp_service.ONRAMP_PRICE_INR_PER_MONTH}) "
        f"has drifted from TIER_PRICING[{BENCHMARK_TIER!r}] ({inr}). "
        "Update the default or set ONRAMP_PRICE_INR_PER_MONTH explicitly."
    )
    assert ramp_service.ONRAMP_PRICE_USD_PER_MONTH == pytest.approx(expected_usd, abs=0.01)


def test_benchmark_is_not_the_old_stale_ninety_nine():
    # Guards the specific regression, independent of the FX rate.
    assert ramp_service.ONRAMP_PRICE_USD_PER_MONTH != 99.0


def test_both_modules_agree_on_the_fx_rate():
    # team_cost_settings converts a live INR subscription with its own rate.
    # If these diverge, a subscribed team and a prospect are modelled at
    # different exchange rates for the same product.
    assert team_cost_settings.INR_TO_USD_RATE == ramp_service.ONRAMP_INR_TO_USD_RATE


def test_explicit_usd_override_still_wins(monkeypatch):
    monkeypatch.setenv("ONRAMP_PRICE_USD_PER_MONTH", "77.5")
    reloaded = importlib.reload(ramp_service)
    try:
        assert reloaded.ONRAMP_PRICE_USD_PER_MONTH == 77.5
    finally:
        monkeypatch.delenv("ONRAMP_PRICE_USD_PER_MONTH", raising=False)
        importlib.reload(ramp_service)


def test_inr_price_override_is_converted(monkeypatch):
    monkeypatch.setenv("ONRAMP_PRICE_INR_PER_MONTH", "8400")
    monkeypatch.delenv("ONRAMP_PRICE_USD_PER_MONTH", raising=False)
    reloaded = importlib.reload(ramp_service)
    try:
        assert reloaded.ONRAMP_PRICE_INR_PER_MONTH == 8400.0
        assert reloaded.ONRAMP_PRICE_USD_PER_MONTH == pytest.approx(100.0, abs=0.01)
    finally:
        monkeypatch.delenv("ONRAMP_PRICE_INR_PER_MONTH", raising=False)
        importlib.reload(ramp_service)
