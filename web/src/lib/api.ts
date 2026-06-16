import type {
  ArchitectureResult,
  LearningPathResult,
  ScoredIssue,
  IssueGuide,
  QAResult,
  IndexResult,
} from './types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

let _idToken: string | null = null

export function setAuthToken(token: string | null) {
  _idToken = token
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_idToken) {
    headers['Authorization'] = `Bearer ${_idToken}`
  }
  return headers
}

async function request<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
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

export interface CTOResponse {
  total_repos: number
  tech_debt: number
  drift_issues: number
  wiki_pages: number
  actions: CTOAction[]
  services: CTOService[]
}

export interface TeamMember {
  name: string
  repos: number
  analyses: number
  contribution: string
}

export interface TeamResponse {
  members: TeamMember[]
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

export interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
}

export interface TasksResponse {
  tasks: TaskItem[]
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

export async function fetchCTODashboard(): Promise<CTOResponse> {
  return get<CTOResponse>(`${API_BASE}/dashboard/cto`)
}

export async function fetchTeamAnalytics(): Promise<TeamResponse> {
  return get<TeamResponse>(`${API_BASE}/dashboard/team`)
}

export async function fetchRoadmap(): Promise<RoadmapResponse> {
  return get<RoadmapResponse>(`${API_BASE}/roadmap`)
}

export async function fetchTasks(): Promise<TasksResponse> {
  return get<TasksResponse>(`${API_BASE}/tasks`)
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
  await fetch(`${API_BASE}/teams/${teamId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, role }),
  })
}

export async function removeTeamMember(
  teamId: string,
  user: string
): Promise<void> {
  await fetch(`${API_BASE}/teams/${teamId}/members/${user}`, {
    method: 'DELETE',
  })
}

export async function changeTeamTier(
  teamId: string,
  tier: string
): Promise<void> {
  await fetch(`${API_BASE}/teams/${teamId}/tier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  await fetch(`${API_BASE}/playbooks/${playbookId}`, { method: 'DELETE' })
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
  })
}

export async function attachStripe(
  teamId: string,
  stripeCustomerId: string
): Promise<Subscription> {
  return request<Subscription>(
    `${API_BASE}/billing/subscriptions/${teamId}/stripe`,
    { stripe_customer_id: stripeCustomerId }
  )
}

export async function listPricing(): Promise<{ tiers: PricingTier[] }> {
  return get<{ tiers: PricingTier[] }>(`${API_BASE}/billing/pricing`)
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
  await fetch(`${API_BASE}/ai/keys/${keyId}`, { method: 'DELETE' })
}

export async function validateApiKey(
  rawKey: string
): Promise<{ valid: boolean; org_name: string; tier: string }> {
  return get<{ valid: boolean; org_name: string; tier: string }>(
    `${API_BASE}/ai/keys/validate/${rawKey}`
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
