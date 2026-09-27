import { describe, it, expect, vi } from 'vitest'
import { renderSettled } from './test-utils'

vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  const defaults: Record<string, unknown> = {
    // The blanket mock below resolves every function to `defaults[key] ?? {}`.
    // authMe had no entry, so it resolved `{}` — truthy — and AuthContext built a
    // phantom logged-in user via mapUser({}) with empty id/email/name for all 32
    // page smoke tests. Give it a real session so pages render as a real user.
    authMe: {
      uid: 'u1',
      email: 'dev@onramp.app',
      name: 'Test',
      provider: 'password',
      position: 'Developer',
      avatar_url: null,
      github_username: null,
    },
    fetchRepos: { repos: [] },
    fetchTraineeDashboard: {
      user: { id: 'u1', name: 'Test', role: 'member' },
      milestones: [], modules: [], recent_tasks: [],
      stats: { tasks_completed: 0, tasks_in_progress: 0, streak_days: 0, modules_unlocked: 0 },
    },
    fetchCTODashboard: { teams: [], stats: {} },
    fetchTeamAnalytics: { teams: [] },
    fetchRoadmap: { roadmap: [] },
    fetchRepoAnalysis: { analysis: {} },
    fetchRepoSections: { sections: [] },
    fetchHealthScore: { health_score: 85, categories: [] },
    findSimilarPatterns: { patterns: [] },
    fetchPairWalkthrough: { steps: [] },
    fetchTestChecklist: { categories: [] },
    generateReport: { report: { summary: '' }, format: 'markdown' },
    generateHtmlReport: { html: '', report: { summary: '' } },
    createTeam: { team_id: 't1' },
    listTeams: { teams: [] },
    getTeam: { team_id: 't1', name: 'Team' },
    getTeamMembers: [],
    createPlaybook: { playbook: { id: 'p1' } },
    listPlaybooks: { playbooks: [] },
    getPlaybook: { id: 'p1', name: 'Playbook', steps: [] },
    listPricing: { tiers: [] },
    createCheckoutSession: { url: 'https://rzp.io/test', subscription_id: 'sub_test' },
    listProviderKeys: { org_name: 'default', providers: [], count: 0 },
    setProviderKey: { provider: 'openai', configured: true, key_id: 'k1', is_primary: false, env_var: null, updated_at: null, updated_by: null },
    deleteProviderKey: {},
    validateApiKey: { valid: true },
    getUsage: { usage: [] },
    getUsageSummary: { total: 0, by_endpoint: [] },
    getQuota: { quota: {} },
    listTiers: { tiers: [] },
    adminListApiKeys: { keys: [] },
    // Full AdminUsageResponse. The old partial `{ total, by_team }` left
    // `tracked_requests` undefined, so AdminDashboardPage's
    // `tracked_requests === 0` guard fell through to the populated branch and
    // fmtUsd(undefined) threw once the async fetch settled.
    adminGetUsage: {
      period: '14d',
      total_requests: 0,
      total_credits: 0,
      team_breakdown: {},
      endpoint_breakdown: {},
      tracked_requests: 0,
      free_requests: 0,
      paid_requests: 0,
      free_pct: 0,
      total_cost_usd: 0,
      total_cost_avoided_usd: 0,
      provider_series: [],
    },
    adminGetTeamUsage: { teams: [] },
    // GamificationPanel destructures `streak` and reads streak.current_streak
    // unconditionally; the bare `{}` default left it undefined.
    fetchGamificationSummary: {
      user_id: 'u1',
      total_xp: 0,
      level: 1,
      xp_progress: 0,
      xp_needed: 100,
      xp_breakdown: {},
      badges: [],
      badges_count: 0,
      streak: { current_streak: 0, longest_streak: 0, last_active: null, streak_frozen: false },
    },
    describePR: { description: '# PR Description\n\nTest' },
    adminListAuditEvents: { events: [] },
    adminListWebhooks: { webhooks: [] },
    adminTestWebhook: { success: true },
    adminDeleteWebhook: { deleted: true },
    adminGetWebhookDeliveries: { deliveries: [] },
    getAskHistory: { turns: [] },
    getTeamModulePermissions: { modules: [] },
    getUserModulePermissions: { modules: [] },
    grantModuleAccess: {},
    checkModuleAccess: { granted: false },
    createTask: { task: { id: 't1', title: 'Task' } },
    listTasks: { tasks: [] },
    getTask: { id: 't1', title: 'Task', state: 'open' },
    startTask: { id: 't1', state: 'in_progress' },
    getTeamProgress: { team_id: 't1', members: [] },
    getUserProgress: { user_id: 'u1', tasks: [] },
    listNotifications: { notifications: [] },
    getUnreadCount: { unread_count: 0 },
    markNotificationsRead: { marked_count: 0 },
    markAllNotificationsRead: { marked_count: 0 },
    deleteNotification: { deleted: true },
    clearReadNotifications: { deleted_count: 0 },
    getNotificationPreferences: {},
    updateNotificationPreferences: {},
    getNotificationDefaults: {},
    listWebhooks: { webhooks: [] },
    createWebhook: {},
    testWebhook: { success: true },
    deleteWebhook: { deleted: true },
    analyzeArchitecture: { analysis: {} },
    generateLearningPath: { path: { id: 'lp1', milestones: [] }, milestones: [] },
    listLearningPaths: { paths: [] },
    getLearningPath: { id: 'lp1', title: 'Path', milestones: [] },
    findIssues: { issues: [] },
    generateGuide: { guide: { title: 'Guide', steps: [] } },
    indexRepo: { status: 'indexed' },
    askQuestion: { answer: 'Test answer', sources: [] },
  }
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => {
      if (typeof value === 'function') {
        return [key, vi.fn().mockResolvedValue(defaults[key] ?? {})]
      }
      return [key, value]
    })
  )
})

