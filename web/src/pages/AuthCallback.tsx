import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setToken } from '../lib/neon-auth'
import { ArrowRight, CircleNotch, CheckCircle, XCircle } from '@phosphor-icons/react'
import AuthShell from '../components/ui/auth-shell'
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

  const meta = {
    processing: { designator: 'PROCESSING', status: 'standby' as const, heading: 'Signing in' },
    success: { designator: 'COMPLETE', status: 'go' as const, heading: isLinkFlow ? 'GitHub account linked' : 'Signed in' },
    error: { designator: 'FAILED', status: 'abort' as const, heading: isLinkFlow ? 'GitHub link failed' : 'Sign in failed' },
  }[status]

  return (
    <div className="min-h-screen bg-room text-ink antialiased">
      <Seo title="Signing in — Onramp" description="Completing your Onramp sign in." path="/auth/callback" noindex />
      <AuthShell
        rail="Authentication"
        designator={meta.designator}
        status={meta.status}
        title="Onramp"
        subtitle={isLinkFlow ? 'Linking your GitHub account' : 'Completing your sign in'}
      >
        <div className="text-center py-2">
          {status === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-card bg-mission/10 border border-mission/20 flex items-center justify-center">
                <CircleNotch size={24} className="text-mission animate-spin" weight="bold" />
              </div>
              <p className="text-body-sm text-ink-secondary">Completing sign in...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-card bg-go/10 border border-go/20 flex items-center justify-center">
                <CheckCircle size={24} className="text-go" weight="fill" />
              </div>
              <p className="text-body-sm font-medium text-ink">
                {isLinkFlow ? 'GitHub account linked!' : 'Signed in successfully!'}
              </p>
              <p className="text-caption text-ink-tertiary flex items-center gap-1">
                {isLinkFlow ? 'Redirecting to your profile' : 'Redirecting to dashboard'} <ArrowRight size={12} className="inline animate-pulse" />
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-card bg-abort/10 border border-abort/20 flex items-center justify-center">
                <XCircle size={24} className="text-abort" weight="fill" />
              </div>
              <p className="text-body-sm text-abort font-medium">
                {isLinkFlow ? 'GitHub link failed' : 'Sign in failed'}
              </p>
              <p className="text-caption text-ink-tertiary mb-2">{errorMsg}</p>
              <button
                onClick={() => navigate(isLinkFlow ? '/profile' : '/login', { replace: true })}
                className="btn btn-primary"
              >
                {isLinkFlow ? 'Back to Profile' : 'Back to Sign In'}
              </button>
            </div>
          )}
        </div>
      </AuthShell>
    </div>
  )
}
