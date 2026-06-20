import type {
  ArchitectureResult,
  LearningPathResult,
  ScoredIssue,
  IssueGuide,
  QAResult,
  IndexResult,
  HistoryTurn,
} from './types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

let _idToken: string | null = null

export function setAuthToken(token: string | null) {
  _idToken = token
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_idToken) {
    headers['Authorization'] = `Bearer ${_idToken}`
  }
  return headers
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
  return res.json()
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
  return res.json()
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

export async function generateLearningPath(
  repoStructure: Record<string, unknown>,
  userLevel: string
): Promise<LearningPathResult> {
  return request<LearningPathResult>(`${API_BASE}/learn/path`, {
    repo_structure: repoStructure,
    user_level: userLevel,
  })
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
  wiki: { pages: number }
  drift: { issues: number }
  tech_debt: { total: number }
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
  return request<Playbook>(`${API_BASE}/playbooks/${playbookId}`, data)
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
    data
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
  revoked: boolean
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
  period: string
  total_credits: number
  endpoints: Record<string, number>
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
  return request<WorkflowTask>(`${API_BASE}/tasks/${taskId}`, data)
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
  return request<NotificationPreferences>(`${API_BASE}/notifications/preferences`, data)
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
  return request<Webhook>(`${API_BASE}/integrations/webhooks/${webhookId}`, data)
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
  return request<IntegrationConfig>(`${API_BASE}/integrations/${integrationType}`, { config })
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

export interface AuthRegisterResponse {
  uid: string
  email: string
  name: string
  provider: string
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

export async function authRegister(
  idToken: string,
  provider: string
): Promise<AuthRegisterResponse> {
  return request<AuthRegisterResponse>(`${API_BASE}/auth/register`, {
    id_token: idToken,
    provider,
  })
}

export async function authMe(
  idToken: string
): Promise<AuthMeResponse> {
  const saved = _idToken
  _idToken = idToken
  try {
    return await get<AuthMeResponse>(`${API_BASE}/auth/me`)
  } finally {
    _idToken = saved
  }
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
