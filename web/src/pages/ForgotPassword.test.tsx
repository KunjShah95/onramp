import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import ForgotPassword from './ForgotPassword'

// Mock forgotPassword used by AuthContext
const { mockForgotPassword } = vi.hoisted(() => ({
  mockForgotPassword: vi.fn().mockRejectedValue(new Error('Password reset is not available. Contact your administrator.')),
}))
vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    forgotPassword: mockForgotPassword,
  }
})

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the forgot password form', () => {
    render(<ForgotPassword />)
    expect(screen.getByRole('heading', { name: /nexora/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('shows error on submit (password reset not available)', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      // AuthContext.resetPassword calls api.forgotPassword which now rejects
      // Error text appears in both the inline error div and the toast notification
      expect(screen.getAllByText(/contact your administrator/i).length).toBeGreaterThan(0)
    })
  })

  it('links back to sign in', () => {
    render(<ForgotPassword />)
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})