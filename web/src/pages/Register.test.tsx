// @ts-nocheck — Pre-existing union type narrowing issues with authClient
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import { authClient } from '../lib/neon-auth'
import Register from './Register'

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authClient.signUp.email).mockResolvedValue({ data: { user: { id: '1', email: 'test@test.com' } } } as any)
  })

  it('renders the registration form', () => {
    render(<Register />)
    expect(screen.getByRole('heading', { name: /nexora/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('shows social sign-up buttons', () => {
    render(<Register />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
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

  it('calls Neon Auth register on valid submit', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => {
      expect(authClient.signUp.email).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123', name: 'Test User' })
    })
  })

  it('navigates to login page link', () => {
    render(<Register />)
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})