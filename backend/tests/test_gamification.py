"""Unit tests for the gamification service (XP, badges, streaks, leaderboard).

Runs against both InMemoryStorage and PostgresStorage when --run-postgres is
passed. The _coll() helpers used in test bodies are replaced with proper
async storage operations that work with both backends.
"""

import pytest
from datetime import datetime, timezone, date, timedelta
from app.services import gamification_service as gs
from app.services.postgres_db import get_storage

# Import deterministic UUIDs from conftest
from conftest import (
    TUID_USER_USER1, TUID_USER_USER2, TUID_USER_JUNIOR1,
    TUID_TEAM_ALPHA, TUID_TEAM_BETA,
    TUID_GAMING_ALICE, TUID_GAMING_BOB, TUID_GAMING_CHARLIE,
    TUID_GAMING_NEWBIE, TUID_GAMING_GHOST,
    TUID_GAMING_USER0, TUID_GAMING_USER1, TUID_GAMING_USER2,
    TUID_GAMING_USER3, TUID_GAMING_USER4,
    TUID_NONEXISTENT,
)

# Make every test in this file use the parametrized backends
pytestmark = [
    pytest.mark.usefixtures("clean_postgres_tables", "seed_test_base"),
]


# ── Override storage_backend to parametrize across both backends ──

@pytest.fixture(params=["memory", "postgres"])
def storage_backend(request):
    """Override — runs each test against InMemoryStorage and PostgresStorage."""
    import os

    if request.param == "postgres":
        if not request.config.getoption("--run-postgres", default=False):
            pytest.skip("Pass --run-postgres to test against PostgreSQL")
        os.environ["STORAGE_BACKEND"] = "postgres"
        os.environ.setdefault(
            "DATABASE_URL",
            "postgresql+asyncpg://onramp:postgres_password@localhost:5432/onramp",
        )
    else:
        os.environ["STORAGE_BACKEND"] = "memory"

    # Reset storage singleton so next get_storage() creates the right backend
    import app.services.postgres_db as postgres_db
    postgres_db._storage = None

    yield request.param

    # Restore to memory
    os.environ["STORAGE_BACKEND"] = "memory"
    postgres_db._storage = None


# ═══════════════════════════════════════════════════════════════
# Async Helpers (backend-agnostic — no _coll() calls)
# ═══════════════════════════════════════════════════════════════


async def _find_xp_record(storage, user_id: str, source: str) -> dict | None:
    """Find an XP record by user_id and source."""
    records = await storage.query_documents(
        gs.XP_COLLECTION,
        [("user_id", "==", user_id), ("source", "==", source)],
    )
    return records[0] if records else None


async def _set_streak_date(storage, user_id: str, target_date: str):
    """Directly update a streak record's last_active_date for testing."""
    records = await storage.query_documents(
        gs.STREAK_COLLECTION, [("user_id", "==", user_id)]
    )
    if records:
        sid = records[0].get("streak_id") or records[0].get("id")
        if sid:
            await storage.update_document(
                gs.STREAK_COLLECTION, sid, {"last_active_date": target_date}
            )


async def _create_user(storage, user_id: str, name: str = "Test User"):
    """Create a minimal user doc in storage if it doesn't exist."""
    existing = await storage.get_document("users", user_id)
    if existing:
        return
    await storage.create_document("users", user_id, {
        "id": user_id,
        "name": name,
        "email": f"{user_id[:8]}@test.com",
    })


# ═══════════════════════════════════════════════════════════════
# Award XP
# ═══════════════════════════════════════════════════════════════


