import { useState, useEffect } from 'react'
import { ProfileSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { fetchRepos } from '../lib/api'

export default function Profile() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [repoCount, setRepoCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { repos } = await fetchRepos()
        if (active) setRepoCount(repos.length)
      } catch {
        if (active) setRepoCount(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <ProfileSkeleton />

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User'
  const email = user?.email || '—'
  const initial = displayName.charAt(0).toUpperCase()
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
      })
    : '—'

  return (
    <div className="animate-in max-w-md">
      <h1 className="font-display text-2xl font-bold text-text-primary">Profile</h1>
      <div className="card mt-8">
        <div className="flex items-center gap-4 mb-6">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accent-from flex items-center justify-center text-xl font-bold text-white shrink-0">
              {initial}
            </div>
          )}
          <div>
            <h3 className="font-display text-base font-semibold text-text-primary">{displayName}</h3>
            <p className="text-text-secondary text-sm">{email}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-text-secondary text-xs">Repositories</span>
            <p className="font-display text-2xl font-bold text-text-primary mt-1">
              {repoCount ?? '—'}
            </p>
          </div>
          <div>
            <span className="text-text-secondary text-xs">Member Since</span>
            <p className="font-display text-2xl font-bold text-text-primary mt-1">{memberSince}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
