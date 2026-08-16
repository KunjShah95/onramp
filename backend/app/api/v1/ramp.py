"""
Ramp Visibility API — the v1.4 wedge endpoints.

- ``GET  /ramp/summary``    — Track + Quantify: per-trainee ramp profiles,
  team benchmark, senior-time cost estimate, current stuck list (any member).
- ``GET  /ramp/stuck``      — current stuck-dev list only (any member).
- ``GET  /ramp/cost-model`` — Phase 0: effective cost assumptions, measured
  signals, and the estimate's uncertainty band (any member).
- ``PUT  /ramp/cost-model`` — Phase 0: calibrate the team's cost model
  (leader roles only — a write that tunes how the cost story is told).
- ``GET  /ramp/benchmark``    — the cost story: senior ramp cost vs Onramp,
  React-scoped, + snapshot history (any member).
- ``POST /ramp/benchmark/snapshot`` — record a benchmark snapshot (leader).
- ``GET  /ramp/agent-benchmark`` — terminal coding-agent costs vs Onramp's
  flat workspace price, + snapshot history (any member).
- ``POST /ramp/agent-benchmark/snapshot`` — record one (leader roles only).
- ``GET  /ramp/efficiency-benchmark`` — the token-burn story: coding agents
  re-read the whole codebase on every change vs Onramp's free-first routing
  + incremental graph refresh (tokens AND dollars, tunable inputs incl.
  ``dev_count`` to simulate hiring).
- ``POST /ramp/efficiency-benchmark/headcount`` — record a "what if we
  hired N people" scenario (leader) so the scaling story tracks over time.
- ``GET  /ramp/efficiency-benchmark/headcount/history`` — the recorded
  headcount scenarios (any member).
- ``POST /ramp/check``      — Intercept: run stuck detection and fire deduped
  ``dev_stuck`` alerts to team leaders (leader roles only).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.api.v1.auth import get_current_user
from app.services.agent_benchmark_service import (
    agent_cost_benchmark, get_agent_benchmark_history, get_headcount_scenario_history,
    record_agent_benchmark_snapshot, record_headcount_scenario, token_efficiency_benchmark,
)
from app.services.ramp_service import (
    detect_stuck, fire_stuck_alerts, get_benchmark_history, get_ramp_summary,
    ramp_health, ramp_vs_onramp_benchmark, record_benchmark_snapshot,
)
from app.services.team_cost_settings import (
    get_team_cost_settings, set_team_cost_settings,
)
from app.services.team_service import get_team_members, get_user_teams

router = APIRouter(prefix="/ramp", tags=["ramp"])


class CostModelUpdate(BaseModel):
    """Optional per-field calibration of the team's cost model (Phase 0)."""
    senior_hourly_rate_usd: Optional[float] = None
    review_hours_per_cycle: Optional[float] = None
    stalled_weekly_hours: Optional[float] = None

LEADER_ROLES = {"senior_dev", "senior", "cto", "ceo", "admin"}


async def _resolve_team(user: dict, team_id: Optional[str]) -> str:
    """Explicit team_id wins; otherwise the user's primary team (or uid)."""
    if team_id:
        return team_id
    teams = await get_user_teams(user.get("uid", ""))
    if teams:
        return teams[0].get("team_id") or teams[0].get("id") or user.get("uid", "")
    return user.get("uid", "")


async def _require_member(user: dict, team_id: str) -> None:
    members = await get_team_members(team_id)
    if not any((m.get("user_id") or m.get("id")) == user.get("uid", "") for m in members):
        raise HTTPException(status_code=403, detail="Not a member of this team")


async def _require_leader(user: dict, team_id: str) -> None:
    members = await get_team_members(team_id)
    role = next(
        ((m.get("role") or "").lower() for m in members
         if (m.get("user_id") or m.get("id")) == user.get("uid", "")),
        "",
    )
    if role not in LEADER_ROLES:
        raise HTTPException(status_code=403, detail="Leader role required to run a stuck check")