class TestAwardXp:
    async def test_award_basic(self):
        """Award XP from a valid source with default amount."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed")
        assert result["awarded"] is True
        assert result["source"] == "quiz_passed"
        assert result["amount"] == 10  # from XP_SOURCES
        assert result["total_xp"] == 10
        assert result["xp_id"] is not None

    async def test_award_custom_amount(self):
        """Award XP with an explicit amount override."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed", amount=99)
        assert result["awarded"] is True
        assert result["amount"] == 99

    async def test_award_with_team_id(self):
        """Award XP scoped to a team."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed", team_id=TUID_TEAM_ALPHA)
        assert result["awarded"] is True

        storage = get_storage()
        records = await storage.query_documents(
            gs.XP_COLLECTION, [("user_id", "==", TUID_USER_USER1)]
        )
        team_records = [r for r in records if r.get("team_id") == TUID_TEAM_ALPHA]
        assert len(team_records) >= 1

    async def test_award_with_metadata(self):
        """Award XP with custom metadata."""
        result = await gs.award_xp(
            user_id=TUID_USER_USER1,
            source="task_completed",
            metadata={"task_id": "task-42", "module": "backend"},
        )
        assert result["awarded"] is True

        storage = get_storage()
        record = await _find_xp_record(storage, TUID_USER_USER1, "task_completed")
        assert record is not None
        assert record["metadata"]["task_id"] == "task-42"
        assert record["metadata"]["module"] == "backend"

    async def test_award_invalid_source(self):
        """Awarding XP from an invalid source returns awarded=False."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="nonexistent_source")
        assert result["awarded"] is False
        assert "Invalid XP source" in result["reason"]

    async def test_daily_cap_single_user(self):
        """Daily cap prevents awarding XP more than the per-day limit."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="question_asked")
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="question_asked")
        assert result["awarded"] is False
        assert "Daily cap reached" in result["reason"]

    async def test_daily_cap_different_users(self):
        """Daily cap is per-user — different users are capped independently."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="question_asked")
        result = await gs.award_xp(user_id=TUID_USER_USER2, source="question_asked")
        assert result["awarded"] is True
        assert result["amount"] == 5

    async def test_multiple_xp_sources(self):
        """Awarding XP from different sources accumulates total."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed")     # 10
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")  # 30
        await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")   # 20
        total = await gs.get_total_xp(TUID_USER_USER1)
        assert total == 60

    async def test_award_multiple_users(self):
        """XP awards for different users are independent.

        Note: first_pr_merged triggers the Squasher badge (+200 XP bonus),
        so bob's total = 200 + 200 = 400.
        """
        await gs.award_xp(user_id=TUID_GAMING_ALICE, source="task_completed")
        await gs.award_xp(user_id=TUID_GAMING_BOB, source="first_pr_merged")
        assert await gs.get_total_xp(TUID_GAMING_ALICE) == 30
        assert await gs.get_total_xp(TUID_GAMING_BOB) == 400  # 200 base + 200 badge bonus


# ═══════════════════════════════════════════════════════════════
# XP Queries
# ═══════════════════════════════════════════════════════════════


class TestXpQueries:
    async def test_get_total_xp_empty(self):
        """A user with no XP records returns 0."""
        total = await gs.get_total_xp(TUID_NONEXISTENT)
        assert total == 0

    async def test_get_xp_breakdown(self):
        """XP breakdown groups amounts by source."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed")       # 10
        await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed")       # 10 (second award, no cap)
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")    # 30

        breakdown = await gs.get_xp_breakdown(TUID_USER_USER1)
        assert breakdown.get("quiz_passed") == 20
        assert breakdown.get("task_completed") == 30


# ═══════════════════════════════════════════════════════════════
# Badges
# ═══════════════════════════════════════════════════════════════


