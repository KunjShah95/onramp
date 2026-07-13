"""Unit tests for the gamification service (XP, badges, streaks, leaderboard).

Uses InMemoryStorage (STORAGE_BACKEND=memory set in conftest.py) so no
PostgreSQL database is required. The _reset_storage autouse fixture in
conftest.py ensures each test gets a fresh storage instance.
"""

import pytest
from datetime import datetime, timezone, date, timedelta
from app.services import gamification_service as gs
from app.services.postgres_db import get_storage


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════


def _find_xp_record(storage, user_id: str, source: str) -> dict | None:
    """Find an XP record by user_id and source."""
    records = storage._coll(gs.XP_COLLECTION).values()
    for r in records:
        if r.get("user_id") == user_id and r.get("source") == source:
            return r
    return None


def _set_streak_date(storage, user_id: str, target_date: str):
    """Directly update a streak record's last_active_date for testing."""
    docs = storage._coll(gs.STREAK_COLLECTION).values()
    for d in docs:
        if d.get("user_id") == user_id:
            d["last_active_date"] = target_date
            return


def _create_user(storage, user_id: str, name: str = "Test User"):
    """Create a minimal user doc in storage (needed for leaderboard name lookup)."""
    import uuid
    storage._coll("users")[user_id] = {
        "id": user_id,
        "name": name,
        "email": f"{user_id}@test.com",
    }


# ═══════════════════════════════════════════════════════════════
# Award XP
# ═══════════════════════════════════════════════════════════════


class TestAwardXp:
    async def test_award_basic(self):
        """Award XP from a valid source with default amount."""
        result = await gs.award_xp(user_id="user1", source="quiz_passed")
        assert result["awarded"] is True
        assert result["source"] == "quiz_passed"
        assert result["amount"] == 10  # from XP_SOURCES
        assert result["total_xp"] == 10
        assert result["xp_id"] is not None

    async def test_award_custom_amount(self):
        """Award XP with an explicit amount override."""
        result = await gs.award_xp(user_id="user1", source="quiz_passed", amount=99)
        assert result["awarded"] is True
        assert result["amount"] == 99

    async def test_award_with_team_id(self):
        """Award XP scoped to a team."""
        result = await gs.award_xp(user_id="user1", source="task_completed", team_id="team-alpha")
        assert result["awarded"] is True

        storage = get_storage()
        records = storage._coll(gs.XP_COLLECTION).values()
        team_records = [r for r in records if r.get("team_id") == "team-alpha"]
        assert len(team_records) >= 1

    async def test_award_with_metadata(self):
        """Award XP with custom metadata."""
        result = await gs.award_xp(
            user_id="user1",
            source="task_completed",
            metadata={"task_id": "task-42", "module": "backend"},
        )
        assert result["awarded"] is True

        storage = get_storage()
        record = _find_xp_record(storage, "user1", "task_completed")
        assert record is not None
        assert record["metadata"]["task_id"] == "task-42"
        assert record["metadata"]["module"] == "backend"

    async def test_award_invalid_source(self):
        """Awarding XP from an invalid source returns awarded=False."""
        result = await gs.award_xp(user_id="user1", source="nonexistent_source")
        assert result["awarded"] is False
        assert "Invalid XP source" in result["reason"]

    async def test_daily_cap_single_user(self):
        """Daily cap prevents awarding XP more than the per-day limit."""
        await gs.award_xp(user_id="user1", source="question_asked")
        result = await gs.award_xp(user_id="user1", source="question_asked")
        assert result["awarded"] is False
        assert "Daily cap reached" in result["reason"]

    async def test_daily_cap_different_users(self):
        """Daily cap is per-user — different users are capped independently."""
        await gs.award_xp(user_id="user1", source="question_asked")
        # user2 should still be able to earn XP for the same source
        result = await gs.award_xp(user_id="user2", source="question_asked")
        assert result["awarded"] is True
        assert result["amount"] == 5

    async def test_multiple_xp_sources(self):
        """Awarding XP from different sources accumulates total."""
        await gs.award_xp(user_id="user1", source="quiz_passed")     # 10
        await gs.award_xp(user_id="user1", source="task_completed")  # 30
        await gs.award_xp(user_id="user1", source="repo_analyzed")   # 20
        total = await gs.get_total_xp("user1")
        assert total == 60

    async def test_award_multiple_users(self):
        """XP awards for different users are independent.

        Note: first_pr_merged triggers the Squasher badge (+200 XP bonus),
        so bob's total = 200 + 200 = 400.
        """
        await gs.award_xp(user_id="alice", source="task_completed")
        await gs.award_xp(user_id="bob", source="first_pr_merged")
        assert await gs.get_total_xp("alice") == 30
        assert await gs.get_total_xp("bob") == 400  # 200 base + 200 badge bonus


