"""Service-level tests for AutopilotService (solve-time role labeling, etc.)."""

import asyncio

from app.services.autopilot_service import AutopilotService, _ROLE_GITHUB_LABELS


class _FakeGitHub:
    """Records ensure_labels / add_labels calls; simulates PR creation."""

    def __init__(self):
        self.github_token = "fake-token"
        self.ensured = []
        self.labeled = []  # (number, labels)

    async def ensure_labels(self, owner, repo, labels):
        self.ensured.append((owner, repo, labels))
        return {"created": list(labels), "existing": []}

    async def add_labels(self, owner, repo, number, labels):
        self.labeled.append((number, labels))
        return True


class _FakeAgent:
    """AutonomousCodingAgent stand-in — opens a PR without network."""

    def __init__(self, llm, github_token=None):
        pass

    async def execute(self, repo_url, issue_description, base_branch="main", **kwargs):
        return {
            "success": True,
            "pr_number": 7,
            "pr_url": f"{repo_url}/pull/7",
            "branch": "ai/test",
            "summary": issue_description.splitlines()[1][:60],
            "files_changed": 1,
        }


def _service(monkeypatch, github=None):
    from app.services import autopilot_service

    monkeypatch.setattr(autopilot_service, "AutonomousCodingAgent", _FakeAgent)
    svc = AutopilotService(llm=object())
    svc.github = github or _FakeGitHub()
    return svc


def _issues():
    return [
        {
            "title": "Fix auth NPE",
            "description": "NPE when token missing",
            "category": "bug",
            "severity": "high",
            "difficulty": "easy",
            "files": ["src/auth.py"],
            "assigned_role": "intern",
            "github_number": 3,
            "source": "github-issue",
        },
        {
            "title": "Harden rate limiter",
            "description": "Redis outage handling",
            "category": "error-handling",
            "severity": "critical",
            "difficulty": "hard",
            "files": ["src/rate.py"],
            "assigned_role": "senior_dev",
            "source": "ai-analysis",
        },
    ]


class TestSolveRoleLabeling:
    def test_ensures_role_labels_once(self, monkeypatch):
        svc = _service(monkeypatch)
        asyncio.run(svc._solve_issues(
            "https://github.com/acme/app", "main", "/tmp/repo",
            _issues(), "fake-token", 5, "balanced",
        ))

        assert len(svc.github.ensured) == 1
        owner, repo, labels = svc.github.ensured[0]
        assert owner == "acme" and repo == "app"
        assert set(labels) == {"good-first-issue", "senior-review"}
        assert labels["good-first-issue"] == "7057ff"
        assert labels["senior-review"] == "d4a72c"

    def test_labels_github_issue_before_solve_and_pr_after(self, monkeypatch):
        svc = _service(monkeypatch)
        results = asyncio.run(svc._solve_issues(
            "https://github.com/acme/app", "main", "/tmp/repo",
            _issues(), "fake-token", 5, "balanced",
        ))

        # Originating GitHub issue #3 labeled with the intern role label.
        assert (3, ["good-first-issue"]) in svc.github.labeled
        # Every opened PR labeled with its role label (both PRs got PR #7 from the fake).
        assert (7, ["good-first-issue"]) in svc.github.labeled
        assert (7, ["senior-review"]) in svc.github.labeled
        assert len(results) == 2
        assert all(r["success"] for r in results)

    def test_github_issue_label_skipped_when_no_number(self, monkeypatch):
        issues = _issues()
        issues[0].pop("github_number")
        svc = _service(monkeypatch)
        asyncio.run(svc._solve_issues(
            "https://github.com/acme/app", "main", "/tmp/repo",
            issues, "fake-token", 5, "balanced",
        ))
        # Only PR labels were added — no issue-numbered labels.
        assert all(num == 7 for num, _ in svc.github.labeled)


class TestRoleLabelMapping:
    def test_all_roles_have_labels(self):
        assert _ROLE_GITHUB_LABELS == {
            "intern": "good-first-issue",
            "developer": "good-second-issue",
            "senior_dev": "senior-review",
        }


# ── Task creation (pipeline → real Onramp tasks) ───────────────────────────

_ISSUES = [
    {
        "title": "Fix auth NPE",
        "description": "NPE when token missing",
        "category": "bug",
        "severity": "high",
        "difficulty": "easy",
        "files": ["src/auth.py"],
        "assigned_role": "intern",
        "source": "ai-analysis",
    },
    {
        "title": "Harden rate limiter",
        "description": "Redis outage handling",
        "category": "error-handling",
        "severity": "critical",
        "difficulty": "hard",
        "files": ["src/rate.py"],
        "assigned_role": "senior_dev",
        "source": "ai-analysis",
    },
]


