import { cn } from '../../lib/utils'
import { SkeletonBase, SkeletonText, SkeletonHeading, SkeletonButton } from './Skeleton'

function SkeletonBadge({ className }: { className?: string }) {
  return <SkeletonBase className={cn('h-5 w-16 rounded-full', className)} />
}

export function PageLoadingFallback() {
  return (
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 animate-in">
      <div className="flex items-center justify-between mb-6">
        <SkeletonHeading />
        <SkeletonButton />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#120D0A] border border-[#FDFBF8]/5 rounded-xl p-4 space-y-2">
              <SkeletonText className="w-16 h-3" />
              <SkeletonBase className="h-8 w-12" />
              <SkeletonText className="w-20 h-3" />
            </div>
          ))}
        </div>
        <div className="bg-[#120D0A] border border-[#FDFBF8]/5 rounded-xl p-6 space-y-3">
          <SkeletonText className="w-48" />
          <SkeletonText className="w-3/4" />
          <SkeletonText className="w-1/2" />
          <div className="flex gap-2 mt-4">
            <SkeletonBase className="h-24 w-full rounded-lg" />
            <SkeletonBase className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function FormLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-[#120D0A]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-xl p-8 w-full max-w-[420px] space-y-4">
        <div className="flex flex-col items-center mb-6">
          <SkeletonBase className="h-12 w-12 rounded-xl mb-4" />
          <SkeletonHeading className="w-40" />
          <SkeletonText className="w-32 mt-2" />
        </div>
        <SkeletonBase className="h-12 w-full rounded-lg" />
        <SkeletonBase className="h-12 w-full rounded-lg" />
        <div className="relative flex items-center py-5">
          <div className="flex-grow border-t border-[#FDFBF8]/10" />
          <SkeletonText className="w-32 mx-4" />
          <div className="flex-grow border-t border-[#FDFBF8]/10" />
        </div>
        <SkeletonBase className="h-10 w-full rounded-lg" />
        <SkeletonBase className="h-10 w-full rounded-lg" />
        <SkeletonBase className="h-12 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function LandingLoadingFallback() {
  return (
    <div className="text-[#FDFBF8] bg-[#050505] min-h-screen">
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#0A0705]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-full">
        <SkeletonText className="w-24" />
        <div className="hidden md:flex items-center gap-8">
          <SkeletonText className="w-12" />
          <SkeletonText className="w-12" />
          <SkeletonText className="w-12" />
        </div>
        <div className="flex items-center gap-4">
          <SkeletonButton className="w-16" />
          <SkeletonButton className="w-32" />
        </div>
      </nav>
      <div className="flex flex-col items-center justify-center pt-40 pb-20 px-6 space-y-6">
        <SkeletonBadge className="w-32" />
        <SkeletonBase className="h-16 w-[600px] max-w-full" />
        <SkeletonText className="w-[500px] max-w-full" />
        <div className="flex gap-4 mt-4">
          <SkeletonButton className="w-36" />
          <SkeletonButton className="w-36" />
        </div>
        <SkeletonBase className="h-52 w-full max-w-3xl rounded-xl mt-8" />
      </div>
    </div>
  )
}
