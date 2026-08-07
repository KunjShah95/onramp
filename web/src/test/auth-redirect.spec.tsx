import { describe, it, expect } from 'vitest'
import { homeForRole } from '../context/AuthContext'

describe('homeForRole (post-login landing page)', () => {
  it('sends HR to their people page', () => {
    expect(homeForRole('hr')).toBe('/hr/people')
  })

  it('sends juniors to My Progress', () => {
    expect(homeForRole('new_dev')).toBe('/my-progress')
    expect(homeForRole('member')).toBe('/my-progress')
  })

  it('defaults everyone else (and null/unknown roles) to the dashboard', () => {
    for (const role of ['tester', 'developer', 'senior_dev', 'senior', 'owner', 'ceo', 'cto'] as const) {
      expect(homeForRole(role)).toBe('/dashboard')
    }
    expect(homeForRole(null)).toBe('/dashboard')
    expect(homeForRole(undefined)).toBe('/dashboard')
  })
})
