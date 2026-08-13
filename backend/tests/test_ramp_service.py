"""
Tests for the Ramp Visibility & Senior-Time Protection service (v1.4 wedge).

Runs against InMemoryStorage by default (STORAGE_BACKEND=memory from
conftest). Covers: the senior-time cost model, the Track/Quantify summary
(benchmark + profiles), stuck-dev detection rules, and the deduped alert
firing in fire_stuck_alerts.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.services import ramp_service as ramp
from app.services.postgres_db import get_storage, generate_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _seed_team(storage, team_id="team-ramp-1") -> str:
    await storage.create_document("teams", team_id, {
        "id": team_id,
        "name": "Ramp Team",
        "description": "",
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
    })
    return team_id


async def _seed_user(storage, uid: str, name: str = "Trainee") -> None:
    await storage.create_document("users", uid, {
        "id": uid,
        "name": name,
        "email": f"{uid}@test.com",
        "provider": "password",
        "is_active": True,
    })


async def _seed_member(storage, team_id: str, uid: str, role: str, joined_days_ago: int = 30) -> None:
    await storage.create_document("team_members", generate_id(), {
        "user_id": uid,
        "team_id": team_id,
        "role": role,
        "joined_at": _now() - timedelta(days=joined_days_ago),
    })


async def _seed_task(
    storage,
    team_id: str,
    assignee: str,
    state: str,
    review_cycles: int = 0,
    updated_days_ago: int = 0,
    completed_days_ago: int | None = None,
    pr_merged_days_ago: int | None = None,
    title: str = "Task",
) -> dict:
    task = {
        "task_id": generate_id(),
        "team_id": team_id,
        "created_by": "senior-1",
        "assigned_to": assignee,
        "title": title,
        "module": "core",
        "state": state,
        "review_cycles": review_cycles,
        "created_at": _now() - timedelta(days=30),
        "updated_at": _now() - timedelta(days=updated_days_ago),
        "started_at": None,
        "submitted_at": None,
        "reviewed_at": None,
        "completed_at": (
            _now() - timedelta(days=completed_days_ago)
            if completed_days_ago is not None else None
        ),
        "pr_merged_at": (
            _now() - timedelta(days=pr_merged_days_ago)
            if pr_merged_days_ago is not None else None
        ),
    }
    await storage.create_document("onramp_tasks", task["task_id"], task)
    return task


# ── Cost model ─────────────────────────────────────────────────────────────


def test_senior_hours_for_task_review_cycles():
    task = {"state": "completed", "review_cycles": 4}
    # 4 cycles × 0.5h = 2h
    assert ramp.senior_hours_for_task(task) == pytest.approx(2.0)


def test_senior_hours_for_task_stalled_adds_reengagement():
    task = {
        "state": "in_progress",
        "review_cycles": 0,
        "updated_at": _now() - timedelta(days=21),
    }
    # 21 days stalled → 3 weeks × 0.5h re-engagement = 1.5h
    assert ramp.senior_hours_for_task(task) == pytest.approx(1.5)


def test_senior_time_estimate_returns_cost():
    tasks = [
        {"state": "completed", "review_cycles": 2},
        {"state": "completed", "review_cycles": 0},
    ]
    est = ramp.senior_time_estimate(tasks)
    assert est["senior_hours"] == pytest.approx(1.0)
    # 1h × $90 rate
    assert est["senior_cost_usd"] == pytest.approx(90.0)


# ── Phase 0 — cost-model pressure-test harness ────────────────────────────


def test_senior_time_estimate_respects_cost_settings():
    """Phase 0: team calibration flows into the estimate — a $115 rate or a
    0.25h/cycle review changes the cost story without code changes."""
    tasks = [{"state": "completed", "review_cycles": 2}]
    # 2 cycles × 0.5h × $115 = $115
    est = ramp.senior_time_estimate(tasks, {"senior_hourly_rate_usd": 115.0})
    assert est["senior_cost_usd"] == pytest.approx(115.0)
    # 2 cycles × 0.25h (20-minute reviews) = 0.5h
    est = ramp.senior_time_estimate(tasks, {"review_hours_per_cycle": 0.25})
    assert est["senior_hours"] == pytest.approx(0.5)


def test_measured_cost_stats_elapsed_and_stall():
    """Phase 0: measured signals bound the assumptions — elapsed cycle time
    (submitted → reviewed) and the stalled re-engagement weeks actually
    accumulating on open tasks."""
    now = _now()
    tasks = [
        {  # reviewed 4h after submission
            "review_cycles": 2,
            "submitted_at": (now - timedelta(days=1)).isoformat(),
            "reviewed_at": (now - timedelta(hours=20)).isoformat(),
        },
        {  # 21 days stalled → 3 re-engagement weeks
            "state": "in_progress",
            "review_cycles": 0,
            "updated_at": (now - timedelta(days=21)).isoformat(),
        },
    ]
    stats = ramp._measured_cost_stats(tasks)
    assert stats["review_cycles"] == 2
    assert stats["avg_cycle_elapsed_hours"] == pytest.approx(4.0)
    assert stats["stall_weeks"] == pytest.approx(3.0)


def test_cost_sensitivity_band_contains_current():
    """Phase 0: the estimate's uncertainty band brackets the current model."""
    settings = {
        "senior_hourly_rate_usd": 90.0,
        "review_hours_per_cycle": 0.5,
        "stalled_weekly_hours": 0.5,
    }
    band = ramp.cost_sensitivity(cycle_count=2, stall_weeks=1.0, settings=settings)
    # current = (2×0.5h + 1×0.5h) × $90 = $135
    assert band["cost_current"] == pytest.approx(135.0)
    assert band["cost_low"] <= band["cost_current"] <= band["cost_high"]


async def test_team_cost_settings_defaults_and_partial_override():
    from app.services import team_cost_settings as tcs

    storage = get_storage()
    await _seed_team(storage, "team-cost-1")

    # No override → platform defaults, source "platform".
    effective = await tcs.get_team_cost_settings("team-cost-1")
    assert effective["source"] == "platform"
    assert effective["senior_hourly_rate_usd"] == pytest.approx(ramp.SENIOR_HOURLY_RATE_USD)

    # Partial override → only the sent field changes; source flips to "team".
    updated = await tcs.set_team_cost_settings(
        "team-cost-1", "senior-1", {"senior_hourly_rate_usd": 115.0}
    )
    assert updated["source"] == "team"
    assert updated["senior_hourly_rate_usd"] == pytest.approx(115.0)
    assert updated["review_hours_per_cycle"] == pytest.approx(ramp.REVIEW_HOURS_PER_CYCLE)

    # A later write keeps earlier overrides (upsert, not replace).
    again = await tcs.set_team_cost_settings(
        "team-cost-1", "senior-1", {"review_hours_per_cycle": 0.25}
    )
    assert again["review_hours_per_cycle"] == pytest.approx(0.25)
    assert again["senior_hourly_rate_usd"] == pytest.approx(115.0)


