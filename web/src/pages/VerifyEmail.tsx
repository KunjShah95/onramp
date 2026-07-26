import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageTransition from '../components/ui/page-transition'

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

  return (
    <PageTransition>
      <div className="bg-[hsl(var(--background))] min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px] z-10"
        >
          <div className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

            <div className="text-4xl mb-4">
              {status === 'verifying' ? (
                <span className="inline-block animate-pulse"></span>
              ) : status === 'success' ? (
                <span></span>
              ) : (
                <span></span>
              )}
            </div>

            <h1 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-2">
              {status === 'verifying' ? 'Verifying...' : status === 'success' ? 'Verified!' : 'Verification Failed'}
            </h1>

            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">{message}</p>

            {status !== 'verifying' && (
              <Link
                to="/login"
                className="inline-block bg-[hsl(var(--accent))] text-white font-semibold text-sm py-2.5 px-6 rounded-xl hover:opacity-90 transition-opacity"
              >
                {status === 'success' ? 'Go to Login' : 'Back to Login'}
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  )
}
