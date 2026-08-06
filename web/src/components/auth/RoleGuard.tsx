import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

import type { TeamRole } from '../../context/AuthContext'

interface RoleGuardProps {
  allowedRoles?: TeamRole[]
  minRole?: TeamRole
}

const ROLE_LEVELS: Partial<Record<TeamRole, number>> = {
  new_dev: 1,
  member: 1,
  tester: 2,
  hr: 3,
  developer: 3,
  senior_dev: 4,
  senior: 4,
  cto: 5,
  ceo: 5,
  owner: 5,
}

export default function RoleGuard({ allowedRoles, minRole }: RoleGuardProps) {
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

  const roleLevel = (r: string | null): number => (r ? ROLE_LEVELS[r as TeamRole] ?? 0 : 0)

  let hasAccess = false

  if (allowedRoles) {
    hasAccess = role ? allowedRoles.includes(role) : false
  } else if (minRole) {
    hasAccess = roleLevel(role) >= roleLevel(minRole)
  } else {
    hasAccess = true
  }

  if (!hasAccess) {
    if (role === 'new_dev' || role === 'member') {
      return <Navigate to="/my-progress" replace />
    }
    if (role === 'hr') {
      return <Navigate to="/hr/people" replace />
    }
    // No team / unknown role — send to an ungated page instead of looping on /dashboard
    if (!role) {
      return <Navigate to="/explore" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
