import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'
import { Lock, ArrowRight, TreeStructure } from '@phosphor-icons/react'

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
      <div data-theme="landing" className="landing-premium landing-light min-h-screen bg-room text-ink antialiased">
      <Seo title="Set Password — Onramp" description="Create a password for your Onramp account." path="/set-password" noindex />
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-body">
        {/* Premium background accents */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-go/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-go/3 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md z-10 relative"
        >
          {/* Brand Header */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-12 h-12 rounded-lg bg-cyan-400/90 shadow-lg flex items-center justify-center mb-5 text-[#0F1419]">
              <TreeStructure size={22} weight="bold" />
            </div>
            <h1 className="font-display text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              Set Your Password
            </h1>
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-2.5 text-center font-body">
              Your account was provisioned. Please set a permanent password.
            </p>
          </div>

          <div className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

            {error && (
              <div className="bg-abort/10 text-abort rounded-lg px-4 py-3 mb-5 text-[13px] border border-abort/20 font-medium relative z-10" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">New Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Min. 6 characters"
                    className="w-full bg-base/50 border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">Confirm Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Repeat your new password"
                    className="w-full bg-base/50 border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !password || !confirm}
                className="w-full mt-6 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Setting Password...' : 'Set Password'}
                {!submitting && <ArrowRight size={18} weight="bold" />}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
      </div>
    </PageTransition>
  )
}
