import type {
  ArchitectureResult,
  LearningPathResult,
  ScoredIssue,
  IssueGuide,
  QAResult,
  IndexResult,
  HistoryTurn,
} from './types'

// Expected VITE_API_URL format: "http://localhost:8000" or "http://localhost:8000/api/v1"
// If it already includes /api/v1, the path is not appended again.
function getApiBaseUrl(): string {
  let url = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
  url = url.replace(/\/+$/, '')
  if (!url.endsWith('/api/v1')) {
    url = `${url}/api/v1`
  }
  return url
}
export const API_BASE = getApiBaseUrl()


// Token is stored/retrieved through neon-auth.ts to keep a single source of truth
import { getToken, getRefreshToken, setToken, setRefreshToken } from './neon-auth'

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Silent session refresh — exchange the stored refresh token for a fresh
 * access token pair, then retry the original request once. Fails gracefully
 * (returns null) when there is no refresh token or the exchange is rejected,
 * so the caller surfaces its normal 401 handling.
 */
async function trySilentRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const json = await res.json()
    const data = unwrap<any>(json)
    if (data?.token) {
      setToken(data.token)
      if (data.refresh_token) setRefreshToken(data.refresh_token)
      return true
    }
    return false
  } catch {
    return false
  }
}

async function request<T>(url: string, body?: unknown, method?: string, retried = false): Promise<T> {
  const res = await fetch(url, {
    method: method || 'POST',
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && !retried) {
    if (await trySilentRefresh()) {
      return request<T>(url, body, method, true)
    }
    const text = await res.text()
    let message = 'Authentication required. Please sign in again.'
    if (text) {
      try {
        const err = JSON.parse(text)
        if (err.detail) message = err.detail
      } catch {
        if (text.length < 200) message = text
      }
    }
    throw new Error(message)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return unwrap<T>(await res.json())
}

async function get<T>(url: string, retried = false): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  if (res.status === 401 && !retried) {
    if (await trySilentRefresh()) {
      return get<T>(url, true)
    }
    const text = await res.text()
    let message = 'Authentication required. Please sign in again.'
    if (text) {
      try {
        const err = JSON.parse(text)
        if (err.detail) message = err.detail
      } catch {
        if (text.length < 200) message = text
      }
    }
    throw new Error(message)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return unwrap<T>(await res.json())
}

/** Unwrap the backend's `{success, data}` response envelope. */
function unwrap<T>(json: any): T {
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T
  }
  return json as T
}

export async function analyzeArchitecture(
  repoUrl: string,
  branch = 'main'
): Promise<ArchitectureResult> {
  return request<ArchitectureResult>(`${API_BASE}/explore/analyze`, {
    repo_url: repoUrl,
    branch,
  })
}

export interface SavedLearningPath {
  path_id: string
  user_id: string
  repo_url: string
  user_level: string
  result: LearningPathResult
  created_at: string
}

export async function generateLearningPath(
  repoStructure: Record<string, unknown>,
  userLevel: string,
  repoUrl = ''
): Promise<LearningPathResult & { path_id?: string }> {
  return request<LearningPathResult & { path_id?: string }>(`${API_BASE}/learn/path`, {
    repo_structure: repoStructure,
    user_level: userLevel,
    repo_url: repoUrl,
  })
}

export async function listLearningPaths(): Promise<{ paths: SavedLearningPath[] }> {
  return get<{ paths: SavedLearningPath[] }>(`${API_BASE}/learn/paths`)
}

export async function getLearningPath(pathId: string): Promise<SavedLearningPath> {
  return get<SavedLearningPath>(`${API_BASE}/learn/paths/${pathId}`)
}

export async function findIssues(
  repoUrl: string,
  userLevel = 'junior'
): Promise<{ issues: ScoredIssue[] }> {
  return request<{ issues: ScoredIssue[] }>(`${API_BASE}/first-pr/issues`, {
    repo_url: repoUrl,
    user_level: userLevel,
  })
}

export async function generateGuide(
  issueId: number,
  repoStructure: Record<string, unknown>
): Promise<IssueGuide> {
  return request<IssueGuide>(`${API_BASE}/first-pr/guide`, {
    issue_id: issueId,
    repo_structure: repoStructure,
  })
}

export async function indexRepo(repoPath: string): Promise<IndexResult> {
  return request<IndexResult>(`${API_BASE}/ask/index`, {
    repo_path: repoPath,
  })
}

export async function askQuestion(
  indexId: string,
  question: string
): Promise<QAResult> {
  return request<QAResult>(`${API_BASE}/ask/query`, {
    index_id: indexId,
    question,
  })
}

/**
 * Stream an answer token-by-token over SSE. Calls onToken for each token.
 * Returns when the stream completes ([DONE]) or aborts via the signal.
 */
export async function askQuestionStream(
  indexId: string,
  question: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  mode: string = 'normal'
): Promise<void> {
  const res = await fetch(`${API_BASE}/ask/query/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ index_id: indexId, question, mode }),
    signal,
  })
  if (res.status === 401) throw new Error('Authentication required. Please sign in again.')
  if (res.status === 429) throw new Error('Quota exceeded. Upgrade your plan or try again next cycle.')
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const evt of events) {
      const line = evt.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const parsed = JSON.parse(payload)
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.token) onToken(parsed.token)
      } catch {
        // ignore malformed keep-alive lines
      }
    }
  }
}

// ── DORA Metrics ────────────────────────────────────────────────────────────

export interface DoraMetric {
  classification: string
  value: string
}

export interface DoraSummary {
  overall_score: number
  metrics: {
    deployment_frequency: DoraMetric
    lead_time_for_changes: DoraMetric
    change_failure_rate: DoraMetric
    mttr: DoraMetric
  }
}

export interface VelocityTrend {
  week: string
  completed: number
  completed_ma4?: number
}

export interface MemberThroughput {
  name: string
  completed: number
  in_progress: number
}

export async function fetchDoraSummary(teamId: string, days = 90): Promise<DoraSummary> {
  return get<DoraSummary>(`${API_BASE}/dora/summary?team_id=${teamId}&days=${days}`)
}

export async function fetchVelocityTrends(teamId: string, weeks = 12): Promise<{ trends: VelocityTrend[] }> {
  return get<{ trends: VelocityTrend[] }>(`${API_BASE}/dora/velocity?team_id=${teamId}&weeks=${weeks}`)
}

export async function fetchTeamThroughput(teamId: string, days = 30): Promise<{ members: MemberThroughput[] }> {
  return get<{ members: MemberThroughput[] }>(`${API_BASE}/dora/throughput?team_id=${teamId}&days=${days}`)
}

// ─── Dashboard endpoints ──────────────────────────────────────────────────

export interface RepoItem {
  id: string
  name: string
  owner: string
  status: 'analyzing' | 'ready' | 'error'
  last_analyzed: string
}

export interface ReposResponse {
  repos: RepoItem[]
}

export interface CTOAction {
  title: string
  subtitle: string
  severity: string
}

export interface CTOService {
  name: string
  status: string
}

export interface CTODashboardMemberProgress {
  user_id: string
  name: string
  role: string
  total: number
  completed: number
  in_progress: number
  pending_review: number
  modules_unlocked: string[]
  completion_rate: number
}

export interface CTODashboardPendingReview {
  task_id: string
  title: string
  assigned_to: string | null
  module: string
  pr_url: string | null
  state: string
  created_at: string
}

export interface CTODashboardRecentActivity {
  task_id: string
  title: string
  state: string
  assigned_to: string | null
  module: string
  updated_at: string
}

export interface CTODashboardAction {
  title: string
  subtitle: string
  severity: string
}

export interface CTODashboardResponse {
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  pending_review_tasks: number
  blocked_tasks: number
  completion_rate: number
  total_members: number
  total_trainees: number
  total_milestones: number
  unique_contributors: number
  first_prs_merged: number
  member_progress: CTODashboardMemberProgress[]
  pending_reviews: CTODashboardPendingReview[]
  recent_activity: CTODashboardRecentActivity[]
  actions: CTODashboardAction[]
}

export interface TeamMemberProgress {
  name: string
  user_id: string
  role: string
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  pending_review: number
  modules_unlocked: string[]
  completion_rate: number
}

export interface TeamAnalyticsResponse {
  members: TeamMemberProgress[]
}

export interface Milestone {
  id: string
  title: string
  phase: string
  status: 'planned' | 'active' | 'completed'
  progress: number
}

export interface RoadmapResponse {
  milestones: Milestone[]
}

export interface AnalysisData {
  graph: { nodes: number; edges: number }
  learning_paths: number
  first_issues_identified: number
  health_score: number
  owner: string
  repo: string
}

export interface SectionItem {
  title: string
  description: string
  detail: string
}

export interface RepoSectionsResponse {
  sections: SectionItem[]
  owner: string
  repo: string
}

export async function fetchRepos(): Promise<ReposResponse> {
  return get<ReposResponse>(`${API_BASE}/repos`)
}

export interface TraineeDashboardProgress {
  total: number
  completed: number
  in_progress: number
  pending_review: number
  modules_unlocked: string[]
  completion_rate: number
}

export interface TraineeModule {
  module: string
  granted_at: string
  source: string
}

export interface TraineeTask {
  task_id: string
  title: string
  state: string
  module: string
  priority: string
  updated_at: string
}

export interface TraineeDashboardResponse {
  user_id: string
  user_name: string
  team_id: string
  progress: TraineeDashboardProgress
  modules: TraineeModule[]
  recent_tasks: TraineeTask[]
}

export async function fetchTraineeDashboard(
  team_id?: string
): Promise<TraineeDashboardResponse> {
  const params = team_id ? `?team_id=${team_id}` : ''
  return get<TraineeDashboardResponse>(`${API_BASE}/dashboard/trainee${params}`)
}

export async function fetchCTODashboard(): Promise<CTODashboardResponse> {
  return get<CTODashboardResponse>(`${API_BASE}/dashboard/cto`)
}

export async function fetchTeamAnalytics(): Promise<TeamAnalyticsResponse> {
  return get<TeamAnalyticsResponse>(`${API_BASE}/dashboard/team`)
}

export async function fetchRoadmap(): Promise<RoadmapResponse> {
  return get<RoadmapResponse>(`${API_BASE}/roadmap`)
}

export async function fetchRepoAnalysis(
  owner: string,
  repo: string
): Promise<AnalysisData> {
  return get<AnalysisData>(`${API_BASE}/repos/${owner}/${repo}/analysis`)
}

export async function fetchRepoSections(
  owner: string,
  repo: string
): Promise<RepoSectionsResponse> {
  return get<RepoSectionsResponse>(
    `${API_BASE}/repos/${owner}/${repo}/sections`
  )
}

// ── Seed Data ─────────────────────────────────────────────────
export interface SeedRoleData {
  role: string
  portal: string
  data: Record<string, any>
}

export async function fetchSeedRoleData(): Promise<SeedRoleData> {
  const res = await fetch(`${API_BASE}/seed/role-data`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: Failed to fetch seed data`)
  return res.json()
}

// ─── Health Score ─────────────────────────────────────────────────────────

export interface HealthScoreResult {
  overall_score: number
  test_coverage: number
  maintainability: number
  complexity: string
  recommendations: string[]
}

export async function fetchHealthScore(
  owner: string,
  repo: string,
  repoStructure: unknown
): Promise<HealthScoreResult> {
  return request<HealthScoreResult>(
    `${API_BASE}/repos/${owner}/${repo}/health`,
    { owner, repo, repo_structure: repoStructure }
  )
}

// ─── Pattern Recognition ──────────────────────────────────────────────────

export interface PatternResult {
  pattern: string
  your_approach: { approach: string; files: string[] }
  similar_solutions: Array<{
    repo: string
    approach: string
    why_different: string
  }>
}

export async function findSimilarPatterns(
  pattern: string,
  repoStructure: unknown
): Promise<PatternResult> {
  return request<PatternResult>(`${API_BASE}/patterns/find-similar`, {
    pattern,
    repo_structure: repoStructure,
  })
}

// ─── Pair Programming ─────────────────────────────────────────────────────

export interface PairWalkthroughResult {
  thought_process: string
  key_insights: string[]
  testing_approach: string
  solution_steps: string[]
}

export async function fetchPairWalkthrough(
  issueTitle: string,
  issueBody: string,
  repoStructure: unknown
): Promise<PairWalkthroughResult> {
  return request<PairWalkthroughResult>(`${API_BASE}/pair/walkthrough`, {
    issue_title: issueTitle,
    issue_body: issueBody,
    repo_structure: repoStructure,
  })
}

// ─── Test Checklist ───────────────────────────────────────────────────────

export interface TestChecklistResult {
  must_test: string[]
  edge_cases: string[]
  test_code_template: string
}

export async function fetchTestChecklist(
  prDiff: string,
  repoStructure: unknown
): Promise<TestChecklistResult> {
  return request<TestChecklistResult>(`${API_BASE}/test-checklist/generate`, {
    pr_diff: prDiff,
    repo_structure: repoStructure,
  })
}

// ─── Onboarding Reports ───────────────────────────────────────────────────

export interface ReportSection {
  title: string
  type: string
  content: any
}

export interface ReportResult {
  report: ReportSection[]
}

export async function generateReport(
  repoUrl: string,
  userLevel: string
): Promise<ReportResult> {
  return request<ReportResult>(`${API_BASE}/reports/generate`, {
    repo_url: repoUrl,
    user_level: userLevel,
  })
}

export interface HtmlReportResult {
  html: string
}

export async function generateHtmlReport(
  repoUrl: string,
  userLevel: string
): Promise<HtmlReportResult> {
  return request<HtmlReportResult>(`${API_BASE}/reports/generate-html`, {
    repo_url: repoUrl,
    user_level: userLevel,
  })
}

// ─── Gamification ────────────────────────────────────────────────────────

export interface BadgeInfo {
  badge_key: string
  badge_name: string
  icon: string
  description: string
  xp_bonus: number
  earned_at: string
}

export interface BadgeDefinition {
  badge_key: string
  name: string
  icon: string
  description: string
  requirement_type: string
  requirement_value: number
  xp_bonus: number
}

export interface StreakInfo {
  current_streak: number
  longest_streak: number
  last_active: string | null
  streak_frozen: boolean
}

export interface GamificationSummary {
  user_id: string
  total_xp: number
  level: number
  xp_progress: number
  xp_needed: number
  xp_breakdown: Record<string, number>
  badges: BadgeInfo[]
  badges_count: number
  streak: StreakInfo
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  name: string
  xp: number
  badges_count: number
  current_streak: number
}

export interface LeaderboardResponse {
  team_id: string
  period: string
  entries: LeaderboardEntry[]
  total_entries: number
}

export interface AwardXpResponse {
  awarded: boolean
  xp_id?: string
  source?: string
  amount?: number
  total_xp?: number
  new_badges?: BadgeInfo[]
  reason?: string
}

export interface LoginStreakResponse {
  streak: StreakInfo
  xp_awarded: boolean
  xp_amount: number
}

export interface XpSource {
  source: string
  default_amount: number
}

export interface XpSourcesResponse {
  sources: XpSource[]
}

export async function fetchGamificationSummary(
  teamId?: string
): Promise<GamificationSummary> {
  const params = teamId ? `?team_id=${teamId}` : ''
  return get<GamificationSummary>(`${API_BASE}/gamification/summary${params}`)
}

export async function awardXp(data: {
  source: string
  amount?: number
  team_id?: string
  metadata?: Record<string, unknown>
}): Promise<AwardXpResponse> {
  return request<AwardXpResponse>(`${API_BASE}/gamification/xp`, data)
}

export async function recordLogin(): Promise<LoginStreakResponse> {
  return request<LoginStreakResponse>(`${API_BASE}/gamification/login`, {})
}

export async function fetchStreak(): Promise<StreakInfo> {
  return get<StreakInfo>(`${API_BASE}/gamification/streak`)
}

export async function fetchBadges(): Promise<{ badges: BadgeInfo[]; count: number }> {
  return get<{ badges: BadgeInfo[]; count: number }>(`${API_BASE}/gamification/badges`)
}

export async function fetchBadgeDefinitions(): Promise<{ badge_definitions: BadgeDefinition[]; count: number }> {
  return get<{ badge_definitions: BadgeDefinition[]; count: number }>(`${API_BASE}/gamification/badges/definitions`)
}

export async function fetchLeaderboard(
  teamId: string,
  period: 'all_time' | 'monthly' | 'weekly' = 'all_time',
  limit = 20
): Promise<LeaderboardResponse> {
  return get<LeaderboardResponse>(
    `${API_BASE}/gamification/leaderboard?team_id=${teamId}&period=${period}&limit=${limit}`
  )
}

export async function fetchXpSources(): Promise<XpSourcesResponse> {
  return get<XpSourcesResponse>(`${API_BASE}/gamification/sources`)
}

// ─── Teams ────────────────────────────────────────────────────────────────

export interface Team {
  team_id: string
  name: string
  owner: string
  tier: string
  members: string[]
  created_at: string
}

export interface TeamsResponse {
  teams: Team[]
}

export async function createTeam(
  name: string,
  owner: string,
  tier = 'free'
): Promise<{ team_id: string }> {
  return request<{ team_id: string }>(`${API_BASE}/teams`, {
    name,
    owner,
    tier,
  })
}

export async function listTeams(user: string): Promise<TeamsResponse> {
  return get<TeamsResponse>(`${API_BASE}/teams?user=${user}`)
}

export async function getTeam(teamId: string): Promise<Team> {
  return get<Team>(`${API_BASE}/teams/${teamId}`)
}

export async function addTeamMember(
  teamId: string,
  user: string,
  role = 'member'
): Promise<void> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/members`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user, role }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function getTeamMembers(teamId: string): Promise<{ user_id: string; name: string; role: string }[]> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/members`, {
    method: 'GET',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function removeTeamMember(
  teamId: string,
  user: string
): Promise<void> {
  await fetch(`${API_BASE}/teams/${teamId}/members/${user}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

export async function changeTeamTier(
  teamId: string,
  tier: string
): Promise<void> {
  await fetch(`${API_BASE}/teams/${teamId}/tier`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ tier }),
  })
}

// ─── Playbooks ────────────────────────────────────────────────────────────

export interface Playbook {
  playbook_id: string
  team_id: string
  title: string
  description: string
  steps: string[]
  version: number
  use_count: number
  tags: string[]
  created_by: string
  created_at: string
}

export interface PlaybooksResponse {
  playbooks: Playbook[]
}

export async function createPlaybook(data: {
  team_id: string
  title: string
  description?: string
  steps: string[]
  created_by: string
}): Promise<{ playbook_id: string }> {
  return request<{ playbook_id: string }>(`${API_BASE}/playbooks`, data)
}

export async function listPlaybooks(
  teamId: string
): Promise<PlaybooksResponse> {
  return get<PlaybooksResponse>(`${API_BASE}/playbooks?team_id=${teamId}`)
}

export async function getPlaybook(
  playbookId: string
): Promise<Playbook> {
  return get<Playbook>(`${API_BASE}/playbooks/${playbookId}`)
}

export async function updatePlaybook(
  playbookId: string,
  data: Partial<{
    title: string
    description: string
    steps: string[]
    tags: string[]
  }>
): Promise<Playbook> {
  return request<Playbook>(`${API_BASE}/playbooks/${playbookId}`, data, 'PATCH')
}

export async function archivePlaybook(
  playbookId: string
): Promise<void> {
  await fetch(`${API_BASE}/playbooks/${playbookId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

// ─── Billing ──────────────────────────────────────────────────────────────

export interface Subscription {
  team_id: string
  tier: string
  price: number
  billing_cycle: string
  status: string
  stripe_customer_id?: string
  created_at: string
}

export interface PricingTier {
  tier: string
  price: number
  features: string[]
}

export async function createSubscription(data: {
  team_id: string
  tier: string
  billing_cycle?: string
}): Promise<Subscription> {
  return request<Subscription>(`${API_BASE}/billing/subscriptions`, data)
}

export async function getSubscription(
  teamId: string
): Promise<Subscription> {
  return get<Subscription>(`${API_BASE}/billing/subscriptions/${teamId}`)
}

export async function updateSubscription(
  teamId: string,
  data: Partial<{ tier: string; billing_cycle: string }>
): Promise<Subscription> {
  return request<Subscription>(
    `${API_BASE}/billing/subscriptions/${teamId}`,
    data,
    'PATCH'
  )
}

export async function cancelSubscription(teamId: string): Promise<void> {
  await fetch(`${API_BASE}/billing/subscriptions/${teamId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

export async function attachStripe(
  teamId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string
): Promise<Subscription> {
  return request<Subscription>(
    `${API_BASE}/billing/subscriptions/${teamId}/stripe`,
    {
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    }
  )
}

export async function listPricing(): Promise<{ tiers: PricingTier[] }> {
  return get<{ tiers: PricingTier[] }>(`${API_BASE}/billing/pricing`)
}

export async function createCheckoutSession(data: {
  team_id: string
  tier: string
  success_url: string
  cancel_url: string
}): Promise<{ url: string; session_id: string }> {
  return request<{ url: string; session_id: string }>(
    `${API_BASE}/billing/checkout`,
    data
  )
}

// ─── API Keys ─────────────────────────────────────────────────────────────

export interface ApiKey {
  key_id: string
  name?: string
  org_name: string
  tier: string
  created_at: string
  usage_count: number
  is_active: boolean
}

export interface ApiKeysResponse {
  keys: ApiKey[]
}

export async function createApiKey(
  orgName: string,
  tier = 'free'
): Promise<{ raw_key: string; key_id: string }> {
  return request<{ raw_key: string; key_id: string }>(
    `${API_BASE}/ai/keys`,
    { org_name: orgName, tier }
  )
}

export async function listApiKeys(
  orgName: string
): Promise<ApiKeysResponse> {
  return get<ApiKeysResponse>(`${API_BASE}/ai/keys?org_name=${orgName}`)
}

export async function revokeApiKey(keyId: string): Promise<void> {
  await fetch(`${API_BASE}/ai/keys/${keyId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

export async function validateApiKey(
  rawKey: string
): Promise<{ valid: boolean; org_name: string; tier: string }> {
  // Key sent in body (never the URL) to avoid leaking it in logs/history.
  return request<{ valid: boolean; org_name: string; tier: string }>(
    `${API_BASE}/ai/keys/validate`,
    { raw_key: rawKey }
  )
}

// ─── Usage ────────────────────────────────────────────────────────────────

export interface UsageRecord {
  org_name: string
  period: string
  total_credits: number
  total_requests: number
  endpoint_breakdown: Record<string, number>
}

export async function getUsage(
  orgName: string
): Promise<UsageRecord> {
  return get<UsageRecord>(`${API_BASE}/ai/usage/${orgName}`)
}

export async function getUsageSummary(
  orgName: string
): Promise<{ summary: any }> {
  return get<{ summary: any }>(`${API_BASE}/ai/usage/${orgName}/summary`)
}

export async function getQuota(
  orgName: string
): Promise<{ quota: any }> {
  return get<{ quota: any }>(`${API_BASE}/ai/usage/${orgName}/quota`)
}

export interface TierLimits {
  requests_per_minute: number
  requests_per_day: number
  credits_per_month: number
  max_repos: number
}

export interface CreditCosts {
  chat: number
  embed: number
  generate: number
  learn: number
  explore: number
  analyze: number
  pr_review: number
  trailer: number
  [key: string]: number
}

export interface RateLimitInfo {
  tiers: Record<string, TierLimits>
  credit_costs: CreditCosts
}

export async function listTiers(): Promise<RateLimitInfo> {
  return get<RateLimitInfo>(`${API_BASE}/ai/tiers`)
}

// ─── AIaaS Public Gateway ────────────────────────────────────────────────────

export interface AgentInfo {
  name: string
  description: string
  required_params: string[]
  credit_cost: number
  // Query-type routing: which model this agent's prompts are routed to.
  query_type: string | null
  model: string | null
}

export async function listAgents(): Promise<{ agents: AgentInfo[]; count: number }> {
  return get<{ agents: AgentInfo[]; count: number }>(`${API_BASE}/ai/agents`)
}

export async function executeAgent(
  agentName: string,
  params: Record<string, unknown>,
  apiKey?: string,
): Promise<{ agent: string; result: any; credits_used: number; tier: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  } else {
    Object.assign(headers, authHeaders())
  }
  const res = await fetch(`${API_BASE}/ai/agents/${agentName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })
  if (res.status === 401) {
    const text = await res.text()
    let message = 'Authentication required. Provide a valid API key or JWT.'
    if (text) {
      try {
        const err = JSON.parse(text)
        if (err.detail) message = err.detail
      } catch {
        if (text.length < 200) message = text
      }
    }
    throw new Error(message)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Autonomous Coding Agent ────────────────────────────────────────────────

export interface AutonomousCodingResult {
  success: boolean
  pr_url?: string
  pr_number?: number
  branch?: string
  summary?: string
  files_changed?: number
  patches_applied?: number
  patches_failed?: number
  error?: string
}

export async function executeAutonomousCoding(
  repoUrl: string,
  issueDescription: string,
  baseBranch = 'main',
  branchName?: string,
): Promise<AutonomousCodingResult> {
  return request<AutonomousCodingResult>(`${API_BASE}/ai/agents/autonomous`, {
    repo_url: repoUrl,
    issue_description: issueDescription,
    base_branch: baseBranch,
    branch_name: branchName,
  })
}

// ─── HR Dashboard ──────────────────────────────────────────────────────────

export interface HrMemberRamp {
  user_id: string
  name: string
  ramp_days: number | null
}

export interface HrRampTime {
  members: HrMemberRamp[]
  team_average_days: number | null
}

export interface HrCompletionMember {
  user_id: string
  name: string
  assigned: number
  completed: number
  completion_pct: number
}

export interface HrOnboardingCompletion {
  members: HrCompletionMember[]
}

export interface HrEngagementMember {
  user_id: string
  name: string
  current_streak: number
  longest_streak: number
}

export interface HrEngagement {
  members: HrEngagementMember[]
  active_streaks: number
}

export interface HrStalledTask {
  task_id: string
  title: string
  state: string
  age_days: number
}

export interface HrAtRiskMember {
  user_id: string
  name: string
  reasons: string[]
  stalled_task: HrStalledTask | null
}

export interface HrAttritionRisk {
  at_risk: HrAtRiskMember[]
  at_risk_count: number
}

export interface HrCohortSummary {
  team_id: string
  member_count: number
  ramp_time: HrRampTime
  onboarding_completion: HrOnboardingCompletion
  engagement: HrEngagement
  attrition_risk: HrAttritionRisk
  generated_at: string
}

export async function fetchHrCohort(teamId: string): Promise<HrCohortSummary> {
  return get<HrCohortSummary>(`${API_BASE}/hr/cohort/${teamId}`)
}

export async function fetchHrAttrition(teamId: string): Promise<HrAttritionRisk> {
  return get<HrAttritionRisk>(`${API_BASE}/hr/attrition/${teamId}`)
}

export interface HrDayBucket {
  date: string
  commits: number
  tasks: number
  logins: number
}

export interface HrMemberHeatmap {
  user_id: string
  name: string
  total: number
  days: HrDayBucket[]
}

export interface HrHeatmapResponse {
  members: Record<string, HrMemberHeatmap>
  from: string
  to: string
}

export async function fetchHrHeatmap(teamId: string): Promise<HrHeatmapResponse> {
  return get<HrHeatmapResponse>(`${API_BASE}/hr/heatmap/${teamId}`)
}

export interface HrDeveloperOverview {
  user_id: string
  name: string
  stage: 'onboarding' | 'ramping' | 'contributing' | 'independent'
  completion_pct: number
  assigned: number
  completed: number
  ramp_days: number | null
  current_streak: number
  longest_streak: number
  at_risk: boolean
}

export interface HrDeveloperResponse {
  developers: HrDeveloperOverview[]
  team_id: string
}

export async function fetchHrDevelopers(teamId: string): Promise<HrDeveloperResponse> {
  return get<HrDeveloperResponse>(`${API_BASE}/hr/developers/${teamId}`)
}

// ─── Cohort Analytics / Timeline / Mentor Matching ──────────

export interface CohortBlocker {
  task_id: string
  title: string
  assignee: string
  age_days: number
  module: string
}

export interface CohortComparisonEntry {
  cohort: string
  label: string
  member_count: number
  avg_ramp_days: number | null
  avg_days_to_first_pr: number | null
  avg_completion_pct: number | null
  blocker_count: number
  top_blockers: CohortBlocker[]
}

export interface CohortComparisonResponse {
  cohorts: CohortComparisonEntry[]
  team_id: string
}

export async function fetchCohortComparison(teamId: string): Promise<CohortComparisonResponse> {
  return get<CohortComparisonResponse>(`${API_BASE}/hr/cohort-comparison/${teamId}`)
}

// ─── Plan Roadmap (milestone DAG) ────────────────────────────

export interface PlanRoadmapMilestone {
  id: string
  title: string
  description: string | null
  category: string
  day_target: number | null
  sort_order: number
  is_completed: boolean
  status: 'completed' | 'in_progress' | 'available' | 'locked'
  depends_on: string[]
}

export interface PlanRoadmapResponse {
  plan_id: string
  milestones: PlanRoadmapMilestone[]
  count: number
}

export async function fetchPlanRoadmap(planId: string): Promise<PlanRoadmapResponse> {
  return get<PlanRoadmapResponse>(`${API_BASE}/onboarding-plans/${planId}/roadmap`)
}

export interface TimelineMilestone {
  task_id: string
  module: string
  state: string
  at: string
  label: string
  title: string
}

export interface TimelineLane {
  user_id: string
  name: string
  role: string
  joined_at: string
  milestone_count: number
  milestones: TimelineMilestone[]
}

export interface OnboardingTimelineResponse {
  lanes: TimelineLane[]
  team_id: string
}

export async function fetchOnboardingTimeline(teamId: string): Promise<OnboardingTimelineResponse> {
  return get<OnboardingTimelineResponse>(`${API_BASE}/hr/timeline/${teamId}`)
}

export interface MentorMatchEntry {
  user_id: string
  name: string
  role: string
  score: number
  shared_languages: string[]
  mentor_languages: string[]
}

export interface MentorMatchResponse {
  new_dev_id: string
  new_dev_languages: string[]
  matches: MentorMatchEntry[]
  match_count: number
}

export async function fetchMentorMatch(teamId: string, userId: string): Promise<MentorMatchResponse> {
  return get<MentorMatchResponse>(`${API_BASE}/hr/mentor-match/${teamId}/${userId}`)
}

// ─── Review Analytics ────────────────────────────────────────

export interface ReviewAnalyticsReviewer {
  user_id: string
  name: string
  reviews: number
}

export interface ReviewAnalytics {
  team_id: string
  total_tasks: number
  rework_rate_pct: number
  reworked_task_count: number
  avg_review_turnaround_hours: number | null
  pending_review_count: number
  top_reviewers: ReviewAnalyticsReviewer[]
  generated_at: string
}

export async function fetchReviewAnalytics(teamId: string): Promise<ReviewAnalytics> {
  return get<ReviewAnalytics>(`${API_BASE}/hr/review-analytics/${teamId}`)
}

// ─── Task CSV Export ─────────────────────────────────────────

async function downloadCsv(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Export error ${res.status}: ${text}`)
  }
  const blob = await res.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  URL.revokeObjectURL(link.href)
  link.remove()
}

export async function exportTasksCsv(teamId: string): Promise<void> {
  return downloadCsv(`${API_BASE}/tasks/export.csv?team_id=${encodeURIComponent(teamId)}`, 'tasks.csv')
}

export async function exportTimeStatsCsv(teamId: string): Promise<void> {
  return downloadCsv(`${API_BASE}/tasks/time-stats/team/${encodeURIComponent(teamId)}/export.csv`, 'time-stats.csv')
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface AdminApiKey {
  key_id: string
  name: string
  team_id: string | null
  user_id: string | null
  tier: string
  org_name: string
  is_active: boolean
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

export interface AdminApiKeysResponse {
  keys: AdminApiKey[]
  count: number
}

export interface AdminUsageResponse {
  period: string
  total_requests: number
  total_credits: number
  team_breakdown: Record<string, { requests: number; credits: number }>
  endpoint_breakdown: Record<string, number>
  // Free-first routing attribution + dollar savings (from route metadata)
  tracked_requests: number
  free_requests: number
  paid_requests: number
  free_pct: number
  total_cost_usd: number
  total_cost_avoided_usd: number
  provider_series: AdminProviderSeriesPoint[]
}

export interface AdminProviderSeriesPoint {
  date: string
  free: number
  paid: number
  cost_usd: number
  cost_avoided_usd: number
}

export interface AdminTeamUsage {
  team_id: string
  team_name: string
  tier: string
  member_count: number
  total_requests: number
  total_credits: number
}

export interface AdminTeamUsageResponse {
  teams: AdminTeamUsage[]
  count: number
}

export interface AdminAuditEvent {
  event_id?: string
  event_type: string
  actor_id: string
  target_id: string
  team_id: string
  metadata: Record<string, any>
  timestamp: string
}

export interface AdminAuditResponse {
  events: AdminAuditEvent[]
  count: number
}

export async function adminListApiKeys(includeRevoked = false): Promise<AdminApiKeysResponse> {
  return get<AdminApiKeysResponse>(`${API_BASE}/admin/keys?include_revoked=${includeRevoked}`)
}

export async function adminGetUsage(period?: string, days = 14): Promise<AdminUsageResponse> {
  const params = new URLSearchParams()
  if (period) params.set('period', period)
  params.set('days', String(days))
  const qs = params.toString()
  return get<AdminUsageResponse>(`${API_BASE}/admin/usage?${qs}`)
}

export async function adminGetTeamUsage(): Promise<AdminTeamUsageResponse> {
  return get<AdminTeamUsageResponse>(`${API_BASE}/admin/usage/teams`)
}

// ─── PR Description ────────────────────────────────────────────────────────

export interface PRDescriptionResult {
  description: string
  title?: string
  branch?: string
}

export async function describePR(
  repoUrl: string,
  prNumber: number,
  title = '',
  branch = ''
): Promise<PRDescriptionResult> {
  return request<PRDescriptionResult>(`${API_BASE}/pr-review/describe`, {
    repo_url: repoUrl,
    pr_number: prNumber,
    title,
    branch,
  })
}

// ─── PR Review Auto-Apply ────────────────────────────────────────────────────

export interface AutoApplySuggestion {
  file_path: string
  old_string: string
  new_string: string
  commit_message?: string
}

export interface AutoApplyResult {
  total: number
  succeeded: number
  failed: number
  results: Array<{
    success: boolean
    commit_sha?: string
    commit_url?: string
    file_path?: string
    error?: string
  }>
}

export async function autoApplySuggestions(
  repoUrl: string,
  prNumber: number,
  suggestions: AutoApplySuggestion[],
  commitMessagePrefix = 'fix: auto-apply PR review suggestion'
): Promise<AutoApplyResult> {
  return request<AutoApplyResult>(`${API_BASE}/pr-review/auto-apply`, {
    repo_url: repoUrl,
    pr_number: prNumber,
    suggestions,
    commit_message_prefix: commitMessagePrefix,
  })
}

export async function autoApplySuggestion(
  repoUrl: string,
  prNumber: number,
  filePath: string,
  oldString: string,
  newString: string,
  commitMessage = 'fix: auto-apply PR review suggestion'
): Promise<{ success: boolean; commit_sha?: string; commit_url?: string }> {
  return request<{ success: boolean; commit_sha?: string; commit_url?: string }>(
    `${API_BASE}/pr-review/auto-apply/single`,
    {
      repo_url: repoUrl,
      pr_number: prNumber,
      file_path: filePath,
      old_string: oldString,
      new_string: newString,
      commit_message: commitMessage,
    }
  )
}

export async function adminListAuditEvents(params?: {
  event_type?: string
  actor_id?: string
  limit?: number
}): Promise<AdminAuditResponse> {
  const query = new URLSearchParams()
  if (params?.event_type) query.set('event_type', params.event_type)
  if (params?.actor_id) query.set('actor_id', params.actor_id)
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return get<AdminAuditResponse>(`${API_BASE}/admin/audit${qs ? '?' + qs : ''}`)
}

export async function exportAuditEvents(params?: {
  format?: 'json' | 'csv'
  event_type?: string
  actor_id?: string
  limit?: number
}): Promise<Blob> {
  const query = new URLSearchParams()
  query.set('format', params?.format || 'json')
  if (params?.event_type) query.set('event_type', params.event_type)
  if (params?.actor_id) query.set('actor_id', params.actor_id)
  if (params?.limit) query.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/admin/audit/export?${query.toString()}`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Export error ${res.status}: ${text}`)
  }
  return res.blob()
}

// ─── Admin Webhooks ────────────────────────────────────────────

export interface AdminWebhook {
  webhook_id: string
  user_id: string
  url: string
  events: string[]
  secret: string
  description: string
  active: boolean
  team_id: string
  created_at: string
  updated_at: string
  last_success_at: string | null
  last_failure_at: string | null
  delivery_count: number
  failure_count: number
}

export interface AdminWebhooksResponse {
  webhooks: AdminWebhook[]
  count: number
}

export interface AdminWebhookDelivery {
  id?: string
  webhook_id: string
  event: string
  url: string
  status_code: number | null
  success: boolean
  error: string | null
  duration_ms: number
  created_at: string
}

export interface AdminWebhookDeliveriesResponse {
  deliveries: AdminWebhookDelivery[]
  count: number
}

export interface AdminWebhookTestResult {
  success: boolean
  status_code?: number | null
  error?: string | null
}

export async function adminListWebhooks(activeOnly = false): Promise<AdminWebhooksResponse> {
  return get<AdminWebhooksResponse>(`${API_BASE}/admin/webhooks?active_only=${activeOnly}`)
}

export async function adminGetWebhook(webhookId: string): Promise<AdminWebhook> {
  return get<AdminWebhook>(`${API_BASE}/admin/webhooks/${webhookId}`)
}

export async function adminTestWebhook(webhookId: string): Promise<AdminWebhookTestResult> {
  return request<AdminWebhookTestResult>(`${API_BASE}/admin/webhooks/${webhookId}/test`, {})
}

export async function adminDeleteWebhook(webhookId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/admin/webhooks/${webhookId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function adminGetWebhookDeliveries(webhookId: string, limit = 50): Promise<AdminWebhookDeliveriesResponse> {
  return get<AdminWebhookDeliveriesResponse>(`${API_BASE}/admin/webhooks/${webhookId}/deliveries?limit=${limit}`)
}

export async function adminRotateWebhookSecret(webhookId: string): Promise<AdminWebhook> {
  return request<AdminWebhook>(`${API_BASE}/admin/webhooks/${webhookId}/rotate-secret`, {})
}

// ─── Architecture Drift Detection ─────────────────────────────────────────

export interface DriftResult {
  drift_score: number
  status: string
  has_docs: boolean
  documented_but_missing: string[]
  undocumented_components: string[]
  code_component_count: number
  documented_component_count: number
  alerts: Array<{
    type: string
    severity: string
    detail: string
    recommendation: string
  }>
  summary: string
}

export async function detectArchitectureDrift(
  repoStructure: Record<string, unknown>,
  docs: string
): Promise<DriftResult> {
  return request<DriftResult>(`${API_BASE}/drift/detect`, {
    repo_structure: repoStructure,
    docs,
  })
}

// ─── Ask / Q&A History ─────────────────────────────────────────────────────

export async function getAskHistory(
  indexId: string,
  limit = 20
): Promise<{ history: HistoryTurn[] }> {
  return get<{ history: HistoryTurn[] }>(
    `${API_BASE}/ask/history/${encodeURIComponent(indexId)}?limit=${limit}`
  )
}

export async function clearAskHistory(
  indexId: string
): Promise<{ cleared: number }> {
  const res = await fetch(
    `${API_BASE}/ask/history/${encodeURIComponent(indexId)}`,
    { method: 'DELETE', headers: authHeaders() }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Module-Level Access Control ─────────────────────────────────────────

export interface ModulePermission {
  id: string
  user_id: string
  user_name: string
  module: string
  granted_by: string
  granted_at: string
  source: string
}

export interface TeamModulePermissionsResponse {
  permissions: ModulePermission[]
  modules: string[]
  count: number
}

export interface UserModulePermissionsResponse {
  user_id: string
  modules: string[]
  count: number
}

export interface ModuleAccessCheckResponse {
  permitted: boolean
}

export async function getTeamModulePermissions(
  teamId: string
): Promise<TeamModulePermissionsResponse> {
  return get<TeamModulePermissionsResponse>(
    `${API_BASE}/teams/${teamId}/module-permissions`
  )
}

export async function getUserModulePermissions(
  teamId: string,
  userId: string
): Promise<UserModulePermissionsResponse> {
  return get<UserModulePermissionsResponse>(
    `${API_BASE}/teams/${teamId}/module-permissions/${userId}`
  )
}

export async function grantModuleAccess(
  teamId: string,
  userId: string,
  module: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/module-permissions/grant`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, module }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function revokeModuleAccess(
  teamId: string,
  userId: string,
  module: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/module-permissions/revoke`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, module }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function revokeAllModuleAccess(
  teamId: string,
  userId: string
): Promise<{ revoked: number }> {
  const res = await fetch(
    `${API_BASE}/teams/${teamId}/module-permissions/revoke-all`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ user_id: userId }),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function checkModuleAccess(
  teamId: string,
  userId: string,
  module: string
): Promise<ModuleAccessCheckResponse> {
  return get<ModuleAccessCheckResponse>(
    `${API_BASE}/teams/${teamId}/module-permissions/check/${userId}/${module}`
  )
}

// ─── Tasks / Workflow ─────────────────────────────────────────────────────

export interface WorkflowTask {
  task_id: string
  team_id: string
  created_by: string
  assigned_to: string | null
  title: string
  description: string
  module: string
  state: string
  priority: string
  pr_url: string | null
  branch: string | null
  repo_url: string | null
  unlock_modules: string[]
  review_feedback: any | null
  ai_review: AiReview | null
  product_signoff: boolean
  estimated_hours: number | null
  actual_hours: number | null
  pr_comments: Array<{ user: string; body: string; path: string; line: number | null; created_at: string }> | null
  peer_reviewed_by: string | null
  quiz_required: boolean
  depends_on: string | null
  source_issue: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface AiReviewIssue {
  type: string
  severity: string
  file: string
  line: number
  message: string
  suggestion: string
}

export interface AiReviewStats {
  files_changed: number
  additions: number
  deletions: number
}

export interface AiReview {
  summary: string
  score: number
  issues: AiReviewIssue[]
  positives: string[]
  recommendations: string[]
  diff_stats: AiReviewStats
}

export interface WorkflowTasksResponse {
  tasks: WorkflowTask[]
  count: number
}

export interface TeamProgress {
  total: number
  by_state: Record<string, number>
  completed: number
  in_progress: number
  pending_review: number
  blocked: number
}

export interface UserProgress {
  total: number
  by_state: Record<string, number>
  completed: number
  in_progress: number
  pending_review: number
  modules_unlocked: string[]
  completion_rate: number
}

export async function createTask(data: {
  team_id: string
  title: string
  description?: string
  module?: string
  priority?: string
  repo_url?: string
  branch?: string
  unlock_modules?: string[]
  estimated_hours?: number
  assigned_to?: string
  quiz_required?: boolean
}): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks`, data)
}

export async function listTasks(params?: {
  team_id?: string
  assigned_to?: string
  created_by?: string
  state?: string
}): Promise<WorkflowTasksResponse> {
  const query = new URLSearchParams()
  if (params?.team_id) query.set('team_id', params.team_id)
  if (params?.assigned_to) query.set('assigned_to', params.assigned_to)
  if (params?.created_by) query.set('created_by', params.created_by)
  if (params?.state) query.set('state', params.state)
  const qs = query.toString()
  return get<WorkflowTasksResponse>(`${API_BASE}/tasks${qs ? '?' + qs : ''}`)
}

export async function getTask(taskId: string): Promise<WorkflowTask> {
  return get<WorkflowTask>(`${API_BASE}/tasks/${taskId}`)
}

export async function updateTask(taskId: string, data: Partial<{
  title: string
  description: string
  module: string
  priority: string
  repo_url: string
  branch: string
  unlock_modules: string[]
  estimated_hours: number
}>): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}`, data, 'PATCH')
}

export async function transitionTask(taskId: string, newState: string, extra?: {
  feedback?: any
  pr_url?: string
}): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/transition`, {
    new_state: newState,
    ...extra,
  })
}

export async function assignTask(taskId: string, assigneeId: string): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/assign`, { assignee_id: assigneeId })
}

export async function startTask(taskId: string): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/start`, {})
}

export async function submitTask(taskId: string, prUrl: string): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/submit`, { pr_url: prUrl })
}

export async function reviewTask(taskId: string, data: {
  approve: boolean
  needs_product?: boolean
  feedback?: any
}): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/review`, data)
}

export async function approveTask(taskId: string, feedback?: any): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/approve`, { feedback })
}

export async function completeTask(taskId: string): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/complete`, {})
}

export async function cancelTask(taskId: string): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/cancel`, {})
}

export async function deleteTask(taskId: string): Promise<void> {
  await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}

export async function getTeamProgress(teamId: string): Promise<TeamProgress> {
  return get<TeamProgress>(`${API_BASE}/tasks/progress/team/${teamId}`)
}

export async function getUserProgress(userId: string, teamId?: string): Promise<UserProgress> {
  const qs = teamId ? `?team_id=${teamId}` : ''
  return get<UserProgress>(`${API_BASE}/tasks/progress/user/${userId}${qs}`)
}

// ─── Time Tracking ───────────────────────────────────────────

export interface TimeStatRow {
  task_id: string
  title: string
  module: string
  state: string
  estimated_hours: number | null
  actual_hours: number | null
  variance_hours: number | null
  variance_pct: number | null
}

export interface TeamTimeStats {
  team_id: string
  tasks: TimeStatRow[]
  with_actual_count: number
  total_estimated_hours: number
  total_actual_hours: number
  avg_variance_hours: number | null
  avg_variance_pct: number | null
}

export async function getTeamTimeStats(teamId: string): Promise<TeamTimeStats> {
  return get<TeamTimeStats>(`${API_BASE}/tasks/time-stats/team/${teamId}`)
}

export async function logActualHours(taskId: string, hours: number): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/actual-hours`, { hours })
}

// ─── GitHub Issue Import ─────────────────────────────────────

export async function importIssueToTask(data: {
  team_id: string
  repo_url: string
  issue_number: number
  assigned_to?: string
  module?: string
  quiz_required?: boolean
}): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/import-issue`, data)
}

