import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/test-utils'
import DoraMetricsPanel from './DoraMetricsPanel'

const { mockListTeams, mockDora, mockVelocity, mockThroughput, mockAuthMe } = vi.hoisted(() => ({
  mockListTeams: vi.fn().mockResolvedValue({ teams: [{ id: 't1', team_id: 't1', name: 'Alpha' }] }),
  mockDora: vi.fn().mockResolvedValue({
    overall_score: 75,
    metrics: {
      deployment_frequency: { classification: 'elite', value: '3x/week' },
      lead_time_for_changes: { classification: 'high', value: '1 day' },
      change_failure_rate: { classification: 'medium', value: '5%' },
      mttr: { classification: 'low', value: '2h' },
    },
  }),
  mockVelocity: vi.fn().mockResolvedValue({ trends: [] }),
  mockThroughput: vi.fn().mockResolvedValue({ members: [] }),
  mockAuthMe: vi.fn().mockRejectedValue(new Error('No session')),
}))

vi.mock(import('../../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    authMe: mockAuthMe,
    listTeams: mockListTeams,
    fetchDoraSummary: mockDora,
    fetchVelocityTrends: mockVelocity,
    fetchTeamThroughput: mockThroughput,
  }
})

describe('DoraMetricsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the four DORA metric badges from the summary', async () => {
    render(<DoraMetricsPanel />)
    await waitFor(() => {
      expect(screen.getByText('Deploy Frequency')).toBeInTheDocument()
      expect(screen.getByText('Lead Time')).toBeInTheDocument()
      expect(screen.getByText('Change Failure Rate')).toBeInTheDocument()
      expect(screen.getByText('MTTR')).toBeInTheDocument()
    })
  })
})