class TestBadges:
    async def test_no_badges_initially(self):
        """A new user has no earned badges."""
        badges = await gs.get_earned_badges(TUID_GAMING_NEWBIE)
        assert badges == []

    async def test_explorer_badge_unlocked(self):
        """Explorer badge unlocks after 3 repo_analyzed XP events."""
        for _ in range(3):
            await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")

        badges = await gs.get_earned_badges(TUID_USER_USER1)
        badge_keys = [b["badge_key"] for b in badges]
        assert "explorer" in badge_keys

        explorer = next(b for b in badges if b["badge_key"] == "explorer")
        assert explorer["badge_name"] == "Explorer"
        assert explorer["icon"] == "🗺️"

    async def test_badge_xp_bonus(self):
        """Earning a badge also awards its XP bonus."""
        for _ in range(3):
            await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")

        total = await gs.get_total_xp(TUID_USER_USER1)
        # 3 × 20 XP (repo_analyzed) + 50 XP (Explorer badge bonus) = 110
        assert total == 110

    async def test_badge_not_earned_twice(self):
        """A badge that is already earned is not re-awarded."""
        for _ in range(3):
            await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")

        badges_after_first = len(await gs.get_earned_badges(TUID_USER_USER1))

        # Award 3 more repo_analyzed events
        for _ in range(3):
            await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")

        badges_after_second = len(await gs.get_earned_badges(TUID_USER_USER1))

        assert badges_after_first == badges_after_second

    async def test_code_champion_badge_at_1000_xp(self):
        """Code Champion badge unlocks when total XP reaches 1000."""
        for _ in range(20):
            await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")  # 30 XP each

        for _ in range(14):
            await gs.award_xp(user_id=TUID_USER_USER1, source="first_pr_merged")  # 200 XP each

        badges = await gs.get_earned_badges(TUID_USER_USER1)
        badge_keys = [b["badge_key"] for b in badges]
        assert "code_champion" in badge_keys

    async def test_earned_badge_bonus_included_in_total(self):
        """After earning a badge, its XP bonus is reflected in total."""
        for _ in range(3):
            await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")

        total = await gs.get_total_xp(TUID_USER_USER1)

        breakdown = await gs.get_xp_breakdown(TUID_USER_USER1)
        assert "badge_bonus" in breakdown
        assert breakdown["badge_bonus"] == 50  # Explorer badge bonus

    async def test_scholar_badge_unlocked(self):
        """Scholar badge unlocks after 5 learning_module_completed XP events."""
        for _ in range(5):
            await gs.award_xp(user_id=TUID_USER_USER1, source="learning_module_completed")

        badges = await gs.get_earned_badges(TUID_USER_USER1)
        badge_keys = [b["badge_key"] for b in badges]
        assert "scholar" in badge_keys

        scholar = next(b for b in badges if b["badge_key"] == "scholar")
        assert scholar["badge_name"] == "Scholar"
        assert scholar["icon"] == "📚"
        assert scholar["description"] == "Complete 5 learning modules"
        assert scholar["xp_bonus"] == 100

    async def test_scholar_badge_xp_bonus(self):
        """Scholar badge awards 100 XP bonus."""
        for _ in range(5):
            await gs.award_xp(user_id=TUID_USER_USER1, source="learning_module_completed")

        total = await gs.get_total_xp(TUID_USER_USER1)
        # 5 × 50 XP (learning_module_completed) + 100 XP (Scholar badge bonus) = 350
        assert total == 350

        breakdown = await gs.get_xp_breakdown(TUID_USER_USER1)
        assert breakdown.get("badge_bonus") == 100

    async def test_streak_master_badge_unlocked(self):
        """Streak Master badge unlocks after a 7-day login streak.

        Note: Badge checking only happens inside award_xp(), not record_login().
        So we must award XP after the streak is established to trigger the check.
        """
        storage = get_storage()

        # Login day 1
        await gs.record_login(TUID_USER_USER1)

        # Simulate days 2 through 7
        for _ in range(6):
            await _set_streak_date(storage, TUID_USER_USER1, (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login(TUID_USER_USER1)

        # Check streak is 7
        streak = await gs.get_streak(TUID_USER_USER1)
        assert streak["current_streak"] == 7

        # Trigger badge check by awarding XP (record_login doesn't call check_badges)
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")

        # Check badge was earned
        badges = await gs.get_earned_badges(TUID_USER_USER1)
        badge_keys = [b["badge_key"] for b in badges]
        assert "streak_master" in badge_keys

        streak_master = next(b for b in badges if b["badge_key"] == "streak_master")
        assert streak_master["badge_name"] == "Streak Master"
        assert streak_master["icon"] == "🔥"
        assert streak_master["xp_bonus"] == 100

    async def test_streak_master_badge_not_before_7_days(self):
        """Streak Master badge is NOT unlocked before reaching a 7-day streak."""
        storage = get_storage()

        await gs.record_login(TUID_USER_USER1)

        # Only reach 5 days
        for _ in range(4):
            await _set_streak_date(storage, TUID_USER_USER1, (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login(TUID_USER_USER1)

        streak = await gs.get_streak(TUID_USER_USER1)
        assert streak["current_streak"] == 5

        # Trigger badge check via XP award
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")

        badges = await gs.get_earned_badges(TUID_USER_USER1)
        badge_keys = [b["badge_key"] for b in badges]
        assert "streak_master" not in badge_keys

    async def test_speed_runner_badge_unlocked(self):
        """Speed Runner badge unlocks when a speed_run XP event is awarded."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="speed_run", amount=500)
        assert result["awarded"] is True

        badges = await gs.get_earned_badges(TUID_USER_USER1)
        badge_keys = [b["badge_key"] for b in badges]
        assert "speed_runner" in badge_keys

        speed_runner = next(b for b in badges if b["badge_key"] == "speed_runner")
        assert speed_runner["badge_name"] == "Speed Runner"
        assert speed_runner["icon"] == "⚡"
        assert speed_runner["description"] == "Complete onboarding in < 2 weeks"
        assert speed_runner["xp_bonus"] == 500

    async def test_speed_runner_badge_xp_bonus(self):
        """Speed Runner badge awards 500 XP bonus on top of the original award."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="speed_run", amount=500)

        total = await gs.get_total_xp(TUID_USER_USER1)
        # 500 (speed_run) + 500 (Speed Runner badge bonus) = 1000
        assert total >= 1000

        breakdown = await gs.get_xp_breakdown(TUID_USER_USER1)
        assert breakdown.get("speed_run") == 500
        assert breakdown.get("badge_bonus") == 500


# ═══════════════════════════════════════════════════════════════
# Streaks
# ═══════════════════════════════════════════════════════════════


class TestStreaks:
    async def test_first_login(self):
        """First login creates a streak with current_streak=1."""
        result = await gs.record_login(TUID_USER_USER1)
        assert result["current_streak"] == 1
        assert result["longest_streak"] == 1
        assert result["last_active"] == date.today().isoformat()

    async def test_duplicate_login_same_day(self):
        """Login twice on the same day returns already_logged_today."""
        await gs.record_login(TUID_USER_USER1)
        result = await gs.record_login(TUID_USER_USER1)
        assert result["already_logged_today"] is True
        assert result["current_streak"] == 1

    async def test_consecutive_login(self):
        """Login on consecutive days increments the streak."""
        await gs.record_login(TUID_USER_USER1)

        storage = get_storage()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        await _set_streak_date(storage, TUID_USER_USER1, yesterday)

        result = await gs.record_login(TUID_USER_USER1)
        assert result["current_streak"] == 2
        assert result["longest_streak"] == 2

    async def test_longest_streak_tracking(self):
        """Longest streak is tracked independently of current streak."""
        storage = get_storage()

        await gs.record_login(TUID_USER_USER1)

        for _ in range(2):
            await _set_streak_date(storage, TUID_USER_USER1, (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login(TUID_USER_USER1)

        assert (await gs.get_streak(TUID_USER_USER1))["current_streak"] == 3
        assert (await gs.get_streak(TUID_USER_USER1))["longest_streak"] == 3

        # Break streak — set last_active to 5 days ago
        await _set_streak_date(storage, TUID_USER_USER1, (date.today() - timedelta(days=5)).isoformat())
        await gs.record_login(TUID_USER_USER1)

        streak = await gs.get_streak(TUID_USER_USER1)
        assert streak["current_streak"] == 1  # Reset
        assert streak["longest_streak"] == 3  # Preserved

    async def test_streak_break(self):
        """A gap of more than 1 day breaks the streak."""
        await gs.record_login(TUID_USER_USER1)

        storage = get_storage()
        await _set_streak_date(storage, TUID_USER_USER1, (date.today() - timedelta(days=3)).isoformat())

        result = await gs.record_login(TUID_USER_USER1)
        assert result["current_streak"] == 1  # Reset to 1
        assert result["longest_streak"] == 1

    async def test_get_streak_new_user(self):
        """A user with no streak records gets all zeros."""
        streak = await gs.get_streak(TUID_NONEXISTENT)
        assert streak["current_streak"] == 0
        assert streak["longest_streak"] == 0
        assert streak["last_active"] is None
        assert streak["streak_frozen"] is False

    async def test_streak_independent_per_user(self):
        """Different users have independent streaks."""
        await gs.record_login(TUID_GAMING_ALICE)
        await gs.record_login(TUID_GAMING_BOB)

        assert (await gs.get_streak(TUID_GAMING_ALICE))["current_streak"] == 1
        assert (await gs.get_streak(TUID_GAMING_BOB))["current_streak"] == 1

        # Alice logs in again (simulate next day)
        storage = get_storage()
        await _set_streak_date(storage, TUID_GAMING_ALICE, (date.today() - timedelta(days=1)).isoformat())
        await gs.record_login(TUID_GAMING_ALICE)

        assert (await gs.get_streak(TUID_GAMING_ALICE))["current_streak"] == 2
        assert (await gs.get_streak(TUID_GAMING_BOB))["current_streak"] == 1


# ═══════════════════════════════════════════════════════════════
# Leaderboard
# ═══════════════════════════════════════════════════════════════


class TestLeaderboard:
    async def test_empty_leaderboard(self):
        """Leaderboard for a team with no XP is empty."""
        result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA)
        assert result["entries"] == []
        assert result["total_entries"] == 0

    async def test_leaderboard_sorted_by_xp(self):
        """Leaderboard entries are sorted by XP descending.

        Note: first_pr_merged triggers the Squasher badge (+200 XP bonus),
        so bob has 200 + 200 = 400 XP.
        """
        storage = get_storage()
        await _create_user(storage, TUID_GAMING_ALICE, "Alice")
        await _create_user(storage, TUID_GAMING_BOB, "Bob")
        await _create_user(storage, TUID_GAMING_CHARLIE, "Charlie")

        await gs.award_xp(user_id=TUID_GAMING_ALICE, source="task_completed", team_id=TUID_TEAM_ALPHA)   # 30
        await gs.award_xp(user_id=TUID_GAMING_BOB, source="first_pr_merged", team_id=TUID_TEAM_ALPHA)    # 200 + 200 badge
        await gs.award_xp(user_id=TUID_GAMING_CHARLIE, source="quiz_passed", team_id=TUID_TEAM_ALPHA)    # 10

        result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA)
        entries = result["entries"]

        assert len(entries) == 3
        assert entries[0]["user_id"] == TUID_GAMING_BOB        # 400 XP — first
        assert entries[1]["user_id"] == TUID_GAMING_ALICE      # 30 XP — second
        assert entries[2]["user_id"] == TUID_GAMING_CHARLIE    # 10 XP — third

        assert entries[0]["xp"] == 400
        assert entries[1]["xp"] == 30
        assert entries[2]["xp"] == 10

    async def test_leaderboard_respects_team_filter(self):
        """Leaderboard only includes users from the specified team."""
        storage = get_storage()
        await _create_user(storage, TUID_GAMING_ALICE, "Alice")
        await _create_user(storage, TUID_GAMING_BOB, "Bob")

        await gs.award_xp(user_id=TUID_GAMING_ALICE, source="task_completed", team_id=TUID_TEAM_ALPHA)
        await gs.award_xp(user_id=TUID_GAMING_BOB, source="task_completed", team_id=TUID_TEAM_BETA)

        alpha_result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA)
        beta_result = await gs.get_leaderboard(team_id=TUID_TEAM_BETA)

        assert len(alpha_result["entries"]) == 1
        assert alpha_result["entries"][0]["user_id"] == TUID_GAMING_ALICE

        assert len(beta_result["entries"]) == 1
        assert beta_result["entries"][0]["user_id"] == TUID_GAMING_BOB

    async def test_leaderboard_limit(self):
        """Leaderboard respects the limit parameter."""
        storage = get_storage()
        uids = [TUID_GAMING_USER0, TUID_GAMING_USER1, TUID_GAMING_USER2,
                TUID_GAMING_USER3, TUID_GAMING_USER4]
        for uid in uids:
            await _create_user(storage, uid, f"User {uid[:4]}")
            await gs.award_xp(user_id=uid, source="task_completed", team_id=TUID_TEAM_ALPHA)

        result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA, limit=3)
        assert len(result["entries"]) == 3

    async def test_leaderboard_includes_user_name(self):
        """Leaderboard entries include the user's display name."""
        storage = get_storage()
        await _create_user(storage, TUID_GAMING_ALICE, "Alice Wong")

        await gs.award_xp(user_id=TUID_GAMING_ALICE, source="task_completed", team_id=TUID_TEAM_ALPHA)

        result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA)
        assert result["entries"][0]["name"] == "Alice Wong"

    async def test_leaderboard_tracks_badges_and_streak(self):
        """Leaderboard entries include badge count and streak info."""
        storage = get_storage()
        await _create_user(storage, TUID_GAMING_ALICE, "Alice")

        await gs.award_xp(user_id=TUID_GAMING_ALICE, source="task_completed", team_id=TUID_TEAM_ALPHA)

        result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA)
        entry = result["entries"][0]
        assert "badges_count" in entry
        assert "current_streak" in entry


