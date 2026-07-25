import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ProfileSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fetchRepos } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import {
  CalendarBlank, Lock, Code, Envelope,
  IdentificationBadge, Clock,
} from '@phosphor-icons/react'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

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
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] relative">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <motion.div variants={item} className="mb-8">
          <GradientHeading as="h1" className="text-display-md mb-1">Profile</GradientHeading>
          <p className="text-body-sm text-text-muted/60">Your account details and connected services</p>
        </motion.div>

        {/* Identity Card */}
        <motion.div variants={item} className="mb-5">
          <CardSpotlight className="p-6">
            <div className="flex items-center gap-5">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={displayName}
                  className="w-16 h-16 rounded-2xl object-cover shrink-0 ring-2 ring-amber-400/15" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/15 to-amber-600/5 border border-amber-400/15 flex items-center justify-center shrink-0">
                  <span className="font-display text-display-sm font-bold text-amber-400">{initial}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-body font-bold text-text-primary truncate">{displayName}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Envelope size={12} className="text-text-muted/30" />
                  <p className="text-body-xs text-text-muted/60 truncate">{email}</p>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-caption text-text-muted/30">
                  <CalendarBlank size={11} />
                  <span>Member since {memberSince}</span>
                </div>
              </div>
            </div>
          </CardSpotlight>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-4 rounded-xl bg-bg-tertiary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-400/8 border border-amber-400/10 flex items-center justify-center">
                <Code size={13} className="text-amber-400" />
              </div>
              <span className="text-caption text-text-muted/50">Repositories</span>
            </div>
            <motion.div
              className="font-display text-display-sm font-bold text-text-primary tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {repoCount ?? '—'}
            </motion.div>
          </div>
          <div className="p-4 rounded-xl bg-bg-tertiary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-400/8 border border-blue-400/10 flex items-center justify-center">
                <Clock size={13} className="text-blue-400" />
              </div>
              <span className="text-caption text-text-muted/50">Member Since</span>
            </div>
            <div className="font-display text-display-sm font-bold text-text-primary">{memberSince}</div>
          </div>
        </motion.div>

        {/* Provider Info */}
        {user?.providerData?.[0] && (
          <motion.div variants={item}>
            <CardSpotlight className="p-5">
              <div className="flex items-center gap-1.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-bg-tertiary border border-border flex items-center justify-center">
                  <Lock size={12} className="text-text-muted/40" />
                </div>
                <span className="text-overline text-text-muted/40">Authentication</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary/30 border border-border/40">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse-glow" />
                <div className="flex items-center gap-2 text-body-xs text-text-primary font-code">
                  <IdentificationBadge size={14} className="text-text-muted/40" />
                  {user.providerData[0].providerId.replace('.com', '')}
                </div>
                <span className="text-caption text-text-muted/20 ml-auto">Connected</span>
              </div>
            </CardSpotlight>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
