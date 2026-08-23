import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/test-utils'
import RetentionCurvesPanel from './RetentionCurvesPanel'

const { mockListTeams, mockCohortRetention, mockAuthMe } = vi.hoisted(() => ({
  mockListTeams: vi.fn(),
  mockCohortRetention: vi.fn(),
  mockAuthMe: vi.fn(),
}))

vi.mock(import('../../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listTeams: mockListTeams,
    fetchCohortRetention: mockCohortRetention,
    authMe: mockAuthMe,
  }
})

// setup.ts stubs getToken to always return null ("no signed-in session") —
// override it here so AuthProvider runs the full init (authMe → listTeams)
// and the role resolves from the mocked team.
vi.mock(import('../../lib/neon-auth'), () => ({
  getToken: () => 'test-token',
  setWsToken: vi.fn(),
  clearTokens: vi.fn(),
  getRefreshToken: () => null,
  getWsToken: () => 'test-token',
}))

/** Two cohorts: Jan retains 67% at 180d, the newer Feb cohort 80% → improving. */
const RETENTION = {
  cohorts: [
    {
      cohort: '2026-01',
      label: 'Jan 2026',
      member_count: 3,
      series: [
        { day: 30, retained_pct: 100, active_pct: 66.7 },
        { day: 60, retained_pct: 66.7, active_pct: 33.3 },
        { day: 90, retained_pct: 66.7, active_pct: 33.3 },
        { day: 120, retained_pct: 66.7, active_pct: 33.3 },
        { day: 180, retained_pct: 66.7, active_pct: 33.3 },
      ],
    },
    {
      cohort: '2026-02',
      label: 'Feb 2026',
      member_count: 4,
      series: [
        { day: 30, retained_pct: 100, active_pct: 75 },
        { day: 60, retained_pct: 100, active_pct: 50 },
        { day: 90, retained_pct: 100, active_pct: 50 },
        { day: 120, retained_pct: 100, active_pct: 50 },
        { day: 180, retained_pct: 80, active_pct: 50 },
      ],
    },
  ],
  team_id: 't1',
  generated_at: '2026-08-01T00:00:00Z',
}

function mockAuthRole(role: string, teamId = 't1') {
  mockListTeams.mockResolvedValue({
    teams: [{ team_id: teamId, role, name: 'Alpha' }],
  })
}

describe('RetentionCurvesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Signed-in session (neon-auth.getToken is mocked to return a token), so
    // AuthProvider runs initAuth → authMe → syncRoleFromTeams(listTeams).
    mockAuthMe.mockResolvedValue({ uid: 'u1', email: 'hr@test.com', name: 'HR' })
  })

  it('renders the newest cohort curves and the across-cohort 180d trend for a leader', async () => {
    mockAuthRole('cto')
    mockCohortRetention.mockResolvedValue(RETENTION)
    render(<RetentionCurvesPanel />)

    await waitFor(() => {
      expect(screen.getByText('Cohort Retention · Survival')).toBeInTheDocument()
    })
    // Data-driven content (the rail renders before the fetch resolves, so wait).
    await waitFor(() => {
      // Newest cohort is charted (header) and listed (180d footer row).
      expect(screen.getAllByText(/Feb 2026/).length).toBeGreaterThan(0)
      // Trend reads improving because the newest cohort retains ≥ the oldest
      // ("improving" lives in a nested span, so assert it separately).
      expect(screen.getByText('improving')).toBeInTheDocument()
    })
    // Per-cohort 180d retention bars (66.7 → 67%, 80% unique vs Y-axis ticks).
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    // Fetched with the resolved team scope.
    expect(mockCohortRetention).toHaveBeenCalledWith('t1')
  })

  it('shows the empty state when no cohorts exist yet', async () => {
    mockAuthRole('hr', 't2')
    mockCohortRetention.mockResolvedValue({ cohorts: [], team_id: 't2', generated_at: '' })
    render(<RetentionCurvesPanel />)

    await waitFor(() => {
      expect(screen.getByText(/No cohorts yet/)).toBeInTheDocument()
    })
    expect(mockCohortRetention).toHaveBeenCalledWith('t2')
  })

  it('stays hidden (and skips the fetch) for non-leader roles', async () => {
    mockAuthRole('junior_dev', 't3')
    render(<RetentionCurvesPanel />)

    // Let the auth role resolve from listTeams before asserting.
    await waitFor(() => expect(mockListTeams).toHaveBeenCalled())
    await waitFor(() => {
      expect(screen.queryByText('Cohort Retention · Survival')).not.toBeInTheDocument()
    })
    expect(mockCohortRetention).not.toHaveBeenCalled()
  })
})
