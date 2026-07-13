import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

interface RoleGuardProps {
  allowedRoles?: Array<'owner' | 'developer' | 'senior' | 'member'>
  minRole?: 'owner' | 'developer' | 'senior' | 'member'
}

const ROLE_LEVELS = {
  member: 1,
  senior: 2,
  developer: 3,
  owner: 4,
}

export default function RoleGuard({ allowedRoles, minRole }: RoleGuardProps) {
  const { role, loading, user } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center font-mono text-[#FDFBF8]/40">
        Authenticating role permissions...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  let hasAccess = false

  if (allowedRoles) {
    hasAccess = role ? allowedRoles.includes(role) : false
  } else if (minRole) {
    const userLevel = role ? ROLE_LEVELS[role] : 0
    const requiredLevel = ROLE_LEVELS[minRole]
    hasAccess = userLevel >= requiredLevel
  } else {
    hasAccess = true
  }

  if (!hasAccess) {
    if (role === 'member') {
      return <Navigate to="/my-progress" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