async def test_team_cost_settings_validation():
    from app.services import team_cost_settings as tcs

    with pytest.raises(ValueError, match="between"):
        await tcs.set_team_cost_settings(
            "team-cost-2", "senior-1", {"senior_hourly_rate_usd": 5.0}
        )
    with pytest.raises(ValueError, match="between"):
        await tcs.set_team_cost_settings(
            "team-cost-2", "senior-1", {"review_hours_per_cycle": 12.0}
        )


async def test_summary_cost_model_block_and_override():
    """Phase 0: the summary carries the effective assumptions, measured
    signals and the sensitivity band; a team override changes the totals."""
    from app.services import team_cost_settings as tcs

    storage = get_storage()
    await _seed_team(storage, "team-cost-3")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-cost-3", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-cost-3", "senior-1", "senior_dev")
    await _seed_task(storage, "team-cost-3", "trainee-a", "completed",
                     review_cycles=2, completed_days_ago=10, updated_days_ago=10)

    summary = await ramp.get_ramp_summary("team-cost-3")
    model = summary["cost_model"]
    assert model["source"] == "platform"
    assert model["measured"]["review_cycles"] == 2
    band = model["sensitivity"]
    assert band["cost_low"] <= band["cost_current"] <= band["cost_high"]

    # Team override flows into the summary's cost story.
    await tcs.set_team_cost_settings("team-cost-3", "senior-1", {"senior_hourly_rate_usd": 115.0})
    summary2 = await ramp.get_ramp_summary("team-cost-3")
    assert summary2["cost_model"]["source"] == "team"
    assert summary2["totals"]["senior_cost_usd"] != summary["totals"]["senior_cost_usd"]


async def test_cost_model_endpoint_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.get("/api/v1/ramp/cost-model").status_code == 401
    assert client.put("/api/v1/ramp/cost-model", json={}).status_code == 401


# ── Ramp vs Onramp benchmark (flat per-workspace price, React-scoped) ─────


async def _seed_subscription(storage, team_id: str, tier: str = "startup") -> None:
    """Seed an active billing subscription (INR price from TIER_PRICING)."""
    from app.services.billing_service import BillingService

    sub = await BillingService().create_subscription(team_id, tier, "monthly")
    await storage.create_document("onramp_subscriptions", sub["subscription_id"], sub)


async def _seed_bench_repo(storage, team_id: str, name: str, language: str, url: str) -> None:
    await storage.create_document("repositories", f"repo-{name}", {
        "owner": "acme", "name": name, "team_id": team_id,
        "language": language, "url": url,
    })


async def _seed_bench_task(
    storage, team_id: str, assignee: str, title: str, repo_url: str,
    review_cycles: int = 2,
) -> dict:
    now = _now()
    task = {
        "task_id": generate_id(),
        "team_id": team_id,
        "created_by": "senior-1",
        "assigned_to": assignee,
        "title": title,
        "module": "core",
        "repo_url": repo_url,
        "state": "completed",
        "review_cycles": review_cycles,
        "created_at": (now - timedelta(days=30)).isoformat(),
        "updated_at": (now - timedelta(days=10)).isoformat(),
        "submitted_at": None,
        "reviewed_at": None,
        "completed_at": (now - timedelta(days=10)).isoformat(),
        "started_at": None,
    }
    await storage.create_document("onramp_tasks", task["task_id"], task)
    return task


def test_repo_stack_detection():
    assert ramp.repo_stack("TypeScript") == "react"
    assert ramp.repo_stack("javascript") == "react"
    assert ramp.repo_stack("Python") == "other"
    assert ramp.repo_stack("") == "unknown"


async def test_ramp_vs_onramp_benchmark_roi():
    """Phase 0 benchmark: a React team with 1h of senior time (2 cycles ×
    0.5h) → $90 senior cost vs Onramp's flat $99/mo workspace price over
    the 0.66-month ramp window (~$65) → ~1.4× ROI."""
    storage = get_storage()
    await _seed_team(storage, "team-bench-1")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-bench-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-bench-1", "senior-1", "senior_dev")
    await _seed_bench_repo(storage, "team-bench-1", "webapp", "TypeScript", "https://github.com/acme/webapp")
    await _seed_bench_task(storage, "team-bench-1", "trainee-a", "A1", "https://github.com/acme/webapp")

    bench = await ramp.ramp_vs_onramp_benchmark("team-bench-1")
    assert bench["team_stack"] == "react"
    assert bench["senior_hours"] == pytest.approx(1.0)
    assert bench["senior_cost_usd"] == pytest.approx(90.0)
    # Ramp window: joined 30d ago, completed 10d ago → 20d → 0.66 months.
    assert bench["ramp_window_days"] == pytest.approx(20.0)
    # Flat $99/mo × 0.66mo ≈ $65 (per-workspace, not per dev).
    assert bench["onramp_price_usd_per_month"] == pytest.approx(99.0)
    assert bench["onramp_cost_usd"] == 65
    assert bench["roi_multiple"] == pytest.approx(1.4)


async def test_benchmark_react_scoping_on_mixed_team():
    """stack=react counts only tasks on React repos; the team's stack is
    still reported honestly (mixed)."""
    storage = get_storage()
    await _seed_team(storage, "team-bench-2")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-bench-2", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-bench-2", "senior-1", "senior_dev")
    await _seed_bench_repo(storage, "team-bench-2", "webapp", "TypeScript", "https://github.com/acme/webapp")
    await _seed_bench_repo(storage, "team-bench-2", "api", "Python", "https://github.com/acme/api")
    await _seed_bench_task(storage, "team-bench-2", "trainee-a", "A1", "https://github.com/acme/webapp")
    await _seed_bench_task(storage, "team-bench-2", "trainee-a", "B1", "https://github.com/acme/api")

    all_bench = await ramp.ramp_vs_onramp_benchmark("team-bench-2")
    assert all_bench["team_stack"] == "mixed"
    assert all_bench["task_count"] == 2
    assert all_bench["senior_hours"] == pytest.approx(2.0)

    react_bench = await ramp.ramp_vs_onramp_benchmark("team-bench-2", stack="react")
    assert react_bench["task_count"] == 1
    assert react_bench["senior_hours"] == pytest.approx(1.0)
    assert react_bench["senior_cost_usd"] == pytest.approx(90.0)


