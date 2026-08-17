/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: Account provisioning lives on the admin seat — a console form with
 *   a clear status rail, a temp-password reveal panel, and copy-to-clipboard
 *   with a mission-control chip.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import { createAccount, listTeams } from '../lib/api'
import ConsolePanel from '../components/ui/console-panel'
import StatusTile from '../components/ui/status-tile'
import {
  UserPlus, Copy, Check, ArrowLeft, IdentificationCard, EnvelopeSimple,
  ShieldCheck, UsersThree, ChatText,
} from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

type TeamOption = { team_id: string; name: string }

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } },
}

export default function AdminCreateAccount() {
  const toast = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'junior_dev' | 'developer' | 'tester' | 'hr'>('junior_dev')
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
    setRole('junior_dev')
    setTeamId('')
    setMessage('')
    setResult(null)
    setCopied(false)
  }

  const roleLabel = (r: typeof role) =>
    r === 'junior_dev' ? 'Junior Developer'
    : r === 'developer' ? 'Developer'
    : r === 'tester' ? 'Tester' : 'HR'

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-2xl mx-auto space-y-6"
    >
      {/* Back link */}
      <motion.div variants={item}>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-caption text-ink-muted hover:text-ink transition-colors font-code"
        >
          <ArrowLeft size={13} weight="bold" /> Back to Admin
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div variants={item}>
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="tile tile-go">Provisioning</span>
          <span className="designator opacity-50">CAPCOM · ACCOUNT</span>
        </div>
        <h1 className="text-display-md md:text-display-lg text-ink flex items-center gap-3">
          <UserPlus size={26} weight="fill" className="text-go shrink-0" />
          Create Developer Account
        </h1>
        <p className="text-body-sm text-ink-secondary mt-1 font-code">
          Provision a new developer account with a temporary password.
        </p>
      </motion.div>

      {result ? (
        <motion.div variants={item} className="space-y-5">
          <ConsolePanel
            rail="Account Created"
            designator={result.email}
            status="go"
            live
            action={<StatusTile status="go" label="PROVISIONED" />}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-tile bg-go-muted border border-go/30 flex items-center justify-center text-go shrink-0">
                  <Check size={18} weight="bold" />
                </span>
                <div>
                  <p className="text-body-sm text-ink font-medium">Account is live.</p>
                  <p className="text-caption text-ink-muted font-code">{result.email}</p>
                </div>
              </div>

              {/* Temp password reveal */}
              <div className="rounded-tile border border-caution/30 bg-caution-muted/40 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusTile status="caution" label="TEMPORARY PASSWORD" />
                  <span className="text-caption text-caution font-code">shown once · copy now</span>
                </div>
                <p className="text-caption text-ink-secondary mb-3">
                  Share this securely with the developer. It cannot be recovered after this view.
                </p>
                <div className="flex items-center gap-2 bg-panel border border-seam rounded-tile px-3 py-2">
                  <code className="flex-1 text-body-sm font-code text-ink select-all break-all">
                    {result.temp_password}
                  </code>
                  <button
                    onClick={handleCopyPassword}
                    aria-label={copied ? 'Password copied' : 'Copy password'}
                    className="p-1.5 rounded-tile border border-seam hover:border-seam-strong bg-panel transition-colors"
                    title="Copy password"
                  >
                    {copied
                      ? <Check size={14} weight="bold" className="text-go" />
                      : <Copy size={14} className="text-ink-secondary" />}
                  </button>
                </div>
                {copied && (
                  <p className="text-caption text-go font-code mt-2">Copied to clipboard.</p>
                )}
              </div>
            </div>
          </ConsolePanel>

          <motion.div variants={item} className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleReset} className="btn flex-1 gap-2">
              <UserPlus size={14} weight="bold" />
              Provision Another
            </button>
            <Link to="/admin" className="btn-secondary flex-1 text-center gap-2">
              Back to Admin
            </Link>
          </motion.div>
        </motion.div>
      ) : (
        <motion.form variants={item} onSubmit={handleSubmit}>
          <ConsolePanel
            rail="Account Provisioning"
            designator="FORM · READY"
            status={submitting ? 'standby' : 'go'}
          >
            <div className="space-y-4">
              {/* Name */}
              <label className="block">
                <span className="flex items-center gap-1.5 overline text-ink-muted/70 mb-1.5">
                  <IdentificationCard size={11} weight="bold" />
                  Full Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="John Doe"
                  className="input w-full"
                />
              </label>

              {/* Email */}
              <label className="block">
                <span className="flex items-center gap-1.5 overline text-ink-muted/70 mb-1.5">
                  <EnvelopeSimple size={11} weight="bold" />
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="developer@company.com"
                  className="input w-full"
                />
              </label>

              {/* Role */}
              <label className="block">
                <span className="flex items-center gap-1.5 overline text-ink-muted/70 mb-1.5">
                  <ShieldCheck size={11} weight="bold" />
                  Role
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="input w-full"
                >
                  <option value="junior_dev">Junior Developer</option>
                  <option value="developer">Developer</option>
                  <option value="tester">Tester</option>
                  <option value="hr">HR</option>
                </select>
                <p className="text-caption text-ink-muted mt-1.5 font-code">
                  Active role · {roleLabel(role)}
                </p>
              </label>

              {/* Team */}
              <label className="block">
                <span className="flex items-center gap-1.5 overline text-ink-muted/70 mb-1.5">
                  <UsersThree size={11} weight="bold" />
                  Team (optional)
                </span>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">No team (account only)</option>
                  {teams.map((t) => (
                    <option key={t.team_id} value={t.team_id}>{t.name}</option>
                  ))}
                </select>
              </label>

              {/* Welcome message */}
              <label className="block">
                <span className="flex items-center gap-1.5 overline text-ink-muted/70 mb-1.5">
                  <ChatText size={11} weight="bold" />
                  Welcome Message (optional)
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Brief welcome note…"
                  rows={3}
                  className="input w-full resize-none"
                />
              </label>

              <button
                type="submit"
                disabled={submitting || !name || !email}
                className="btn w-full gap-2 mt-2"
              >
                {submitting ? 'Creating Account…' : 'Create Account'}
                <UserPlus size={14} weight="bold" />
              </button>
            </div>
          </ConsolePanel>
        </motion.form>
      )}
    </motion.div>
  )
}
