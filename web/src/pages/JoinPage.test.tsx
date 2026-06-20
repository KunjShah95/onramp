import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { ToastProvider } from '../context/ToastContext'
import JoinPage from './JoinPage'
import * as api from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>()
  return {
    ...mod,
    acceptInvite: vi.fn(),
  }
})

function renderWithRoute(path: string) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/join" element={<JoinPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  )
}

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error when no invite token is present', async () => {
    renderWithRoute('/join')

    expect(await screen.findByText(/no invite token found/i)).toBeInTheDocument()
  })

  it('shows success message when invite is accepted', async () => {
    vi.mocked(api.acceptInvite).mockResolvedValueOnce({
      success: true,
      team_id: 'team-1',
      team_name: 'Acme Corp',
      role: 'member',
    })

    renderWithRoute('/join?token=valid-token')

    expect(await screen.findByText(/welcome!/i)).toBeInTheDocument()
    const acmeElements = await screen.findAllByText(/acme corp/i)
    expect(acmeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows error message when invite fails', async () => {
    vi.mocked(api.acceptInvite).mockRejectedValueOnce(
      new Error('Invite has expired'),
    )

    renderWithRoute('/join?token=expired-token')

    expect(await screen.findByText(/invite error/i)).toBeInTheDocument()
    const errorElements = await screen.findAllByText('Invite has expired')
    expect(errorElements.length).toBeGreaterThanOrEqual(1)
  })
})
