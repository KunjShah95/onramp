import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { setToken } from '../lib/neon-auth'
import { ArrowRight, CircleNotch, TreeStructure } from '@phosphor-icons/react'
import Seo from '../components/seo/Seo'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')
  const [isLinkFlow, setIsLinkFlow] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    const error = searchParams.get('error')
    // True when this callback completes a GitHub *account-link* flow started
    // from the Profile page (flagged in sessionStorage before the redirect),
    // as opposed to a fresh sign-in. After a successful link the user should
    // land back on their profile, not the dashboard. The flag carries a
    // timestamp so a stale flag left over from an aborted flow (closed tab,
    // backend error, back button) is ignored rather than hijacking a later
    // OAuth sign-in in the same tab.
    const rawLinkFlow = sessionStorage.getItem('ghLinkFlow')
    const linkFlow = rawLinkFlow !== null && Date.now() - Number(rawLinkFlow) < 15 * 60 * 1000
    if (rawLinkFlow !== null) sessionStorage.removeItem('ghLinkFlow')
    setIsLinkFlow(linkFlow)

    if (error) {
      setStatus('error')
      setErrorMsg(decodeURIComponent(error))
      return
    }

    if (!token) {
      setStatus('error')
      setErrorMsg('No authentication token received from the provider.')
      return
    }

    // Store the JWT and redirect to the right landing page
    try {
      setToken(token)
      setStatus('success')
      setTimeout(() => {
        navigate(linkFlow ? '/profile' : '/dashboard', { replace: true })
      }, 500)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Failed to process authentication. Please try again.')
    }
  }, [searchParams, navigate])

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  }

  return (
    <div data-theme="landing" className="landing-premium landing-light min-h-screen bg-room text-ink antialiased">
      <Seo title="Signing in — Onramp" description="Completing your Onramp sign in." path="/auth/callback" noindex />
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-body">
        {/* Premium background accents */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-go/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-go/3 rounded-full blur-3xl pointer-events-none" />

        <motion.main
          initial="hidden"
          animate="visible"
          className="w-full max-w-md z-10 relative text-center"
        >
          {/* Brand Header */}
          <motion.div variants={fadeUp} className="flex flex-col items-center mb-10">
            <div className="w-12 h-12 rounded-lg bg-cyan-400/90 shadow-lg flex items-center justify-center mb-5 text-[#0F1419]">
              <TreeStructure size={22} weight="bold" />
            </div>
            <h1 className="font-display text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              Onramp
            </h1>
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-2.5 text-center font-body">
              {isLinkFlow ? 'Linking your GitHub account' : 'Completing your sign in'}
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              {status === 'processing' && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-14 h-14 rounded-lg bg-mission/10 border border-mission/20 flex items-center justify-center">
                    <CircleNotch size={28} className="text-mission animate-spin" weight="bold" />
                  </div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] font-body">
                    Completing sign in...
                  </p>
                </div>
              )}

              {status === 'success' && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-14 h-14 rounded-lg bg-go/10 border border-go/20 flex items-center justify-center">
                    <svg className="w-7 h-7 text-go" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))] font-body">
                    {isLinkFlow ? 'GitHub account linked!' : 'Signed in successfully!'}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body flex items-center gap-1">
                    {isLinkFlow ? 'Redirecting to your profile' : 'Redirecting to dashboard'} <ArrowRight size={12} className="inline animate-pulse" />
                  </p>
                </div>
              )}

              {status === 'error' && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-14 h-14 rounded-lg bg-abort/10 border border-abort/20 flex items-center justify-center">
                    <svg className="w-7 h-7 text-abort" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-sm text-abort font-medium font-body">
                    {isLinkFlow ? 'GitHub link failed' : 'Sign in failed'}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body mb-2">
                    {errorMsg}
                  </p>
                  <button
                    onClick={() => navigate(isLinkFlow ? '/profile' : '/login', { replace: true })}
                    className="bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-sm py-3 px-8 rounded-lg transition-all active:scale-[0.98] font-body"
                  >
                    {isLinkFlow ? 'Back to Profile' : 'Back to Sign In'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.main>
      </div>
    </div>
  )
}
