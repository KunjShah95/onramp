import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import { acceptInvite } from '../lib/api'
import JoinPage from './JoinPage'

vi.mock('../lib/api')

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    render(<JoinPage />)
    expect(screen.getByText(/joining team/i)).toBeInTheDocument()
  })

  it('shows error when no token in URL', async () => {
    render(<JoinPage />)
    await waitFor(() => {
      expect(screen.getByText(/invite error/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/no invite token found/i)).toBeInTheDocument()
  })

  it('shows success state when acceptInvite resolves', async () => {
    vi.mocked(acceptInvite).mockResolvedValue({ team_name: 'Test Team', team_id: '1', role: 'member' } as any)
    const originalSearchParams = window.location.search
    Object.defineProperty(window, 'location', {
      value: { search: '?token=test-token-123' },
      writable: true,
    })
    render(<JoinPage />)
    await waitFor(() => {
      expect(screen.getByText(/welcome/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Test Team/)).toBeInTheDocument()
    Object.defineProperty(window, 'location', { value: { search: originalSearchParams }, writable: true })
  })

  it('shows error when acceptInvite rejects', async () => {
    vi.mocked(acceptInvite).mockRejectedValue(new Error('Invalid token'))
    const originalSearchParams = window.location.search
    Object.defineProperty(window, 'location', {
      value: { search: '?token=bad-token' },
      writable: true,
    })
    render(<JoinPage />)
    await waitFor(() => {
      expect(screen.getByText(/invite error/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/invalid token/i)).toBeInTheDocument()
    Object.defineProperty(window, 'location', { value: { search: originalSearchParams }, writable: true })
  })
})