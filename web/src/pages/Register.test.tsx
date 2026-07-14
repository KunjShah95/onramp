import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Register from './Register'

// Mock API auth functions used by AuthContext
const { mockAuthRegister } = vi.hoisted(() => ({
  mockAuthRegister: vi.fn().mockResolvedValue({
    uid: '1', email: 'test@test.com', name: 'Test User', provider: 'password', token: 'test-token',
  }),
}))
vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    authRegister: mockAuthRegister,
    authMe: vi.fn().mockRejectedValue(new Error('No session')),
    listTeams: vi.fn().mockResolvedValue({ teams: [] }),
  }
})

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the registration form', () => {
    render(<Register />)
    expect(screen.getByRole('heading', { name: /nexora/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('validates password length', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await user.type(screen.getByLabelText(/name/i), 'Test')
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm password/i), 'short')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => {
      expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument()
    })
  })

  it('calls auth register on valid submit', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => {
      expect(mockAuthRegister).toHaveBeenCalledWith('test@test.com', 'password123', 'Test User')
    })
  })

  it('navigates to login page link', () => {
    render(<Register />)
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})