@router.get("/summary")
async def ramp_summary(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Track + Quantify in one payload: profiles, benchmark, cost, stuck list."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return await get_ramp_summary(tid)


@router.get("/stuck")
async def ramp_stuck(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Current stuck-dev list without firing any notifications."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return await detect_stuck(tid)


@router.get("/health")
async def ramp_health_endpoint(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Org-level ramp health score (0-100) + component breakdown (v1.6)."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return await ramp_health(tid)


@router.get("/cost-model")
async def ramp_cost_model(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Phase 0 pressure-test surface: the cost model under the hood.

    Returns the effective assumptions (team override → platform default),
    measured signals (review cycles, elapsed cycle time, stalled weeks) and
    the estimate's uncertainty band — so a leader can see the honest range
    the cost story lives in, not a false-precision point.
    """
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    summary = await get_ramp_summary(tid)
    model = summary.get("cost_model", {})
    return {
        "team_id": tid,
        "settings": model.get("settings", {}),
        "source": model.get("source", "platform"),
        "measured": model.get("measured", {}),
        "sensitivity": model.get("sensitivity", {}),
        "totals": summary.get("totals", {}),
    }


@router.put("/cost-model")
async def ramp_cost_model_update(
    body: CostModelUpdate,
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Calibrate the team's cost model (leader roles only).

    Partial overrides are fine — only the fields sent are changed; unset
    fields keep the platform default. Returns the new effective settings.
    """
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    await _require_leader(user, tid)
    overrides = body.model_dump(exclude_none=True)
    try:
        effective = await set_team_cost_settings(
            tid, user.get("uid", ""), overrides
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"team_id": tid, "settings": {
        "senior_hourly_rate_usd": round(effective["senior_hourly_rate_usd"], 2),
        "review_hours_per_cycle": round(effective["review_hours_per_cycle"], 2),
        "stalled_weekly_hours": round(effective["stalled_weekly_hours"], 2),
    }, "source": effective.get("source", "platform")}


@router.get("/benchmark")
async def ramp_benchmark(
    request: Request,
    stack: Optional[str] = Query(None, description="Scope the cost side to one stack, e.g. 'react'"),
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """The cost story, tracked: ramp senior-time cost vs Onramp at the
    benchmark price, plus snapshot history. ``stack=react`` scopes the cost
    side to React repos; the team's detected stack is always reported.
    """
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    current = await ramp_vs_onramp_benchmark(tid, stack)
    history = await get_benchmark_history(tid, stack)
    return {
        "team_id": tid,
        "stack": current["stack"],
        "current": current,
        "history": history,
    }


@router.post("/benchmark/snapshot")
async def ramp_benchmark_snapshot(
    request: Request,
    stack: Optional[str] = Query(None, description="Record the snapshot scoped to one stack, e.g. 'react'"),
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Record a point-in-time benchmark snapshot so leadership can watch the
    cost story trend (leader roles only — a write)."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    await _require_leader(user, tid)
    record = await record_benchmark_snapshot(tid, user.get("uid", ""), stack)
    return {"team_id": tid, "snapshot": record}


@router.get("/agent-benchmark")
async def ramp_agent_benchmark(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Terminal coding-agent costs vs Onramp's flat per-workspace price.

    Per-agent team monthly cost (per-dev subscription × developer count) vs
    Onramp, labelled with the team's detected stack (React when the repos
    are JS/TS), plus snapshot history for tracking.
    """
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    current = await agent_cost_benchmark(tid)
    history = await get_agent_benchmark_history(tid)
    return {"team_id": tid, "current": current, "history": history}


@router.post("/agent-benchmark/snapshot")
async def ramp_agent_benchmark_snapshot(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Record a point-in-time agent-vs-Onramp comparison (leader roles)."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    await _require_leader(user, tid)
    record = await record_agent_benchmark_snapshot(tid, user.get("uid", ""))
    return {"team_id": tid, "snapshot": record}


@router.get("/efficiency-benchmark")
async def ramp_efficiency_benchmark(
    request: Request,
    codebase_tokens: Optional[int] = Query(None, description="Codebase size in tokens (default: indexed files × 500, else 250K)"),
    changes_per_month: Optional[int] = Query(None, description="How often the codebase meaningfully changes per month (default 5)"),
    dev_count: Optional[int] = Query(None, description="Simulate hiring: agent costs at this developer count (default: the team's actual dev count)"),
    per_dev_token_burn: Optional[bool] = Query(None, description="Each developer's agent re-reads the codebase into its own context (default true); false models a shared/reused context burned once per change"),
    product_count: Optional[int] = Query(None, description="Simulate a multi-product company — each product is its own codebase of codebase_tokens; agent re-reads multiply across products, Onramp's flat price stays put"),
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """The token-burn story, tracked: coding agents re-read the whole
    codebase on every change; Onramp's free-first routing + incremental
    graph refresh burns a fraction. Both sides costed in tokens AND dollars.
    ``codebase_tokens`` / ``changes_per_month`` / ``dev_count`` /
    ``product_count`` tune the model; ``per_dev_token_burn=false`` models a
    shared context instead of one re-read per developer. The Onramp side
    runs on the team's measured 30-day usage.
    """
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return await token_efficiency_benchmark(
        tid, codebase_tokens=codebase_tokens,
        changes_per_month=changes_per_month or 5, dev_count=dev_count,
        per_dev_token_burn=True if per_dev_token_burn is None else per_dev_token_burn,
        product_count=product_count,
    )


@router.post("/efficiency-benchmark/headcount")
async def ramp_efficiency_headcount_scenario(
    request: Request,
    dev_count: int = Query(..., ge=1, description="The headcount to record the scenario at"),
    per_dev_token_burn: Optional[bool] = Query(None, description="One re-read per developer (default true); false = shared context burned once"),
    product_count: Optional[int] = Query(None, description="Products in the scenario (default 1) — each adds its own codebase to the agent re-read"),
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Record a 'what if we hired N people across M products' efficiency
    scenario (leader roles — a write). Every engineer AND every product
    multiplies the agent-side subscriptions + per-dev token burn while
    Onramp's flat price stays put; the record captures the exact savings so
    the scaling story tracks over time.
    """
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    await _require_leader(user, tid)
    record = await record_headcount_scenario(
        tid, user.get("uid", ""), dev_count,
        per_dev_token_burn=True if per_dev_token_burn is None else per_dev_token_burn,
        product_count=product_count or 1,
    )
    return {"team_id": tid, "record": record}


@router.get("/efficiency-benchmark/headcount/history")
async def ramp_efficiency_headcount_history(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Recent recorded headcount scenarios for a team (newest first)."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return {"team_id": tid, "history": await get_headcount_scenario_history(tid)}


@router.post("/check")
async def ramp_check(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Run stuck detection and fire deduped alerts to leaders + trainees."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    await _require_leader(user, tid)
    return await fire_stuck_alerts(tid)