async def test_benchmark_price_override_changes_onramp_cost():
    """The benchmark price is tunable per team — a $198 override doubles
    the Onramp side of the story vs the $99 default."""
    from app.services import team_cost_settings as tcs

    storage = get_storage()
    await _seed_team(storage, "team-bench-3")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-bench-3", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-bench-3", "senior-1", "senior_dev")
    await _seed_bench_repo(storage, "team-bench-3", "webapp", "JavaScript", "https://github.com/acme/webapp")
    await _seed_bench_task(storage, "team-bench-3", "trainee-a", "A1", "https://github.com/acme/webapp")

    at_99 = await ramp.ramp_vs_onramp_benchmark("team-bench-3")
    await tcs.set_team_cost_settings("team-bench-3", "senior-1", {"onramp_price_usd_per_month": 198.0})
    at_198 = await ramp.ramp_vs_onramp_benchmark("team-bench-3")
    assert at_198["onramp_price_usd_per_month"] == pytest.approx(198.0)
    # Doubling the price doubles the *unrounded* Onramp cost; both are rounded
    # to whole dollars, so allow rounding error (65.05 → 65, 130.09 → 130).
    assert at_198["onramp_cost_usd"] == pytest.approx(at_99["onramp_cost_usd"] * 2, abs=1)
    assert at_198["roi_multiple"] < at_99["roi_multiple"]


async def test_benchmark_snapshot_record_and_history():
    """Snapshots track the cost story over time — record, then read back
    newest-first, with stack scoping."""
    storage = get_storage()
    await _seed_team(storage, "team-bench-4")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-bench-4", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-bench-4", "senior-1", "senior_dev")
    await _seed_bench_repo(storage, "team-bench-4", "webapp", "TypeScript", "https://github.com/acme/webapp")
    await _seed_bench_task(storage, "team-bench-4", "trainee-a", "A1", "https://github.com/acme/webapp")

    first = await ramp.record_benchmark_snapshot("team-bench-4", "senior-1", stack="react")
    assert first["stack"] == "react"
    assert first["roi_multiple"] > 0
    second = await ramp.record_benchmark_snapshot("team-bench-4", "senior-1", stack="react")
    assert second["senior_cost_usd"] == first["senior_cost_usd"]

    history = await ramp.get_benchmark_history("team-bench-4", stack="react")
    assert len(history) == 2
    assert history[0]["generated_at"] >= history[1]["generated_at"]

    # Stack filter isolates the team's own React snapshots; other stacks and
    # other teams see nothing.
    assert len(await ramp.get_benchmark_history("team-bench-4")) == 2
    assert await ramp.get_benchmark_history("team-bench-4", stack="python") == []
    assert await ramp.get_benchmark_history("team-bench-other", stack="react") == []


async def test_benchmark_uses_live_subscription_price():
    """The benchmark reads the team's live subscription amount (INR → USD)
    instead of the flat $99 default — a professional team at ₹2,999/mo pays
    ~$35.70, and the ROI story runs on that number."""
    from app.services.team_cost_settings import INR_TO_USD_RATE

    storage = get_storage()
    await _seed_team(storage, "team-bench-live")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-bench-live", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-bench-live", "senior-1", "senior_dev")
    await _seed_bench_repo(storage, "team-bench-live", "webapp", "TypeScript", "https://github.com/acme/webapp")
    await _seed_bench_task(storage, "team-bench-live", "trainee-a", "A1", "https://github.com/acme/webapp")
    await _seed_subscription(storage, "team-bench-live", "professional")  # ₹2,999/mo

    bench = await ramp.ramp_vs_onramp_benchmark("team-bench-live")
    expected_price = round(2999.0 / INR_TO_USD_RATE, 2)
    assert bench["price_source"] == "subscription"
    assert bench["onramp_price_usd_per_month"] == pytest.approx(expected_price)
    # The original INR amount rides along so the ₹ → $ conversion is visible.
    assert bench["onramp_price_inr"] == pytest.approx(2999.0)
    # Same 20d window (0.66mo): live price ≈ $35.70 × 0.66 ≈ $24.
    assert bench["onramp_cost_usd"] == pytest.approx(expected_price * (20.0 / ramp.DAYS_PER_MONTH), abs=1)
    # Senior cost $90 ÷ ~$24 → ~3.8× (vs 1.4× at the flat $99).
    assert bench["roi_multiple"] > 2.0

    # The agent benchmark reads the same live number + INR provenance.
    from app.services import agent_benchmark_service as absvc
    agent = await absvc.agent_cost_benchmark("team-bench-live")
    assert agent["price_source"] == "subscription"
    assert agent["onramp_monthly_usd"] == pytest.approx(expected_price)
    assert agent["onramp_price_inr"] == pytest.approx(2999.0)


async def test_benchmark_team_override_wins_over_subscription():
    """An explicit per-team price calibration beats the live subscription
    (the leader deliberately tuned the comparison number)."""
    from app.services import team_cost_settings as tcs

    storage = get_storage()
    await _seed_team(storage, "team-bench-override")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-bench-override", "trainee-a", "new_dev")
    await _seed_subscription(storage, "team-bench-override", "startup")  # ₹999/mo
    await tcs.set_team_cost_settings(
        "team-bench-override", "senior-1", {"onramp_price_usd_per_month": 198.0}
    )

    from app.services import agent_benchmark_service as absvc
    agent = await absvc.agent_cost_benchmark("team-bench-override")
    assert agent["price_source"] == "team"
    assert agent["onramp_monthly_usd"] == pytest.approx(198.0)
    assert agent["onramp_price_inr"] is None  # a team override has no INR source

    bench = await ramp.ramp_vs_onramp_benchmark("team-bench-override")
    assert bench["price_source"] == "team"
    assert bench["onramp_price_usd_per_month"] == pytest.approx(198.0)


async def test_benchmark_free_tier_falls_back_to_platform_default():
    """A free-tier team (₹0 subscription) has no live price to run on — the
    benchmark falls back to the $99/mo platform default instead of showing
    an infinite ROI."""
    storage = get_storage()
    await _seed_team(storage, "team-bench-free")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-bench-free", "trainee-a", "new_dev")
    await _seed_subscription(storage, "team-bench-free", "free")  # ₹0/mo

    from app.services import agent_benchmark_service as absvc
    agent = await absvc.agent_cost_benchmark("team-bench-free")
    assert agent["price_source"] == "platform"
    assert agent["onramp_monthly_usd"] == pytest.approx(ramp.ONRAMP_PRICE_USD_PER_MONTH)


