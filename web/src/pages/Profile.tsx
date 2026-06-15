import { useState, useEffect } from 'react'
import { ProfileSkeleton } from '../components/ui/Skeleton'

export default function Profile() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 150)
    return () => clearTimeout(timer)
  }, [])

  if (loading) return <ProfileSkeleton />

  return (
    <div className="animate-in max-w-md">
      <h1 className="font-display text-2xl font-bold text-text-primary">Profile</h1>
      <div className="card mt-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-accent-from flex items-center justify-center text-xl font-bold text-white shrink-0">
            U
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-text-primary">Demo User</h3>
            <p className="text-text-secondary text-sm">demo@codeflow.ai</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-text-secondary text-xs">Repositories</span>
            <p className="font-display text-2xl font-bold text-text-primary mt-1">12</p>
          </div>
          <div>
            <span className="text-text-secondary text-xs">Total Analysis Time</span>
            <p className="font-display text-2xl font-bold text-text-primary mt-1">4h 23m</p>
          </div>
        </div>
      </div>
    </div>
  )
}