// ─── Peer Review ─────────────────────────────────────────────

export async function peerReviewTask(taskId: string, data: {
  approve: boolean
  needs_product?: boolean
  feedback?: any
}): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/peer-review`, data)
}

export async function claimPeerReview(taskId: string): Promise<WorkflowTask> {
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}/peer-review`, {})
}

// ─── Quiz Gates ──────────────────────────────────────────────

export interface QuizGateStatus {
  task_id: string
  required: boolean
  module: string
  passed: boolean
}

export async function getQuizGateStatus(taskId: string): Promise<QuizGateStatus> {
  return get<QuizGateStatus>(`${API_BASE}/tasks/${taskId}/quiz-gate`)
}

// ─── Task Templates ──────────────────────────────────────────

export interface TaskTemplate {
  template_id: string
  team_id: string
  created_by: string
  name: string
  description: string
  module: string
  priority: string
  repo_url: string
  unlock_modules: string[]
  estimated_hours: number | null
  created_at: string
}

export interface TaskTemplatesResponse {
  templates: TaskTemplate[]
  count: number
}

export async function listTaskTemplates(teamId?: string, module?: string): Promise<TaskTemplatesResponse> {
  const query = new URLSearchParams()
  if (teamId) query.set('team_id', teamId)
  if (module) query.set('module', module)
  const qs = query.toString()
  return get<TaskTemplatesResponse>(`${API_BASE}/tasks/templates${qs ? '?' + qs : ''}`)
}

