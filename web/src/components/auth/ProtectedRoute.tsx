import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AppShell from '../layout/AppShell'
import SidebarSkeleton from '../ui/SidebarSkeleton'
import TopBarSkeleton from '../ui/TopBarSkeleton'
import {
  SkeletonBase,
  SkeletonText,
  SkeletonHeading,
} from '../ui/Skeleton'

function isSafeInternalPath(path: string): boolean {
  // Must be internal absolute path starting with single slash, not // or external scheme
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes(':')
}

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <AppShell sidebar={<SidebarSkeleton />} topbar={<TopBarSkeleton />}>
        <div className="max-w-3xl space-y-6 animate-in">
          <SkeletonHeading />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card border-seam/30">
                <SkeletonText className="w-16 h-3" />
                <SkeletonBase className="h-8 w-12 mt-2" />
                <SkeletonText className="w-20 h-3 mt-2" />
              </div>
            ))}
          </div>
          <div className="card border-seam/30 space-y-3">
            <SkeletonBase className="h-5 w-36" />
            {[...Array(3)].map((_, i) => (
              <SkeletonBase key={i} className="h-12 w-full rounded-btn" />
            ))}
          </div>
        </div>
      </AppShell>
    )
  }

  if (!user) {
    // Avoid redirect loop — if already on /login, don't push another redirect
    if (location.pathname === '/login') return <Outlet />
    // Sanitize state.from to prevent open redirect via //evil.com or https://evil.com
    const pathname = location.pathname || '/'
    const safeFrom = isSafeInternalPath(pathname) ? location : { pathname: '/', search: '', hash: '' }
    return <Navigate to="/login" state={{ from: safeFrom }} replace />
  }

  return <Outlet />
}
