import type {
  ArchitectureResult,
  LearningPathResult,
  ScoredIssue,
  IssueGuide,
  QAResult,
  IndexResult,
} from './types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

async function request<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
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
