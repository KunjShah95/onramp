## High impact — builds on existing infra

1. **Automated first-task assignment**
   New dev joins team → AI picks 3 starter tasks from repo issues. Quiz score + module level determines difficulty. Connects existing quiz, gamification, GitHub issues API. *(Partially covered by Autopilot load-aware assignment; extend to quiz-gated.)*

2. **Onboarding progress timeline**
   Visual for HR/seniors: each dev as a lane, task states as milestones. `hr_dashboard` router exists; cohort retention + headcount flows built — add the lane view.

3. **Stale task alerts**
   Cron: task sits in `needs_changes` > 48h → notify dev + senior. Same for `submitted` > 24h with no review. Celery `check_stuck_devs` every 6h already covers stuck; widen to these thresholds.

4. **PR comment sync**
   Pull GitHub PR inline comments into `review_feedback` on submit. Senior sees real diff comments, not just AI summary. GitHub API already used; wire `github_service`.

5. **Cohort analytics**
   Compare onboarding speed across hiring cohorts — avg days to first merged PR, review cycles, top blockers. Data in `tasks` + `hr_metrics_service.cohort_retention` / `headcount_flow` — surface the avg + blocker table.

---

## Medium impact — new surface

1. **Peer review**
   Dev can review another dev's PR (not just senior). Builds review skills, reduces senior bottleneck. Add `peer_review` role transition to the state machine.

2. **Prerequisite quiz gates**
   Before task unlocks, must pass a quiz on that module. Quiz routes + `depends_on` DAG already exist — gate `task_service.transition_task` on quiz result.

3. **AI-generated onboarding plan**
   Senior picks repo + role → AI explores codebase, generates ordered milestones. Connects explore agent + `onboarding_plans` (30-60-90 day plans already exist; promote to one-click AI generation).

4. **Mentor matching**
   Match new dev to senior by shared tech stack (from repo languages). Simple scoring, not ML.

5. **Environment setup wizard**
   Step-by-step checklist: clone repo, install deps, run tests, hit a verified API call. Reduces day-1 friction.

---

## Quick wins (days not weeks)

1. **Time tracking** — actual vs estimated hours per task. One field, one chart. *(Built: `estimated_hours` + `actual_hours` on tasks; surface overrun alerts.)*
2. **Task templates** — senior creates reusable task blueprints per module. *(Built: `task_template_service` + `TaskTemplate` table.)*
3. **Bulk task assignment** — assign full onboarding plan (10 tasks) to new dev in one click.
4. **Daily digest email** — senior gets morning email: who submitted, who's blocked, who completed. `digest` router + Celery beat exist; schedule + SendGrid domain auth remain.
5. **GitHub issue → task** — one-click import: pick a GitHub issue, auto-fill task title/description/repo. *(Partially via `--github-issues` in Autopilot.)*
