import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ProfileSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fetchRepos } from '../lib/api'
import ConsolePanel from '../components/ui/console-panel'
import ReadoutBank, { type Readout } from '../components/ui/readout-bank'
import {
  Envelope, IdentificationBadge, Clock, Code,
} from '@phosphor-icons/react'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
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
  const position = user?.position || ''
  const email = user?.email || '—'
  const initial = displayName.charAt(0).toUpperCase()
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    : '—'

  const readouts: Readout[] = [
    { label: 'Repositories', value: repoCount ?? '—', color: 'text-info' },
    { label: 'Member Since', value: memberSince, color: 'text-ink-secondary' },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Header */}
        <motion.div variants={item}>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">Profile</span>
            <span className="designator opacity-50">CREW IDENT · ACCOUNT</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-text-primary">Crew Profile</h1>
          <p className="text-body-sm text-text-secondary mt-1 font-code">Account details and connected services</p>
        </motion.div>

        {/* Identity Card */}
        <motion.div variants={item}>
          <ConsolePanel rail="Identity" designator="IDENT" status="go">
            <div className="flex items-center gap-5">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={displayName}
                  className="w-16 h-16 rounded-tile object-cover shrink-0 ring-2 ring-go/15" />
              ) : (
                <div className="w-16 h-16 rounded-tile bg-go/10 border border-go/20 flex items-center justify-center shrink-0">
                  <span className="font-display text-display-sm font-bold text-go">{initial}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-heading text-body font-semibold text-ink truncate">{displayName}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Envelope size={12} className="text-ink-disabled" />
                  <p className="text-body-xs text-ink-muted truncate">{email}</p>
                </div>
                {position && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <IdentificationBadge size={12} className="text-ink-disabled" />
                    <p className="text-body-xs text-ink-secondary">{position}</p>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1 text-caption text-ink-muted">
                  <Clock size={11} />
                  <span>Member since {memberSince}</span>
                </div>
              </div>
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Stats */}
        <motion.div variants={item}>
          <ReadoutBank callsign="TELEMETRY" items={readouts} columns={4} />
        </motion.div>

        {/* Provider Info */}
        {user?.providerData?.[0] && (
          <motion.div variants={item}>
            <ConsolePanel rail="Authentication" designator="AUTH SOURCE" status="go">
              <div className="flex items-center gap-3 p-3 rounded-tile bg-well border border-seam">
                <span className="w-2 h-2 rounded-pill bg-go-lit motion-safe:animate-pulse-glow" />
                <div className="flex items-center gap-2 text-body-xs text-ink font-code">
                  <IdentificationBadge size={14} className="text-ink-muted" />
                  {user.providerData[0].providerId.replace('.com', '')}
                </div>
                <span className="tile tile-go ml-auto">Connected</span>
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-caption text-ink-muted">
                <Code size={12} />
                <span>Sign-in is managed by your identity provider.</span>
              </div>
            </ConsolePanel>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
