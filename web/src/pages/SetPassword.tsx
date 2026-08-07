import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { Lock, ArrowRight } from '@phosphor-icons/react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { getIdToken } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)
    try {
      const token = getIdToken()
      const res = await fetch(`${API_BASE}/auth/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Failed to set password')
      }
      toast.success('Password set', 'Your new password has been saved')
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageTransition>
      <div className="bg-[hsl(var(--background))] min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[hsl(var(--accent))]/5 rounded-full blur-[100px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px] z-10"
        >
          <div className="bg-bg-secondary border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-[hsl(var(--accent))]/10 flex items-center justify-center mx-auto mb-3">
                <Lock size={24} className="text-[hsl(var(--accent))]" />
              </div>
              <h1 className="font-display text-xl font-bold text-[hsl(var(--foreground))]">Set Your Password</h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Your account was provisioned. Please set a permanent password.
              </p>
            </div>

            {error && (
              <div className="bg-error/10 text-error rounded-lg px-4 py-3 mb-4 text-sm border border-error/25">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">New Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Min. 6 characters"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">Confirm Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Repeat your new password"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !password || !confirm}
                className="w-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {submitting ? 'Setting Password...' : 'Set Password'}
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  )
}
