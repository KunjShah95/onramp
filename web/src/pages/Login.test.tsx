import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import { signInWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth'
import Login from './Login'

vi.mock('firebase/auth')

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchSignInMethodsForEmail).mockResolvedValue([])
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: { uid: '1', email: 'test@test.com' } } as any)
  })

  it('renders the login form', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { name: /codeflow 2\.0/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows social sign-in buttons', () => {
    render(<Login />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup()
    render(<Login />)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByLabelText(/email/i)).toBeInvalid()
  })

  it('calls Firebase login on valid submit', async () => {
    const user = userEvent.setup()
    render(<Login />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalled()
    })
  })

  it('displays error on failed login', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(new Error('auth/invalid-credentials'))
    const user = userEvent.setup()
    render(<Login />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials|login failed/i)).toBeInTheDocument()
    })
  })

  it('navigates to register page link', () => {
    render(<Login />)
    expect(screen.getByRole('link', { name: /register/i })).toHaveAttribute('href', '/register')
  })
})