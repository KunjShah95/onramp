import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent } from '../test/test-utils'
import ForgotPassword from './ForgotPassword'
import { sendPasswordResetEmail } from 'firebase/auth'

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email field and Send Reset Link button', async () => {
    render(<ForgotPassword />)

    expect(await screen.findByRole('textbox', { name: /email address/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('shows sent state after successful submit', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />)

    await user.type(await screen.findByRole('textbox', { name: /email address/i }), 'test@example.com')
    await user.click(await screen.findByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(vi.mocked(sendPasswordResetEmail)).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
    )
  })

  it('shows error message when reset fails', async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(
      new Error('auth/user-not-found'),
    )

    const user = userEvent.setup()
    render(<ForgotPassword />)

    await user.type(await screen.findByRole('textbox', { name: /email address/i }), 'unknown@example.com')
    await user.click(await screen.findByRole('button', { name: /send reset link/i }))

    const errors = await screen.findAllByText('No account found with this email')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })
})