export async function createTaskTemplate(data: {
  name: string
  description?: string
  module?: string
  priority?: string
  repo_url?: string
  unlock_modules?: string[]
  estimated_hours?: number
}): Promise<TaskTemplate> {
  return request<TaskTemplate>(`${API_BASE}/tasks/templates`, data)
}

export async function updateTaskTemplate(templateId: string, data: Partial<{
  name: string
  description: string
  module: string
  priority: string
  repo_url: string
  unlock_modules: string[]
  estimated_hours: number
}>): Promise<TaskTemplate> {
  return request<TaskTemplate>(`${API_BASE}/tasks/templates/${templateId}`, data, 'PATCH')
}

export async function deleteTaskTemplate(templateId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/tasks/templates/${templateId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Bulk Assignment ─────────────────────────────────────────

export interface BulkAssignResult {
  created_count: number
  missing_count: number
  missing_template_ids: string[]
  tasks: WorkflowTask[]
}

export async function bulkAssignTemplates(data: {
  team_id: string
  assignee_id: string
  template_ids: string[]
}): Promise<BulkAssignResult> {
  return request<BulkAssignResult>(`${API_BASE}/tasks/bulk-assign`, data)
}

// ─── Automated First-Task Assignment ─────────────────────────

export interface StarterAssignmentResult {
  level: string
  created_count: number
  tasks: WorkflowTask[]
  message?: string
}

export async function autoAssignStarterTasks(data: {
  team_id: string
  user_id: string
  repo_url: string
  count?: number
}): Promise<StarterAssignmentResult> {
  return request<StarterAssignmentResult>(`${API_BASE}/tasks/auto-assign-starter`, data)
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface OnrampNotification {
  notification_id: string
  user_id: string
  type: string
  title: string
  message: string
  full_message?: string
  metadata: Record<string, any>
  team_id: string
  read: boolean
  read_at: string | null
  created_at: string
}

export interface NotificationsResponse {
  notifications: OnrampNotification[]
  count: number
}

export interface UnreadCountResponse {
  unread_count: number
}

export async function listNotifications(params?: {
  unread_only?: boolean
  limit?: number
  type_filter?: string
}): Promise<NotificationsResponse> {
  const query = new URLSearchParams()
  if (params?.unread_only) query.set('unread_only', 'true')
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.type_filter) query.set('type_filter', params.type_filter)
  const qs = query.toString()
  return get<NotificationsResponse>(`${API_BASE}/notifications${qs ? '?' + qs : ''}`)
}

export async function getUnreadCount(): Promise<UnreadCountResponse> {
  return get<UnreadCountResponse>(`${API_BASE}/notifications/unread-count`)
}

export async function markNotificationsRead(notificationIds: string[]): Promise<{ marked_count: number }> {
  return request<{ marked_count: number }>(`${API_BASE}/notifications/mark-read`, { notification_ids: notificationIds })
}

export async function markAllNotificationsRead(): Promise<{ marked_count: number }> {
  return request<{ marked_count: number }>(`${API_BASE}/notifications/mark-all-read`, {})
}

export async function deleteNotification(notificationId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function clearReadNotifications(): Promise<{ deleted_count: number }> {
  return request<{ deleted_count: number }>(`${API_BASE}/notifications/clear-read`, {})
}

// ─── Notification Preferences ─────────────────────────────────────────────

export interface NotificationPreferences {
  user_id: string
  channels: Record<string, Record<string, boolean>>
  digest_frequency: string
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  email_digest_time: string
  roast_mode_enabled: boolean
}

export interface NotificationPreferencesDefaults {
  defaults: Record<string, Record<string, boolean>>
  notification_types: Record<string, string>
  channels: Record<string, string>
  channel_icons: Record<string, string>
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return get<NotificationPreferences>(`${API_BASE}/notifications/preferences`)
}

export async function updateNotificationPreferences(data: Partial<{
  channels: Record<string, Record<string, boolean>>
  digest_frequency: string
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  email_digest_time: string
  roast_mode_enabled: boolean
}>): Promise<NotificationPreferences> {
  return request<NotificationPreferences>(`${API_BASE}/notifications/preferences`, data, 'PUT')
}

export async function getNotificationDefaults(): Promise<NotificationPreferencesDefaults> {
  return get<NotificationPreferencesDefaults>(`${API_BASE}/notifications/preferences/defaults`)
}

// ─── Integrations / Webhooks ─────────────────────────────────────────────

export interface Webhook {
  webhook_id: string
  user_id: string
  url: string
  events: string[]
  secret: string
  description: string
  active: boolean
  created_at: string
  updated_at: string
  last_success_at: string | null
  last_failure_at: string | null
  delivery_count: number
  failure_count: number
}

export interface WebhooksResponse {
  webhooks: Webhook[]
  count: number
}

export interface IntegrationConfig {
  id?: string
  user_id?: string
  integration: string
  config: Record<string, any>
  configured: boolean
  created_at?: string
  updated_at?: string
}

export interface SupportedEventsResponse {
  events: string[]
  labels: Record<string, string>
}

export async function listWebhooks(): Promise<WebhooksResponse> {
  return get<WebhooksResponse>(`${API_BASE}/integrations/webhooks`)
}

export async function createWebhook(data: {
  url: string
  events: string[]
  description?: string
}): Promise<Webhook> {
  return request<Webhook>(`${API_BASE}/integrations/webhooks`, data)
}

export async function getWebhook(webhookId: string): Promise<Webhook> {
  return get<Webhook>(`${API_BASE}/integrations/webhooks/${webhookId}`)
}

export async function updateWebhook(webhookId: string, data: {
  url?: string
  events?: string[]
  active?: boolean
  description?: string
}): Promise<Webhook> {
  return request<Webhook>(`${API_BASE}/integrations/webhooks/${webhookId}`, data, 'PUT')
}

export async function deleteWebhook(webhookId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/integrations/webhooks/${webhookId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function testWebhook(webhookId: string): Promise<{ success: boolean; status_code?: number; error?: string }> {
  return request<{ success: boolean; status_code?: number; error?: string }>(
    `${API_BASE}/integrations/webhooks/${webhookId}/test`, {}
  )
}

export async function rotateWebhookSecret(webhookId: string): Promise<Webhook> {
  return request<Webhook>(`${API_BASE}/integrations/webhooks/${webhookId}/rotate-secret`, {})
}

export async function getIntegration(integrationType: string): Promise<IntegrationConfig> {
  return get<IntegrationConfig>(`${API_BASE}/integrations/${integrationType}`)
}

export async function saveIntegration(integrationType: string, config: Record<string, any>): Promise<IntegrationConfig> {
  return request<IntegrationConfig>(`${API_BASE}/integrations/${integrationType}`, { config }, 'PUT')
}

export async function deleteIntegration(integrationType: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/integrations/${integrationType}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export interface GithubTestResult {
  valid: boolean
  username?: string
  scopes?: string[]
  error?: string
}

export async function testGithubToken(token: string): Promise<GithubTestResult> {
  return request<GithubTestResult>(`${API_BASE}/integrations/github/test`, { token })
}

export async function listUserIntegrations(): Promise<{ integrations: IntegrationConfig[]; count: number }> {
  return get<{ integrations: IntegrationConfig[]; count: number }>(`${API_BASE}/integrations`)
}

export async function getSupportedEvents(): Promise<SupportedEventsResponse> {
  return get<SupportedEventsResponse>(`${API_BASE}/integrations/events/list`)
}

// ─── Jira Integration ─────────────────────────────────────────────────────

export interface JiraTestResult {
  valid: boolean
  display_name?: string
  account_id?: string
  error?: string
}

export interface JiraProject {
  key: string
  name: string
  id: string
}

export interface JiraIssueType {
  id: string
  name: string
  subtask: boolean
}

export async function testJiraConnection(config: Record<string, any>): Promise<JiraTestResult> {
  return request<JiraTestResult>(`${API_BASE}/integrations/jira/test`, { config })
}

export async function listJiraProjects(config: Record<string, any>): Promise<{ projects: JiraProject[]; count: number }> {
  return request<{ projects: JiraProject[]; count: number }>(`${API_BASE}/integrations/jira/projects`, { config })
}

export async function listJiraIssueTypes(config: Record<string, any>): Promise<{ issue_types: JiraIssueType[]; count: number }> {
  return request<{ issue_types: JiraIssueType[]; count: number }>(`${API_BASE}/integrations/jira/issue-types`, { config })
}

// ─── Linear Integration ───────────────────────────────────────────────────

export interface LinearTestResult {
  valid: boolean
  name?: string
  email?: string
  id?: string
  error?: string
}

export interface LinearTeam {
  id: string
  name: string
  key: string
}

export interface LinearWorkflowState {
  id: string
  name: string
  type: string
}

export async function testLinearConnection(config: Record<string, any>): Promise<LinearTestResult> {
  return request<LinearTestResult>(`${API_BASE}/integrations/linear/test`, { config })
}

export async function listLinearTeams(config: Record<string, any>): Promise<{ teams: LinearTeam[]; count: number }> {
  return request<{ teams: LinearTeam[]; count: number }>(`${API_BASE}/integrations/linear/teams`, { config })
}

export async function listLinearWorkflowStates(config: Record<string, any>): Promise<{ workflow_states: LinearWorkflowState[]; count: number }> {
  return request<{ workflow_states: LinearWorkflowState[]; count: number }>(`${API_BASE}/integrations/linear/workflow-states`, { config })
}

// ─── Credit Wallet (Usage-Based Billing) ─────────────────────────────────

export interface CreditWallet {
  scope: string
  balance: number
  lifetime_purchased: number
  lifetime_spent: number
  created_at: string
  updated_at?: string
}

export interface LedgerEntry {
  entry_id: string
  scope: string
  delta: number
  balance_after: number
  reason: string
  action: string
  created_at: string
}

export async function getCreditWallet(): Promise<CreditWallet> {
  return get<CreditWallet>(`${API_BASE}/billing/credits`)
}

export async function topUpCredits(amount: number): Promise<CreditWallet> {
  return request<CreditWallet>(`${API_BASE}/billing/credits/topup`, { amount })
}

export async function getCreditLedger(limit = 50): Promise<{ entries: LedgerEntry[]; count: number }> {
  return get<{ entries: LedgerEntry[]; count: number }>(`${API_BASE}/billing/credits/ledger?limit=${limit}`)
}

export interface CreditCostInfo {
  action: string
  cost: number
  description: string
}

export const CREDIT_COSTS_LIST: CreditCostInfo[] = [
  { action: 'chat', cost: 1, description: 'Ask a question to the codebase' },
  { action: 'embed', cost: 1, description: 'Embed a code snippet' },
  { action: 'generate', cost: 5, description: 'Generate PR description / guide' },
  { action: 'learn', cost: 5, description: 'Generate learning path' },
  { action: 'explore', cost: 10, description: 'Explore repo architecture' },
  { action: 'analyze', cost: 10, description: 'Analyze code patterns / drift' },
  { action: 'pr_review', cost: 15, description: 'Review a pull request' },
  { action: 'trailer', cost: 20, description: 'Generate codebase trailer' },
]

// ─── GitLab Integration ───────────────────────────────────────────────────

export interface GitLabTestResult {
  valid: boolean
  username?: string
  name?: string
  avatar_url?: string
  error?: string
}

export interface GitLabProject {
  id: number
  name: string
  path_with_namespace: string
  web_url: string
  description: string
  avatar_url: string
  visibility: string
  star_count: number
}

export async function testGitLabConnection(config: Record<string, any>): Promise<GitLabTestResult> {
  return request<GitLabTestResult>(`${API_BASE}/integrations/gitlab/test`, { config })
}

export async function listGitLabProjects(config: Record<string, any>): Promise<{ projects: GitLabProject[]; count: number }> {
  return request<{ projects: GitLabProject[]; count: number }>(`${API_BASE}/integrations/gitlab/projects`, { config })
}

// ─── Bitbucket Integration ────────────────────────────────────────────────

export interface BitbucketTestResult {
  valid: boolean
  username?: string
  display_name?: string
  uuid?: string
  error?: string
}

export interface BitbucketRepo {
  slug: string
  name: string
  full_name: string
  description: string
  language: string
  is_private: boolean
  links: {
    html: string
    clone: string[]
  }
}

export async function testBitbucketConnection(config: Record<string, any>): Promise<BitbucketTestResult> {
  return request<BitbucketTestResult>(`${API_BASE}/integrations/bitbucket/test`, { config })
}

export async function listBitbucketRepos(config: Record<string, any>): Promise<{ repos: BitbucketRepo[]; count: number }> {
  return request<{ repos: BitbucketRepo[]; count: number }>(`${API_BASE}/integrations/bitbucket/repos`, { config })
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface AuthResponse {
  uid: string
  email: string
  name: string
  provider: string
  token: string
  refresh_token?: string | null
}

export interface AuthMeResponse {
  uid: string
  email: string
  name: string
  provider: string
}

export interface ProviderCheckResponse {
  email: string
  registered: boolean
  provider: string | null
}

export async function authLogin(
  email: string,
  password: string,
  rememberMe = false
): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE}/auth/login`, { email, password, remember_me: rememberMe })
}

/**
 * Exchange the stored refresh token for a fresh access-token pair.
 * The endpoint is public (no auth header) — the refresh token itself is the
 * credential. Returns the new token pair so callers can persist both.
 */
export async function refreshToken(): Promise<{ token: string; refresh_token?: string | null }> {
  const stored = getRefreshToken()
  if (!stored) throw new Error('No refresh token available')
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: stored }),
  })
  if (!res.ok) {
    const text = await res.text()
    let message = 'Session expired. Please sign in again.'
    if (text) {
      try {
        const err = JSON.parse(text)
        if (err.detail) message = err.detail
      } catch {
        if (text.length < 200) message = text
      }
    }
    throw new Error(message)
  }
  const json = await res.json()
  const data = unwrap<any>(json)
  if (!data?.token) throw new Error('Refresh failed')
  setToken(data.token)
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return { token: data.token, refresh_token: data.refresh_token }
}

export async function authRegister(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE}/auth/register`, {
    email,
    password,
    name,
  })
}

export async function authMe(): Promise<AuthMeResponse> {
  return get<AuthMeResponse>(`${API_BASE}/auth/me`)
}

export async function checkProvider(
  email: string
): Promise<ProviderCheckResponse> {
  return get<ProviderCheckResponse>(
    `${API_BASE}/auth/check-provider?email=${encodeURIComponent(email)}`
  )
}

// ─── Admin Account Provisioning ──────────────────────────────────────────

export interface CreateAccountRequest {
  name: string
  email: string
  role: 'new_dev' | 'developer' | 'tester' | 'hr'
  team_id?: string
  message?: string
}

export interface CreateAccountResponse {
  success: boolean
  uid: string
  email: string
  name: string
  role: string
  temp_password: string
  team_id?: string
}

export async function createAccount(
  data: CreateAccountRequest
): Promise<CreateAccountResponse> {
  return request<CreateAccountResponse>(`${API_BASE}/admin/accounts/create`, data)
}

export interface BulkCreateRow {
  name: string
  email: string
  role: string
  team_id?: string
}

export interface BulkCreateResponse {
  success: boolean
  created: Array<{ email: string; uid: string; temp_password: string; role: string }>
  skipped: Array<{ email: string; reason: string }>
  total_created: number
  total_skipped: number
}

export interface CsvPreviewRow {
  row_number: number
  name: string
  email: string
  role: string
  valid: boolean
  error?: string
}

export interface CsvPreviewResponse {
  rows: CsvPreviewRow[]
  total_valid: number
  total_errors: number
}

export async function previewCsv(csvData: string): Promise<CsvPreviewResponse> {
  return request<CsvPreviewResponse>(`${API_BASE}/admin/accounts/preview-csv`, { csv_data: csvData })
}

export async function createAccountsBulk(rows: BulkCreateRow[]): Promise<BulkCreateResponse> {
  return request<BulkCreateResponse>(`${API_BASE}/admin/accounts/create-bulk`, { rows })
}

// ── OAuth Social Login ─────────────────────────────────────────────────────

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/auth/oauth/google/login`
}

export function getGithubLoginUrl(): string {
  return `${API_BASE}/auth/oauth/github/login`
}

// ── SSO / SAML ──────────────────────────────────────────────────────────────

export interface SsoProvider {
  idp_type: string
  name: string
  description: string
}

export interface SsoConfig {
  team_id: string
  idp_type: string
  entity_id: string
  sso_url: string
  x509_cert: string
  domain: string
  metadata_xml?: string
  active: boolean
  created_at: string
  updated_at: string
}

export async function fetchSsoProviders(): Promise<{ providers: SsoProvider[] }> {
  return get<{ providers: SsoProvider[] }>(`${API_BASE}/auth/sso/providers`)
}

export async function configureSso(config: {
  team_id: string
  idp_type: string
  entity_id?: string
  sso_url?: string
  x509_cert?: string
  domain: string
  metadata_xml?: string
}): Promise<SsoConfig> {
  return request<SsoConfig>(`${API_BASE}/auth/sso/configure`, config)
}

export async function getSsoConfig(teamId: string): Promise<SsoConfig> {
  return get<SsoConfig>(`${API_BASE}/auth/sso/config/${teamId}`)
}

export async function deleteSsoConfig(teamId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/auth/sso/config/${teamId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function testSsoConnection(teamId: string): Promise<{ success: boolean; errors?: string[] }> {
  return request<{ success: boolean; errors?: string[] }>(`${API_BASE}/auth/sso/test`, { team_id: teamId })
}

// ── Password Reset ─────────────────────────────────────────────────────────

export interface ForgotPasswordResponse {
  ok: boolean
  message: string
}

export interface ResetPasswordResponse {
  ok: boolean
  message: string
}

export async function forgotPassword(
  email: string
): Promise<ForgotPasswordResponse> {
  return request<ForgotPasswordResponse>(`${API_BASE}/auth/forgot-password`, {
    email,
  })
}

export async function resetPassword(
  token: string,
  password: string
): Promise<ResetPasswordResponse> {
  return request<ResetPasswordResponse>(`${API_BASE}/auth/reset-password`, {
    token,
    password,
  })
}

// ── Invites ────────────────────────────────────────────────────

export interface TeamInvite {
  id: string
  team_id: string
  email: string
  invited_by: string
  token: string
  role: string
  status: string
  message: string
  expires_at: string
  created_at: string
  team_name?: string
}

export function createTeamInvite(teamId: string, email: string, role = 'member', message?: string) {
  return request<{ invite_id: string; token: string; email: string; status: string }>(
    `${API_BASE}/invites/teams/${teamId}`,
    { email, role, message }
  )
}

export function listTeamInvites(teamId: string) {
  return get<{ invites: TeamInvite[]; count: number }>(`${API_BASE}/invites/teams/${teamId}`)
}

export function cancelTeamInvite(teamId: string, inviteId: string) {
  return request<{ cancelled: boolean }>(`${API_BASE}/invites/teams/${teamId}/invites/${inviteId}`, {}, 'DELETE')
}

export function acceptInvite(token: string) {
  return request<{ success: boolean; team_id: string; team_name: string; role: string }>(
    `${API_BASE}/invites/accept?token=${encodeURIComponent(token)}`
  )
}

export function myPendingInvites() {
  return get<{ invites: TeamInvite[]; count: number }>(`${API_BASE}/invites/me`)
}

// ─── Quizzes ────────────────────────────────────────────────────────

export interface QuizQuestion {
  question_id: string
  question_type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'code_review' | 'matching'
  question_text: string
  options: string[]
  correct_answer?: string
  explanation?: string
  difficulty: string
  related_files: string[]
}

export interface GenerateQuizResponse {
  quiz_id: string
  mode: string
  module: string
  total_questions: number
  questions: QuizQuestion[]
}

export interface SubmitAnswerResult {
  question_id: string
  correct: boolean
  correct_answer: string
  user_answer: string
  feedback: string
}

export interface SubmitQuizResponse {
  result_id: string
  quiz_id: string
  score: number
  total: number
  percentage: number
  passed: boolean
  results: SubmitAnswerResult[]
  summary: string
}

export interface QuizSummary {
  quiz_id: string
  mode: string
  module: string
  difficulty: string
  total_questions: number
  created_at: string
}

export async function generateQuiz(data: {
  mode: 'module' | 'repo'
  module_name?: string
  repo_structure: Record<string, unknown>
  num_questions?: number
  difficulty?: string
}): Promise<GenerateQuizResponse> {
  return request<GenerateQuizResponse>(`${API_BASE}/quiz/generate`, {
    mode: data.mode,
    module_name: data.module_name,
    repo_structure: data.repo_structure,
    num_questions: data.num_questions ?? 5,
    difficulty: data.difficulty ?? 'mixed',
  })
}

export async function getQuiz(quizId: string): Promise<GenerateQuizResponse> {
  return get<GenerateQuizResponse>(`${API_BASE}/quiz/${quizId}`)
}

export async function getQuizWithAnswers(quizId: string): Promise<GenerateQuizResponse> {
  return get<GenerateQuizResponse>(`${API_BASE}/quiz/${quizId}/answers`)
}

export async function submitQuizAnswers(
  quizId: string,
  answers: Record<string, string>
): Promise<SubmitQuizResponse> {
  return request<SubmitQuizResponse>(`${API_BASE}/quiz/${quizId}/submit`, { answers })
}

export async function listQuizzes(params?: {
  module?: string
  limit?: number
}): Promise<{ quizzes: QuizSummary[] }> {
  const query = new URLSearchParams()
  if (params?.module) query.set('module', params.module)
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return get<{ quizzes: QuizSummary[] }>(`${API_BASE}/quiz${qs ? '?' + qs : ''}`)
}

export interface QuizResultEntry {
  result_id: string
  quiz_id: string
  user_id: string
  module: string
  answers: Record<string, string>
  score: number
  total: number
  percentage: number
  passed: boolean
  results: SubmitAnswerResult[]
  summary: string
  submitted_at: string
}

export async function getQuizResults(quizId: string): Promise<{
  quiz_id: string
  results: QuizResultEntry[]
  attempts: number
  best_score: number
}> {
  return get<{
    quiz_id: string
    results: QuizResultEntry[]
    attempts: number
    best_score: number
  }>(`${API_BASE}/quiz/${quizId}/results`)
}

// ─── Onboarding Plans (30-60-90 Day) ─────────────────────────────────────────

export interface OnboardingMilestone {
  id: string
  plan_id: string
  day_target: number
  title: string
  description: string | null
  category: string
  is_completed: boolean
  completed_at: string | null
  sort_order: number
}

export interface PreBoardingTask {
  id: string
  plan_id: string
  title: string
  description: string | null
  assignee: string
  is_required: boolean
  is_completed: boolean
  completed_at: string | null
  sort_order: number
}

export interface PulseSurvey {
  id: string
  plan_id: string
  week_number: number
  confidence_score: number | null
  clarity_score: number | null
  support_score: number | null
  workload_score: number | null
  sentiment: string | null
  open_feedback: string | null
  submitted_at: string | null
}

export interface OnboardingPlan {
  id: string
  team_id: string
  user_id: string
  created_by: string | null
  start_date: string
  buddy_id: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
  milestones: OnboardingMilestone[]
  pre_boarding_tasks: PreBoardingTask[]
  pulse_surveys: PulseSurvey[]
}

export async function createOnboardingPlan(data: {
  team_id: string
  user_id: string
  start_date?: string
  buddy_id?: string
  notes?: string
}): Promise<OnboardingPlan> {
  return request<OnboardingPlan>(`${API_BASE}/onboarding-plans`, data)
}

export async function listOnboardingPlans(params?: {
  team_id?: string
  user_id?: string
}): Promise<OnboardingPlan[]> {
  const query = new URLSearchParams()
  if (params?.team_id) query.set('team_id', params.team_id)
  if (params?.user_id) query.set('user_id', params.user_id)
  const qs = query.toString()
  return get<OnboardingPlan[]>(`${API_BASE}/onboarding-plans${qs ? '?' + qs : ''}`)
}

export async function getOnboardingPlan(planId: string): Promise<OnboardingPlan> {
  return get<OnboardingPlan>(`${API_BASE}/onboarding-plans/${planId}`)
}

export async function updateOnboardingPlan(planId: string, data: Partial<{
  status: string
  buddy_id: string
  notes: string
  start_date: string
}>): Promise<OnboardingPlan> {
  return request<OnboardingPlan>(`${API_BASE}/onboarding-plans/${planId}`, data, 'PATCH')
}

export async function submitPulse(planId: string, data: {
  week_number: number
  confidence_score: number
  clarity_score: number
  support_score: number
  workload_score: number
  sentiment: string
  open_feedback?: string
}): Promise<PulseSurvey> {
  return request<PulseSurvey>(`${API_BASE}/onboarding-plans/${planId}/pulse`, data)
}

export async function getPulseTrends(planId: string): Promise<{
  pulses: PulseSurvey[]
  trends: Record<string, number | null>
}> {
  return get<{ pulses: PulseSurvey[]; trends: Record<string, number | null> }>(
    `${API_BASE}/onboarding-plans/${planId}/pulse-trends`
  )
}

export async function completeMilestone(milestoneId: string): Promise<OnboardingMilestone> {
  return request<OnboardingMilestone>(
    `${API_BASE}/onboarding-plans/milestones/${milestoneId}/complete`, {}
  )
}

export async function completePreBoardingTask(taskId: string): Promise<PreBoardingTask> {
  return request<PreBoardingTask>(
    `${API_BASE}/onboarding-plans/pre-boarding/${taskId}/complete`, {}
  )
}

export async function getTeamPulseOverview(teamId: string): Promise<{
  members: Array<{
    user_id: string
    plan_id: string
    week_number: number
    confidence_score: number | null
    sentiment: string | null
    submitted_at: string | null
  }>
}> {
  return get(`${API_BASE}/onboarding-plans/team/${teamId}/pulse-overview`)
}

// ─── AI Onboarding Wiki Generator ───────────────────────────────────────────

export interface WikiResponse {
  repo: string
  sections: string[]
  content: string
  generated_at: string
  stats: {
    stars: number
    language: string
    open_issues: number
    first_issues_found: number
  }
}

export async function generateWiki(repoUrl: string): Promise<WikiResponse> {
  return request<WikiResponse>(`${API_BASE}/wiki/generate`, { repo_url: repoUrl })
}

// ─── Feature Flags ──────────────────────────────────────────────────────

export interface FeatureFlag {
  id: string
  team_id: string
  flag_name: string
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FeatureFlagsResponse {
  flags: FeatureFlag[]
  count: number
}

export async function listFeatureFlags(teamId: string): Promise<FeatureFlagsResponse> {
  return get<FeatureFlagsResponse>(`${API_BASE}/feature-flags/${teamId}`)
}

export async function getFeatureFlag(teamId: string, flagName: string): Promise<FeatureFlag> {
  return get<FeatureFlag>(`${API_BASE}/feature-flags/${teamId}/${flagName}`)
}

export async function setFeatureFlag(teamId: string, flagName: string, enabled: boolean): Promise<FeatureFlag> {
  return request<FeatureFlag>(`${API_BASE}/feature-flags/${teamId}/${flagName}`, { enabled })
}

export async function deleteFeatureFlag(teamId: string, flagName: string): Promise<void> {
  return (await fetch(`${API_BASE}/feature-flags/${teamId}/${flagName}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })).json()
}