async def test_benchmark_endpoint_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.get("/api/v1/ramp/benchmark").status_code == 401
    assert client.post("/api/v1/ramp/benchmark/snapshot").status_code == 401


# ── Terminal coding agents vs Onramp (React codebases) ─────────────────────


async def test_agent_benchmark_math():
    """Terminal agents vs Onramp: per-dev subscription × dev count vs the
    flat $99/mo workspace. 3 devs on Claude Code Pro = $60 → $39 cheaper
    than Onramp; Gemini CLI Free = $0. Sorted cheapest-first."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-agent-1")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_user(storage, "trainee-c", "Casey")
    await _seed_user(storage, "hr-1", "H")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-agent-1", "trainee-a", "new_dev")
    await _seed_member(storage, "team-agent-1", "trainee-b", "new_dev")
    await _seed_member(storage, "team-agent-1", "trainee-c", "new_dev")
    await _seed_member(storage, "team-agent-1", "hr-1", "hr")  # excluded from dev count
    await _seed_member(storage, "team-agent-1", "senior-1", "senior_dev")
    await _seed_bench_repo(storage, "team-agent-1", "webapp", "TypeScript", "https://github.com/acme/webapp")

    bench = await absvc.agent_cost_benchmark("team-agent-1")
    assert bench["dev_count"] == 4  # 3 new_dev + senior, hr excluded
    assert bench["team_stack"] == "react"
    assert bench["onramp_monthly_usd"] == 99.0
    # Cheapest first → Gemini CLI Free at $0.
    assert bench["agents"][0]["slug"] == "gemini-cli-free"

    by_slug = {a["slug"]: a for a in bench["agents"]}
    claude = by_slug["claude-code-pro"]
    assert claude["team_monthly_usd"] == 80.0   # 4 × $20
    assert claude["vs_onramp_usd"] == pytest.approx(19.0)  # 99 − 80
    assert claude["onramp_equivalents"] == pytest.approx(0.81)
    gemini = by_slug["gemini-cli-free"]
    assert gemini["vs_onramp_usd"] == pytest.approx(99.0)
    max_tier = by_slug["claude-code-max"]
    assert max_tier["vs_onramp_usd"] < 0  # $200/dev × 4 = $800 > Onramp


async def test_agent_benchmark_price_override():
    """A team calibrating Onramp to a different workspace price shifts the
    comparison deltas."""
    from app.services import agent_benchmark_service as absvc
    from app.services import team_cost_settings as tcs

    storage = get_storage()
    await _seed_team(storage, "team-agent-2")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-agent-2", "trainee-a", "new_dev")

    at_99 = await absvc.agent_cost_benchmark("team-agent-2")
    await tcs.set_team_cost_settings("team-agent-2", "senior-1", {"onramp_price_usd_per_month": 198.0})
    at_198 = await absvc.agent_cost_benchmark("team-agent-2")
    assert at_198["onramp_monthly_usd"] == 198.0
    claude_99 = next(a for a in at_99["agents"] if a["slug"] == "claude-code-pro")
    claude_198 = next(a for a in at_198["agents"] if a["slug"] == "claude-code-pro")
    # 1 dev × $20 = $20; Onramp $99 → Onramp costs $79 more; at $198 → $178 more.
    assert claude_99["vs_onramp_usd"] == pytest.approx(79.0)
    assert claude_198["vs_onramp_usd"] == pytest.approx(178.0)


async def test_agent_benchmark_snapshot_roundtrip():
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-agent-3")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-agent-3", "trainee-a", "new_dev")
    await _seed_bench_repo(storage, "team-agent-3", "webapp", "JavaScript", "https://github.com/acme/webapp")

    first = await absvc.record_agent_benchmark_snapshot("team-agent-3", "senior-1")
    assert first["team_stack"] == "react"
    assert first["agents"]
    await absvc.record_agent_benchmark_snapshot("team-agent-3", "senior-1")

    history = await absvc.get_agent_benchmark_history("team-agent-3")
    assert len(history) == 2
    assert history[0]["generated_at"] >= history[1]["generated_at"]
    assert await absvc.get_agent_benchmark_history("team-agent-other") == []


async def test_agent_benchmark_endpoint_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.get("/api/v1/ramp/agent-benchmark").status_code == 401
    assert client.post("/api/v1/ramp/agent-benchmark/snapshot").status_code == 401


# ── Token-efficiency benchmark (agents re-read the repo; Onramp refreshes the graph) ──


def test_agent_token_cost_rate():
    """1M agent tokens at the paid-mix rate = $2.40 in (80% × $3.00/M) + $3.00 out (20% × $15/M) = $5.40."""
    from app.services import agent_benchmark_service as absvc

    assert absvc._agent_token_cost(1_000_000) == pytest.approx(5.40)


async def test_token_efficiency_benchmark_default_math():
    """Default model: 250K-token codebase × 5 changes/mo = 1.25M agent tokens
    re-read ($6.75) + Claude Code Pro $20/dev → $26.75/mo. Onramp refreshes
    only 10% per change (125K tokens, $0.68) with no measured usage → 10×
    fewer tokens, ~40× cheaper."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-eff-1")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-1", "trainee-a", "new_dev")

    bench = await absvc.token_efficiency_benchmark("team-eff-1")
    assert bench["assumptions"]["codebase_tokens"] == 250_000
    assert bench["assumptions"]["changes_per_month"] == 5

    # Agent side: 1.25M tokens × $5.40/M = $6.75 + $20 subscription.
    assert bench["agent"]["tokens_per_change"] == 250_000
    assert bench["agent"]["monthly_tokens_burned"] == 1_250_000
    assert bench["agent"]["token_cost_usd"] == pytest.approx(6.75, abs=0.01)
    assert bench["agent"]["subscription_monthly_usd"] == pytest.approx(20.0)  # 1 dev × $20
    assert bench["agent"]["monthly_usd"] == pytest.approx(26.75, abs=0.01)

    # Onramp side (no measured usage yet) — only the incremental refresh:
    # ~10% of the codebase per change = 25K tokens × 5 changes.
    assert bench["onramp"]["graph_refresh"]["tokens_per_change"] == 25_000
    assert bench["onramp"]["graph_refresh"]["tokens_monthly"] == 125_000
    assert bench["onramp"]["measured"]["free_pct"] == 0.0
    assert bench["onramp"]["monthly_tokens"] == 125_000

    # Headlines.
    assert bench["token_ratio"] == pytest.approx(10.0)
    assert bench["cost_ratio"] > 10.0
    assert bench["monthly_savings_usd"] > 0


