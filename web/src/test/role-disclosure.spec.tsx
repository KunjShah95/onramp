/*
 * Role pages × progressive disclosure.
 *
 * The kit has its own unit tests (progressive.spec.tsx). This file pins the
 * *page-level contract*: each role console opens on one ranked next move,
 * narrows the field with counted filters before it lists anything, caps long
 * lists, and keeps genuinely-secondary panels unmounted until asked.
 *
 * These assert derivation logic (which action wins, which bucket a person
 * lands in, how many are withheld) — the parts a screenshot cannot check.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderSettled, screen, userEvent, within } from './test-utils'

vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  const dev = (
    id: string, name: string, stage: string, pct: number, atRisk: boolean,
  ) => ({
    user_id: id, name, stage, completion_pct: pct,
    assigned: 10, completed: Math.round(pct / 10), ramp_days: 12,
    current_streak: 3, longest_streak: 9, at_risk: atRisk,
  })

  const defaults: Record<string, unknown> = {
    authMe: {
      uid: 'u1', email: 'dev@onramp.app', name: 'Test',
      provider: 'password', position: 'Senior', avatar_url: null, github_username: null,
    },
    fetchGamificationSummary: {
      user_id: 'u1', total_xp: 0, level: 1, xp_progress: 0, xp_needed: 100, xp_breakdown: {},
      badges: [], badges_count: 0,
      streak: { current_streak: 0, longest_streak: 0, last_active: null, streak_frozen: false },
    },
    // ── HR: a cohort with two at-risk people across two stages ──
    // `role` here is what AuthContext resolves the session role from, so it
    // gates every role-guarded surface in these tests.
    listTeams: { teams: [{ team_id: 't1', name: 'Team One', role: 'admin' }] },
    fetchHrDevelopers: {
      team_id: 't1',
      developers: [
        dev('d1', 'Ada Lovelace', 'onboarding', 20, true),
        dev('d2', 'Grace Hopper', 'ramping', 45, true),
        dev('d3', 'Alan Turing', 'contributing', 70, false),
        dev('d4', 'Katherine Johnson', 'independent', 100, false),
        dev('d5', 'Radia Perlman', 'ramping', 55, false),
        dev('d6', 'Barbara Liskov', 'onboarding', 30, false),
        dev('d7', 'Margaret Hamilton', 'contributing', 65, false),
        dev('d8', 'Jean Bartik', 'ramping', 50, false),
        dev('d9', 'Frances Allen', 'independent', 95, false),
        dev('d10', 'Jean Sammet', 'onboarding', 15, false),
      ],
    },
    fetchHrHeatmap: { members: {}, from: '2026-01-01', to: '2026-03-24' },
    // ── Dev space: a queue with something waiting on a human ──
    // One payload serves DevSpace (activity) and OnboardingHub (checklist),
    // so the keys are merged rather than duplicated — a duplicate key would
    // silently blank one of the two pages.
    fetchSeedRoleData: {
      data: {
        stats: { repos_analyzed: 3, active_teams: 1, total_users: 8, api_calls_24h: 42 },
        recent_activity: [
          { title: 'Fix auth race', module: 'core', updated_at: '2026-03-20', state: 'completed' },
          { title: 'Add rate limiter', module: 'gateway', updated_at: '2026-03-21', state: 'in_progress' },
          { title: 'Refactor router', module: 'llm', updated_at: '2026-03-22', state: 'submitted' },
        ],
        checklist: [
          { label: 'Explore the repository', done: false },
          { label: 'Complete a learning path', done: false },
          { label: 'Ask a question', done: true },
        ],
        learning_modules: [
          { name: 'Python basics', progress: 100 },
          { name: 'Async patterns', progress: 40 },
          { name: 'Testing', progress: 0 },
        ],
        completed_tasks: 2,
        total_tasks: 5,
      },
    },
    // ── Ramp: one stuck, one at risk, one ramped ──
    fetchRampSummary: {
      benchmark_days: 10, first_pr_benchmark_days: 14,
      ramped_count: 1, trainee_count: 3,
      totals: { senior_hours: 12.5, senior_cost_usd: 1125 },
      cost_model: { settings: { senior_hourly_rate_usd: 90 } },
      stuck: {
        stuck: [{
          user_id: 'd1', name: 'Ada Lovelace', severity: 'high', senior_cost_usd: 400,
          signals: [{ label: 'No PR in 9 days', detail: 'stalled on first task' }],
        }],
      },
      profiles: [
        { user_id: 'd1', name: 'Ada Lovelace', role: 'junior_dev', ramp_days: null, days_to_first_pr: null, first_pr_source: null, tasks_completed: 1, tasks_total: 10, completion_pct: 10, review_cycles: 0, questions_asked: 2, senior_cost_usd: 400, senior_hours: 4.4, vs_benchmark_days: null, stuck_severity: 'high' },
        { user_id: 'd2', name: 'Grace Hopper', role: 'junior_dev', ramp_days: null, days_to_first_pr: null, first_pr_source: null, tasks_completed: 4, tasks_total: 10, completion_pct: 40, review_cycles: 2, questions_asked: 8, senior_cost_usd: 300, senior_hours: 3.3, vs_benchmark_days: null, stuck_severity: 'medium' },
        { user_id: 'd3', name: 'Alan Turing', role: 'developer', ramp_days: 8, days_to_first_pr: 12, first_pr_source: 'github', tasks_completed: 10, tasks_total: 10, completion_pct: 100, review_cycles: 0, questions_asked: 1, senior_cost_usd: 0, senior_hours: 0, vs_benchmark_days: -2, stuck_severity: 'low' },
      ],
    },
    fetchRampHealth: { grade: 'at_risk', health_score: 62, trainee_count: 3, stuck_count: 1, at_risk_count: 1, components: {} },
    // ── Admin: two providers set, the rest unset ──
    adminListProviderKeys: {
      providers: [{ provider: 'openai', configured: true, key_id: 'k1', is_primary: false, env_var: null, updated_at: '2026-03-20T00:00:00Z', updated_by: null }],
    },
    adminGetUsage: {
      period: '14d', total_requests: 10, total_credits: 1, team_breakdown: {}, endpoint_breakdown: {},
      tracked_requests: 0, free_requests: 0, paid_requests: 0, free_pct: 0,
      total_cost_usd: 0, total_cost_avoided_usd: 0, provider_series: [],
    },
    adminGetTeamUsage: { teams: [] },
    adminListAuditEvents: { events: [] },
    // ── Trainee: a task that is ready for a PR ──
    fetchTraineeDashboard: {
      user_name: 'Test',
      progress: { completion_rate: 40, modules_unlocked: ['Python'], in_progress: 1, pending_review: 0 },
      modules: [{ module: 'Python', granted_at: '2026-03-01T00:00:00Z', source: 'path' }],
      recent_tasks: [
        { task_id: 'k1', title: 'Add pagination', module: 'core', state: 'in_progress', updated_at: '2026-03-22T00:00:00Z', repo_url: 'https://github.com/o/r', pr_url: '' },
        { task_id: 'k2', title: 'Fix typos', module: 'docs', state: 'completed', updated_at: '2026-03-21T00:00:00Z', repo_url: '', pr_url: '' },
      ],
    },
    // ── Senior: two reviews and one member under 60% ──
    fetchCTODashboard: {
      completion_rate: 55, total_members: 3, in_progress_tasks: 2,
      member_progress: [
        { user_id: 'u1', name: 'Ada Lovelace', role: 'junior_dev', completion_rate: 30 },
        { user_id: 'u2', name: 'Alan Turing', role: 'developer', completion_rate: 100 },
      ],
      pending_reviews: [
        { task_id: 'r1', title: 'PR one', module: 'core', state: 'submitted', assigned_to: 'u1', created_at: '2026-03-20' },
        { task_id: 'r2', title: 'PR two', module: 'api', state: 'under_review', assigned_to: 'u2', created_at: '2026-03-21' },
      ],
    },
    getTeamMembers: [], fetchReposByTeam: { repos: [] },
    listTasks: { tasks: [] }, createTask: {}, approveTask: {}, mergePR: {},
  }
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => {
      if (typeof value === 'function') return [key, vi.fn().mockResolvedValue(defaults[key] ?? {})]
      return [key, value]
    }),
  )
})

import DevSpacePage from '../pages/DevSpacePage'
import HrPeoplePage from '../pages/HrPeoplePage'
import RampPage from '../pages/RampPage'
import AdminDashboardPage from '../pages/AdminDashboardPage'
import TraineeDashboard from '../pages/TraineeDashboard'
import OnboardingHubPage from '../pages/OnboardingHubPage'
import SeniorSpacePage from '../pages/SeniorSpacePage'

/**
 * The rail's headline — the one ranked verdict the page opens on. Waits for
 * the async query behind it, because react-query resolves after the first
 * settled act().
 */
