import { describe, it, expect } from 'vitest'
import { homeForRole } from '../context/AuthContext'
import { resolveGuardAccess } from '../components/auth/RoleGuard'
import type { TeamRole } from '../context/AuthContext'

describe('homeForRole (post-login landing page)', () => {
  it('sends HR to their people page', () => {
    expect(homeForRole('hr')).toBe('/hr/people')
  })

  it('sends juniors to My Progress', () => {
    expect(homeForRole('junior_dev')).toBe('/my-progress')
    expect(homeForRole('member')).toBe('/my-progress')
  })

  it('defaults everyone else (and null/unknown roles) to the dashboard', () => {
    for (const role of ['tester', 'developer', 'senior_dev', 'senior', 'admin', 'ceo', 'cto'] as const) {
      expect(homeForRole(role)).toBe('/dashboard')
    }
    expect(homeForRole(null)).toBe('/dashboard')
    expect(homeForRole(undefined)).toBe('/dashboard')
  })
})

describe('resolveGuardAccess (route permission check)', () => {
  const LEADERSHIP: TeamRole[] = ['tester', 'developer', 'senior_dev', 'senior', 'admin', 'ceo', 'cto']

  it('denies no-team users by default', () => {
    expect(resolveGuardAccess({ role: null, allowedRoles: LEADERSHIP })).toBe(false)
  })

  it('admits no-team users when allowNoTeam is set (first-run dashboard)', () => {
    expect(resolveGuardAccess({ role: null, allowedRoles: LEADERSHIP, allowNoTeam: true })).toBe(true)
  })

  it('keeps real roles working', () => {
    expect(resolveGuardAccess({ role: 'ceo', allowedRoles: LEADERSHIP })).toBe(true)
    expect(resolveGuardAccess({ role: 'junior_dev', allowedRoles: LEADERSHIP })).toBe(false)
  })

  it('honours minRole', () => {
    expect(resolveGuardAccess({ role: 'developer', minRole: 'senior' })).toBe(false)
    expect(resolveGuardAccess({ role: 'ceo', minRole: 'senior' })).toBe(true)
  })
})