async def test_token_efficiency_uses_measured_usage():
    """The Onramp side runs on the team's real 30-day usage — tokens, spend,
    and the free-first ratio from usage_records ride into the totals."""
    from app.services import agent_benchmark_service as absvc
    from datetime import datetime, timedelta, timezone

    storage = get_storage()
    await _seed_team(storage, "team-eff-2")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-2", "trainee-a", "new_dev")

    # 5 records in the last 30d: 4 free, 1 paid — 10K tokens, $0.02 spent.
    now = datetime.now(timezone.utc)
    for i in range(5):
        await storage.create_document("usage_records", generate_id(), {
            "user_id": None,
            "team_id": "team-eff-2",
            "endpoint": "chat",
            "method": "POST",
            "status_code": 200,
            "response_time_ms": 0,
            "tokens_used": 2000,
            "cost_usd": 0.004 if i == 4 else 0.0,
            "usage_metadata": {
                "provider": "gemini",
                "free": i != 4,
                "served": "google/gemini-2.5-flash:free",
                "cost_avoided_usd": 0.1,
            },
            "created_at": (now - timedelta(days=i)).isoformat(),
        })

    bench = await absvc.token_efficiency_benchmark("team-eff-2")
    measured = bench["onramp"]["measured"]
    assert measured["requests_30d"] == 5
    assert measured["tokens_30d"] == 10_000
    assert measured["free_pct"] == pytest.approx(80.0)
    # One paid record at $0.004 — sub-cent spend must survive the round.
    assert measured["cost_usd_30d"] == pytest.approx(0.004, abs=0.0001)
    assert measured["cost_avoided_usd_30d"] == pytest.approx(0.5, abs=0.01)
    # Measured tokens join the incremental refresh in the total.
    assert bench["onramp"]["monthly_tokens"] == 10_000 + 125_000


async def test_token_efficiency_tunable_inputs_and_file_count_default():
    """codebase_tokens / changes_per_month tune the model, and the default
    codebase size comes from the team's indexed file count when available."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-eff-3")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-3", "trainee-a", "new_dev")
    await _seed_bench_repo(storage, "team-eff-3", "webapp", "TypeScript", "https://github.com/acme/webapp")
    await storage.update_document("repositories", "repo-webapp", {"file_count": 400})

    # File-count default: 400 files × 500 tokens = 200K.
    bench = await absvc.token_efficiency_benchmark("team-eff-3")
    assert bench["assumptions"]["codebase_tokens"] == 200_000
    assert "400 indexed files" in bench["codebase_size_note"]

    # Explicit inputs win.
    tuned = await absvc.token_efficiency_benchmark(
        "team-eff-3", codebase_tokens=500_000, changes_per_month=10
    )
    assert tuned["assumptions"]["codebase_tokens"] == 500_000
    assert tuned["assumptions"]["changes_per_month"] == 10
    assert tuned["agent"]["monthly_tokens_burned"] == 5_000_000
    assert tuned["token_ratio"] == pytest.approx(10.0)  # ratio invariant to scale


async def test_efficiency_benchmark_endpoint_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.get("/api/v1/ramp/efficiency-benchmark").status_code == 401


async def test_headcount_simulation_scales_agent_cost_only():
    """Hiring is the story: every engineer adds another agent subscription
    AND another full re-read of the codebase (per-dev token burn — each
    agent holds its own context), while Onramp's flat price never moves.
    10 devs → $200 subs AND 10× the token burn."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-eff-hc")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-hc", "trainee-a", "new_dev")
    await _seed_bench_repo(storage, "team-eff-hc", "webapp", "TypeScript", "https://github.com/acme/webapp")

    at_actual = await absvc.token_efficiency_benchmark("team-eff-hc")
    assert at_actual["simulated_dev_count"] == at_actual["dev_count"] == 1
    assert at_actual["assumptions"]["per_dev_token_burn"] is True

    at_10 = await absvc.token_efficiency_benchmark("team-eff-hc", dev_count=10)
    assert at_10["simulated_dev_count"] == 10
    # Subscriptions: $20/dev × 10 = $200 (was $20 at 1 dev).
    assert at_10["agent"]["subscription_monthly_usd"] == pytest.approx(200.0)
    # Token burn scales with headcount too: 10 devs × 250K tokens/change.
    assert at_10["agent"]["tokens_per_dev_per_change"] == 250_000
    assert at_10["agent"]["tokens_per_change"] == 2_500_000
    assert at_10["agent"]["monthly_tokens_burned"] == pytest.approx(
        at_actual["agent"]["monthly_tokens_burned"] * 10
    )
    assert at_10["agent"]["token_cost_usd"] == pytest.approx(
        at_actual["agent"]["token_cost_usd"] * 10, abs=0.01
    )
    # Onramp's flat price is untouched.
    assert at_10["onramp"]["monthly_usd"] == at_actual["onramp"]["monthly_usd"]
    assert at_10["monthly_savings_usd"] > at_actual["monthly_savings_usd"]


