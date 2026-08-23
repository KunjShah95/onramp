import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { ArrowRight, CheckCircle, Lock, Clock, Warning } from '@phosphor-icons/react'
import { resetPassword as apiResetPassword } from '../lib/api'
import InputField from '../components/ui/first-principles/InputField'

type PageState = 'idle' | 'submitting' | 'success' | 'error'

/** Decode JWT payload (base64url) without verification — read-only display fields. */
function decodeTokenPayload(token: string): { exp?: number; iat?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return { exp: payload.exp, iat: payload.iat }
  } catch {
    return null
  }
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pageState, setPageState] = useState<PageState>(token ? 'idle' : 'error')
  const [errorMsg, setErrorMsg] = useState(token ? '' : 'Invalid or missing reset token.')
  const [tokenExpiry, setTokenExpiry] = useState<{ expiresAt: Date; isExpired: boolean; minutesLeft: number } | null>(null)
  const expiryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Decode token and compute expiry status
  useEffect(() => {
    if (!token) return
    const decoded = decodeTokenPayload(token)
    if (!decoded?.exp) return

    const expiresAt = new Date(decoded.exp * 1000)
    const update = () => {
      const now = Date.now()
      const isExpired = now > expiresAt.getTime()
      const minutesLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 60000))
      setTokenExpiry({ expiresAt, isExpired, minutesLeft })
      if (isExpired && expiryTimerRef.current) {
        clearInterval(expiryTimerRef.current)
        setPageState('error')
        setErrorMsg('This reset link has expired. Please request a new one.')
      }
    }
    update()
    expiryTimerRef.current = setInterval(update, 10000)
    return () => { if (expiryTimerRef.current) clearInterval(expiryTimerRef.current) }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pageState === 'submitting') return

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match')
      setPageState('error')
      return
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters')
      setPageState('error')
      return
    }

    setPageState('submitting')
    setErrorMsg('')

    try {
      await apiResetPassword(token, password)
      toast.success('Password reset', 'Your password has been updated successfully!')
      setPageState('success')
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password'
      setErrorMsg(msg)
      setPageState('error')
      toast.error('Reset failed', msg)
    }
  }

  const tokenExpired = tokenExpiry?.isExpired ?? false
  const showExpiredUI = !token || tokenExpired

  return (
    <PageTransition>
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Reset Password · Onramp" description="Set a new password for your Onramp account." path="/reset-password" noindex />
        <AuthShell
          rail="Access"
          designator={pageState === 'success' ? 'PASSWORD UPDATED' : 'SET NEW PASSWORD'}
          status={pageState === 'success' ? 'go' : 'standby'}
          title="Reset Password"
          subtitle={pageState === 'success' ? 'Password reset successful' : 'Set a new password'}
          footer={
            <>
              <span>Remember your password?</span>
              <Link to="/login" className="text-go font-semibold hover:text-go-lit transition-colors ml-2">
                Sign in
              </Link>
            </>
          }
        >
          {pageState === 'success' ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-card bg-go/10 border border-go/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={24} className="text-go" weight="fill" />
              </div>
              <h2 className="font-display text-heading font-bold text-ink mb-2">Password updated</h2>
              <p className="text-body-sm text-ink-secondary mb-6">
                Your password has been reset successfully. Redirecting to sign in...
              </p>
              <Link to="/login" className="btn btn-primary">
                Sign In <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          ) : showExpiredUI ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-card bg-warning-muted border border-warning/20 flex items-center justify-center mx-auto mb-4">
                <Warning size={24} className="text-warning" weight="fill" />
              </div>
              <p className="text-body-sm text-ink-secondary mb-2">
                This reset link is invalid or has expired.
              </p>
              <p className="text-caption text-ink-tertiary mb-6">
                Reset links expire after 60 minutes for security.
              </p>
              <Link to="/forgot-password" className="btn btn-primary">
                Request a New Link <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          ) : (
            <>
              {errorMsg && pageState === 'error' && (
                <div className="bg-abort/10 text-abort rounded-card px-4 py-3 mb-6 text-body-sm border border-abort/20 font-medium" role="alert">
                  {errorMsg}
                </div>
              )}

              {/* Token expiry warning banner */}
              {tokenExpiry && !tokenExpiry.isExpired && tokenExpiry.minutesLeft <= 10 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-tile bg-warning-muted border border-warning/20 text-warning text-caption mb-4">
                  <Clock size={13} weight="bold" className="shrink-0" />
                  <span>
                    Link expires in <strong className="font-code">{tokenExpiry.minutesLeft} min</strong> — set your password soon
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <InputField
                  label="New Password"
                  name="password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  autoComplete="new-password"
                  icon={<Lock size={15} weight="bold" />}
                />
                <InputField
                  label="Confirm Password"
                  name="confirmPassword"
                  type="password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  icon={<Lock size={15} weight="bold" />}
                />

                <button
                  type="submit"
                  disabled={pageState === 'submitting' || !password || !confirmPassword}
                  className="btn btn-primary w-full mt-2"
                >
                  {pageState === 'submitting' ? 'Resetting...' : 'Reset Password'}
                  {pageState !== 'submitting' && <ArrowRight size={16} weight="bold" />}
                </button>
              </form>
            </>
          )}
        </AuthShell>
      </div>
    </PageTransition>
  )
}
