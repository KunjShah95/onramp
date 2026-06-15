import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
}

export function SkeletonBase({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-skeleton rounded-md bg-bg-elevated/50',
        className
      )}
    />
  )
}

export function SkeletonText({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-4 w-full', className)} />
}

export function SkeletonTitle({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-6 w-48', className)} />
}

export function SkeletonHeading({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-8 w-64', className)} />
}

export function SkeletonBadge({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-5 w-16 rounded-full', className)} />
}

export function SkeletonButton({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-9 w-28 rounded-btn', className)} />
}

export function SkeletonInput({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-10 rounded-input', className)} />
}

export function SkeletonAvatar({ className }: SkeletonProps) {
  return <SkeletonBase className={cn('h-8 w-8 rounded-full', className)} />
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('card space-y-3 border-border/30', className)}>
      <SkeletonTitle />
      <SkeletonText />
      <SkeletonText className="w-3/4" />
    </div>
  )
}

export function SkeletonStatCard({ className }: SkeletonProps) {
  return (
    <div className={cn('card border-l-[3px] border-border', className)}>
      <SkeletonText className="w-20 h-3" />
      <SkeletonBase className="h-8 w-16 mt-2" />
      <SkeletonText className="w-24 h-3 mt-2" />
    </div>
  )
}

export function SkeletonListItem({ className }: SkeletonProps) {
  return (
    <div className={cn('flex items-center justify-between p-3 bg-bg-tertiary rounded-btn', className)}>
      <div className="space-y-1.5 flex-1 mr-4">
        <SkeletonText className="w-3/5" />
        <SkeletonText className="w-2/5 h-3" />
      </div>
      <SkeletonBadge />
    </div>
  )
}

export function SkeletonProgressBar({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <SkeletonBadge className="w-20" />
      <SkeletonTitle className="w-full" />
      <SkeletonBase className="h-2 w-full rounded-full" />
      <SkeletonText className="w-16 h-3" />
    </div>
  )
}

// ─── Composed skeleton layouts ──────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="animate-in max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <SkeletonHeading />
        <SkeletonButton />
      </div>
      <div className="mb-6">
        <SkeletonInput className="w-full" />
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card border-border/30">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1 mr-4">
                <SkeletonTitle />
                <SkeletonText className="w-1/3 h-3" />
              </div>
              <SkeletonBadge />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(count)].map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  )
}

export function ListPanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card space-y-3 border-border/30">
      <SkeletonTitle className="w-40" />
      <div className="space-y-3 mt-4">
        {[...Array(rows)].map((_, i) => (
          <SkeletonListItem key={i} />
        ))}
      </div>
    </div>
  )
}

export function MilestoneListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <SkeletonProgressBar key={i} />
      ))}
    </div>
  )
}

// ─── Page-specific skeleton layouts ────────────────────────────────────

export function AnalysisSkeleton() {
  return (
    <div className="animate-in">
      <SkeletonText className="w-32 h-4 mb-2" />
      <SkeletonHeading className="mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card border-border/30">
            <SkeletonTitle className="w-28" />
            <SkeletonBase className="h-8 w-20 mt-2" />
            <SkeletonText className="w-16 h-3 mt-2" />
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SkeletonButton />
      </div>
    </div>
  )
}

