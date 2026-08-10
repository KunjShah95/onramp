import { describe, it, expect, vi } from 'vitest'
import { render, screen } from './test-utils'

vi.mock(import('../lib/api'), async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => {
      if (typeof value === 'function') return [key, vi.fn().mockResolvedValue({})]
      return [key, value]
    })
  )
})

import DashboardPage from '../pages/DashboardPage'
import FirstRunDashboard from '../components/dashboard/FirstRunDashboard'

describe('First-run dashboard for new users', () => {
  it('renders the welcome experience with the four next steps', () => {
    render(<FirstRunDashboard />)
    expect(screen.getByText(/welcome aboard/i)).toBeTruthy()
    expect(screen.getByText('All systems ready')).toBeTruthy()
    expect(screen.getAllByText('Create your team').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Explore a repository')).toBeTruthy()
    expect(screen.getByText('Start onboarding plan')).toBeTruthy()
    expect(screen.getByText('Learn fundamentals')).toBeTruthy()
  })

  it('shows the welcome experience instead of Mission Control when the user has no team', async () => {
    // AuthProvider has no session → role/activeTeamId are null → fresh-user branch.
    render(<DashboardPage />)
    expect(await screen.findByText(/welcome aboard/i)).toBeTruthy()
    expect(screen.queryByText('Mission Control')).toBeNull()
  })

  it('adapts the first step when the user already has an empty team', () => {
    render(<FirstRunDashboard hasTeam />)
    expect(screen.getByText('Your team is ready')).toBeTruthy()
    expect(screen.getByText('Invite team members')).toBeTruthy()
    expect(screen.queryByText('Create your team')).toBeNull()
  })
})