const { mockUseParams } = vi.hoisted(() => ({ mockUseParams: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useParams: mockUseParams }
})

import Login from '../pages/Login'
import Register from '../pages/Register'
import ForgotPassword from '../pages/ForgotPassword'
import JoinPage from '../pages/JoinPage'
import ChangelogPage from '../pages/ChangelogPage'
import DocsPage from '../pages/DocsPage'
import PrivacyPage from '../pages/PrivacyPage'
import TermsPage from '../pages/TermsPage'
import ExplorePage from '../pages/ExplorePage'
import DashboardPage from '../pages/DashboardPage'
import TeamPage from '../pages/TeamPage'
import TasksPage from '../pages/TasksPage'
import Settings from '../pages/Settings'
import Profile from '../pages/Profile'
import BillingPage from '../pages/BillingPage'
import FirstIssuePage from '../pages/FirstIssuePage'
import LearnPage from '../pages/LearnPage'
import AskPage from '../pages/AskPage'
import NotificationsPage from '../pages/NotificationsPage'
import PlaybooksPage from '../pages/PlaybooksPage'
import OnboardingReportPage from '../pages/OnboardingReportPage'
import TraineeDashboard from '../pages/TraineeDashboard'
import CodeHealthPage from '../pages/CodeHealthPage'
import PRDescriptionPage from '../pages/PRDescriptionPage'
import ReviewQueuePage from '../pages/ReviewQueuePage'
import AdminDashboardPage from '../pages/AdminDashboardPage'
import MemberDetailPage from '../pages/MemberDetailPage'
import ModuleHealthPage from '../pages/ModuleHealthPage'
import DevSpacePage from '../pages/DevSpacePage'
import SeniorSpacePage from '../pages/SeniorSpacePage'
import ExecutivePage from '../pages/ExecutivePage'
import NotFoundPage from '../pages/NotFoundPage'

describe('Auth pages', () => {
  it('renders Login', async () => { await expect(renderSettled(<Login />)).resolves.toBeDefined() })
  it('renders Register', async () => { await expect(renderSettled(<Register />)).resolves.toBeDefined() })
  it('renders ForgotPassword', async () => { await expect(renderSettled(<ForgotPassword />)).resolves.toBeDefined() })
  it('renders JoinPage', async () => { await expect(renderSettled(<JoinPage />)).resolves.toBeDefined() })
})

