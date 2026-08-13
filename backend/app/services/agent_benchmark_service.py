"""Terminal coding-agent cost comparison vs Onramp (benchmark tracking).

Answers the competitive question leadership actually asks: **"what does a
team of terminal coding agents cost vs Onramp, for our stack?"** — for React
codebases in particular, since that's where agent-driven workflows are most
common.

The comparison is team-level and subscription-based:

- **Onramp side**: the flat per-workspace price — sourced live from the
  team's active billing subscription (INR → USD) when one exists, else a
  team override, else the $99/mo platform default.
- **Agent side**: each terminal agent's per-developer monthly subscription ×
  the team's developer count (if *every* dev runs that agent).

Pricing is a documented catalog below (as of Aug 2026) — subscription plans,
not pay-per-token API usage (Aider/API-only flows vary with usage and are
excluded for that reason). Snapshots record the comparison over time so the
cost story can be tracked, mirroring the ramp-vs-Onramp benchmark.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.agent_benchmark")

SNAPSHOT_COLLECTION = "agent_benchmark_snapshots"
HEADCOUNT_COLLECTION = "headcount_scenarios"

# ── Token-efficiency model (why Onramp burns fewer tokens) ─────────────────
#
# The efficiency claim customers hear: **coding agents re-read the whole
# codebase on every change, Onramp keeps a persisted graph + vector index and
# only refreshes the changed parts.** This module models that difference in
# tokens and dollars so the claim is a number, not marketing.
#
# The agent side is a *model*: ``codebase_tokens`` × ``changes_per_month``
# re-reads at a per-token rate (assumptions below, all tunable via the
# endpoint / panel). The Onramp side is *measured*: the team's real 30-day
# usage (tokens, spend, free-tier %) from ``usage_records``, plus the cost of
# the incremental graph refresh for the changed files — which the
# free-first router then serves at its free/paid mix.

# Agent token economics: a coding agent's per-million-token rates (paid
# frontier model, e.g. Claude Sonnet-class — the models agents actually
# default to). Input-heavy: agents push the whole repo into context, so
# assume ~80% input / 20% output per re-read.
AGENT_INPUT_PER_MTOK = 3.00
AGENT_OUTPUT_PER_MTOK = 15.00
AGENT_INPUT_SHARE = 0.80

# Assumptions about the codebase and its churn. ``codebase_tokens`` defaults
# to the team's indexed file count × tokens-per-file (250K fallback — a
# mid-size React repo); ``changes_per_month`` is the number of times per
# month the codebase meaningfully changes (each change = one full agent
# re-read vs one incremental Onramp refresh).
TOKENS_PER_FILE = 500
DEFAULT_CODEBASE_TOKENS = 250_000
DEFAULT_CHANGES_PER_MONTH = 5
CHANGE_FILE_RATIO = 0.10  # Onramp re-processes ~10% of files per change (graph diff)

# The cheapest paid terminal agent drives the per-dev subscription comparison
# (Gemini CLI Free at $0 exists but is the free tier; the story is about what
# a team *pays* for a serious agent).
CHEAPEST_PAID_SLUG = "claude-code-pro"


# ── Terminal agent pricing catalog (subscription plans, Aug 2026) ──────────
# Terminal-based CLI coding agents with a flat monthly per-developer price.
# Pay-per-token agents (Aider, direct-API usage) vary with usage and are
# deliberately excluded — the comparison needs stable subscription numbers.
TERMINAL_AGENTS: list[dict] = [
    {"slug": "claude-code-pro",   "name": "Claude Code", "plan": "Pro",       "monthly_usd_per_dev": 20.0},
    {"slug": "claude-code-max",   "name": "Claude Code", "plan": "Max 20x",   "monthly_usd_per_dev": 200.0},
    {"slug": "codex-plus",        "name": "OpenAI Codex", "plan": "ChatGPT Plus", "monthly_usd_per_dev": 20.0},
    {"slug": "codex-pro",         "name": "OpenAI Codex", "plan": "ChatGPT Pro",   "monthly_usd_per_dev": 200.0},
    {"slug": "gemini-cli-free",   "name": "Gemini CLI",  "plan": "Free",      "monthly_usd_per_dev": 0.0},
    {"slug": "gemini-cli-pro",    "name": "Gemini CLI",  "plan": "AI Pro",    "monthly_usd_per_dev": 20.0},
    {"slug": "cursor-pro",        "name": "Cursor",      "plan": "Pro",       "monthly_usd_per_dev": 20.0},
    {"slug": "cursor-ultra",      "name": "Cursor",      "plan": "Ultra",     "monthly_usd_per_dev": 60.0},
]

# Roles excluded from the developer count (non-engineering seats wouldn't run
# a coding agent).
NON_DEV_ROLES = {"hr"}


def _repo_stack(language: str) -> str:
    lang = (language or "").strip().lower()
    if not lang:
        return "unknown"
    return "react" if lang in {"javascript", "typescript", "tsx", "react", "jsx"} else "other"


async def _team_context(team_id: str) -> dict:
    """Developer count + detected stack for a team (honest React labelling)."""
    storage = get_storage()
    try:
        members = await storage.query_documents("team_members", [("team_id", "==", team_id)])
        repos = await storage.query_documents("repositories", [("team_id", "==", team_id)])
    except Exception:
        logger.exception("Failed to load team context for %s", team_id)
        return {"dev_count": 0, "team_stack": "unknown", "stacks_present": [], "repo_count": 0}

    dev_count = sum(
        1 for m in members
        if (m.get("role") or "").lower() not in NON_DEV_ROLES
    )
    stacks_present = sorted({
        _repo_stack(r.get("language")) for r in repos
        if _repo_stack(r.get("language")) != "unknown"
    })
    team_stack = (
        "mixed" if len(stacks_present) > 1
        else (stacks_present[0] if stacks_present else "unknown")
    )
    return {
        "dev_count": dev_count,
        "team_stack": team_stack,
        "stacks_present": stacks_present,
        "repo_count": len(repos),
    }


async def agent_cost_benchmark(team_id: str) -> dict:
    """Compare every terminal agent's team monthly cost vs Onramp's flat
    per-workspace price. Sorted cheapest-first; ``vs_onramp_usd`` is positive
    when Onramp is cheaper, negative when the agent is."""
    from app.services.team_cost_settings import (
        get_team_cost_settings, resolve_benchmark_price,
    )

    settings = await get_team_cost_settings(team_id)
    # Live subscription amount (INR→USD) when one exists — the comparison is
    # only as real as the price it runs on.
    price_info = await resolve_benchmark_price(team_id)
    onramp_monthly = price_info["price_usd"]
    context = await _team_context(team_id)
    dev_count = context["dev_count"]

    agents = []
    for a in TERMINAL_AGENTS:
        per_dev = a["monthly_usd_per_dev"]
        team_monthly = round(per_dev * dev_count, 2)
        agents.append({
            "slug": a["slug"],
            "name": a["name"],
            "plan": a["plan"],
            "monthly_usd_per_dev": per_dev,
            "team_monthly_usd": team_monthly,
            "vs_onramp_usd": round(onramp_monthly - team_monthly, 2),
            # How many Onramp subscriptions one agent seat costs (agent cost
            # ÷ Onramp). 1.0 = parity with a $99/mo workspace.
            "onramp_equivalents": round(team_monthly / onramp_monthly, 2) if onramp_monthly else 0.0,
        })
    agents.sort(key=lambda x: x["team_monthly_usd"])

    return {
        "team_id": team_id,
        "dev_count": dev_count,
        "onramp_monthly_usd": round(onramp_monthly, 2),
        "price_source": price_info["price_source"],
        "onramp_price_inr": price_info.get("price_inr"),
        "settings_source": settings.get("source", "platform"),
        "team_stack": context["team_stack"],
        "stacks_present": context["stacks_present"],
        "repo_count": context["repo_count"],
        "agents": agents,
        "generated_at": datetime.now(timezone.utc),
    }


async def record_agent_benchmark_snapshot(team_id: str, user_id: str) -> dict:
    """Store a point-in-time agent-vs-Onramp comparison for trend tracking."""
    bench = await agent_cost_benchmark(team_id)
    record = {
        "team_id": team_id,
        "recorded_by": user_id,
        "dev_count": bench["dev_count"],
        "onramp_monthly_usd": bench["onramp_monthly_usd"],
        "price_source": bench.get("price_source", "platform"),
        "onramp_price_inr": bench.get("onramp_price_inr"),
        "team_stack": bench["team_stack"],
        "agents": bench["agents"],
        "generated_at": bench["generated_at"],
    }
    await get_storage().create_document(SNAPSHOT_COLLECTION, generate_id(), record)
    return record


async def record_headcount_scenario(
    team_id: str, user_id: str, dev_count: int, per_dev_token_burn: bool = True,
    product_count: int = 1,
) -> dict:
    """Capture a "what if we hired N people across M products" efficiency
    scenario as a benchmark record — the agent-side cost at that headcount
    and product count (subscriptions + per-dev token burn × products, by
    default) vs Onramp's flat price, so leadership can track the scaling
    story over time."""
    bench = await token_efficiency_benchmark(
        team_id, dev_count=dev_count, per_dev_token_burn=per_dev_token_burn,
        product_count=product_count,
    )
    record = {
        "team_id": team_id,
        "recorded_by": user_id,
        "dev_count": bench["dev_count"],
        "simulated_dev_count": bench["simulated_dev_count"],
        "per_dev_token_burn": bench["assumptions"]["per_dev_token_burn"],
        "product_count": bench["assumptions"]["product_count"],
        "onramp_monthly_usd": bench["onramp"]["monthly_usd"],
        "agent_monthly_usd": bench["agent"]["monthly_usd"],
        "agent_subscription_monthly_usd": bench["agent"]["subscription_monthly_usd"],
        "agent_token_cost_monthly_usd": bench["agent"]["token_cost_usd"],
        "monthly_savings_usd": bench["monthly_savings_usd"],
        "cost_ratio": bench["cost_ratio"],
        "token_ratio": bench["token_ratio"],
        "team_stack": bench["team_stack"],
        "generated_at": datetime.now(timezone.utc),
    }
    await get_storage().create_document(HEADCOUNT_COLLECTION, generate_id(), record)
    return record


async def get_headcount_scenario_history(team_id: str, limit: int = 30) -> list[dict]:
    """Recent headcount-scenario records (newest first)."""
    try:
        rows = await get_storage().query_documents(
            HEADCOUNT_COLLECTION, [("team_id", "==", team_id)]
        )
    except Exception:
        return []
    rows.sort(key=lambda r: str(r.get("generated_at") or ""), reverse=True)
    return rows[:limit]


async def get_agent_benchmark_history(team_id: str, limit: int = 30) -> list[dict]:
    """Recent agent-benchmark snapshots for a team (newest first)."""
    try:
        rows = await get_storage().query_documents(
            SNAPSHOT_COLLECTION, [("team_id", "==", team_id)]
        )
    except Exception:
        return []
    rows.sort(key=lambda r: str(r.get("generated_at") or ""), reverse=True)
    return rows[:limit]


# ── Token-efficiency benchmark (agents vs Onramp, tokens AND dollars) ──────


async def _team_indexed_file_count(team_id: str) -> int:
    """Total file count across the team's indexed repos (for a grounded
    codebase-size default). Falls back to 0 — the caller then uses
    ``DEFAULT_CODEBASE_TOKENS``."""
    try:
        repos = await get_storage().query_documents("repositories", [("team_id", "==", team_id)])
    except Exception:
        return 0
    total = 0
    for r in repos:
        try:
            total += int(r.get("file_count") or 0)
        except (TypeError, ValueError):
            continue
    return total


async def _measured_usage_30d(team_id: str) -> dict:
    """The team's real last-30-days LLM usage: requests, tokens, spend,
    free-tier %, and free-first savings. Best-effort — empty defaults when
    storage fails or there's no usage yet."""
    from datetime import datetime, timedelta, timezone

    try:
        records = await get_storage().query_documents("usage_records", [("team_id", "==", team_id)])
    except Exception:
        logger.exception("Failed to load usage for %s", team_id)
        return {}
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent = []
    for r in records:
        created = r.get("created_at") or r.get("timestamp")
        try:
            if created:
                dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt.astimezone(timezone.utc) < cutoff:
                    continue
        except (ValueError, TypeError):
            pass
        recent.append(r)

    tokens = sum(int(r.get("tokens_used") or 0) for r in recent)
    cost = sum(float(r.get("cost_usd") or 0.0) for r in recent)
    free_requests = 0
    avoided = 0.0
    for r in recent:
        meta = r.get("usage_metadata") or {}
        if meta.get("free"):
            free_requests += 1
        avoided += float(meta.get("cost_avoided_usd") or 0.0)
    total = len(recent)
    # Cost precision: per-request costs are often sub-cent (free-first
    # routing keeps the *paid* fraction tiny), so round to 4 decimals — a
    # 2-decimal round would turn $0.004 of real spend into $0.00.
    return {
        "requests": total,
        "tokens": tokens,
        "cost_usd": round(cost, 4),
        "free_pct": round(100.0 * free_requests / total, 1) if total else 0.0,
        "cost_avoided_usd": round(avoided, 2),
    }


