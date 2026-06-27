import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import { sendPasswordResetEmail } from 'firebase/auth'
import ForgotPassword from './ForgotPassword'

vi.mock('firebase/auth')

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)
  })

  it('renders the forgot password form', () => {
    render(<ForgotPassword />)
    expect(screen.getByRole('heading', { name: /codeflow/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('calls Firebase reset password on submit', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(sendPasswordResetEmail).toHaveBeenCalled()
    })
  })

  it('shows success message after sending', async () => {
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })
  })
})