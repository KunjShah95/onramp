export interface FileAnalysis {
  path: string
  language: string
  classes: ClassDef[]
  functions: FuncDef[]
  imports: string[]
  exports: string[]
  dependencies: string[]
}

export interface ClassDef {
  name: string
  methods: string[]
  bases: string[]
  lineno: number
}

export interface FuncDef {
  name: string
  args: string[]
  decorators?: string[]
  lineno: number
}

export interface ArchitectureResult {
  repo: string
  entities: {
    files: FileAnalysis[]
    classes: ClassDef[]
    functions: FuncDef[]
    imports: ImportRef[]
    exports: ExportRef[]
  }
  services: ServiceInfo[]
  dependencies: Record<string, string[]>
  circular_dependencies: string[][]
  architecture_pattern: string
  architecture_diagram: string
}

export interface ServiceInfo {
  name: string
  files: string[]
  description: string
}

export interface ImportRef {
  module: string
  file: string
  language: string
}

export interface ExportRef {
  name: string
  file: string
  language: string
}

export interface LearningPathModule {
  order: number
  name: string
  files: string[]
  time_hours: number
  objectives: string[]
  description: string
}

export interface LearningPathResult {
  user_level: string
  total_estimated_hours: number
  path: LearningPathModule[]
}

export interface ScoredIssue {
  id: number
  number: number
  title: string
  body: string
  url: string
  labels: string[]
  complexity_score: number
  estimated_hours: number
}

export interface IssueGuide {
  issue_id: number
  title: string
  files_to_touch: string[]
  steps: string[]
  similar_prs: SimilarPR[]
}

export interface SimilarPR {
  url: string
  title: string
  merged: boolean
}

export interface QAResult {
  answer: string
}

export interface IndexResult {
  index_id: string
}

export interface HistoryTurn {
  id: string
  question: string
  answer: string
  created_at: string
  index_id?: string
  user_id?: string
}

export interface ProposedFix {
  file_path: string
  search_string: string
  replace_string: string
  reasoning: string
}

export interface AnalysisResult {
  root_cause: string
  affected_entities: string[]
  blast_radius: string
  confidence: number
}

export interface ResolveIssueRequest {
  repo_url: string
  issue_description: string
  branch?: string
}

export interface ResolveIssueResult {
  /** Whether the agent completed its run and opened a pull request. */
  success: boolean
  /** URL to the opened pull request (present when success is true). */
  pr_url?: string
  /** Pull request number (present when success is true). */
  pr_number?: number
  /** The branch the changes were pushed to. */
  branch?: string
  /** Human-readable summary written by the agent. */
  summary?: string
  /** Number of files touched by applied patches. */
  files_changed?: number
  /** Number of patches that committed cleanly. */
  patches_applied?: number
  /** Number of patches that failed to apply. */
  patches_failed?: number
  /** Failure message when success is false. */
  error?: string
  /** Legacy status string (kept for backward compatibility). */
  status?: string
  /** Raw patches produced by the agent (present on partial success). */
  applied_patches?: Array<{ file_path?: string; error?: string; commit_sha?: string }>
  analysis?: AnalysisResult
  fixes?: ProposedFix[]
  application?: Array<{ status: string; result?: unknown; error?: string }>
  validation?: string
}