def _agent_token_cost(tokens: int) -> float:
    """Dollar cost of ``tokens`` on a paid agent model (input-heavy mix)."""
    inp = tokens * AGENT_INPUT_SHARE
    out = tokens * (1.0 - AGENT_INPUT_SHARE)
    return inp * AGENT_INPUT_PER_MTOK / 1e6 + out * AGENT_OUTPUT_PER_MTOK / 1e6


async def token_efficiency_benchmark(
    team_id: str,
    codebase_tokens: Optional[int] = None,
    changes_per_month: int = DEFAULT_CHANGES_PER_MONTH,
    dev_count: Optional[int] = None,
    per_dev_token_burn: bool = True,
    product_count: Optional[int] = None,
) -> dict:
    """Agents vs Onramp on token burn AND dollars, side by side.

    **Agent side (model):** every codebase change means a full re-read of the
    repo into context — ``codebase_tokens`` × ``changes_per_month`` at paid
    per-token rates, plus the terminal agent's per-dev subscription. When
    ``per_dev_token_burn`` is set (default), EACH developer's agent holds its
    own copy of the codebase, so the token burn multiplies by the developer
    count too — agents scale on subscriptions AND tokens; ``per_dev_token_burn=False``
    models a shared/reused context where the team burns the re-read once.

    **Onramp side (measured + architecture):** the team's *real* 30-day LLM
    usage (tokens, spend, free-tier %) — free-first routing keeps most of it
    at $0 — plus the incremental graph refresh: only the changed files
    (~10% of the codebase) are re-parsed/re-embedded per change, costed at
    the same token rate.

    ``codebase_tokens`` defaults to indexed file count × ``TOKENS_PER_FILE``
    (250K fallback). ``changes_per_month`` is tunable — the whole comparison
    scales with how often the codebase actually churns.

    ``dev_count`` (optional) simulates hiring — the team's actual developer
    count is used when omitted, so leaders can answer "what would agents cost
    us at 5/10/20 people?" while Onramp's flat price stays put.

    ``product_count`` (optional) simulates a multi-product company — each
    product is its own codebase of ``codebase_tokens``, so the agent re-read
    multiplies across products too (agents hold every product's code in
    context per dev), while Onramp's flat workspace price stays put.

    **Honest caveat (surfaced in the payload):** today the Onramp graph
    re-embeds the full repo on re-index; incremental changed-files-only
    refresh is the target architecture the numbers assume.
    """
    # Codebase-size default is grounded in the team's indexed repos when
    # available (file count × tokens/file); an explicit codebase_tokens wins.
    file_count = await _team_indexed_file_count(team_id)
    if not codebase_tokens and file_count:
        codebase_tokens = file_count * TOKENS_PER_FILE
    codebase_tokens = int(codebase_tokens) if codebase_tokens else DEFAULT_CODEBASE_TOKENS
    changes_per_month = max(1, int(changes_per_month or DEFAULT_CHANGES_PER_MONTH))
    # Multi-product: every product is its own codebase. Agents hold ALL of
    # them in context per dev; Onramp keeps one workspace + per-product
    # graph refreshes.
    product_count = int(product_count) if product_count and int(product_count) > 1 else 1
    total_codebase_tokens = codebase_tokens * product_count

    context = await _team_context(team_id)
    agent_slug = next(
        (a for a in TERMINAL_AGENTS if a["slug"] == CHEAPEST_PAID_SLUG), TERMINAL_AGENTS[0]
    )
    # Headcount: the team's real dev count, or a simulated "what if we hired
    # N people" — every engineer adds another per-dev subscription on the
    # agent side while Onramp's flat workspace price never moves.
    actual_dev_count = context["dev_count"]
    dev_count = int(dev_count) if dev_count and int(dev_count) > 0 else actual_dev_count

    # Agent side — the per-change story: one codebase change = one full
    # re-read of the repo into context (per developer by default — each
    # agent holds its own copy). Every product adds its codebase to what
    # each dev's agent must hold. Onramp: re-embed only the changed files
    # (~10%) and merge the delta into the persisted graph.
    read_multiplier = dev_count if per_dev_token_burn else 1
    agent_tokens_per_dev_per_change = total_codebase_tokens
    agent_tokens_per_change = total_codebase_tokens * read_multiplier
    agent_read_tokens = agent_tokens_per_change * changes_per_month
    agent_token_cost = _agent_token_cost(agent_read_tokens)
    agent_sub_monthly = agent_slug["monthly_usd_per_dev"] * dev_count
    agent_monthly = round(agent_token_cost + agent_sub_monthly, 2)

    # Onramp side: measured usage + incremental refresh cost. The graph
    # refresh scales with the TOTAL codebase (every product's changed
    # files), but the flat workspace price never moves.
    measured = await _measured_usage_30d(team_id)
    refresh_tokens_per_change = int(total_codebase_tokens * CHANGE_FILE_RATIO)
    refresh_tokens = refresh_tokens_per_change * changes_per_month
    refresh_cost = _agent_token_cost(refresh_tokens)  # same per-token rate, honest
    onramp_total_tokens = measured["tokens"] + refresh_tokens
    onramp_monthly = round(measured["cost_usd"] + refresh_cost, 2)

    token_ratio = round(agent_read_tokens / max(onramp_total_tokens, 1), 1)
    cost_ratio = round(agent_monthly / max(onramp_monthly, 1), 1)

    return {
        "team_id": team_id,
        "team_stack": context["team_stack"],
        "dev_count": actual_dev_count,
        "simulated_dev_count": dev_count,
        "assumptions": {
            "codebase_tokens": codebase_tokens,
            "product_count": product_count,
            "total_codebase_tokens": total_codebase_tokens,
            "changes_per_month": changes_per_month,
            "change_file_ratio": CHANGE_FILE_RATIO,
            "agent_input_per_mtok": AGENT_INPUT_PER_MTOK,
            "agent_output_per_mtok": AGENT_OUTPUT_PER_MTOK,
            "per_dev_token_burn": bool(per_dev_token_burn),
        },
        "codebase_size_note": (
            f"{file_count} indexed files × {TOKENS_PER_FILE} tokens/file"
            if file_count else f"default {DEFAULT_CODEBASE_TOKENS:,} tokens (mid-size React repo)"
        ),
        "agent": {
            "name": agent_slug["name"],
            "plan": agent_slug["plan"],
            "tokens_per_dev_per_change": agent_tokens_per_dev_per_change,
            "tokens_per_change": agent_tokens_per_change,
            "monthly_tokens_burned": agent_read_tokens,
            "token_cost_usd": round(agent_token_cost, 2),
            "subscription_monthly_usd": round(agent_sub_monthly, 2),
            "monthly_usd": agent_monthly,
        },
        "onramp": {
            "measured": {
                "requests_30d": measured["requests"],
                "tokens_30d": measured["tokens"],
                "cost_usd_30d": measured["cost_usd"],
                "free_pct": measured["free_pct"],
                "cost_avoided_usd_30d": measured["cost_avoided_usd"],
            },
            "graph_refresh": {
                "tokens_per_change": refresh_tokens_per_change,
                "tokens_monthly": refresh_tokens,
                "cost_usd_monthly": round(refresh_cost, 2),
            },
            "monthly_tokens": onramp_total_tokens,
            "monthly_usd": onramp_monthly,
        },
        # The headline: how many × fewer tokens/dollars Onramp burns.
        "token_ratio": token_ratio,
        "cost_ratio": cost_ratio,
        "monthly_savings_usd": round(max(0.0, agent_monthly - onramp_monthly), 2),
        "caveat": (
            "Agent side models full-repo re-reads per change. Onramp side uses "
            "measured 30d usage + incremental changed-files graph refresh "
            "(changed-files-only re-embed is the target architecture; today "
            "re-index re-embeds the full repo)."
        ),
        "generated_at": datetime.now(timezone.utc),
    }
