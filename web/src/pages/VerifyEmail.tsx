import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { CheckCircle, XCircle, CircleNotch } from '@phosphor-icons/react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided. The link may be invalid.')
      return
    }

    const verify = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || data.message || 'Verification failed')
        }
        setStatus('success')
        setMessage('Email verified successfully! You can now log in.')
      } catch (err: unknown) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed')
      }
    }

    verify()
  }, [token])

  const meta = {
    verifying: { designator: 'VERIFYING', status: 'standby' as const, heading: 'Verifying...' },
    success: { designator: 'VERIFIED', status: 'go' as const, heading: 'Verified!' },
    error: { designator: 'FAILED', status: 'abort' as const, heading: 'Verification Failed' },
  }[status]

  return (
    <PageTransition>
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Verify Email · Onramp" description="Verify your email address to activate your Onramp account." path="/verify-email" noindex />
        <AuthShell
          rail="Verification"
          designator={meta.designator}
          status={meta.status}
          title="Verify Email"
          subtitle={status === 'verifying' ? 'Confirming your address' : status === 'success' ? 'All set' : 'Something went wrong'}
        >
          <div className="text-center py-2">
            <div className="mx-auto mb-4 flex items-center justify-center">
              {status === 'verifying' && (
                <div className="w-12 h-12 rounded-card bg-mission/10 border border-mission/20 flex items-center justify-center">
                  <CircleNotch size={24} className="text-mission animate-spin" weight="bold" />
                </div>
              )}
              {status === 'success' && (
                <div className="w-12 h-12 rounded-card bg-go/10 border border-go/20 flex items-center justify-center">
                  <CheckCircle size={24} className="text-go" weight="fill" />
                </div>
              )}
              {status === 'error' && (
                <div className="w-12 h-12 rounded-card bg-abort/10 border border-abort/20 flex items-center justify-center">
                  <XCircle size={24} className="text-abort" weight="fill" />
                </div>
              )}
            </div>

            <h2 className="font-display text-heading font-bold text-ink mb-2">{meta.heading}</h2>
            <p className="text-body-sm text-ink-secondary mb-6">{message}</p>

            {status !== 'verifying' && (
              <Link to="/login" className="btn btn-primary">
                {status === 'success' ? 'Go to Login' : 'Back to Login'}
              </Link>
            )}
          </div>
        </AuthShell>
      </div>
    </PageTransition>
  )
}