// ─── Playbook Marketplace ───────────────────────────────────────────────────

export interface MarketplaceRating {
  rating_id: string
  user_id: string
  rating: number
  comment?: string
  created_at?: string
}

export interface MarketplaceListing {
  listing_id: string
  source_playbook_id: string
  publisher_id: string
  publisher_name: string
  origin_team_id?: string | null
  title: string
  description: string
  steps: string[]
  tags: string[]
  import_count: number
  rating_avg: number
  rating_count: number
  published_at?: string
  updated_at?: string
  ratings?: MarketplaceRating[]
}

export type MarketplaceSort = 'popular' | 'top_rated' | 'newest'

export async function listMarketplacePlaybooks(params?: {
  search?: string
  tag?: string
  sort?: MarketplaceSort
  limit?: number
}): Promise<{ listings: MarketplaceListing[]; count: number }> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.tag) query.set('tag', params.tag)
  if (params?.sort) query.set('sort', params.sort)
  if (params?.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return get(`${API_BASE}/marketplace/playbooks${qs ? '?' + qs : ''}`)
}

export async function getMarketplaceListing(listingId: string): Promise<MarketplaceListing> {
  return get<MarketplaceListing>(`${API_BASE}/marketplace/playbooks/${listingId}`)
}

export async function publishPlaybook(sourcePlaybookId: string): Promise<MarketplaceListing> {
  return request<MarketplaceListing>(`${API_BASE}/marketplace/publish`, {
    source_playbook_id: sourcePlaybookId,
  })
}

export async function unpublishListing(listingId: string): Promise<{ unpublished: boolean }> {
  return request<{ unpublished: boolean }>(
    `${API_BASE}/marketplace/playbooks/${listingId}`,
    undefined,
    'DELETE',
  )
}

export async function importMarketplaceListing(
  listingId: string,
  teamId: string,
): Promise<{ imported_playbook: unknown; listing_id: string }> {
  return request(`${API_BASE}/marketplace/playbooks/${listingId}/import`, { team_id: teamId })
}

export async function rateMarketplaceListing(
  listingId: string,
  rating: number,
  comment = '',
): Promise<{ rating_avg: number; rating_count: number }> {
  return request(`${API_BASE}/marketplace/playbooks/${listingId}/rate`, { rating, comment })
}
