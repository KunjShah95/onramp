import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent } from '../test/test-utils'
import Register from './Register'
import { createUserWithEmailAndPassword } from 'firebase/auth'

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(await screen.findByRole('textbox', { name: /^name/i }), 'Test User')
    await user.type(await screen.findByRole('textbox', { name: /email address/i }), 'test@example.com')
    await user.type(await screen.findByLabelText(/^password/i), 'password123')
    await user.type(await screen.findByLabelText(/confirm password/i), 'password123')
  }

  it('renders all form fields and Create Account button', async () => {
    render(<Register />)

    expect(await screen.findByRole('textbox', { name: /^name/i })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: /email address/i })).toBeInTheDocument()
    expect(await screen.findByLabelText(/^password/i)).toBeInTheDocument()
    expect(await screen.findByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('shows validation error when passwords do not match', async () => {
    const user = userEvent.setup()
    render(<Register />)

    await user.type(await screen.findByRole('textbox', { name: /^name/i }), 'Test User')
    await user.type(await screen.findByRole('textbox', { name: /email address/i }), 'test@example.com')
    await user.type(await screen.findByLabelText(/^password/i), 'password123')
    await user.type(await screen.findByLabelText(/confirm password/i), 'different')
    await user.click(await screen.findByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
  })

  it('calls createUserWithEmailAndPassword on successful submit', async () => {
    const user = userEvent.setup()
    render(<Register />)

    await fillForm(user)
    await user.click(await screen.findByRole('button', { name: /create account/i }))

    await vi.waitFor(() => {
      expect(vi.mocked(createUserWithEmailAndPassword)).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123',
      )
    })
  })
})
