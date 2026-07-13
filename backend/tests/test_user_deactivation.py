"""Tests for GDPR user deactivation endpoint and service."""

import pytest
from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import decrypt_field
from app.services.user_service import create_user, get_user_by_uid, deactivate_user


@pytest.mark.asyncio
async def test_deactivate_cleans_gamification_data():
    """XP records, badges, and streaks are deleted on deactivation."""
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="frank@example.com", name="Frank", provider="google.com")

    xp_id = generate_id()
    await s.create_document("codeflow_gamification_xp", xp_id, {
        "user_id": uid, "source": "code_review", "amount": 50, "date": "2026-07-01"
    })
    badge_id = generate_id()
    await s.create_document("codeflow_gamification_badges", badge_id, {
        "user_id": uid, "badge_type": "explorer", "unlocked_at": "2026-07-01"
    })
    streak_id = generate_id()
    await s.create_document("codeflow_gamification_streaks", streak_id, {
        "user_id": uid, "current_streak": 5, "longest_streak": 10
    })

    await deactivate_user(uid)

    assert await s.get_document("codeflow_gamification_xp", xp_id) is None
    assert await s.get_document("codeflow_gamification_badges", badge_id) is None
    assert await s.get_document("codeflow_gamification_streaks", streak_id) is None


@pytest.mark.asyncio
async def test_deactivate_cleans_conversations_quizzes_paths():
    """Conversations, quizzes, quiz results, and learning paths are cleaned."""
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="grace@example.com", name="Grace", provider="github.com")

    conv_id = generate_id()
    await s.create_document("codeflow_conversations", conv_id, {
        "user_id": uid, "question": "How do I deploy?", "answer": "Run deploy script"
    })
    quiz_id = generate_id()
    await s.create_document("codeflow_quizzes", quiz_id, {
        "user_id": uid, "module": "docker", "score": 80
    })
    result_id = generate_id()
    await s.create_document("codeflow_quiz_results", result_id, {
        "user_id": uid, "quiz_id": quiz_id, "answers": []
    })
    path_id = generate_id()
    await s.create_document("codeflow_learning_paths", path_id, {
        "user_id": uid, "title": "Kubernetes", "progress": 50
    })

    await deactivate_user(uid)

    assert await s.get_document("codeflow_conversations", conv_id) is None
    assert await s.get_document("codeflow_quizzes", quiz_id) is None
    assert await s.get_document("codeflow_quiz_results", result_id) is None
    assert await s.get_document("codeflow_learning_paths", path_id) is None


@pytest.mark.asyncio
async def test_deactivate_anonymizes_pii():
    """Deactivation replaces email and name with anonymized values."""
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="alice@example.com", name="Alice", provider="google.com")

    result = await deactivate_user(uid)

    assert decrypt_field(result["email"]).startswith("deleted-")
    assert decrypt_field(result["name"]) == "Deleted User"
    assert result.get("is_active") is False
    assert result.get("deactivated_at") is not None


@pytest.mark.asyncio
async def test_deactivate_removes_from_teams():
    """User is removed from all teams after deactivation."""
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="bob@example.com", name="Bob", provider="github.com")

    # Add user to two teams
    team_a_id = generate_id()
    team_b_id = generate_id()
    m1 = await s.create_document("team_members", str(generate_id()), {
        "user_id": uid, "team_id": team_a_id, "role": "member"
    })
    m2 = await s.create_document("team_members", str(generate_id()), {
        "user_id": uid, "team_id": team_b_id, "role": "owner"
    })

    await deactivate_user(uid)

    remaining = await s.query_documents("team_members", [("user_id", "==", uid)])
    assert len(remaining) == 0


@pytest.mark.asyncio
async def test_deactivate_deletes_webhooks_and_integrations():
    """Webhooks and integrations (containing GitHub tokens) are deleted."""
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="carol@example.com", name="Carol", provider="password")

    wh_id = generate_id()
    await s.create_document("codeflow_webhooks", wh_id, {
        "user_id": uid, "url": "https://hooks.example.com", "secret": "s3cr3t"
    })
    int_id = generate_id()
    await s.create_document("codeflow_integrations", int_id, {
        "user_id": uid, "integration": "github", "token": "ghp_encrypted"
    })

    await deactivate_user(uid)

    assert await s.get_document("codeflow_webhooks", wh_id) is None
    assert await s.get_document("codeflow_integrations", int_id) is None


@pytest.mark.asyncio
async def test_deactivate_deletes_notifications():
    """Notifications and preferences are deleted on deactivation."""
    s = get_storage()
    uid = generate_id()
    await create_user(uid=uid, email="dave@example.com", name="Dave", provider="google.com")

    n_id = generate_id()
    await s.create_document("codeflow_notifications", n_id, {
        "user_id": uid, "message": "You have a new task", "read": False
    })
    await s.create_document("codeflow_notification_preferences", uid, {
        "user_id": uid, "email_digest": "daily"
    })

    await deactivate_user(uid)

    assert await s.get_document("codeflow_notifications", n_id) is None
    assert await s.get_document("codeflow_notification_preferences", uid) is None


@pytest.mark.asyncio
async def test_deactivate_twice_is_idempotent():
    """Calling deactivate on an already deactivated user doesn't error."""
    uid = generate_id()
    await create_user(uid=uid, email="eve@example.com", name="Eve", provider="password")

    await deactivate_user(uid)
    await deactivate_user(uid)

    result = await get_user_by_uid(uid)
    assert result.get("is_active") is False
    assert decrypt_field(result["name"]) == "Deleted User"
