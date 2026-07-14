import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight, Spinner, Terminal, Users, EnvelopeSimple, User } from '@phosphor-icons/react'
import { useToast } from '../context/ToastContext'
import { API_BASE } from '../lib/api'

const getWaitlistUrl = () => {
  const base = (import.meta.env.VITE_WAITLIST_URL ?? API_BASE).replace(/\/+$/, '')
  const root = base.replace(/\/api\/v1\/?$/, '')
  return `${root}/api/v1/waitlist`
}
const WAITLIST_URL = getWaitlistUrl()

type Role = 'developer' | 'manager' | 'cto'
type TeamSize = '1-10' | '11-50' | '51-200' | '200+'

interface FormData {
  name: string
  email: string
  role: Role | ''
  company: string
  team_size: TeamSize | ''
  use_case: string
}

const EMPTY_FORM: FormData = {
  name: '',
  email: '',
  role: '',
  company: '',
  team_size: '',
  use_case: '',
}

export default function WaitlistPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ position: number; message: string } | null>(null)
  const [count, setCount] = useState<number | null>(null)

  const toast = useToast()

  useEffect(() => {
    fetch(`${WAITLIST_URL}/count`)
      .then(r => r.json())
      .then(d => setCount(d.count))
      .catch(() => toast.error('Failed to load waitlist count'))
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.role || !form.team_size) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${WAITLIST_URL}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Something went wrong. Please try again.')
        return
      }
      setSuccess({ position: data.position, message: data.message })
    } catch {
      setError('Could not connect. Please try again.')
      toast.error('Failed to join waitlist', 'Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-tertiary/50 focus:outline-none focus:border-accent-primary/50 transition-colors'

  return (
    <div className="text-text-primary font-body bg-bg-primary antialiased">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3.5 bg-bg-primary/80 backdrop-blur-xl border-b border-border">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-primary/15 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-accent-primary" weight="fill" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">Onramp</span>
        </Link>
      </nav>

      <div className="min-h-screen flex flex-col items-center justify-center pt-20 pb-20 px-6">
        {/* Background decoration */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-primary/3 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-primary/2 rounded-full blur-3xl" />
        </div>

        {/* Hero */}
        <div className="relative z-10 flex flex-col items-center text-center gap-6 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-primary/10 border border-accent-primary/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
            <span className="font-mono text-[11px] text-accent-primary uppercase tracking-wider font-bold">Coming Soon</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.1] tracking-tight max-w-3xl">
            Be first to transform<br />
            <span className="text-text-tertiary">how your team onboards.</span>
          </h1>
          <p className="text-text-secondary text-base max-w-xl leading-relaxed">
            Onramp maps your codebase, builds guided learning paths, and gets new engineers shipping PRs on day 5 — not day 45.
          </p>
          {count !== null && (
            <div className="flex items-center gap-2 text-sm text-accent-primary/80">
              <Users className="w-4 h-4" weight="fill" />
              <span className="font-mono">{count} developer{count !== 1 ? 's' : ''} already waiting</span>
            </div>
          )}
        </div>

        {/* Form / Success card */}
        <div className="relative z-10 w-full max-w-lg">
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-bg-secondary border border-accent-primary/20 rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"
                >
                  <Check className="w-7 h-7 text-green-400" weight="bold" />
                </motion.div>
                <h2 className="font-display text-2xl font-bold">{success.message}</h2>
                <p className="text-text-secondary text-sm">Check your email for confirmation. We'll reach out when we launch.</p>
                <Link to="/" className="mt-2 text-accent-primary text-sm hover:underline flex items-center gap-1">
                  <ArrowRight className="w-4 h-4" weight="bold" />
                  Back to home
                </Link>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="bg-bg-secondary border border-border rounded-2xl p-8 flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary/50 pointer-events-none" />
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Full name"
                      required
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  <div className="relative">
                    <EnvelopeSimple className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary/50 pointer-events-none" />
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="Work email"
                      required
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    required
                    className={`${inputClass} ${!form.role ? 'text-text-tertiary/50' : ''}`}
                  >
                    <option value="" disabled>Your role</option>
                    <option value="developer">Developer</option>
                    <option value="manager">Manager</option>
                    <option value="cto">CTO</option>
                  </select>
                  <input
                    name="company"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="Company"
                    required
                    className={inputClass}
                  />
                </div>

                <select
                  name="team_size"
                  value={form.team_size}
                  onChange={handleChange}
                  required
                  className={`${inputClass} ${!form.team_size ? 'text-text-tertiary/50' : ''}`}
                >
                  <option value="" disabled>Team size</option>
                  <option value="1-10">1–10 people</option>
                  <option value="11-50">11–50 people</option>
                  <option value="51-200">51–200 people</option>
                  <option value="200+">200+ people</option>
                </select>

                <textarea
                  name="use_case"
                  value={form.use_case}
                  onChange={handleChange}
                  placeholder="What's your biggest onboarding challenge? (optional, max 500 chars)"
                  maxLength={500}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />

                {error && (
                  <p className="text-red-400 text-sm flex items-center gap-1.5">
                    <span>⚠</span> {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-accent-primary text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Spinner className="w-4 h-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      Join Waitlist
                      <ArrowRight className="w-4 h-4" weight="bold" />
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
