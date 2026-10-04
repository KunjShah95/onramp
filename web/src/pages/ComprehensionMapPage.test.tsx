import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import ComprehensionMapPage from './ComprehensionMapPage'

const api = vi.hoisted(() => ({
  fetchRepos: vi.fn(),
  fetchComprehensionMap: vi.fn(),
  fetchWalkthroughs: vi.fn(),
  fetchFactChecks: vi.fn(),
  gradeFactChecks: vi.fn(),
  completeWalkthrough: vi.fn(),
  createWalkthrough: vi.fn(),
  reverifyWalkthrough: vi.fn(),
  deleteWalkthrough: vi.fn(),
  fetchComprehensionTeam: vi.fn(),
  fetchStarterIssues: vi.fn(),
  fetchChangeImpact: vi.fn(),
  fetchPrImpact: vi.fn(),
  fetchModuleContext: vi.fn(),
}))

vi.mock('../lib/api', () => ({ ...api, authMe: async () => null }))

// The D3 canvas isn't under test; expose nodes as buttons so clicks can drive the page.
vi.mock('../components/ForceGraph', () => ({
  default: ({ nodes, onNodeClick, nodeStates }: {
    nodes: { id: string }[]
    onNodeClick: (n: { id: string }) => void
    nodeStates: Record<string, string>
  }) => (
    <div data-testid="graph">
      {nodes.map((n) => (
        <button key={n.id} data-state={nodeStates[n.id]} onClick={() => onNodeClick(n)}>node:{n.id}</button>
      ))}
    </div>
  ),
}))

const node = (id: string, over: Record<string, unknown> = {}) => ({
  id, group: 'app', files: [], fan_in: 2, fan_out: 1, critical: false, state: 'fog',
  lit_source: null, lit_at: null, checkable: true, failed_attempts: 0, ...over,
})

function mapResponse(overrides: Record<string, unknown> = {}) {
  return {
    nodes: [node('app/core.py', { critical: true, fan_in: 3 }), node('app/api.py')],
    edges: [{ source: 'app/api.py', target: 'app/core.py' }],
    critical_path: ['app/core.py'],
    next_up: 'app/core.py',
    progress: { critical_total: 1, critical_lit: 0, critical_pct: 0, overall_total: 2, overall_lit: 0, changed: 0 },
    snapshot: { commit: 'abc1234def', built_at: '2026-09-30T00:00:00Z' },
    branch: 'main',
    is_senior: false,
    ...overrides,
  }
}

function impact(over: Record<string, unknown> = {}) {
  return {
    changed_modules: ['app/core.py'], affected_modules: ['app/api.py'], blast_radius: 1,
    touches_critical: ['app/core.py'], unmapped_files: [], knowledge_gaps: [],
    reviewers: [{ uid: 's', name: 'Sam', understands_changed: ['app/core.py'], understands_affected: 1, score: 3 }],
    ...over,
  }
}

