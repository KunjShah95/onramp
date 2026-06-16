import axios, { AxiosInstance } from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CodeFlowConfig {
  apiKey: string;
  baseUrl?: string;
  org?: string;
}

interface ArchitectureResult {
  repo: string;
  entities: { files: any[]; classes: any[]; functions: any[]; imports: any[] };
  services: { name: string; files: string[]; description: string }[];
  dependencies: Record<string, string[]>;
  circular_dependencies: string[][];
  architecture_pattern: string;
  architecture_diagram: string;
}

interface LearningPathResult {
  user_level: string;
  total_estimated_hours: number;
  path: {
    order: number;
    name: string;
    files: string[];
    time_hours: number;
    objectives: string[];
    description: string;
  }[];
}

interface ScoredIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  complexity_score: number;
  estimated_hours: number;
}

interface IssueGuide {
  issue_id: number;
  title: string;
  files_to_touch: string[];
  steps: string[];
  similar_prs: { url: string; title: string; merged: boolean }[];
}

interface HealthScore {
  overall_score: number;
  test_coverage: number;
  documentation: number;
  dependency_freshness: number;
  complexity: string;
  maintainability: number;
  recommendations: string[];
}

interface OnboardingReport {
  repo: string;
  user_level: string;
  report: { title: string; type: string; content: any }[];
}

interface QAResult {
  answer: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class CodeFlow {
  private client: AxiosInstance;

  constructor(config: CodeFlowConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.codeflow.ai/v1',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        'X-Org': config.org || 'default',
      },
      timeout: 30000,
    });
  }

  // ─── Architecture Explorer ──────────────────────────────────────────────

  async explore(repo: string, branch = 'main'): Promise<ArchitectureResult> {
    const { data } = await this.client.post('/explore/analyze', { repo_url: repo, branch });
    return data;
  }

  // ─── Learning Path Generator ────────────────────────────────────────────

  async generateLearningPath(
    repoStructure: Record<string, unknown>,
    userLevel = 'junior'
  ): Promise<LearningPathResult> {
    const { data } = await this.client.post('/learn/path', {
      repo_structure: repoStructure,
      user_level: userLevel,
    });
    return data;
  }

  // ─── First PR Accelerator ───────────────────────────────────────────────

  async findIssues(repoUrl: string, userLevel = 'junior'): Promise<{ issues: ScoredIssue[] }> {
    const { data } = await this.client.post('/first-pr/issues', {
      repo_url: repoUrl,
      user_level: userLevel,
    });
    return data;
  }

  async generateGuide(
    issueId: number,
    repoStructure: Record<string, unknown>
  ): Promise<IssueGuide> {
    const { data } = await this.client.post('/first-pr/guide', {
      issue_id: issueId,
      repo_structure: repoStructure,
    });
    return data;
  }

  // ─── Repository Q&A ─────────────────────────────────────────────────────

  async indexRepo(repoPath: string): Promise<{ index_id: string }> {
    const { data } = await this.client.post('/ask/index', { repo_path: repoPath });
    return data;
  }

  async ask(indexId: string, question: string): Promise<QAResult> {
    const { data } = await this.client.post('/ask/query', {
      index_id: indexId,
      question,
    });
    return data;
  }

  // ─── Health Score ───────────────────────────────────────────────────────

  async getHealth(owner: string, repo: string, repoStructure: any): Promise<HealthScore> {
    const { data } = await this.client.post(`/repos/${owner}/${repo}/health`, {
      owner,
      repo,
      repo_structure: repoStructure,
    });
    return data;
  }

  // ─── Onboarding Reports ─────────────────────────────────────────────────

  async generateReport(repoUrl: string, userLevel = 'junior'): Promise<OnboardingReport> {
    const { data } = await this.client.post('/reports/generate', {
      repo_url: repoUrl,
      user_level: userLevel,
    });
    return data;
  }

  // ─── Silent Pair Programming ────────────────────────────────────────────

  async pairWalkthrough(
    issueTitle: string,
    issueBody: string,
    repoStructure: any
  ): Promise<any> {
    const { data } = await this.client.post('/pair/walkthrough', {
      issue_title: issueTitle,
      issue_body: issueBody,
      repo_structure: repoStructure,
    });
    return data;
  }

  // ─── Pattern Recognition ────────────────────────────────────────────────

  async findPatterns(pattern: string, repoStructure: any): Promise<any> {
    const { data } = await this.client.post('/patterns/find-similar', {
      pattern,
      repo_structure: repoStructure,
    });
    return data;
  }

  // ─── Test Checklist ─────────────────────────────────────────────────────

  async generateTestChecklist(prDiff: string, repoStructure: any): Promise<any> {
    const { data } = await this.client.post('/test-checklist/generate', {
      pr_diff: prDiff,
      repo_structure: repoStructure,
    });
    return data;
  }
}

export default CodeFlow;
