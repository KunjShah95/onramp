import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import JoinPage from './JoinPage'

vi.mock('../lib/api')

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})