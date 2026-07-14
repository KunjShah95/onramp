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

  it('renders the login form', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { name: /nexora/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls auth login on valid submit', async () => {
    const user = userEvent.setup()
    render(<Login />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(mockAuthLogin).toHaveBeenCalledWith('test@test.com', 'password123')
    })
  })

  it('navigates to register page link', () => {
    render(<Login />)
    expect(screen.getByRole('link', { name: /register/i })).toHaveAttribute('href', '/register')
  })
})