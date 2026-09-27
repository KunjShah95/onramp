import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderSettled, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import ForgotPassword from './ForgotPassword'

// Mock forgotPassword used by AuthContext, plus checkProvider which the page
// calls first to detect accounts that can never receive a reset email.
const { mockForgotPassword, mockCheckProvider, mockResend } = vi.hoisted(() => ({
  mockForgotPassword: vi.fn().mockRejectedValue(new Error('Password reset is not available. Contact your administrator.')),
  mockCheckProvider: vi.fn(),
  mockResend: vi.fn(),
}))
vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    forgotPassword: mockForgotPassword,
    checkProvider: mockCheckProvider,
    resendForgotPassword: mockResend,
  }
})

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: not an OAuth account. The backend returns registered=false for
    // both unknown addresses and password accounts, so this is what a normal
    // email-password user looks like.
    mockCheckProvider.mockResolvedValue({ email: 'x', registered: false, provider: null })
  })

  it('renders the forgot password form', async () => {
    await renderSettled(<ForgotPassword />)
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('shows error on submit (password reset not available)', async () => {
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      // AuthContext.resetPassword calls api.forgotPassword which now rejects
      // Error text appears in both the inline error div and the toast notification
      expect(screen.getAllByText(/contact your administrator/i).length).toBeGreaterThan(0)
    })
  })

  it('links back to sign in', async () => {
    await renderSettled(<ForgotPassword />)
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  // ── OAuth accounts ──────────────────────────────────────────────────────
  // The backend never emails a reset link to a non-password account, so
  // showing "check your email" for one is a promise that cannot be kept.

  it('routes a Google account to Google instead of claiming an email was sent', async () => {
    mockCheckProvider.mockResolvedValue({ email: 'a@b.com', registered: true, provider: 'google' })
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /this account uses google/i })).toBeInTheDocument()
    })
    // No reset email was sent, so nothing should claim one was.
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
    expect(mockForgotPassword).not.toHaveBeenCalled()
  })

  it('offers the provider sign-in link for a GitHub account', async () => {
    mockCheckProvider.mockResolvedValue({ email: 'a@b.com', registered: true, provider: 'github' })
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /this account uses github/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /continue with github/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/auth/oauth/github/login'),
    )
  })

  it('sends a normal reset for a password account', async () => {
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalled()
    })
    expect(screen.queryByRole('heading', { name: /this account uses/i })).not.toBeInTheDocument()
  })

  it('still attempts the reset when the provider lookup fails', async () => {
    // A lookup outage must never become a new way to lock someone out.
    mockCheckProvider.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalled()
    })
    expect(screen.queryByRole('heading', { name: /this account uses/i })).not.toBeInTheDocument()
  })

  // ── Delivery failures ────────────────────────────────────────────────────
  // The backend sets delivery:'failed' only when the account exists and the
  // mail provider refused the message. Claiming success there is a lie the
  // user discovers 10 minutes later, staring at an empty inbox.

  it('reports a real delivery failure instead of claiming an email was sent', async () => {
    mockForgotPassword.mockResolvedValue({
      ok: true,
      message: 'If an account exists, a reset link has been sent.',
      delivery: 'failed',
    })
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /couldn't send that email/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })

  it('offers a support route when delivery fails', async () => {
    mockForgotPassword.mockResolvedValue({ ok: true, message: 'sent', delivery: 'failed' })
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /email support/i })).toHaveAttribute(
        'href',
        'mailto:support@onramp.ai',
      )
    })
    expect(screen.getByRole('link', { name: /contact form/i })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('button', { name: /try sending again/i })).toBeInTheDocument()
  })

  it('stays on the failure screen when a retry also fails', async () => {
    mockForgotPassword.mockResolvedValue({ ok: true, message: 'sent', delivery: 'failed' })
    mockResend.mockResolvedValue({ ok: true, message: 'sent', delivery: 'failed' })
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /couldn't send that email/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /try sending again/i }))
    await waitFor(() => {
      expect(mockResend).toHaveBeenCalled()
    })
    // A failed retry must not flip us to a success screen.
    expect(screen.getByRole('heading', { name: /couldn't send that email/i })).toBeInTheDocument()
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })

  it('does not show a failure screen when delivery is fine', async () => {
    mockForgotPassword.mockResolvedValue({ ok: true, message: 'sent' })
    const user = userEvent.setup()
    await renderSettled(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    })
    expect(mockForgotPassword).toHaveBeenCalledTimes(1)
  })
})
