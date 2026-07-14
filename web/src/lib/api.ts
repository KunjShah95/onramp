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
import { getToken } from './neon-auth'

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/** Unwrap the backend's `{success, data}` response envelope. */
function unwrap<T>(json: any): T {
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return json.data as T
  }
  return json as T
}

async function request<T>(url: string, body?: Record<string, unknown>, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method || 'POST',
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    throw new Error('Authentication required. Please sign in again.')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return unwrap<T>(await res.json())
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  if (res.status === 401) {
    throw new Error('Authentication required. Please sign in again.')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return unwrap<T>(await res.json())
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

export async function listTiers(): Promise<{ tiers: any[] }> {
  return get<{ tiers: any[] }>(`${API_BASE}/ai/tiers`)
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

export async function adminGetUsage(period?: string): Promise<AdminUsageResponse> {
  const qs = period ? `?period=${period}` : ''
  return get<AdminUsageResponse>(`${API_BASE}/admin/usage${qs}`)
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

// ─── Notifications ──────────────────────────────────────────────────────────

export interface CodeFlowNotification {
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
  notifications: CodeFlowNotification[]
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

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface AuthResponse {
  uid: string
  email: string
  name: string
  provider: string
  token: string
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
  password: string
): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE}/auth/login`, { email, password })
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