async function railHeadline(): Promise<string> {
  const region = await screen.findByRole('region', {
    name: /start here|your next move|needs attention|intervention|needs a decision|your next step|next step|platform setup/i,
  })
  return region.textContent ?? ''
}

describe('DevSpace — a developer console with one ranked move', () => {
  it('routes the developer at the PR that is waiting, not the finished work', async () => {
    await renderSettled(<DevSpacePage />)
    expect(await railHeadline()).toMatch(/1 pull request waiting on review/)
    // The submitted PR is ranked first in the activity list.
    const firstRow = screen.getAllByText(/Refactor router|Add rate limiter|Fix auth race/)[0]
    expect(firstRow).toHaveTextContent('Refactor router')
  })

  it('filters the tool shelf by counted category before listing', async () => {
    const user = userEvent.setup()
    await renderSettled(<DevSpacePage />)
    const rail = screen.getByRole('group', { name: 'Filter' })
    const admin = within(rail).getByRole('button', { name: /Admin/ })
    expect(admin).toHaveAttribute('aria-pressed', 'false')
    // Default view is unfiltered — all eight tools are on the shelf.
    expect(screen.getByText('8 of 8')).toBeInTheDocument()

    await user.click(admin)
    expect(admin).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 of 8')).toBeInTheDocument()
    // The admin link is the only one left standing in that bucket.
    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    expect(screen.queryByText('Explore Architecture')).not.toBeInTheDocument()
  })
})

