import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import WaitlistPage from './WaitlistPage'

describe('WaitlistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the waitlist form', () => {
    render(<WaitlistPage />)
    expect(screen.getByRole('heading', { name: /join the waitlist/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/team size/i)).toBeInTheDocument()
  })

  it('shows validation error for missing fields', async () => {
    const user = userEvent.setup()
    render(<WaitlistPage />)
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/use case/i), 'Testing')
    await user.click(screen.getByRole('button', { name: /join waitlist/i }))
    await waitFor(() => {
      expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument()
    })
  })

  it('submits the form successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ position: 42, message: 'Welcome!' }),
    })
    const user = userEvent.setup()
    render(<WaitlistPage />)
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.selectOptions(screen.getByLabelText(/role/i), 'developer')
    await user.type(screen.getByLabelText(/company/i), 'Test Corp')
    await user.selectOptions(screen.getByLabelText(/team size/i), '1-10')
    await user.type(screen.getByLabelText(/use case/i), 'Testing')
    await user.click(screen.getByRole('button', { name: /join waitlist/i }))
    await waitFor(() => {
      expect(screen.getByText(/position #42/i)).toBeInTheDocument()
    })
  })

  it('shows error on failed submit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ detail: 'Email already registered' }),
    })
    const user = userEvent.setup()
    render(<WaitlistPage />)
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.selectOptions(screen.getByLabelText(/role/i), 'developer')
    await user.selectOptions(screen.getByLabelText(/team size/i), '1-10')
    await user.click(screen.getByRole('button', { name: /join waitlist/i }))
    await waitFor(() => {
      expect(screen.getByText(/email already registered/i)).toBeInTheDocument()
    })
  })
})