async def test_multi_product_scaling_compounds_agent_cost():
    """Multiple products = multiple codebases. Each dev's agent must hold
    ALL of them in context, so agent re-reads multiply by products × devs
    (3 products × 250K = 750K per dev per change), while Onramp's flat
    workspace price never moves and its refresh scales only with the total
    changed files (~10% of all products)."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-eff-mp")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-mp", "trainee-a", "new_dev")
    await _seed_bench_repo(storage, "team-eff-mp", "webapp", "TypeScript", "https://github.com/acme/webapp")

    single = await absvc.token_efficiency_benchmark("team-eff-mp")
    assert single["assumptions"]["product_count"] == 1
    assert single["assumptions"]["total_codebase_tokens"] == 250_000

    three = await absvc.token_efficiency_benchmark("team-eff-mp", dev_count=5, product_count=3)
    assert three["assumptions"]["product_count"] == 3
    assert three["assumptions"]["total_codebase_tokens"] == 750_000
    # Per-dev per-change: 3 products × 250K = 750K.
    assert three["agent"]["tokens_per_dev_per_change"] == 750_000
    # Team per-change: 750K × 5 devs = 3.75M.
    assert three["agent"]["tokens_per_change"] == 3_750_000
    # Onramp refresh scales with total codebase (10% × 750K = 75K/change)
    # — honest, but it grows ~linearly with tokens while the agent grows
    # ~quadratically (devs × products). The flat price never moves.
    assert three["onramp"]["graph_refresh"]["tokens_per_change"] == 75_000
    assert three["onramp"]["monthly_usd"] == pytest.approx(
        single["onramp"]["monthly_usd"] * 3, abs=0.1
    )
    # Agent cost grows much faster than the refresh (devs × products
    # compound on the agent side): 5× devs × 3× products → ~7.6× the
    # monthly cost; savings multiply accordingly.
    assert three["agent"]["monthly_usd"] > single["agent"]["monthly_usd"] * 7
    assert three["token_ratio"] > single["token_ratio"]
    assert three["monthly_savings_usd"] > single["monthly_savings_usd"] * 7


async def test_per_dev_token_burn_can_be_disabled():
    """per_dev_token_burn=False models a shared/reused context — the team
    burns the re-read once per change regardless of headcount, so only
    subscriptions scale with hiring."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-eff-shared")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-shared", "trainee-a", "new_dev")
    await _seed_bench_repo(storage, "team-eff-shared", "webapp", "TypeScript", "https://github.com/acme/webapp")

    shared_10 = await absvc.token_efficiency_benchmark(
        "team-eff-shared", dev_count=10, per_dev_token_burn=False,
    )
    assert shared_10["assumptions"]["per_dev_token_burn"] is False
    # One 250K re-read per change regardless of 10 devs.
    assert shared_10["agent"]["tokens_per_change"] == 250_000
    assert shared_10["agent"]["monthly_tokens_burned"] == 1_250_000
    # Subscriptions still scale per seat.
    assert shared_10["agent"]["subscription_monthly_usd"] == pytest.approx(200.0)


async def test_headcount_scenario_record_and_history():
    """Recorded headcount scenarios round-trip, newest-first, and capture
    the exact agent/Onramp split at the simulated headcount."""
    from app.services import agent_benchmark_service as absvc

    storage = get_storage()
    await _seed_team(storage, "team-eff-hc2")
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-eff-hc2", "trainee-a", "new_dev")
    await _seed_bench_repo(storage, "team-eff-hc2", "webapp", "TypeScript", "https://github.com/acme/webapp")

    rec = await absvc.record_headcount_scenario("team-eff-hc2", "senior-1", 10)
    assert rec["simulated_dev_count"] == 10
    assert rec["per_dev_token_burn"] is True
    assert rec["agent_subscription_monthly_usd"] == pytest.approx(200.0)
    # Per-dev token burn: 10 × 250K × 5 changes = 12.5M tokens at $5.40/M ≈ $67.50.
    assert rec["agent_token_cost_monthly_usd"] == pytest.approx(67.5, abs=0.5)
    assert rec["monthly_savings_usd"] > 0
    await absvc.record_headcount_scenario("team-eff-hc2", "senior-1", 20)

    history = await absvc.get_headcount_scenario_history("team-eff-hc2")
    assert len(history) == 2
    assert history[0]["simulated_dev_count"] == 20
    assert history[1]["simulated_dev_count"] == 10
    assert await absvc.get_headcount_scenario_history("team-eff-other") == []


async def test_headcount_endpoint_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    assert client.get("/api/v1/ramp/efficiency-benchmark/headcount/history").status_code == 401
    assert client.post("/api/v1/ramp/efficiency-benchmark/headcount").status_code == 401


async def test_cost_model_put_requires_leader():
    """Phase 0: reading the model is member-scoped; calibrating it is a
    leader write (mirrors the /ramp/check guard)."""
    from fastapi import HTTPException

    from app.api.v1.ramp import _require_leader, _require_member

    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")

    # A plain member may read…
    await _require_member({"uid": "trainee-a"}, "team-ramp-1")
    # …but cannot calibrate the cost model.
    with pytest.raises(HTTPException) as exc:
        await _require_leader({"uid": "trainee-a"}, "team-ramp-1")
    assert exc.value.status_code == 403


# ── Track + Quantify ───────────────────────────────────────────────────────


async def test_get_ramp_summary_benchmark_and_profiles():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "trainee-b", "member", joined_days_ago=10)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev", joined_days_ago=200)

    # Alice ramped in 10 days (joined 30d ago, completed 20d ago);
    # Bob ramped in 5 days (joined 10d ago, completed 5d ago).
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=20, updated_days_ago=20, title="A1")
    await _seed_task(storage, "team-ramp-1", "trainee-b", "completed",
                     completed_days_ago=5, updated_days_ago=5, title="B1")
    await storage.create_document("onramp_conversations", generate_id(), {
        "user_id": "trainee-a",
        "question": "how does auth work?",
        "answer": "…",
        "created_at": _now(),
    })

    summary = await ramp.get_ramp_summary("team-ramp-1")

    assert summary["trainee_count"] == 2
    assert summary["ramped_count"] == 2
    # median of [10, 5] = 7.5
    assert summary["benchmark_days"] == pytest.approx(7.5)

    by_id = {p["user_id"]: p for p in summary["profiles"]}
    assert by_id["trainee-a"]["ramp_days"] == pytest.approx(10.0)
    assert by_id["trainee-b"]["ramp_days"] == pytest.approx(5.0)
    assert by_id["trainee-b"]["vs_benchmark_days"] == pytest.approx(-2.5)
    assert by_id["trainee-a"]["questions_asked"] == 1
    assert by_id["trainee-a"]["completion_pct"] == 100.0
    # Seniors are not tracked as trainees.
    assert "senior-1" not in by_id

    # Summary cost totals are the sum of per-trainee estimates.
    total_hours = sum(p["senior_hours"] for p in summary["profiles"])
    assert summary["totals"]["senior_hours"] == pytest.approx(round(total_hours, 1))


# ── Intercept: detection ───────────────────────────────────────────────────


async def test_detect_stuck_signals_and_severity():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")
    await _seed_member(storage, "team-ramp-1", "trainee-b", "new_dev")

    # Alice: needs_changes untouched 10 days + 2 change-request cycles.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "needs_changes",
                     review_cycles=2, updated_days_ago=10, title="A1")
    # Bob: healthy, recently completed.
    await _seed_task(storage, "team-ramp-1", "trainee-b", "completed",
                     completed_days_ago=2, updated_days_ago=2, title="B1")

    detection = await ramp.detect_stuck("team-ramp-1")
    assert detection["count"] == 1
    entry = detection["stuck"][0]
    assert entry["user_id"] == "trainee-a"
    assert entry["severity"] == "high"
    codes = {s["code"] for s in entry["signals"]}
    assert "stalled_task" in codes
    assert "review_loop" in codes


