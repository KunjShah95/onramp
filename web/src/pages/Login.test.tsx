import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Login from './Login'

// Mock API auth functions used by AuthContext
const { mockAuthLogin } = vi.hoisted(() => ({
  mockAuthLogin: vi.fn().mockResolvedValue({
    uid: '1', email: 'test@test.com', name: 'Test', provider: 'password', token: 'test-token',
  }),
}))
vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    authLogin: mockAuthLogin,
    authMe: vi.fn().mockRejectedValue(new Error('No session')),
    listTeams: vi.fn().mockResolvedValue({ teams: [] }),
  }
})

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login form (two-stage: email → password)', () => {
    render(<Login />)
    // Stage 1: email prompt + continue CTA
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('calls auth login on valid submit', async () => {
    const user = userEvent.setup()
    render(<Login />)
    // Stage 1 — submit email to advance to password
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    // Stage 2 — password + final sign-in
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(mockAuthLogin).toHaveBeenCalledWith('test@test.com', 'password123', true)
    })
  })

  it('navigates to register page link', () => {
    render(<Login />)
    expect(screen.getByRole('link', { name: /create free account/i })).toHaveAttribute('href', '/register')
  })
})