# ═══════════════════════════════════════════════════════════════
# XP Queries
# ═══════════════════════════════════════════════════════════════


class TestXpQueries:
    async def test_get_total_xp_empty(self):
        """A user with no XP records returns 0."""
        total = await gs.get_total_xp("nonexistent")
        assert total == 0

    async def test_get_xp_breakdown(self):
        """XP breakdown groups amounts by source."""
        await gs.award_xp(user_id="user1", source="quiz_passed")       # 10
        await gs.award_xp(user_id="user1", source="quiz_passed")       # 10 (second award, no cap)
        await gs.award_xp(user_id="user1", source="task_completed")    # 30

        breakdown = await gs.get_xp_breakdown("user1")
        assert breakdown.get("quiz_passed") == 20
        assert breakdown.get("task_completed") == 30


# ═══════════════════════════════════════════════════════════════
# Badges
# ═══════════════════════════════════════════════════════════════


class TestBadges:
    async def test_no_badges_initially(self):
        """A new user has no earned badges."""
        badges = await gs.get_earned_badges("user1")
        assert badges == []

    async def test_explorer_badge_unlocked(self):
        """Explorer badge unlocks after 3 repo_analyzed XP events."""
        for _ in range(3):
            await gs.award_xp(user_id="user1", source="repo_analyzed")

        badges = await gs.get_earned_badges("user1")
        badge_keys = [b["badge_key"] for b in badges]
        assert "explorer" in badge_keys

        explorer = next(b for b in badges if b["badge_key"] == "explorer")
        assert explorer["badge_name"] == "Explorer"
        assert explorer["icon"] == "🗺️"

    async def test_badge_xp_bonus(self):
        """Earning a badge also awards its XP bonus."""
        for _ in range(3):
            await gs.award_xp(user_id="user1", source="repo_analyzed")

        total = await gs.get_total_xp("user1")
        # 3 × 20 XP (repo_analyzed) + 50 XP (Explorer badge bonus) = 110
        assert total == 110

    async def test_badge_not_earned_twice(self):
        """A badge that is already earned is not re-awarded."""
        for _ in range(3):
            await gs.award_xp(user_id="user1", source="repo_analyzed")

        badges_after_first = len(await gs.get_earned_badges("user1"))

        # Award 3 more repo_analyzed events
        for _ in range(3):
            await gs.award_xp(user_id="user1", source="repo_analyzed")

        badges_after_second = len(await gs.get_earned_badges("user1"))

        # Only the Explorer badge should be awarded (no new badges for 6 repo_analyzed events)
        # Actually, badge count won't increase because Explorer is the only badge for repo_analyzed
        assert badges_after_first == badges_after_second

    async def test_code_champion_badge_at_1000_xp(self):
        """Code Champion badge unlocks when total XP reaches 1000."""
        # Award 1000+ XP via a mix of sources
        for _ in range(20):
            await gs.award_xp(user_id="user1", source="task_completed")  # 30 XP each
        # 20 × 30 = 600 XP — enough to trigger it once we add more

        # Check if Explorer badge is there too (it uses repo_analyzed count, not task_completed)
        # Actually let's award enough to reach 1000+ XP
        for _ in range(14):
            await gs.award_xp(user_id="user1", source="first_pr_merged")  # 200 XP each

        # 20*30 + 14*200 = 600 + 2800 = 3400+ XP (includes badge bonuses)
        badges = await gs.get_earned_badges("user1")
        badge_keys = [b["badge_key"] for b in badges]

        # Multiple badges should be earned at this point
        assert "code_champion" in badge_keys

    async def test_earned_badge_bonus_included_in_total(self):
        """After earning a badge, its XP bonus is reflected in total."""
        for _ in range(3):
            await gs.award_xp(user_id="user1", source="repo_analyzed")

        total = await gs.get_total_xp("user1")

        # Check XP breakdown includes badge_bonus
        breakdown = await gs.get_xp_breakdown("user1")
        assert "badge_bonus" in breakdown
        assert breakdown["badge_bonus"] == 50  # Explorer badge bonus

    async def test_scholar_badge_unlocked(self):
        """Scholar badge unlocks after 5 learning_module_completed XP events."""
        for _ in range(5):
            await gs.award_xp(user_id="user1", source="learning_module_completed")

        badges = await gs.get_earned_badges("user1")
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
            await gs.award_xp(user_id="user1", source="learning_module_completed")

        total = await gs.get_total_xp("user1")
        # 5 × 50 XP (learning_module_completed) + 100 XP (Scholar badge bonus) = 350
        assert total == 350

        breakdown = await gs.get_xp_breakdown("user1")
        assert breakdown.get("badge_bonus") == 100

    async def test_streak_master_badge_unlocked(self):
        """Streak Master badge unlocks after a 7-day login streak.

        Note: Badge checking only happens inside award_xp(), not record_login().
        So we must award XP after the streak is established to trigger the check.
        """
        storage = get_storage()

        # Login day 1
        await gs.record_login("user1")

        # Simulate days 2 through 7
        for _ in range(6):
            _set_streak_date(storage, "user1", (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login("user1")

        # Check streak is 7
        streak = await gs.get_streak("user1")
        assert streak["current_streak"] == 7

        # Trigger badge check by awarding XP (record_login doesn't call check_badges)
        await gs.award_xp(user_id="user1", source="task_completed")

        # Check badge was earned
        badges = await gs.get_earned_badges("user1")
        badge_keys = [b["badge_key"] for b in badges]
        assert "streak_master" in badge_keys

        streak_master = next(b for b in badges if b["badge_key"] == "streak_master")
        assert streak_master["badge_name"] == "Streak Master"
        assert streak_master["icon"] == "🔥"
        assert streak_master["xp_bonus"] == 100

    async def test_streak_master_badge_not_before_7_days(self):
        """Streak Master badge is NOT unlocked before reaching a 7-day streak.

        Must award XP first to trigger the badge check (record_login doesn't
        call check_badges — only award_xp does).
        """
        storage = get_storage()

        await gs.record_login("user1")

        # Only reach 5 days
        for _ in range(4):
            _set_streak_date(storage, "user1", (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login("user1")

        streak = await gs.get_streak("user1")
        assert streak["current_streak"] == 5

        # Trigger badge check via XP award
        await gs.award_xp(user_id="user1", source="task_completed")

        badges = await gs.get_earned_badges("user1")
        badge_keys = [b["badge_key"] for b in badges]
        assert "streak_master" not in badge_keys

    async def test_speed_runner_badge_unlocked(self):
        """Speed Runner badge unlocks when a speed_run XP event is awarded.

        This is an externally-triggered badge — it fires when someone explicitly
        awards XP with source='speed_run' (e.g., completing onboarding in < 2 weeks).
        """
        # Award speed_run XP (not in XP_SOURCES, so pass amount explicitly)
        result = await gs.award_xp(user_id="user1", source="speed_run", amount=500)
        assert result["awarded"] is True

        badges = await gs.get_earned_badges("user1")
        badge_keys = [b["badge_key"] for b in badges]
        assert "speed_runner" in badge_keys

        speed_runner = next(b for b in badges if b["badge_key"] == "speed_runner")
        assert speed_runner["badge_name"] == "Speed Runner"
        assert speed_runner["icon"] == "⚡"
        assert speed_runner["description"] == "Complete onboarding in < 2 weeks"
        assert speed_runner["xp_bonus"] == 500

    async def test_speed_runner_badge_xp_bonus(self):
        """Speed Runner badge awards 500 XP bonus on top of the original award."""
        await gs.award_xp(user_id="user1", source="speed_run", amount=500)

        total = await gs.get_total_xp("user1")
        # 500 (speed_run) + 500 (Speed Runner badge bonus) = 1000
        assert total >= 1000

        breakdown = await gs.get_xp_breakdown("user1")
        # Should have both speed_run and badge_bonus sources
        assert breakdown.get("speed_run") == 500
        assert breakdown.get("badge_bonus") == 500


# ═══════════════════════════════════════════════════════════════
# Streaks
# ═══════════════════════════════════════════════════════════════


class TestStreaks:
    async def test_first_login(self):
        """First login creates a streak with current_streak=1."""
        result = await gs.record_login("user1")
        assert result["current_streak"] == 1
        assert result["longest_streak"] == 1
        assert result["last_active"] == date.today().isoformat()

    async def test_duplicate_login_same_day(self):
        """Login twice on the same day returns already_logged_today."""
        await gs.record_login("user1")
        result = await gs.record_login("user1")
        assert result["already_logged_today"] is True
        assert result["current_streak"] == 1

    async def test_consecutive_login(self):
        """Login on consecutive days increments the streak."""
        await gs.record_login("user1")

        # Manually set the streak to yesterday to simulate a second day
        storage = get_storage()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        _set_streak_date(storage, "user1", yesterday)

        result = await gs.record_login("user1")
        assert result["current_streak"] == 2
        assert result["longest_streak"] == 2

    async def test_longest_streak_tracking(self):
        """Longest streak is tracked independently of current streak."""
        storage = get_storage()

        # Login day 1
        await gs.record_login("user1")

        # Simulate day 2
        _set_streak_date(storage, "user1", (date.today() - timedelta(days=1)).isoformat())
        await gs.record_login("user1")

        # Simulate day 3
        _set_streak_date(storage, "user1", (date.today() - timedelta(days=1)).isoformat())
        await gs.record_login("user1")

        assert (await gs.get_streak("user1"))["current_streak"] == 3
        assert (await gs.get_streak("user1"))["longest_streak"] == 3

        # Break streak — set last_active to 5 days ago
        _set_streak_date(storage, "user1", (date.today() - timedelta(days=5)).isoformat())
        await gs.record_login("user1")

        streak = await gs.get_streak("user1")
        assert streak["current_streak"] == 1  # Reset
        assert streak["longest_streak"] == 3  # Preserved

    async def test_streak_break(self):
        """A gap of more than 1 day breaks the streak."""
        await gs.record_login("user1")

        # Simulate a break — set last_active to 3 days ago
        storage = get_storage()
        _set_streak_date(storage, "user1", (date.today() - timedelta(days=3)).isoformat())

        result = await gs.record_login("user1")
        assert result["current_streak"] == 1  # Reset to 1
        # Longest should still be 1 since we never had a streak > 1
        assert result["longest_streak"] == 1

    async def test_get_streak_new_user(self):
        """A user with no streak records gets all zeros."""
        streak = await gs.get_streak("nonexistent")
        assert streak["current_streak"] == 0
        assert streak["longest_streak"] == 0
        assert streak["last_active"] is None
        assert streak["streak_frozen"] is False

    async def test_streak_independent_per_user(self):
        """Different users have independent streaks."""
        await gs.record_login("alice")
        await gs.record_login("bob")

        assert (await gs.get_streak("alice"))["current_streak"] == 1
        assert (await gs.get_streak("bob"))["current_streak"] == 1

        # Alice logs in again (simulate next day)
        storage = get_storage()
        _set_streak_date(storage, "alice", (date.today() - timedelta(days=1)).isoformat())
        await gs.record_login("alice")

        assert (await gs.get_streak("alice"))["current_streak"] == 2
        # Bob stays at 1
        assert (await gs.get_streak("bob"))["current_streak"] == 1


# ═══════════════════════════════════════════════════════════════
# Leaderboard
# ═══════════════════════════════════════════════════════════════


class TestLeaderboard:
    async def test_empty_leaderboard(self):
        """Leaderboard for a team with no XP is empty."""
        result = await gs.get_leaderboard(team_id="team-alpha")
        assert result["entries"] == []
        assert result["total_entries"] == 0

    async def test_leaderboard_sorted_by_xp(self):
        """Leaderboard entries are sorted by XP descending.

        Note: first_pr_merged triggers the Squasher badge (+200 XP bonus),
        so bob has 200 + 200 = 400 XP.
        """
        storage = get_storage()
        _create_user(storage, "alice", "Alice")
        _create_user(storage, "bob", "Bob")
        _create_user(storage, "charlie", "Charlie")

        await gs.award_xp(user_id="alice", source="task_completed", team_id="team-alpha")   # 30
        await gs.award_xp(user_id="bob", source="first_pr_merged", team_id="team-alpha")    # 200 + 200 badge
        await gs.award_xp(user_id="charlie", source="quiz_passed", team_id="team-alpha")    # 10

        result = await gs.get_leaderboard(team_id="team-alpha")
        entries = result["entries"]

        assert len(entries) == 3
        assert entries[0]["user_id"] == "bob"       # 400 XP — first
        assert entries[1]["user_id"] == "alice"     # 30 XP — second
        assert entries[2]["user_id"] == "charlie"   # 10 XP — third

        # Verify XP values (bob's includes Squasher badge bonus)
        assert entries[0]["xp"] == 400
        assert entries[1]["xp"] == 30
        assert entries[2]["xp"] == 10

    async def test_leaderboard_respects_team_filter(self):
        """Leaderboard only includes users from the specified team."""
        storage = get_storage()
        _create_user(storage, "alice", "Alice")
        _create_user(storage, "bob", "Bob")

        await gs.award_xp(user_id="alice", source="task_completed", team_id="team-alpha")
        await gs.award_xp(user_id="bob", source="task_completed", team_id="team-beta")

        alpha_result = await gs.get_leaderboard(team_id="team-alpha")
        beta_result = await gs.get_leaderboard(team_id="team-beta")

        assert len(alpha_result["entries"]) == 1
        assert alpha_result["entries"][0]["user_id"] == "alice"

        assert len(beta_result["entries"]) == 1
        assert beta_result["entries"][0]["user_id"] == "bob"

    async def test_leaderboard_limit(self):
        """Leaderboard respects the limit parameter."""
        storage = get_storage()
        for i in range(5):
            uid = f"user{i}"
            _create_user(storage, uid, f"User {i}")
            await gs.award_xp(user_id=uid, source="task_completed", team_id="team-alpha")

        result = await gs.get_leaderboard(team_id="team-alpha", limit=3)
        assert len(result["entries"]) == 3

    async def test_leaderboard_includes_user_name(self):
        """Leaderboard entries include the user's display name."""
        storage = get_storage()
        _create_user(storage, "alice", "Alice Wong")

        await gs.award_xp(user_id="alice", source="task_completed", team_id="team-alpha")

        result = await gs.get_leaderboard(team_id="team-alpha")
        assert result["entries"][0]["name"] == "Alice Wong"

    async def test_leaderboard_tracks_badges_and_streak(self):
        """Leaderboard entries include badge count and streak info."""
        storage = get_storage()
        _create_user(storage, "alice", "Alice")

        await gs.award_xp(user_id="alice", source="task_completed", team_id="team-alpha")

        result = await gs.get_leaderboard(team_id="team-alpha")
        entry = result["entries"][0]
        assert "badges_count" in entry
        assert "current_streak" in entry


# ═══════════════════════════════════════════════════════════════
# User Summary
# ═══════════════════════════════════════════════════════════════


class TestUserSummary:
    async def test_summary_new_user(self):
        """A user with no activity gets level 1, 0 XP, no badges."""
        summary = await gs.get_user_gamification_summary("newbie")
        assert summary["user_id"] == "newbie"
        assert summary["total_xp"] == 0
        assert summary["level"] == 1
        assert summary["xp_progress"] == 0
        assert summary["xp_needed"] == 250
        assert summary["badges"] == []
        assert summary["badges_count"] == 0
        assert summary["streak"]["current_streak"] == 0

    async def test_summary_level_calculation(self):
        """Level is calculated as (total_xp // 250) + 1.

        Uses task_completed (30 XP) which doesn't trigger any badge bonuses,
        so math stays clean.
        """
        await gs.award_xp(user_id="user1", source="task_completed")  # 30 XP
        summary = await gs.get_user_gamification_summary("user1")
        assert summary["level"] == 1  # 30 XP → level 1

        # Award enough task_completed to reach level 2 (250+ XP needed)
        for _ in range(8):
            await gs.award_xp(user_id="user1", source="task_completed")  # 30 XP each
        # Total: 30 + (8 * 30) = 270 XP

        summary2 = await gs.get_user_gamification_summary("user1")
        assert summary2["level"] == 2  # 270 XP → level 2
        assert summary2["xp_progress"] == 20  # 270 - 250 = 20

    async def test_summary_includes_breakdown(self):
        """Summary includes XP breakdown by source."""
        await gs.award_xp(user_id="user1", source="quiz_passed")
        await gs.award_xp(user_id="user1", source="task_completed")

        summary = await gs.get_user_gamification_summary("user1")
        assert "xp_breakdown" in summary
        assert summary["xp_breakdown"].get("quiz_passed") == 10
        assert summary["xp_breakdown"].get("task_completed") == 30

    async def test_summary_includes_streak_and_badges(self):
        """Summary includes streak info and earned badges."""
        storage = get_storage()
        for _ in range(3):
            await gs.award_xp(user_id="user1", source="repo_analyzed")

        summary = await gs.get_user_gamification_summary("user1")
        assert summary["badges_count"] >= 1
        assert summary["streak"]["current_streak"] >= 0
        # Streak might be 0 if user hasn't logged in, but at least the key exists
        assert "current_streak" in summary["streak"]

    async def test_summary_with_team_id(self):
        """Summary accepts an optional team_id parameter."""
        await gs.award_xp(user_id="user1", source="task_completed", team_id="team-alpha")
        summary = await gs.get_user_gamification_summary("user1", team_id="team-alpha")
        assert summary["user_id"] == "user1"
        assert summary["total_xp"] >= 30


# ═══════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════


class TestEdgeCases:
    async def test_zero_amount_source(self):
        """A source not in XP_SOURCES and no amount defaults to 0 → not awarded."""
        result = await gs.award_xp(user_id="user1", source="unknown_source")
        assert result["awarded"] is False
        assert "Invalid XP source" in result["reason"]

    async def test_negative_amount(self):
        """Awarding negative XP is prevented (amount < 0 → defaults to 0 → invalid)."""
        result = await gs.award_xp(user_id="user1", source="quiz_passed", amount=-10)
        assert result["awarded"] is False

    async def test_long_streak(self):
        """A streak of 100+ days is tracked correctly."""
        storage = get_storage()
        await gs.record_login("user1")

        # Simulate 100 consecutive logins
        for day in range(100):
            # Set streak to (yesterday) and login again
            _set_streak_date(storage, "user1", (date.today() - timedelta(days=1)).isoformat())
            await gs.record_login("user1")

        streak = await gs.get_streak("user1")
        assert streak["current_streak"] == 101  # Initial login + 100 more
        assert streak["longest_streak"] == 101

    async def test_daily_cap_not_applied_to_all_sources(self):
        """Most XP sources (like task_completed) have no daily cap."""
        for _ in range(5):
            result = await gs.award_xp(user_id="user1", source="task_completed")
            assert result["awarded"] is True

        total = await gs.get_total_xp("user1")
        assert total == 150  # 5 × 30 XP

    async def test_leaderboard_no_users_in_storage(self):
        """Leaderboard handles users that exist in XP records but not in 'users' collection."""
        # Award XP without creating a user doc
        await gs.award_xp(user_id="ghost", source="task_completed", team_id="team-alpha")

        result = await gs.get_leaderboard(team_id="team-alpha")
        assert len(result["entries"]) == 1
        # Fallback name should be first 8 chars of UUID
        assert result["entries"][0]["name"] is not None
        assert result["entries"][0]["xp"] == 30