export function RepoAnalysisSkeleton() {
  return (
    <div className="animate-in">
      <SkeletonText className="w-24 h-4 mb-2" />
      <SkeletonHeading className="mb-6" />
      <div className="card border-border/30 space-y-4">
        <SkeletonTitle className="w-44" />
        <SkeletonText className="w-3/4" />
        <SkeletonText className="w-1/2" />
        <div className="space-y-3 mt-4">
          {[...Array(3)].map((_, i) => (
            <SkeletonBase key={i} className="h-16 w-full rounded-btn" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ExploreResultSkeleton() {
  return (
    <div className="animate-in space-y-6">
      <StatsGridSkeleton count={4} />
      <div className="card border-border/30">
        <div className="flex items-center justify-between">
          <SkeletonText className="w-32" />
          <SkeletonBadge />
        </div>
      </div>
      <div>
        <SkeletonText className="w-36 mb-3" />
        <SkeletonBase className="h-64 w-full rounded-card" />
      </div>
    </div>
  )
}

export function LearningPathSkeleton() {
  return (
    <div className="animate-in space-y-6">
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <SkeletonButton key={i} className="w-28" />
        ))}
      </div>
      <SkeletonBase className="h-32 w-full rounded-card" />
      <SkeletonButton className="w-44" />
      <MilestoneListSkeleton count={4} />
    </div>
  )
}

export function IssueListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      <SkeletonTitle className="w-44" />
      {[...Array(count)].map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  )
}

export function GuideSkeleton() {
  return (
    <div className="card border-border/30 space-y-4">
      <SkeletonTitle className="w-3/4" />
      <SkeletonText />
      <SkeletonText className="w-3/4" />
      <div className="flex flex-wrap gap-2">
        {[...Array(4)].map((_, i) => (
          <SkeletonBadge key={i} />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <SkeletonText key={i} className="w-5/6" />
        ))}
      </div>
    </div>
  )
}

export function ChatAreaSkeleton() {
  return (
    <div className="flex-1 bg-bg-tertiary rounded-card border border-border/30 p-4 flex flex-col gap-4">
      <SkeletonBase className="h-12 w-3/4 rounded-card" />
      <SkeletonBase className="h-20 w-1/2 rounded-card ml-auto" />
      <SkeletonBase className="h-16 w-2/3 rounded-card" />
      <SkeletonBase className="h-10 w-3/4 rounded-card ml-auto" />
      <div className="mt-auto">
        <SkeletonBase className="h-12 w-full rounded-card" />
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="animate-in max-w-lg space-y-6">
      <SkeletonHeading />
      {[...Array(2)].map((_, i) => (
        <div key={i} className="card border-border/30 space-y-4">
          <SkeletonTitle className="w-44" />
          <SkeletonBase className="h-5 w-48" />
          <SkeletonText className="w-28" />
          <SkeletonBase className="h-10 w-full rounded-input" />
        </div>
      ))}
      <SkeletonButton className="w-32" />
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="animate-in max-w-md">
      <SkeletonHeading />
      <div className="card mt-8 border-border/30">
        <div className="flex items-center gap-4 mb-6">
          <SkeletonBase className="h-16 w-16 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <SkeletonTitle className="w-32" />
            <SkeletonText className="w-44" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <SkeletonText className="w-20 h-3" />
            <SkeletonBase className="h-8 w-12" />
          </div>
          <div className="space-y-1">
            <SkeletonText className="w-24 h-3" />
            <SkeletonBase className="h-8 w-20" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingSkeleton() {
  return (
    <div className="animate-in">
      {/* Hero area */}
      <div className="flex flex-col items-center justify-center py-24 px-4 space-y-6">
        <SkeletonBadge className="w-24" />
        <SkeletonBase className="h-12 w-96 max-w-full" />
        <SkeletonText className="w-80 max-w-full" />
        <SkeletonText className="w-64 max-w-full" />
        <div className="flex gap-3 mt-4">
          <SkeletonButton className="w-32" />
          <SkeletonButton className="w-32" />
        </div>
      </div>
      {/* Features grid */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
      {/* How it works */}
      <div className="max-w-4xl mx-auto px-4 py-16 space-y-8">
        <SkeletonHeading className="mx-auto" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-6">
            <SkeletonBase className="h-16 w-16 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <SkeletonTitle />
              <SkeletonText className="w-3/4" />
            </div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div className="border-t border-border/30 py-8 px-4">
        <div className="max-w-6xl mx-auto flex justify-between">
          <SkeletonText className="w-32" />
          <div className="flex gap-4">
            <SkeletonText className="w-16" />
            <SkeletonText className="w-16" />
            <SkeletonText className="w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}
