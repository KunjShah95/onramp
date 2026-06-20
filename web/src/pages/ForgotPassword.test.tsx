import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import { sendPasswordResetEmail } from 'firebase/auth'
import ForgotPassword from './ForgotPassword'

vi.mock('firebase/auth')

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)
  })

  it('renders the forgot password form', () => {
    render(<ForgotPassword />)
    expect(screen.getByRole('heading', { name: /codeflow 2\.0/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('calls Firebase reset password on submit', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(sendPasswordResetEmail).toHaveBeenCalled()
    })
  })

  it('shows success message after sending', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })
  })

  it('shows error on failed reset', async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(new Error('auth/invalid-email'))
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'invalid')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(screen.getByText(/failed to send reset email/i)).toBeInTheDocument()
    })
  })

  it('has link back to sign in', () => {
    render(<ForgotPassword />)
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login')
  })
})