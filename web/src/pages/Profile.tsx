import { useState, useEffect } from 'react'
import { ProfileSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fetchRepos } from '../lib/api'
import { StatCard } from '../components/ui/stat-card'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

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
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
      <div className="mb-6">
        <GradientHeading as="h1">Profile</GradientHeading>
        <p className="text-[#FDFBF8]/40 text-sm mt-1">Your account overview</p>
      </div>

      <div className="w-full max-w-xl space-y-5">
        {/* Identity card */}
        <CardSpotlight className="p-6">
          <div className="flex items-center gap-4">
            {user?.photoURL ? (
              <img src={user.photoURL} alt={displayName}
                className="w-16 h-16 rounded-full object-cover shrink-0 ring-2 ring-[#FF8C00]/20" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/20 flex items-center justify-center text-2xl font-bold text-[#FF8C00] shrink-0">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold text-[#FDFBF8] truncate">{displayName}</h3>
              <p className="text-sm text-[#FDFBF8]/40 truncate">{email}</p>
              <p className="text-[11px] text-[#FDFBF8]/25 mt-1 font-mono">Member since {memberSince}</p>
            </div>
          </div>
        </CardSpotlight>

        {/* Stats */}
        <CardSpotlight className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Repositories"
              value={repoCount ?? '—'}
              accentColor="#FF8C00"
              color={repoCount !== null ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/20'}
            />
            <StatCard
              label="Member Since"
              value={memberSince}
              color="text-[#FDFBF8]/70"
            />
          </div>
        </CardSpotlight>

        {/* Provider info */}
        {user?.providerData?.[0] && (
          <CardSpotlight className="p-5">
            <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/25 font-semibold mb-2"><GradientHeading as="h4" className="text-[10px] uppercase tracking-widest">Sign-in Provider</GradientHeading></div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-[#FDFBF8]/60 capitalize font-mono">
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