async def test_question_spike_signal_fires_above_threshold():
    # No tasks, but a flood of Ask questions in the window → spike signal.
    signals = ramp.stuck_signals("trainee-a", [], questions_7d=12)
    assert any(s["code"] == "question_spike" for s in signals)

    # Below the threshold → no spike.
    assert not any(
        s["code"] == "question_spike"
        for s in ramp.stuck_signals("trainee-a", [], questions_7d=3)
    )


async def test_no_inactivity_signal_when_all_tasks_completed():
    """Regression (v1.6): a trainee whose tasks are ALL completed is not
    stuck — idle time with no open work is normal, and flagging it would
    drag down the health score for healthy teams."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")
    # Completed 15 days ago, nothing since — no open work.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=15, updated_days_ago=15, title="A1")

    signals = ramp.stuck_signals("trainee-a", await storage.query_documents(
        "onramp_tasks", [("assigned_to", "==", "trainee-a")]
    ))
    assert signals == []

    # With an OPEN stale task, inactivity still fires alongside it.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "in_progress",
                     updated_days_ago=15, title="A2")
    signals = ramp.stuck_signals("trainee-a", await storage.query_documents(
        "onramp_tasks", [("assigned_to", "==", "trainee-a")]
    ))
    assert any(s["code"] == "inactivity" for s in signals)


async def test_pending_review_timeout_signal():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")
    # Submitted 2 days ago, still waiting for review.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "submitted",
                     updated_days_ago=2, title="A1")

    signals = ramp.stuck_signals("trainee-a", await storage.query_documents(
        "onramp_tasks", [("assigned_to", "==", "trainee-a")]
    ))
    codes = {s["code"] for s in signals}
    assert "pending_review_timeout" in codes


async def test_ramp_summary_days_to_first_pr_from_webhook():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await storage.update_document("users", "trainee-a", {"github_username": "alice-dev"})
    # PR merged 10 days ago → 20 days after joining.
    await storage.create_document("onramp_milestones", generate_id(), {
        "user": "alice-dev",
        "repo": "org/repo",
        "type": "pr_merged",
        "timestamp": _now() - timedelta(days=10),
        "metadata": {},
    })

    summary = await ramp.get_ramp_summary("team-ramp-1")
    profile = summary["profiles"][0]
    assert profile["days_to_first_pr"] == pytest.approx(20.0)
    assert profile["first_pr_at"] is not None
    assert profile["first_pr_source"] == "github"


async def test_ramp_summary_days_to_first_pr_from_task_stamp_without_github():
    """Teams without linked GitHub accounts still get time-to-first-merged-PR:
    the merge webhook stamps pr_merged_at on the trainee's own task, which the
    ramp summary falls back to when no login-keyed milestone exists."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    # No github_username on the user, no milestone rows — only the task stamp.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10,
                     pr_merged_days_ago=10, title="A1")

    summary = await ramp.get_ramp_summary("team-ramp-1")
    profile = summary["profiles"][0]
    # PR merged 10 days ago → 20 days after joining (task-stamped path).
    assert profile["days_to_first_pr"] == pytest.approx(20.0)
    assert profile["first_pr_source"] == "task"


async def test_ramp_summary_first_pr_benchmark_median():
    """The team's first-PR benchmark is the median of per-trainee days,
    ignoring trainees with no first-PR data yet."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_user(storage, "trainee-c", "Cara")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "trainee-b", "new_dev", joined_days_ago=20)
    await _seed_member(storage, "team-ramp-1", "trainee-c", "new_dev", joined_days_ago=10)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")

    # Alice: PR merged 10d ago → 20d. Bob: merged 5d ago → 15d. Cara: none.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10,
                     pr_merged_days_ago=10, title="A1")
    await _seed_task(storage, "team-ramp-1", "trainee-b", "completed",
                     completed_days_ago=5, updated_days_ago=5,
                     pr_merged_days_ago=5, title="B1")
    await _seed_task(storage, "team-ramp-1", "trainee-c", "completed",
                     completed_days_ago=2, updated_days_ago=2, title="C1")

    summary = await ramp.get_ramp_summary("team-ramp-1")
    # median of [20, 15] = 17.5
    assert summary["first_pr_benchmark_days"] == pytest.approx(17.5)

    by_id = {p["user_id"]: p for p in summary["profiles"]}
    assert by_id["trainee-a"]["days_to_first_pr"] == pytest.approx(20.0)
    assert by_id["trainee-b"]["days_to_first_pr"] == pytest.approx(15.0)
    assert by_id["trainee-c"]["days_to_first_pr"] is None


async def test_ramp_summary_first_pr_benchmark_none_when_no_data():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10, title="A1")

    summary = await ramp.get_ramp_summary("team-ramp-1")
    assert summary["first_pr_benchmark_days"] is None


async def test_ramp_summary_github_milestone_wins_over_task_stamp():
    """When both a login-keyed milestone and a task stamp exist, the GitHub
    milestone is authoritative (and labelled as such)."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await storage.update_document("users", "trainee-a", {"github_username": "alice-dev"})
    # Milestone: merged 15 days ago (15d after join). Task stamp: 10 days ago.
    await storage.create_document("onramp_milestones", generate_id(), {
        "user": "alice-dev",
        "repo": "org/repo",
        "type": "pr_merged",
        "timestamp": _now() - timedelta(days=15),
        "metadata": {},
    })
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10,
                     pr_merged_days_ago=10, title="A1")

    summary = await ramp.get_ramp_summary("team-ramp-1")
    profile = summary["profiles"][0]
    assert profile["days_to_first_pr"] == pytest.approx(15.0)
    assert profile["first_pr_source"] == "github"


