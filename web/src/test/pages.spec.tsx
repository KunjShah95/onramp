import { describe, it, expect, vi } from 'vitest'
import { render } from './test-utils'

vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  const defaults: Record<string, unknown> = {
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
    createCheckoutSession: { url: 'https://checkout.stripe.com/test' },
    createApiKey: { key: { id: 'k1', label: 'Key' }, raw_key: 'sk-test' },
    listApiKeys: { keys: [] },
    validateApiKey: { valid: true },
    getUsage: { usage: [] },
    getUsageSummary: { total: 0, by_endpoint: [] },
    getQuota: { quota: {} },
    listTiers: { tiers: [] },
    adminListApiKeys: { keys: [] },
    adminGetUsage: { total: 0, by_team: [] },
    adminGetTeamUsage: { teams: [] },
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
import WaitlistPage from '../pages/WaitlistPage'
import PricingPage from '../pages/PricingPage'
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
import ApiKeysPage from '../pages/ApiKeysPage'
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
  it('renders Login', () => expect(() => render(<Login />)).not.toThrow())
  it('renders Register', () => expect(() => render(<Register />)).not.toThrow())
  it('renders ForgotPassword', () => expect(() => render(<ForgotPassword />)).not.toThrow())
  it('renders JoinPage', () => expect(() => render(<JoinPage />)).not.toThrow())
  it('renders WaitlistPage', () => expect(() => render(<WaitlistPage />)).not.toThrow())
})

describe('Landing/marketing pages', () => {
  it('renders PricingPage', () => expect(() => render(<PricingPage />)).not.toThrow())
  it('renders ChangelogPage', () => expect(() => render(<ChangelogPage />)).not.toThrow())
  it('renders DocsPage', () => expect(() => render(<DocsPage />)).not.toThrow())
  it('renders PrivacyPage', () => expect(() => render(<PrivacyPage />)).not.toThrow())
  it('renders TermsPage', () => expect(() => render(<TermsPage />)).not.toThrow())
})

describe('Core workspace pages', () => {
  it('renders ExplorePage', () => expect(() => render(<ExplorePage />)).not.toThrow())
  it('renders DashboardPage', () => expect(() => render(<DashboardPage />)).not.toThrow())
  it('renders TeamPage', () => expect(() => render(<TeamPage />)).not.toThrow())
  it('renders TasksPage', () => expect(() => render(<TasksPage />)).not.toThrow())
  it('renders Settings', () => expect(() => render(<Settings />)).not.toThrow())
  it('renders Profile', () => expect(() => render(<Profile />)).not.toThrow())
  it('renders BillingPage', () => expect(() => render(<BillingPage />)).not.toThrow())
})

describe('Feature pages (recently wired)', () => {
  it('renders FirstIssuePage', () => expect(() => render(<FirstIssuePage />)).not.toThrow())
  it('renders LearnPage', () => expect(() => render(<LearnPage />)).not.toThrow())
  it('renders AskPage', () => expect(() => render(<AskPage />)).not.toThrow())
  it('renders NotificationsPage', () => expect(() => render(<NotificationsPage />)).not.toThrow())
  it('renders ApiKeysPage', () => expect(() => render(<ApiKeysPage />)).not.toThrow())
  it('renders PlaybooksPage', () => expect(() => render(<PlaybooksPage />)).not.toThrow())
  it('renders OnboardingReportPage', () => expect(() => render(<OnboardingReportPage />)).not.toThrow())
  it('renders TraineeDashboard', () => expect(() => render(<TraineeDashboard />)).not.toThrow())
  it('renders CodeHealthPage', () => expect(() => render(<CodeHealthPage />)).not.toThrow())
  it('renders PRDescriptionPage', () => expect(() => render(<PRDescriptionPage />)).not.toThrow())
  it('renders ReviewQueuePage', () => expect(() => render(<ReviewQueuePage />)).not.toThrow())
  it('renders AdminDashboardPage', () => expect(() => render(<AdminDashboardPage />)).not.toThrow())
  it('renders MemberDetailPage with route param', () => {
    mockUseParams.mockReturnValue({ userId: 'user123' })
    expect(() => render(<MemberDetailPage />)).not.toThrow()
  })
  it('renders ModuleHealthPage with route param', () => {
    mockUseParams.mockReturnValue({ moduleName: 'react-basics' })
    expect(() => render(<ModuleHealthPage />)).not.toThrow()
  })
  it('renders DevSpacePage', () => expect(() => render(<DevSpacePage />)).not.toThrow())
  it('renders SeniorSpacePage', () => expect(() => render(<SeniorSpacePage />)).not.toThrow())
  it('renders ExecutivePage', () => expect(() => render(<ExecutivePage />)).not.toThrow())
  it('renders NotFoundPage', () => expect(() => render(<NotFoundPage />)).not.toThrow())
})
