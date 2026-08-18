import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ProfileSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { fetchRepos, getGithubLinkUrl } from '../lib/api'
import ConsolePanel from '../components/ui/console-panel'
import { ArrowRight, ArrowUpRight, GithubLogo, SignOut } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
}

export default function Profile() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [repoCount, setRepoCount] = useState<number | null>(null)
  const [signingOut, setSigningOut] = useState(false)

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

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await logout()
      toast.success('Signed out', 'See you on the next flight.')
      navigate('/login', { replace: true })
    } catch {
      toast.error('Sign-out failed', 'Try again.')
    } finally {
      setSigningOut(false)
    }
  }

  const connectGithub = async () => {
    // Start the account-linking OAuth flow — the callback lands on
    // /auth/callback with a fresh session and attaches the GitHub identity
    // to this (already signed-in) account instead of creating a second one.
    try {
      const { url } = await getGithubLinkUrl()
      // Remember this was an account-link flow (not a fresh sign-in) so the
      // OAuth callback can return the user to their profile afterwards. The
      // value is a timestamp so a stale flag from an aborted flow is ignored.
      sessionStorage.setItem('ghLinkFlow', String(Date.now()))
      window.location.href = url
    } catch (err) {
      toast.error(
        'GitHub link failed',
        err instanceof Error ? err.message : 'Could not start the link flow.'
      )
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        <motion.div initial="hidden" animate="show" variants={fadeUp} className="space-y-5">
          {/* Identity card — one surface, one rail */}
          <ConsolePanel rail="Identity" designator="ID CARD" status="go">
            <div className="flex items-start gap-5">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={displayName}
                  className="w-16 h-16 rounded-[3px] object-cover shrink-0 border border-seam" />
              ) : (
                <div className="w-16 h-16 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center shrink-0">
                  <span className="font-display text-display-sm font-bold text-go">{initial}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-2xl font-bold text-ink tracking-tight truncate">{displayName}</h2>
                {position && (
                  <p className="text-body-sm text-ink-secondary mt-0.5">{position}</p>
                )}
                <p className="text-caption text-ink-tertiary font-mono mt-1 truncate">{email}</p>
              </div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-[3px] border border-seam-strong bg-panel-raised px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-abort/40 hover:text-abort transition-colors disabled:opacity-50"
                aria-label="Sign out"
              >
                <SignOut size={13} weight="bold" />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </ConsolePanel>

          {/* Two readouts — repos, member since */}
          <div className="grid grid-cols-2 gap-3">
            <ConsolePanel rail="Repositories" designator="REPOS">
              <div className="font-mono tabular-nums text-3xl md:text-4xl font-semibold text-ink leading-none">
                {repoCount ?? '—'}
              </div>
              <button
                onClick={connectGithub}
                className="mt-3 inline-flex items-center gap-1.5 text-caption text-go hover:underline"
              >
                <GithubLogo size={12} weight="fill" />
                {user?.githubUsername ? `Linked as @${user.githubUsername}` : 'Connect GitHub'}
                <ArrowUpRight size={11} weight="bold" />
              </button>
            </ConsolePanel>

            <ConsolePanel rail="Member since" designator="Active">
              <div className="font-code text-2xl md:text-3xl font-semibold text-ink leading-none tabular-nums">
                {memberSince}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-caption text-ink-tertiary">
                <span className="w-1.5 h-1.5 rounded-full bg-go-lit" />
                Account in good standing
              </div>
            </ConsolePanel>
          </div>

          {/* Footer rail */}
          <div className="flex items-center justify-between pt-2 text-caption text-ink-tertiary">
            <a href="/docs" className="inline-flex items-center gap-1 hover:text-ink transition-colors">
              Need help with your account?
              <ArrowRight size={11} weight="bold" />
            </a>
            <span className="font-mono">v2.4</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
