import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent } from '../test/test-utils'
import Login from './Login'
import { signInWithEmailAndPassword } from 'firebase/auth'

const getEmailInput = () => screen.findByRole('textbox', { name: /email address/i })
const getPasswordInput = () => screen.findByLabelText(/password/i)
const getSignInButton = () => screen.findByRole('button', { name: /sign in/i })

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email, password fields and Sign In button', async () => {
    render(<Login />)

    expect(await getEmailInput()).toBeInTheDocument()
    expect(await getPasswordInput()).toBeInTheDocument()
    expect(await getSignInButton()).toBeInTheDocument()
  })

  it('calls signInWithEmailAndPassword on successful submit', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await user.type(await getEmailInput(), 'test@example.com')
    await user.type(await getPasswordInput(), 'secret123')
    await user.click(await getSignInButton())

    await vi.waitFor(() => {
      expect(vi.mocked(signInWithEmailAndPassword)).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'secret123',
      )
    })
  })

  it('renders error message on failed login', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(
      new Error('auth/invalid-credential'),
    )

    const user = userEvent.setup()
    render(<Login />)

    await user.type(await getEmailInput(), 'test@example.com')
    await user.type(await getPasswordInput(), 'wrong')
    await user.click(await getSignInButton())

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
  })
})