async def _seed_team(storage, team_id, creator_id, extra_members=()):
    """Create a team + users with roles new_dev / developer / senior_dev.

    ``extra_members``: list of (uid, name, role) added after the base set so
    tests can build multi-member roles for round-robin rotation.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    await storage.create_document("teams", team_id, {
        "name": "Pipeline Team", "description": "", "is_active": True,
        "created_at": now, "updated_at": now,
    })
    for uid, name, role in [
        (creator_id, "Creator", "admin"),
        ("u-newdev", "New Dev", "junior_dev"),
        ("u-dev", "Dev", "developer"),
        ("u-senior", "Senior", "senior_dev"),
    ] + list(extra_members):
        await storage.create_document("users", uid, {
            "email": f"{name.lower().replace(' ', '')}@test.com",
            "name": name, "provider": "password", "password_hash": "h",
            "is_active": True, "created_at": now, "updated_at": now,
        })
        await storage.create_document("team_members", f"mem-{uid}", {
            "user_id": uid, "team_id": team_id, "role": role,
            "joined_at": now,
        })


class TestCreateTasks:
    def test_creates_tasks_assigned_by_matching_role(self, storage):
        svc = AutopilotService(llm=object())
        asyncio.run(_seed_team(storage, "team-pipe", "u-creator"))

        created = asyncio.run(svc.create_tasks(
            _ISSUES, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))

        assert len(created) == 2
        by_title = {t["title"]: t for t in created}
        assert by_title["Fix auth NPE"]["team_role"] == "junior_dev"
        assert by_title["Fix auth NPE"]["assigned_to"] == "u-newdev"
        assert by_title["Harden rate limiter"]["team_role"] == "senior_dev"
        assert by_title["Harden rate limiter"]["assigned_to"] == "u-senior"
        # Each created task is persisted in the assigned state.
        assert all(t["state"] == "assigned" for t in created)

    def test_issues_stamped_with_task_id(self, storage):
        svc = AutopilotService(llm=object())
        asyncio.run(_seed_team(storage, "team-pipe", "u-creator"))
        issues = [dict(i) for i in _ISSUES]

        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        assert all(i.get("task_id") for i in issues)
        assert all(i.get("task_status") == "created" for i in issues)

    def test_skips_duplicate_issues_on_rerun(self, storage):
        svc = AutopilotService(llm=object())
        asyncio.run(_seed_team(storage, "team-pipe", "u-creator"))

        asyncio.run(svc.create_tasks(
            _ISSUES, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        # Second run — same repo, same titles → all skipped as duplicates.
        issues2 = [dict(i) for i in _ISSUES]
        created2 = asyncio.run(svc.create_tasks(
            issues2, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        assert created2 == []
        assert all(i.get("task_status") == "skipped-duplicate" for i in issues2)

    def test_skips_duplicate_github_issue_by_number(self, storage):
        svc = AutopilotService(llm=object())
        asyncio.run(_seed_team(storage, "team-pipe", "u-creator"))
        issues = [dict(i) for i in _ISSUES]
        issues[0]["github_number"] = 42
        issues[0]["github_url"] = "https://github.com/acme/app/issues/42"

        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        issues2 = [dict(i) for i in _ISSUES]
        issues2[0]["github_number"] = 42
        issues2[0]["github_url"] = "https://github.com/acme/app/issues/42"
        # Same GitHub issue, different title → still deduped by number.
        issues2[0]["title"] = "Renamed title"
        created2 = asyncio.run(svc.create_tasks(
            issues2, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        assert all(t["title"] != "Renamed title" for t in created2)
        assert issues2[0]["task_status"] == "skipped-duplicate"

    def test_unassigned_when_no_matching_role(self, storage):
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        # Team with only an owner — no role-matched assignees available.
        asyncio.run(storage.create_document("teams", "team-owner", {
            "name": "Owner Team", "is_active": True, "created_at": now, "updated_at": now,
        }))
        asyncio.run(storage.create_document("users", "u-boss", {
            "email": "boss@test.com", "name": "Boss", "provider": "password",
            "password_hash": "h", "is_active": True, "created_at": now, "updated_at": now,
        }))
        asyncio.run(storage.create_document("team_members", "mem-u-boss", {
            "user_id": "u-boss", "team_id": "team-owner", "role": "admin",
            "joined_at": now,
        }))
        svc = AutopilotService(llm=object())

        created = asyncio.run(svc.create_tasks(
            _ISSUES, "https://github.com/acme/app", "main", "team-owner", "u-boss",
        ))
        assert len(created) == 2
        assert all(t["assigned_to"] is None for t in created)
        # Owner is not auto-assigned (creator excluded) — tasks stay pending.
        assert all(t["state"] == "pending" for t in created)

    def test_github_issue_sets_source_issue(self, storage):
        svc = AutopilotService(llm=object())
        asyncio.run(_seed_team(storage, "team-pipe", "u-creator"))
        issues = [dict(i) for i in _ISSUES]
        issues[0]["github_number"] = 7
        issues[0]["github_url"] = "https://github.com/acme/app/issues/7"

        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        from app.services.postgres_db import get_storage
        tasks = asyncio.run(get_storage().query_documents(
            "onramp_tasks", [("team_id", "==", "team-pipe")]
        ))
        gh_task = next(t for t in tasks if t.get("source_issue") and t["source_issue"].get("number") == 7)
        assert gh_task["source_issue"]["url"] == "https://github.com/acme/app/issues/7"
        assert gh_task["source_issue"]["repo_url"] == "https://github.com/acme/app"


class TestRoundRobinAssignment:
    """Round-robin rotation across all members holding the matching role."""

    @staticmethod
    def _easy_issues(n, start=0):
        return [
            {
                "title": f"Easy bug {i}",
                "description": "d",
                "category": "bug",
                "severity": "high",
                "difficulty": "easy",
                "files": ["src/a.py"],
                "assigned_role": "intern",
                "source": "ai-analysis",
            }
            for i in range(start, start + n)
        ]

    def test_rotates_across_all_new_dev_members_in_one_batch(self, storage):
        # new_dev pool: base u-newdev + u-n1 + u-n2 → sorted [u-n1, u-n2, u-newdev].
        asyncio.run(_seed_team(storage, "team-rr", "u-creator", [
            ("u-n1", "Intern One", "junior_dev"),
            ("u-n2", "Intern Two", "junior_dev"),
        ]))
        svc = AutopilotService(llm=object())

        created = asyncio.run(svc.create_tasks(
            self._easy_issues(4),
            "https://github.com/acme/app", "main", "team-rr", "u-creator",
        ))

        assignees = [t["assigned_to"] for t in created]
        assert assignees == ["u-n1", "u-n2", "u-newdev", "u-n1"]

    def test_rotation_continues_across_separate_runs(self, storage):
        """A second pipeline run keeps the cycle (seeded from task history)."""
        asyncio.run(_seed_team(storage, "team-rr", "u-creator", [
            ("u-n1", "Intern One", "junior_dev"),
            ("u-n2", "Intern Two", "junior_dev"),
        ]))
        svc = AutopilotService(llm=object())

        asyncio.run(svc.create_tasks(
            self._easy_issues(2),
            "https://github.com/acme/app", "main", "team-rr", "u-creator",
        ))
        # Second run with fresh titles → continues after u-n2 → u-newdev.
        created = asyncio.run(svc.create_tasks(
            self._easy_issues(2, start=10),
            "https://github.com/acme/app", "main", "team-rr", "u-creator",
        ))
        assert [t["assigned_to"] for t in created] == ["u-newdev", "u-n1"]

    def test_rotation_is_per_role(self, storage):
        """Each role rotates independently over its own member pool.

        new_dev pool: [u-n1, u-n2, u-newdev]; senior pool: [u-s2, u-senior]
        (sorted — 'u-s2' < 'u-senior')."""
        asyncio.run(_seed_team(storage, "team-rr", "u-creator", [
            ("u-n1", "Intern One", "junior_dev"),
            ("u-n2", "Intern Two", "junior_dev"),
            ("u-s2", "Senior Two", "senior_dev"),
        ]))
        svc = AutopilotService(llm=object())
        issues = self._easy_issues(2) + [
            {
                "title": "Hard perf 1",
                "description": "d",
                "category": "performance",
                "severity": "critical",
                "difficulty": "hard",
                "files": ["src/b.py"],
                "assigned_role": "senior_dev",
                "source": "ai-analysis",
            },
            {
                "title": "Hard perf 2",
                "description": "d",
                "category": "performance",
                "severity": "critical",
                "difficulty": "hard",
                "files": ["src/b.py"],
                "assigned_role": "senior_dev",
                "source": "ai-analysis",
            },
        ]

        created = asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-rr", "u-creator",
        ))
        by_title = {t["title"]: t["assigned_to"] for t in created}
        assert by_title["Easy bug 0"] == "u-n1"
        assert by_title["Easy bug 1"] == "u-n2"
        assert by_title["Hard perf 1"] == "u-s2"
        assert by_title["Hard perf 2"] == "u-senior"


class TestLoadAwareAssignment:
    """Members with fewer active tasks win the next assignment."""

    @staticmethod
    def _easy_issue(title):
        return {
            "title": title,
            "description": "d",
            "category": "bug",
            "severity": "high",
            "difficulty": "easy",
            "files": ["src/a.py"],
            "assigned_role": "intern",
            "source": "ai-analysis",
        }

    @staticmethod
    def _seed_active_tasks(storage, team_id, assigned_to, count):
        """Create ``count`` active tasks assigned to a member (pre-existing load)."""
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        for i in range(count):
            asyncio.run(storage.create_document("onramp_tasks", f"preload-{assigned_to}-{i}", {
                "task_id": f"preload-{assigned_to}-{i}",
                "team_id": team_id,
                "created_by": "u-creator",
                "assigned_to": assigned_to,
                "title": f"Existing task {i}",
                "description": "",
                "module": "",
                "state": "in_progress",
                "priority": "medium",
                "created_at": now,
                "updated_at": now,
            }))

    def test_skips_overloaded_member(self, storage):
        """A member with pre-existing active tasks is passed over until the
        lighter member gets the assignment."""
        asyncio.run(_seed_team(storage, "team-load", "u-creator", [
            ("u-busy", "Busy Intern", "junior_dev"),
            ("u-free", "Free Intern", "junior_dev"),
        ]))
        # u-busy already holds 2 active tasks; u-free holds none.
        self._seed_active_tasks(storage, "team-load", "u-busy", 2)
        svc = AutopilotService(llm=object())

        created = asyncio.run(svc.create_tasks(
            [self._easy_issue("New bug 1")],
            "https://github.com/acme/app", "main", "team-load", "u-creator",
        ))
        assert created[0]["assigned_to"] == "u-free"

    def test_load_beats_round_robin_cursor(self, storage):
        """The cursor is only a tie-breaker — when it points at an overloaded
        member, the lighter member wins instead."""
        # new_dev pool (sorted): [u-a, u-b, u-newdev]
        asyncio.run(_seed_team(storage, "team-load", "u-creator", [
            ("u-a", "Intern A", "junior_dev"),
            ("u-b", "Intern B", "junior_dev"),
        ]))
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        # Most recent assignment → u-a, so the cursor advances to u-b.
        asyncio.run(storage.create_document("onramp_tasks", "seed-last", {
            "task_id": "seed-last",
            "team_id": "team-load",
            "created_by": "u-creator",
            "assigned_to": "u-a",
            "title": "Last assigned task",
            "description": "", "module": "", "state": "submitted",
            "priority": "medium", "created_at": now, "updated_at": now,
        }))
        # u-a is also overloaded (2 active: seed-last + one more).
        self._seed_active_tasks(storage, "team-load", "u-a", 1)
        svc = AutopilotService(llm=object())

        created = asyncio.run(svc.create_tasks(
            [self._easy_issue("New bug 2")],
            "https://github.com/acme/app", "main", "team-load", "u-creator",
        ))
        # Loads: u-a=2, u-b=0, u-newdev=0 → least-loaded wins, even though
        # the round-robin cursor sits on u-b after u-a's recent assignment.
        assert created[0]["assigned_to"] in ("u-b", "u-newdev")
        assert created[0]["assigned_to"] != "u-a"

    def test_completed_tasks_do_not_count_as_load(self, storage):
        """Only active tasks weight the assignment — completed work is not load."""
        asyncio.run(_seed_team(storage, "team-load", "u-creator", [
            ("u-done", "Done Intern", "junior_dev"),
            ("u-other", "Other Intern", "junior_dev"),
        ]))
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        # u-done has 2 COMPLETED tasks — they must not weigh against them.
        for i in range(2):
            asyncio.run(storage.create_document("onramp_tasks", f"done-{i}", {
                "task_id": f"done-{i}", "team_id": "team-load",
                "created_by": "u-creator", "assigned_to": "u-done",
                "title": f"Done {i}", "description": "", "module": "",
                "state": "completed", "priority": "medium",
                "created_at": now, "updated_at": now,
            }))
        svc = AutopilotService(llm=object())

        created = asyncio.run(svc.create_tasks(
            [self._easy_issue("New bug 3")],
            "https://github.com/acme/app", "main", "team-load", "u-creator",
        ))
        # Equal active load → round-robin tie-break from cursor (0) → u-done
        # (sorted first, both at 0 active).
        assert created[0]["assigned_to"] == "u-done"


class TestTaskAutoAdvance:
    """Pipeline-opened PRs advance the linked task's state machine."""

    @staticmethod
    def _patched_service(monkeypatch):
        from app.services import autopilot_service

        monkeypatch.setattr(autopilot_service, "AutonomousCodingAgent", _FakeAgent)
        svc = AutopilotService(llm=object())
        svc.github = _FakeGitHub()
        return svc

    def _created_issues(self, storage):
        """Seed a team, create tasks for the standard issues, return issues with task_id."""
        asyncio.run(_seed_team(storage, "team-pipe", "u-creator"))
        svc = AutopilotService(llm=object())
        issues = [dict(i) for i in _ISSUES]
        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        return svc, issues

    def test_submits_task_with_pr_url_after_solve(self, monkeypatch, storage):
        svc = self._patched_service(monkeypatch)
        issues = [dict(i) for i in _ISSUES]
        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        assert all(i.get("task_id") for i in issues)

        results = asyncio.run(svc._solve_issues(
            "https://github.com/acme/app", "main", "/tmp/repo",
            issues, "fake-token", 5, "balanced",
        ))
        assert all(r["success"] for r in results)

        from app.services import task_service
        task = asyncio.run(task_service.get_task(issues[0]["task_id"]))
        assert task["state"] == "submitted"
        assert task["pr_url"] == "https://github.com/acme/app/pull/7"
        assert task["submitted_at"] is not None

    def test_pending_task_advanced_through_full_chain(self, monkeypatch, storage):
        """A task created pending (no matching role) reaches submitted: the
        creator becomes the assignee, then in_progress, then submitted."""
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        asyncio.run(storage.create_document("teams", "team-owner", {
            "name": "Owner Team", "is_active": True, "created_at": now, "updated_at": now,
        }))
        asyncio.run(storage.create_document("users", "u-boss", {
            "email": "boss@test.com", "name": "Boss", "provider": "password",
            "password_hash": "h", "is_active": True, "created_at": now, "updated_at": now,
        }))
        asyncio.run(storage.create_document("team_members", "mem-u-boss", {
            "user_id": "u-boss", "team_id": "team-owner", "role": "admin",
            "joined_at": now,
        }))
        svc = self._patched_service(monkeypatch)
        issues = [dict(i) for i in _ISSUES]
        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-owner", "u-boss",
        ))
        assert all(i.get("task_id") for i in issues)

        results = asyncio.run(svc._solve_issues(
            "https://github.com/acme/app", "main", "/tmp/repo",
            issues, "fake-token", 5, "balanced",
        ))
        assert all(r["success"] for r in results)

        from app.services import task_service
        task = asyncio.run(task_service.get_task(issues[0]["task_id"]))
        assert task["state"] == "submitted"
        assert task["assigned_to"] == "u-boss"  # creator became the assignee
        assert task["pr_url"] == "https://github.com/acme/app/pull/7"

    def test_already_submitted_task_not_clobbered(self, monkeypatch, storage):
        """Validation retries open a second PR — the first submission stands."""
        svc = self._patched_service(monkeypatch)
        issues = [dict(i) for i in _ISSUES]
        asyncio.run(svc.create_tasks(
            issues, "https://github.com/acme/app", "main", "team-pipe", "u-creator",
        ))
        assert all(i.get("task_id") for i in issues)

        asyncio.run(svc._solve_issues(
            "https://github.com/acme/app", "main", "/tmp/repo",
            issues, "fake-token", 5, "balanced",
        ))

        from app.services import task_service
        task = asyncio.run(task_service.get_task(issues[0]["task_id"]))
        assert task["state"] == "submitted"
        # Retry (simulated second PR, different URL) must not move it again.
        asyncio.run(svc._advance_task_on_pr(issues[0], "https://github.com/acme/app/pull/99"))
        task2 = asyncio.run(task_service.get_task(issues[0]["task_id"]))
        assert task2["state"] == "submitted"
        assert task2["pr_url"] == "https://github.com/acme/app/pull/7"

    def test_no_task_id_is_noop(self, monkeypatch, storage):
        svc = AutopilotService(llm=object())
        svc.github = _FakeGitHub()
        issues = [dict(i) for i in _ISSUES]  # no task_id stamped
        result = asyncio.run(svc._advance_task_on_pr(issues[0], "https://github.com/acme/app/pull/7"))
        assert result is None
