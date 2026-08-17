import { useTransition } from '../../context/TransitionContext'
import {
  SkeletonBase,
  SkeletonText,
  SkeletonHeading,
} from './Skeleton'
import { cn } from '../../lib/utils'

export default function TransitionOverlay() {
  const { isTransitioning } = useTransition()

  return (
    <div
      className={cn(
        'absolute inset-0 z-30 transition-opacity duration-200 ease-out pointer-events-none',
        isTransitioning
          ? 'opacity-100'
          : 'opacity-0'
      )}
      aria-hidden="true"
    >
      {/* Solid seated backdrop (no glass) */}
      <div className="absolute inset-0 bg-panel" />

      {/* Skeleton content */}
      <div className="relative z-10 p-6 space-y-6 animate-in">
        <SkeletonHeading />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card border-seam">
              <SkeletonText className="w-16 h-3" />
              <SkeletonBase className="h-8 w-12 mt-2" />
              <SkeletonText className="w-20 h-3 mt-2" />
            </div>
          ))}
        </div>
        <div className="card border-seam space-y-3">
          <SkeletonBase className="h-5 w-36" />
          {[...Array(3)].map((_, i) => (
            <SkeletonBase key={i} className="h-12 w-full rounded-btn" />
          ))}
        </div>
      </div>
    </div>
  )
}
