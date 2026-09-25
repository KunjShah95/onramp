import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setWsToken } from '../lib/neon-auth'
import { ArrowRight, CircleNotch, CheckCircle, XCircle } from '@phosphor-icons/react'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'

const AUTH_RETURN_STORAGE_KEY = 'onramp.authReturnTo'

function safeInternalReturn(value: string | null | undefined): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes(':') ? value : null
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')
  const [isLinkFlow, setIsLinkFlow] = useState(false)

  useEffect(() => {
    let cancelled = false
    let redirectTimer: ReturnType<typeof setTimeout> | null = null

    const token = searchParams.get('token')
    const error = searchParams.get('error')
    const rawLinkFlow = sessionStorage.getItem('ghLinkFlow')
    const linkFlow = rawLinkFlow !== null && Date.now() - Number(rawLinkFlow) < 15 * 60 * 1000
    if (rawLinkFlow !== null) sessionStorage.removeItem('ghLinkFlow')
    setIsLinkFlow(linkFlow)

    let storedReturn: string | null = null
    try { storedReturn = safeInternalReturn(sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)) } catch { /* optional */ }
    const destination = linkFlow ? '/profile' : (storedReturn || '/dashboard')

    const scheduleRedirect = () => {
      if (cancelled) return
      setStatus('success')
      try { sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY) } catch { /* optional */ }
      redirectTimer = setTimeout(() => {
        if (!cancelled) navigate(destination, { replace: true })
      }, 500)
    }

    if (error) {
      setStatus('error')
      setErrorMsg(decodeURIComponent(error))
      return () => { cancelled = true }
    }

    // Legacy callback token: capture it before stripping the query string.
    if (token) {
      window.history.replaceState(null, '', window.location.pathname)
      try {
        setWsToken(token)
        scheduleRedirect()
      } catch {
        setStatus('error')
        setErrorMsg('Failed to process authentication. Please try again.')
      }
      return () => {
        cancelled = true
        if (redirectTimer) clearTimeout(redirectTimer)
      }
    }

    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }

    const verify = async () => {
      try {
        const rawBase = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1').trim()
        let url = rawBase.replace(/\/+$/, '')
        if (!url.endsWith('/api/v1')) {
          if (url.endsWith('/api')) url = `${url}/v1`
          else if (!url.includes('/api')) url = `${url}/api/v1`
        }
        const res = await fetch(`${url}/auth/me`, { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) {
            setStatus('error')
            setErrorMsg(res.status === 401 || res.status === 403
              ? 'The provider did not establish a valid session.'
              : 'Authentication could not be verified. Please try again.')
          }
          return
        }
        const json = await res.json().catch(() => null)
        const data = json?.data || json
        if (data?.token) setWsToken(data.token)
        scheduleRedirect()
      } catch {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg('Authentication could not be verified. Check your connection and try again.')
        }
      }
    }
    void verify()

    return () => {
      cancelled = true
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [searchParams, navigate])

  const retryReturn = (() => {
    try { return safeInternalReturn(sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)) } catch { return null }
  })()

  const meta = {
    processing: { designator: 'PROCESSING', status: 'standby' as const, heading: 'Signing in' },
    success: { designator: 'COMPLETE', status: 'go' as const, heading: isLinkFlow ? 'GitHub account linked' : 'Signed in' },
    error: { designator: 'FAILED', status: 'abort' as const, heading: isLinkFlow ? 'GitHub link failed' : 'Sign in failed' },
  }[status]

  return (
    <div className="min-h-screen bg-room text-ink antialiased">
      <Seo title="Signing in · Onramp" description="Completing your Onramp sign in." path="/auth/callback" noindex />
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
                onClick={() => navigate(
                  isLinkFlow ? '/profile' : `/login${retryReturn ? `?returnTo=${encodeURIComponent(retryReturn)}` : ''}`,
                  { replace: true },
                )}
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
