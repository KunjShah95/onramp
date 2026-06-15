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
              <div key={i} className="card border-border/30">
                <SkeletonText className="w-16 h-3" />
                <SkeletonBase className="h-8 w-12 mt-2" />
                <SkeletonText className="w-20 h-3 mt-2" />
              </div>
            ))}
          </div>
          <div className="card border-border/30 space-y-3">
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
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
