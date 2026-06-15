import { SkeletonAvatar } from './Skeleton'

/**
 * Skeleton placeholder that mirrors the real `<TopBar />` structure.
 */
export default function TopBarSkeleton() {
  return (
    <header className="h-14 border-b border-border bg-bg-primary flex items-center justify-end px-6">
      <SkeletonAvatar />
    </header>
  )
}