# ═══════════════════════════════════════════════════════════════
# User Summary
# ═══════════════════════════════════════════════════════════════


class TestUserSummary:
    async def test_summary_new_user(self):
        """A user with no activity gets level 1, 0 XP, no badges."""
        summary = await gs.get_user_gamification_summary(TUID_GAMING_NEWBIE)
        assert summary["user_id"] == TUID_GAMING_NEWBIE
        assert summary["total_xp"] == 0
        assert summary["level"] == 1
        assert summary["xp_progress"] == 0
        assert summary["xp_needed"] == 250
        assert summary["badges"] == []
        assert summary["badges_count"] == 0
        assert summary["streak"]["current_streak"] == 0

    async def test_summary_level_calculation(self):
        """Level is calculated as (total_xp // 250) + 1.

        Uses task_completed (30 XP) which doesn't trigger any badge bonuses.
        """
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")  # 30 XP
        summary = await gs.get_user_gamification_summary(TUID_USER_USER1)
        assert summary["level"] == 1  # 30 XP → level 1

        for _ in range(8):
            await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")  # 30 XP each
        # Total: 30 + (8 * 30) = 270 XP

        summary2 = await gs.get_user_gamification_summary(TUID_USER_USER1)
        assert summary2["level"] == 2  # 270 XP → level 2
        assert summary2["xp_progress"] == 20  # 270 - 250 = 20

    async def test_summary_includes_breakdown(self):
        """Summary includes XP breakdown by source."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed")
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")

        summary = await gs.get_user_gamification_summary(TUID_USER_USER1)
        assert "xp_breakdown" in summary
        assert summary["xp_breakdown"].get("quiz_passed") == 10
        assert summary["xp_breakdown"].get("task_completed") == 30

    async def test_summary_includes_streak_and_badges(self):
        """Summary includes streak info and earned badges."""
        for _ in range(3):
            await gs.award_xp(user_id=TUID_USER_USER1, source="repo_analyzed")

        summary = await gs.get_user_gamification_summary(TUID_USER_USER1)
        assert summary["badges_count"] >= 1
        assert "current_streak" in summary["streak"]

    async def test_summary_with_team_id(self):
        """Summary accepts an optional team_id parameter."""
        await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed", team_id=TUID_TEAM_ALPHA)
        summary = await gs.get_user_gamification_summary(TUID_USER_USER1, team_id=TUID_TEAM_ALPHA)
        assert summary["user_id"] == TUID_USER_USER1
        assert summary["total_xp"] >= 30


# ═══════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════


class TestEdgeCases:
    async def test_zero_amount_source(self):
        """A source not in XP_SOURCES and no amount defaults to 0 → not awarded."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="unknown_source")
        assert result["awarded"] is False
        assert "Invalid XP source" in result["reason"]

    async def test_negative_amount(self):
        """Awarding negative XP is prevented (amount < 0 → defaults to 0 → invalid)."""
        result = await gs.award_xp(user_id=TUID_USER_USER1, source="quiz_passed", amount=-10)
        assert result["awarded"] is False

    async def test_long_streak(self):
        """A streak of 100+ days is tracked correctly."""
        storage = get_storage()
        await gs.record_login(TUID_USER_USER1)

        for _ in range(100):
            await _set_streak_date(storage, TUID_USER_USER1, (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login(TUID_USER_USER1)

        streak = await gs.get_streak(TUID_USER_USER1)
        assert streak["current_streak"] == 101  # Initial login + 100 more
        assert streak["longest_streak"] == 101

    async def test_daily_cap_not_applied_to_all_sources(self):
        """Most XP sources (like task_completed) have no daily cap."""
        for _ in range(5):
            result = await gs.award_xp(user_id=TUID_USER_USER1, source="task_completed")
            assert result["awarded"] is True

        total = await gs.get_total_xp(TUID_USER_USER1)
        assert total == 150  # 5 × 30 XP

    async def test_leaderboard_no_users_in_storage(self):
        """Leaderboard handles users that exist in XP records but not in 'users' collection."""
        await gs.award_xp(user_id=TUID_GAMING_GHOST, source="task_completed", team_id=TUID_TEAM_ALPHA)

        result = await gs.get_leaderboard(team_id=TUID_TEAM_ALPHA)
        assert len(result["entries"]) == 1
        assert result["entries"][0]["name"] is not None
        assert result["entries"][0]["xp"] == 30
