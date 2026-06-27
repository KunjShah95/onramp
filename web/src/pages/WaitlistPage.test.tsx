import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../test/test-utils'
import WaitlistPage from './WaitlistPage'

describe('WaitlistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the waitlist form heading', () => {
    render(<WaitlistPage />)
    expect(screen.getByRole('heading', { name: /be first to transform/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/full name/i)).toBeInTheDocument()
  })

  it('shows coming soon badge', () => {
    render(<WaitlistPage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})