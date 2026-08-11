"""Per-team routing-mode preference — service layer.

Mirrors test_team_provider_keys.py's shape: set/get round-trip, upsert
semantics, and defaulting when a team has no preference set.
"""

from app.llm import RoutingMode
from app.services.team_routing_settings import (
    get_team_routing_mode,
    set_team_routing_mode,
)


class TestTeamRoutingSettings:
    async def test_defaults_to_balanced_when_unset(self):
        assert await get_team_routing_mode("routing-r1") == RoutingMode.BALANCED

    async def test_falsy_team_id_defaults_to_balanced(self):
        assert await get_team_routing_mode(None) == RoutingMode.BALANCED
        assert await get_team_routing_mode("") == RoutingMode.BALANCED

    async def test_set_get_roundtrip_with_preset_name(self):
        team = "routing-r2"
        result = await set_team_routing_mode(team, "intelligence", "u-1")
        assert result["routing_mode"] == RoutingMode.INTELLIGENCE
        assert await get_team_routing_mode(team) == RoutingMode.INTELLIGENCE

    async def test_set_get_roundtrip_with_int(self):
        team = "routing-r3"
        await set_team_routing_mode(team, 3, "u-1")
        assert await get_team_routing_mode(team) == 3

    async def test_upsert_replaces_value(self):
        team = "routing-r4"
        await set_team_routing_mode(team, "cost", "u-1")
        await set_team_routing_mode(team, "intelligence", "u-2")
        assert await get_team_routing_mode(team) == RoutingMode.INTELLIGENCE

    async def test_out_of_range_int_is_clamped(self):
        team = "routing-r5"
        await set_team_routing_mode(team, 99, "u-1")
        assert await get_team_routing_mode(team) == 10

    async def test_different_teams_are_isolated(self):
        await set_team_routing_mode("routing-r6a", "cost", "u-1")
        await set_team_routing_mode("routing-r6b", "intelligence", "u-1")
        assert await get_team_routing_mode("routing-r6a") == RoutingMode.COST
        assert await get_team_routing_mode("routing-r6b") == RoutingMode.INTELLIGENCE