describe('HR People — triage before browsing', () => {
  it('opens on the at-risk list and counts every stage from the whole team', async () => {
    await renderSettled(<HrPeoplePage />)
    expect(await railHeadline()).toMatch(/2 developers flagged at risk/)

    const rail = screen.getByRole('group', { name: 'Stage' })
    // Counts come from the full roster, not the filtered view, so a chip
    // never reports a misleading number.
    expect(within(rail).getByRole('button', { name: /All/ })).toHaveTextContent('10')
    expect(within(rail).getByRole('button', { name: /Onboarding/ })).toHaveTextContent('3')
    expect(within(rail).getByRole('button', { name: /Ramping/ })).toHaveTextContent('3')
    expect(within(rail).getByRole('button', { name: /Contributing/ })).toHaveTextContent('2')
    expect(within(rail).getByRole('button', { name: /Independent/ })).toHaveTextContent('2')
  })

  it('caps the roster and labels what it withheld', async () => {
    await renderSettled(<HrPeoplePage />)
    expect(screen.getByText(/Show 2 more · 10 developers total/)).toBeInTheDocument()
  })

  it('seals the 12-week heatmap until a person is selected', async () => {
    const user = userEvent.setup()
    await renderSettled(<HrPeoplePage />)
    expect(screen.queryByText('Activity Heatmap')).not.toBeInTheDocument()

    // Scoped to the roster list — the at-risk rail intentionally repeats the
    // same names as shortcuts, which is the point of a rail.
    const roster = screen.getByRole('list', { name: 'Developers' })
    await user.click(within(roster).getByRole('button', { name: /Ada Lovelace/ }))
    // No heatmap data for this person, so the sealed trigger must NOT appear
    // rather than opening onto an empty chart.
    expect(screen.queryByRole('button', { name: /Activity heatmap/ })).not.toBeInTheDocument()
  })

  it('narrows the roster to a stage when a chip is pressed', async () => {
    const user = userEvent.setup()
    await renderSettled(<HrPeoplePage />)
    const rail = screen.getByRole('group', { name: 'Stage' })
    await user.click(within(rail).getByRole('button', { name: /Ramping/ }))
    expect(within(rail).getByRole('button', { name: /Ramping/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('3 of 10')).toBeInTheDocument()

    const roster = within(screen.getByRole('list', { name: 'Developers' }))
    expect(roster.getByText('Grace Hopper')).toBeInTheDocument()
    expect(roster.getByText('Radia Perlman')).toBeInTheDocument()
    expect(roster.getByText('Jean Bartik')).toBeInTheDocument()
    // Contributing / onboarding people are genuinely gone from the roster.
    expect(roster.queryByText('Alan Turing')).not.toBeInTheDocument()
    expect(roster.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })
})

describe('Ramp — the people come before the benchmarks', () => {
  it('leads with the interception and prices it', async () => {
    await renderSettled(<RampPage />)
    expect(await railHeadline()).toMatch(/1 developer stuck/)
    expect(await railHeadline()).toMatch(/\$400/)
  })

  it('exposes the stuck case as a named action, not a buried row', async () => {
    await renderSettled(<RampPage />)
    expect(screen.getByRole('button', { name: /Ada Lovelace/ })).toBeInTheDocument()
  })

  it('keeps the three benchmark panels unmounted until asked', async () => {
    const user = userEvent.setup()
    await renderSettled(<RampPage />)
    const trigger = screen.getByRole('button', { name: /Cost model & competitive benchmarks/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Agent Benchmark')).not.toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('bands the roster and derives each band from the profile', async () => {
    const user = userEvent.setup()
    await renderSettled(<RampPage />)
    const rail = screen.getByRole('group', { name: 'Show' })
    expect(within(rail).getByRole('button', { name: /Stuck/ })).toHaveTextContent('1')
    expect(within(rail).getByRole('button', { name: /At risk/ })).toHaveTextContent('1')
    expect(within(rail).getByRole('button', { name: /Ramped/ })).toHaveTextContent('1')
    expect(screen.getByText('3 of 3')).toBeInTheDocument()

    await user.click(within(rail).getByRole('button', { name: /Ramped/ }))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    // Scoped to the table — the same name legitimately appears in the
    // intervention rail above, which is the whole point of a rail.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Alan Turing')).toBeInTheDocument()
    expect(table.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })
})

describe('Admin — setup state before a wall of editors', () => {
  it('counts what is unconfigured and offers to filter to exactly that', async () => {
    await renderSettled(<AdminDashboardPage />)
    expect(await railHeadline()).toMatch(/provider/)
    // PROVIDER_OPTIONS is the source of truth for the total.
    expect(await railHeadline()).toMatch(/not configured/)
  })

  it('filters the key shelf to Configured / Not set with live counts', async () => {
    const user = userEvent.setup()
    await renderSettled(<AdminDashboardPage />)
    const rail = screen.getByRole('group', { name: 'Show' })
    const configured = within(rail).getByRole('button', { name: /Configured/ })
    expect(configured).toHaveTextContent('1')

    await user.click(within(rail).getByRole('button', { name: /Not set/ }))
    expect(within(rail).getByRole('button', { name: /Not set/ })).toHaveAttribute('aria-pressed', 'true')
    // The one configured provider drops out of the shelf entirely.
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument()
  })

  it('mounts a key editor only for the provider being edited', async () => {
    const user = userEvent.setup()
    await renderSettled(<AdminDashboardPage />)
    expect(screen.queryByLabelText(/API key$/i)).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Add key/ })[0])
    expect(screen.getAllByLabelText(/API key$/i).length).toBeGreaterThan(0)
  })
})

describe('Trainee — one next step, then the flight plan', () => {
  it('routes the trainee at the PR they can raise right now', async () => {
    await renderSettled(<TraineeDashboard />)
    expect(await railHeadline()).toMatch(/Raise a PR on Add pagination/)
    expect(screen.getByRole('button', { name: /Raise the pull request/ })).toBeInTheDocument()
  })

  it('caps the module and task lists', async () => {
    await renderSettled(<TraineeDashboard />)
    // One module, one repo task, two recent tasks — nothing exceeds the cap
    // here, so the reveal control must not appear at all.
    expect(screen.queryByText(/more ·/)).not.toBeInTheDocument()
  })
})

describe('Onboarding hub — remaining work leads', () => {
  it('counts open steps and points at the first one', async () => {
    await renderSettled(<OnboardingHubPage />)
    expect(await railHeadline()).toMatch(/2 steps left/)
    expect(await railHeadline()).toMatch(/Start with: Explore the repository/)
  })

  it('leads with the open steps and seals the completed ones', async () => {
    await renderSettled(<OnboardingHubPage />)
    // The struck-through completed item is not in the open list.
    expect(screen.getAllByText('Ask a question')).toHaveLength(1)
    expect(screen.getByText('Explore the repository')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Completed/ })).toBeInTheDocument()
  })
})

describe('Senior space — reviews first, and no duplicated roster', () => {
  it('leads with the review queue', async () => {
    await renderSettled(<SeniorSpacePage />)
    expect(await railHeadline()).toMatch(/2 reviews waiting on you/)
  })

  it('renders the member roster once, banded, not twice', async () => {
    const user = userEvent.setup()
    await renderSettled(<SeniorSpacePage />)
    // "Code Health" and "Team Progress" used to render member_progress twice.
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(1)
    expect(screen.getAllByText('Alan Turing')).toHaveLength(1)

    const rail = screen.getByRole('group', { name: 'Band' })
    expect(within(rail).getByRole('button', { name: /Needs help/ })).toHaveTextContent('1')
    await user.click(within(rail).getByRole('button', { name: /Needs help/ }))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument()
  })

  it('seals the assign-repository form instead of parking it above the fold', async () => {
    const user = userEvent.setup()
    await renderSettled(<SeniorSpacePage />)
    expect(screen.queryByLabelText('Developer')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Pick a developer and a repo/ }))
    // The controls are labelled, so the form is navigable by name.
    expect(screen.getByLabelText('Developer')).toBeInTheDocument()
    expect(screen.getByLabelText('Repository')).toBeInTheDocument()
    expect(screen.getByLabelText('Task title')).toBeInTheDocument()
  })
})
