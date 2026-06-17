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