async def test_ramp_summary_no_first_pr_data():
    """A trainee with neither a GitHub milestone nor a merged task gets no
    first-PR timing, and the source stays null."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10, title="A1")

    summary = await ramp.get_ramp_summary("team-ramp-1")
    profile = summary["profiles"][0]
    assert profile["days_to_first_pr"] is None
    assert profile["first_pr_at"] is None
    assert profile["first_pr_source"] is None


async def test_fire_stuck_alerts_deduped():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await _seed_task(storage, "team-ramp-1", "trainee-a", "in_progress",
                     updated_days_ago=10, title="A1")

    first = await ramp.fire_stuck_alerts("team-ramp-1")
    assert first["alerts_fired"] == 1
    assert first["stuck_count"] == 1

    # Leader alert + trainee nudge.
    notifs = await storage.list_documents("onramp_notifications")
    assert len(notifs) == 2
    assert {n["type"] for n in notifs} == {"dev_stuck"}

    # Second run inside the 24h cooldown → skipped, nothing new.
    second = await ramp.fire_stuck_alerts("team-ramp-1")
    assert second["alerts_fired"] == 0
    assert second["skipped"] == 1
    assert len(await storage.list_documents("onramp_notifications")) == 2


async def test_no_alerts_when_team_is_healthy():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=2, updated_days_ago=2, title="A1")

    result = await ramp.fire_stuck_alerts("team-ramp-1")
    assert result["alerts_fired"] == 0
    assert result["stuck_count"] == 0
    assert await storage.list_documents("onramp_notifications") == []


# ── Org ramp health (v1.6) ─────────────────────────────────────────────────


async def test_ramp_health_healthy_team_scores_high():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "trainee-b", "new_dev", joined_days_ago=20)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    # Both ramped fast, all tasks completed, merged PRs — a healthy team.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10,
                     pr_merged_days_ago=10, title="A1")
    await _seed_task(storage, "team-ramp-1", "trainee-b", "completed",
                     completed_days_ago=5, updated_days_ago=5,
                     pr_merged_days_ago=5, title="B1")

    health = await ramp.ramp_health("team-ramp-1")
    assert health["trainee_count"] == 2
    assert health["stuck_count"] == 0
    assert health["grade"] == "healthy"
    assert health["health_score"] is not None and health["health_score"] >= 80
    assert set(health["components"].keys()) == {
        "ramp_velocity", "completion", "stuck_health", "review_health",
        "first_pr", "attrition_health",
    }
    # Weights must always sum to 1.0 (the composite is a weighted mean).
    assert sum(c["weight"] for c in health["components"].values()) == pytest.approx(1.0)
    for comp in health["components"].values():
        assert 0 <= comp["score"] <= 100


async def test_ramp_health_stuck_heavy_team_scores_low():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "trainee-b", "new_dev", joined_days_ago=20)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    # Neither has ramped; both have stale in-progress tasks → stuck.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "in_progress",
                     updated_days_ago=12, title="A1")
    await _seed_task(storage, "team-ramp-1", "trainee-b", "needs_changes",
                     review_cycles=2, updated_days_ago=10, title="B1")

    health = await ramp.ramp_health("team-ramp-1")
    assert health["stuck_count"] == 2
    assert health["grade"] == "critical"
    assert health["health_score"] is not None and health["health_score"] < 50


async def test_ramp_health_review_analytics_failure_is_graceful(monkeypatch):
    """Regression (v1.6 review): when review_analytics raises, the except
    path must still produce a working components dict — the review component
    degrades to a neutral 100 with a safe detail string instead of blowing up
    with an unbound `turnaround` NameError."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10,
                     pr_merged_days_ago=10, title="A1")

    async def _boom(team_id):
        raise RuntimeError("storage down")

    monkeypatch.setattr(ramp, "review_analytics", _boom)

    health = await ramp.ramp_health("team-ramp-1")
    review = health["components"]["review_health"]
    assert review["score"] == 100
    assert review["detail"] == "0 pending review · no review data"
    # The rest of the composite still computes.
    assert health["health_score"] is not None
    assert 0 <= health["health_score"] <= 100


async def test_ramp_health_attrition_risk_lowers_score():
    """v1.6 wave 2: HR attrition flags are a weighted component — a trainee
    with a stalled task (at-risk) drags the composite down via
    attrition_health, not just context."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "trainee-b", "Bob")
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev", joined_days_ago=30)
    await _seed_member(storage, "team-ramp-1", "trainee-b", "new_dev", joined_days_ago=20)
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")
    # Healthy trainee: ramped, completed, merged PR.
    await _seed_task(storage, "team-ramp-1", "trainee-a", "completed",
                     completed_days_ago=10, updated_days_ago=10,
                     pr_merged_days_ago=10, title="A1")
    # At-risk trainee: stale in-progress task (untouched 12d → stalled).
    await _seed_task(storage, "team-ramp-1", "trainee-b", "in_progress",
                     updated_days_ago=12, title="B1")

    health = await ramp.ramp_health("team-ramp-1")
    attrition = health["components"]["attrition_health"]
    # 1 of 2 trainees at risk → 100 - (1/2)*150 = 25
    assert attrition["score"] == 25
    assert health["at_risk_count"] == 1
    # The weighted attrition component visibly lowers the composite vs the
    # healthy-team test above (which scores ≥80 with zero at-risk flags).
    assert health["health_score"] is not None and health["health_score"] < 80


async def test_ramp_health_no_trainees_is_no_data():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")

    health = await ramp.ramp_health("team-ramp-1")
    assert health["grade"] == "no_data"
    assert health["health_score"] is None
    assert health["components"] == {}


async def test_ramp_health_endpoint_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    res = client.get("/api/v1/ramp/health")
    assert res.status_code == 401


# ── API authz (membership + leader role) ───────────────────────────────────


async def test_ramp_authz_non_member_forbidden():
    from fastapi import HTTPException

    from app.api.v1.ramp import _require_leader, _require_member

    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_user(storage, "outsider", "Oscar")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")

    with pytest.raises(HTTPException) as exc:
        await _require_member({"uid": "outsider"}, "team-ramp-1")
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        await _require_leader({"uid": "outsider"}, "team-ramp-1")
    assert exc.value.status_code == 403


async def test_ramp_authz_member_but_not_leader_forbidden_on_check():
    from fastapi import HTTPException

    from app.api.v1.ramp import _require_leader, _require_member

    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "trainee-a", "Alice")
    await _seed_member(storage, "team-ramp-1", "trainee-a", "new_dev")

    # A plain member passes the read check…
    await _require_member({"uid": "trainee-a"}, "team-ramp-1")
    # …but cannot run the alert-firing check.
    with pytest.raises(HTTPException) as exc:
        await _require_leader({"uid": "trainee-a"}, "team-ramp-1")
    assert exc.value.status_code == 403


async def test_ramp_authz_leader_allowed():
    from app.api.v1.ramp import _require_leader, _require_member

    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ramp-1", "senior-1", "senior_dev")

    await _require_member({"uid": "senior-1"}, "team-ramp-1")
    await _require_leader({"uid": "senior-1"}, "team-ramp-1")
