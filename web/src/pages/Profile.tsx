import { useState, useEffect } from 'react'
import { ProfileSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fetchRepos } from '../lib/api'
import { StatCard } from '../components/ui/stat-card'
import CardSpotlight from '../components/ui/card-spotlight'
import PageTransition from '../components/ui/page-transition'
import { CalendarBlank, Lock, UserCircle } from '@phosphor-icons/react'

export default function Profile() {
  const { user } = useAuth()
  const toast = useToast()
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
        if (active) toast.error('Failed to load repositories')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  if (loading) return <ProfileSkeleton />

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User'
  const email = user?.email || '—'
  const initial = displayName.charAt(0).toUpperCase()
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    : '—'

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-text-primary">
        <div className="max-w-xl mx-auto space-y-5">
          {/* Identity card */}
          <CardSpotlight className="p-6">
            <div className="flex items-center gap-4">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={displayName}
                  className="w-16 h-16 rounded-full object-cover shrink-0 ring-2 ring-accent-primary/20" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-2xl font-bold text-accent-primary shrink-0">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold text-text-primary truncate">{displayName}</h3>
                <p className="text-sm text-text-secondary truncate">{email}</p>
                <p className="text-[11px] text-text-tertiary mt-1 font-mono flex items-center gap-1.5">
                  <CalendarBlank className="w-3 h-3" />
                  Member since {memberSince}
                </p>
              </div>
            </div>
          </CardSpotlight>

          {/* Stats */}
          <CardSpotlight className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Repositories"
                value={repoCount ?? '—'}
                accentColor="#F59E0B"
                color={repoCount !== null ? 'text-text-primary' : 'text-text-tertiary'}
              />
              <StatCard
                label="Member Since"
                value={memberSince}
                color="text-text-primary"
              />
            </div>
          </CardSpotlight>

          {/* Provider info */}
          {user?.providerData?.[0] && (
            <CardSpotlight className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-3 flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                Sign-in Provider
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-text-secondary capitalize font-mono flex items-center gap-1.5">
                  <UserCircle className="w-4 h-4" weight="fill" />
                  {user.providerData[0].providerId.replace('.com', '')}
                </span>
              </div>
            </CardSpotlight>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
