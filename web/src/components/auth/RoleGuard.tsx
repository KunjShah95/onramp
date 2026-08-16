import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

import type { TeamRole } from '../../context/AuthContext'

interface RoleGuardProps {
  allowedRoles?: TeamRole[]
  minRole?: TeamRole
  /** Allow users with no team membership (role === null) through. Used on
   *  /dashboard, where a first-run welcome replaces the mission console. */
  allowNoTeam?: boolean
}

const ROLE_LEVELS: Partial<Record<TeamRole, number>> = {
  junior_dev: 1,
  member: 1,
  tester: 2,
  hr: 3,
  developer: 3,
  senior_dev: 4,
  senior: 4,
  cto: 5,
  ceo: 5,
  admin: 5,
}

const roleLevel = (r: string | null): number => (r ? ROLE_LEVELS[r as TeamRole] ?? 0 : 0)

/** Pure access decision — exported for unit tests. */
export function resolveGuardAccess(opts: {
  role: string | null
  allowedRoles?: TeamRole[]
  minRole?: TeamRole
  allowNoTeam?: boolean
}): boolean {
  const { role, allowedRoles, minRole, allowNoTeam } = opts
  if (allowedRoles) {
    return role ? allowedRoles.includes(role as TeamRole) : !!allowNoTeam
  }
  if (minRole) {
    return roleLevel(role) >= roleLevel(minRole)
  }
  return true
}

export default function RoleGuard({ allowedRoles, minRole, allowNoTeam }: RoleGuardProps) {
  const { role, loading, user } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center font-mono text-text-muted">
        Authenticating role permissions...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!resolveGuardAccess({ role, allowedRoles, minRole, allowNoTeam })) {
    if (role === 'junior_dev' || role === 'member') {
      return <Navigate to="/my-progress" replace />
    }
    if (role === 'hr') {
      return <Navigate to="/hr/people" replace />
    }
    // No team / unknown role — /dashboard is allowNoTeam and renders the
    // first-run welcome, so send them there instead of an ungated page.
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
