import { SkeletonBase, SkeletonText, SkeletonAvatar } from './Skeleton'

/**
 * Skeleton placeholder that mirrors the real `<Sidebar />` structure.
 *
 * Kept in sync with the real sidebar so the loading state has the
 * same dimensions and visual rhythm — no layout shift when auth resolves.
 */
export default function SidebarSkeleton() {
  return (
    <aside className="w-[260px] min-h-screen bg-bg-secondary border-r border-border flex flex-col shrink-0">
      {/* Logo area */}
      <div className="px-6 py-5 border-b border-border">
        <SkeletonBase className="h-7 w-28" />
      </div>

      {/* Navigation items */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {['Dashboard', 'Explore', 'Learn', 'Issues', 'Ask'].map((label) => (
          <div
            key={label}
            className="flex items-center gap-3 px-3 py-2 rounded-btn"
          >
            <SkeletonBase className="h-4 w-4 shrink-0" />
            <SkeletonText className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* User info area */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <SkeletonAvatar />
          <div className="space-y-1.5 flex-1">
            <SkeletonText className="w-24 h-3" />
            <SkeletonText className="w-32 h-2.5" />
          </div>
        </div>
      </div>

      {/* Bottom links area */}
      <div className="px-3 py-4 border-t border-border space-y-1">
        {['Settings', 'Profile', 'Sign Out'].map((label) => (
          <div
            key={label}
            className="px-3 py-2 rounded-btn"
          >
            <SkeletonText className="h-4 w-16" />
          </div>
        ))}
      </div>
    </aside>
  )
}
