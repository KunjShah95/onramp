// @ts-nocheck — Pre-existing union type narrowing issues with authClient
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import { authClient } from '../lib/neon-auth'
import Login from './Login'

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authClient.signIn.email).mockResolvedValue({ data: { user: { id: '1', email: 'test@test.com' } } } as any)
  })

  it('renders the login form', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { name: /nexora/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows social sign-in buttons', () => {
    render(<Login />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
  })

  it('calls Neon Auth login on valid submit', async () => {
    const user = userEvent.setup()
    render(<Login />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(authClient.signIn.email).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' })
    })
  })

  it('navigates to register page link', () => {
    render(<Login />)
    expect(screen.getByRole('link', { name: /register/i })).toHaveAttribute('href', '/register')
  })
})