describe('ComprehensionMapPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/map?owner=acme&repo=shop')
    api.fetchRepos.mockResolvedValue({ repos: [{ id: 'r1', owner: 'acme', name: 'shop' }] })
    api.fetchComprehensionMap.mockResolvedValue(mapResponse())
    api.fetchWalkthroughs.mockResolvedValue({ walkthroughs: [], coverage_gaps: ['app/core.py'], can_author: false })
    api.fetchStarterIssues.mockResolvedValue({ issues: [], labelled_good_first_issue: true })
    api.fetchChangeImpact.mockResolvedValue(impact())
    api.fetchModuleContext.mockResolvedValue({
      node: 'app/core.py',
      who: { wrote: [{ name: 'Ann', commits: 3 }], understands: ['Sam'], bus_factor: 1 },
      why: {
        history: [{ sha: 'b2', author: 'Ann', date: '1700000200', subject: 'Split pricing rules', pr_number: 42, pr_url: 'https://github.com/acme/shop/pull/42' }],
        decisions: [{ path: 'docs/adr/0003-pricing.md', title: 'Pricing lives in core', excerpt: 'Rules stay here' }],
        walkthrough_notes: [],
        discussions: [{ path: 'app/core.py', author: 'rev', body: 'Keep pricing pure so the API stays thin.', line: 12, created_at: '2026-09-02', pr_number: 9, pr_url: 'https://github.com/acme/shop/pull/9' }],
      },
      has_history: true,
    })
  })

  it('opens on the next critical module and grades a fact check', async () => {
    const user = userEvent.setup()
    api.fetchFactChecks.mockResolvedValue({
      node: 'app/core.py',
      locked_for_seconds: 0,
      questions: [{ id: 'importers:app/core.py', node: 'app/core.py', kind: 'importers', prompt: 'Which of these depend directly on `app/core.py`? Select all that apply.', options: ['app/api.py', 'app/cli.py'] }],
    })
    api.gradeFactChecks.mockResolvedValue({ passed: true, results: [{ id: 'importers:app/core.py', correct: true, answer: ['app/api.py'] }] })

    render(<ComprehensionMapPage />)
    expect(await screen.findByText('Understand app/core.py')).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /check my understanding/i }))
    await user.click(await screen.findByLabelText('app/api.py'))
    await user.click(screen.getByRole('button', { name: /check answers/i }))

    await waitFor(() => expect(api.gradeFactChecks).toHaveBeenCalledWith(
      'acme', 'shop', 'app/core.py', { 'importers:app/core.py': ['app/api.py'] },
    ))
    // A pass refetches the map so the node lights up.
    await waitFor(() => expect(api.fetchComprehensionMap).toHaveBeenCalledTimes(2))
  })

  it('plays a walkthrough and completes it', async () => {
    const user = userEvent.setup()
    api.fetchWalkthroughs.mockResolvedValue({
      can_author: false,
      coverage_gaps: [],
      walkthroughs: [{
        id: 'w1', title: 'Request path', summary: '', branch: 'main', author_uid: 's', author_name: 'Sam',
        steps: [
          { node: 'app/api.py', note: 'Start here', status: 'fresh' },
          { node: 'app/core.py', note: 'Where the rules live', status: 'changed' },
        ],
        stale: true, stale_steps: 1, completed: false, completed_count: 0, pinned_commit: 'c', created_at: '', updated_at: '',
      }],
    })
    api.completeWalkthrough.mockResolvedValue({ lit: ['app/api.py'], skipped_stale: 1, walkthrough: {} })

    render(<ComprehensionMapPage />)
    await user.click(await screen.findByRole('button', { name: 'Request path' }))
    expect(screen.getByText('Start here')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/code here changed after this step was recorded/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /finish tour/i }))
    await waitFor(() => expect(api.completeWalkthrough).toHaveBeenCalledWith('acme', 'shop', 'w1'))
  })

  it('lets a senior record a walkthrough by clicking modules', async () => {
    const user = userEvent.setup()
    api.fetchComprehensionMap.mockResolvedValue(mapResponse({ is_senior: true }))
    api.fetchWalkthroughs.mockResolvedValue({ walkthroughs: [], coverage_gaps: ['app/core.py'], can_author: true })
    api.fetchComprehensionTeam.mockResolvedValue({
      members: [{ uid: 'j', name: 'June', critical_lit: 0, critical_total: 1, critical_pct: 0, overall_lit: 0, changed: 0, updated_at: null }],
      stuck: [{ node: 'app/core.py', failed_checks: 4, developers: 2, critical: true }],
      critical_path: ['app/core.py'],
      bus_factor: [{ node: 'app/core.py', count: 1, understood_by: ['Sam'] }],
    })
    api.createWalkthrough.mockResolvedValue({})

    render(<ComprehensionMapPage />)
    expect(await screen.findByText('Where people get stuck')).toBeInTheDocument()
    expect(screen.getByText('4 misses · 2 devs')).toBeInTheDocument()
    expect(screen.getByText('only Sam')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /record/i }))
    const graph = screen.getByTestId('graph')
    await user.click(within(graph).getByText('node:app/api.py'))
    await user.click(within(graph).getByText('node:app/core.py'))
    await user.type(screen.getByPlaceholderText(/title/i), 'Request path')
    await user.click(screen.getByRole('button', { name: /publish walkthrough/i }))

    await waitFor(() => expect(api.createWalkthrough).toHaveBeenCalledWith('acme', 'shop', {
      title: 'Request path',
      summary: '',
      steps: [{ node: 'app/api.py', note: '' }, { node: 'app/core.py', note: '' }],
    }))
  })

  it('points to Explore when the repo has no graph yet', async () => {
    api.fetchComprehensionMap.mockRejectedValue(new Error('No architecture snapshot yet. Build the graph from Explore first.'))
    render(<ComprehensionMapPage />)
    expect(await screen.findByText('No map for this repository yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /build the graph in explore/i })).toHaveAttribute('href', '/explore?owner=acme&repo=shop')
  })

  it('ranks safe first tasks and explains unknown radius', async () => {
    api.fetchStarterIssues.mockResolvedValue({
      labelled_good_first_issue: false,
      issues: [
        { number: 3, title: 'Typo in cli', url: 'https://x/3', labels: [], modules: ['app/cli.py'], known_modules: ['app/cli.py'], unknown_modules: [], touches_critical: false, blast_radius: 0, reason: 'Touches only modules you understand; 0 module(s) depend on them.' },
        { number: 1, title: 'Refactor', url: 'https://x/1', labels: [], modules: [], known_modules: [], unknown_modules: [], touches_critical: false, blast_radius: null, reason: "Doesn't name a file, so its blast radius is unknown." },
      ],
    })
    // test-utils shares one QueryClient; a fresh repo avoids the cached (5 min) issue list.
    window.history.pushState({}, '', '/map?owner=acme&repo=fresh')
    render(<ComprehensionMapPage />)
    expect(await screen.findByText(/Typo in cli/)).toBeInTheDocument()
    expect(screen.getByText('radius 0')).toBeInTheDocument()
    expect(screen.getByText('radius ?')).toBeInTheDocument()
    expect(screen.getByText(/No "good first issue" labels/)).toBeInTheDocument()
  })

  it('shows what breaks and who understands it for a selected module and a PR', async () => {
    const user = userEvent.setup()
    api.fetchFactChecks.mockResolvedValue({ node: 'app/core.py', locked_for_seconds: 0, questions: [] })
    api.fetchPrImpact.mockResolvedValue({ ...impact({ reviewers: [], knowledge_gaps: ['app/core.py'] }), pr_number: 42, files: ['app/core.py'] })

    render(<ComprehensionMapPage />)
    await user.click(await screen.findByText('node:app/core.py'))
    expect(await screen.findByText('1 module can break')).toBeInTheDocument()
    expect(screen.getByText('1 changed · 1 affected')).toBeInTheDocument() // Sam as reviewer
    expect(api.fetchChangeImpact).toHaveBeenCalledWith('acme', 'shop', { nodes: ['app/core.py'] })

    // Why / who layer
    expect(await screen.findByText('Pricing lives in core')).toBeInTheDocument()
    expect(screen.getByText(/Only one person on the team understands this module/)).toBeInTheDocument()
    expect(screen.getByText('Wrote it: Ann (3)')).toBeInTheDocument()
    expect(screen.getByText('Keep pricing pure so the API stays thin.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PR #9' })).toHaveAttribute('href', 'https://github.com/acme/shop/pull/9')
    expect(screen.getByRole('link', { name: /PR #42/ })).toHaveAttribute('href', 'https://github.com/acme/shop/pull/42')

    await user.type(screen.getByLabelText('Pull request number'), '#42')
    await user.click(screen.getByRole('button', { name: /analyze/i }))
    expect(await screen.findByText(/#42 changes 1 module/)).toBeInTheDocument()
    expect(screen.getByText(/Nobody on the team has shown they understand this yet/)).toBeInTheDocument()
    expect(api.fetchPrImpact).toHaveBeenCalledWith('acme', 'shop', 42)
  })
})
