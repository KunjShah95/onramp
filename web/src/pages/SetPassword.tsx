import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { ArrowRight, Lock } from '@phosphor-icons/react'
import InputField from '../components/ui/first-principles/InputField'

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
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Set Password — Onramp" description="Create a password for your Onramp account." path="/set-password" noindex />
        <AuthShell
          rail="Access"
          designator="SET PASSWORD"
          status="standby"
          title="Set Your Password"
          subtitle="Your account was provisioned. Please set a permanent password."
        >
          {error && (
            <div className="bg-abort/10 text-abort rounded-card px-4 py-3 mb-6 text-body-sm border border-abort/20 font-medium" role="alert">
              {error}
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
              name="confirm"
              type="password"
              placeholder="Repeat your new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              icon={<Lock size={15} weight="bold" />}
            />

            <button
              type="submit"
              disabled={submitting || !password || !confirm}
              className="btn btn-primary w-full mt-2"
            >
              {submitting ? 'Setting Password...' : 'Set Password'}
              {!submitting && <ArrowRight size={16} weight="bold" />}
            </button>
          </form>
        </AuthShell>
      </div>
    </PageTransition>
  )
}
