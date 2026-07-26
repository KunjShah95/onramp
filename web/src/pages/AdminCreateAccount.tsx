import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import { createAccount, listTeams } from '../lib/api'
import PageTransition from '../components/ui/page-transition'
import { UserPlus, Copy, Check, ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

type TeamOption = { team_id: string; name: string }

export default function AdminCreateAccount() {
  const toast = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'new_dev' | 'developer' | 'tester' | 'hr'>('new_dev')
  const [teamId, setTeamId] = useState('')
  const [message, setMessage] = useState('')
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ email: string; temp_password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listTeams('current-user')
        setTeams((data.teams || []).map((t: any) => ({ team_id: t.team_id || t.id, name: t.name })))
      } catch { /* ignore */ }
    }
    load()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setResult(null)

    try {
      const resp = await createAccount({
        name,
        email,
        role,
        team_id: teamId || undefined,
        message: message || undefined,
      })
      setResult({ email: resp.email, temp_password: resp.temp_password })
      toast.success('Account created', `Account for ${name} has been created`)
    } catch (err: unknown) {
      toast.error('Failed to create account', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyPassword = () => {
    if (result) {
      navigator.clipboard.writeText(result.temp_password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleReset = () => {
    setName('')
    setEmail('')
    setRole('new_dev')
    setTeamId('')
    setMessage('')
    setResult(null)
    setCopied(false)
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto p-6">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Admin
        </Link>

        <h1 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-1">Create Developer Account</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-8">
          Provision a new developer account with a temporary password
        </p>

        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard"
          >
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <UserPlus size={24} className="text-green-600" />
              </div>
              <h2 className="font-display text-lg font-bold">Account Created</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{result.email}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ Temporary Password — Copy it now</p>
              <p className="text-xs text-amber-700 mb-3">This password will only be shown once. Share it securely with the developer.</p>
              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                <code className="flex-1 text-sm font-mono select-all">{result.temp_password}</code>
                <button
                  onClick={handleCopyPassword}
                  className="p-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                  title="Copy password"
                >
                  {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 bg-[hsl(var(--accent))] text-white font-semibold text-sm py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              >
                Create Another Account
              </button>
              <Link
                to="/admin"
                className="flex-1 bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] font-semibold text-sm py-2.5 rounded-xl text-center hover:opacity-80 transition-opacity"
              >
                Back to Admin
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="John Doe"
                className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="developer@company.com"
                className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--accent))]/60 transition-all"
              >
                <option value="new_dev">New Developer</option>
                <option value="developer">Developer</option>
                <option value="tester">Tester</option>
                <option value="hr">HR</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">Team (optional)</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--accent))]/60 transition-all"
              >
                <option value="">No team (will create account only)</option>
                {teams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium">Welcome Message (optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Brief welcome note..."
                rows={2}
                className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 resize-none focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !name || !email}
              className="w-full bg-[hsl(var(--accent))] text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {submitting ? 'Creating Account...' : 'Create Account'}
              <UserPlus size={16} />
            </button>
          </motion.form>
        )}
      </div>
    </PageTransition>
  )
}