describe('Landing/marketing pages', () => {
  it('renders ChangelogPage', async () => { await expect(renderSettled(<ChangelogPage />)).resolves.toBeDefined() })
  it('renders DocsPage', async () => { await expect(renderSettled(<DocsPage />)).resolves.toBeDefined() })
  it('renders PrivacyPage', async () => { await expect(renderSettled(<PrivacyPage />)).resolves.toBeDefined() })
  it('renders TermsPage', async () => { await expect(renderSettled(<TermsPage />)).resolves.toBeDefined() })
})

describe('Core workspace pages', () => {
  it('renders ExplorePage', async () => { await expect(renderSettled(<ExplorePage />)).resolves.toBeDefined() })
  it('renders DashboardPage', async () => { await expect(renderSettled(<DashboardPage />)).resolves.toBeDefined() })
  it('renders TeamPage', async () => { await expect(renderSettled(<TeamPage />)).resolves.toBeDefined() })
  it('renders TasksPage', async () => { await expect(renderSettled(<TasksPage />)).resolves.toBeDefined() })
  it('renders Settings', async () => { await expect(renderSettled(<Settings />)).resolves.toBeDefined() })
  it('renders Profile', async () => { await expect(renderSettled(<Profile />)).resolves.toBeDefined() })
  it('renders BillingPage', async () => { await expect(renderSettled(<BillingPage />)).resolves.toBeDefined() })
})

describe('Feature pages (recently wired)', () => {
  it('renders FirstIssuePage', async () => { await expect(renderSettled(<FirstIssuePage />)).resolves.toBeDefined() })
  it('renders LearnPage', async () => { await expect(renderSettled(<LearnPage />)).resolves.toBeDefined() })
  it('renders AskPage', async () => { await expect(renderSettled(<AskPage />)).resolves.toBeDefined() })
  it('renders NotificationsPage', async () => { await expect(renderSettled(<NotificationsPage />)).resolves.toBeDefined() })
  it('renders PlaybooksPage', async () => { await expect(renderSettled(<PlaybooksPage />)).resolves.toBeDefined() })
  it('renders OnboardingReportPage', async () => { await expect(renderSettled(<OnboardingReportPage />)).resolves.toBeDefined() })
  it('renders TraineeDashboard', async () => { await expect(renderSettled(<TraineeDashboard />)).resolves.toBeDefined() })
  it('renders CodeHealthPage', async () => { await expect(renderSettled(<CodeHealthPage />)).resolves.toBeDefined() })
  it('renders PRDescriptionPage', async () => { await expect(renderSettled(<PRDescriptionPage />)).resolves.toBeDefined() })
  it('renders ReviewQueuePage', async () => { await expect(renderSettled(<ReviewQueuePage />)).resolves.toBeDefined() })
  it('renders AdminDashboardPage', async () => { await expect(renderSettled(<AdminDashboardPage />)).resolves.toBeDefined() })
  it('renders MemberDetailPage with route param', async () => {
    mockUseParams.mockReturnValue({ userId: 'user123' })
    await expect(renderSettled(<MemberDetailPage />)).resolves.toBeDefined()
  })
  it('renders ModuleHealthPage with route param', async () => {
    mockUseParams.mockReturnValue({ moduleName: 'react-basics' })
    await expect(renderSettled(<ModuleHealthPage />)).resolves.toBeDefined()
  })
  it('renders DevSpacePage', async () => { await expect(renderSettled(<DevSpacePage />)).resolves.toBeDefined() })
  it('renders SeniorSpacePage', async () => { await expect(renderSettled(<SeniorSpacePage />)).resolves.toBeDefined() })
  it('renders ExecutivePage', async () => { await expect(renderSettled(<ExecutivePage />)).resolves.toBeDefined() })
  it('renders NotFoundPage', async () => { await expect(renderSettled(<NotFoundPage />)).resolves.toBeDefined() })
})
