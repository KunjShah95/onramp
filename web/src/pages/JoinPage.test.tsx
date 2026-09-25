import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import JoinPage from './JoinPage'
import { acceptInvite, listTeams } from '../lib/api'

vi.mock('../lib/api')

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/')
    vi.mocked(acceptInvite).mockResolvedValue({
      success: true,
      team_id: 'team-invited',
      team_name: 'Invited Team',
      role: 'member',
    })
    vi.mocked(listTeams).mockResolvedValue({
      teams: [{ team_id: 'team-invited', name: 'Invited Team', role: 'member' }],
    } as any)
  })

  it('renders without crashing', async () => {
    render(<JoinPage />)
    await waitFor(() => {
      expect(screen.getByText(/invite error|joining team/i)).toBeInTheDocument()
    })
  })

  it('shows error when no token in URL', async () => {
    render(<JoinPage />)
    await waitFor(() => {
      expect(screen.getByText(/no invite token found/i)).toBeInTheDocument()
    })
  })

  it('activates the accepted team instead of keeping the first team selection', async () => {
    window.history.pushState({}, '', '/join?token=invite-123')
    render(<JoinPage />)

    await waitFor(() => expect(screen.getByText(/welcome!/i)).toBeInTheDocument())
    expect(vi.mocked(listTeams)).toHaveBeenCalledWith('current-user')
    expect(window.localStorage.getItem('onramp.activeTeamId.current-user')).toBe('team-invited')
  })
})