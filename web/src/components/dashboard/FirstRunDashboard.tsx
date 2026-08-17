/*
 * ─── DIRECTION CONTRACT · ONRAMP FIRST RUN · FIRST PRINCIPLES ──────────────
 * THESIS: A brand-new user (no team, no data) — or a fresh team owner with
 *   zero members/tasks/repos — should never stare at a zero-filled mission
 *   console. Instead: one welcome verdict, four concrete next actions, and a
 *   glimpse of what unlocks. Status at 5 meters, action at 1 — same design
 *   language as Mission Control, but for day zero.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { StatusVerdict, ConsoleCard } from '../ui/first-principles'
import ConsolePanel from '../ui/console-panel'
import {
  Users, UserPlus, Compass, Rocket, GraduationCap, ArrowRight, Sparkle,
  ChatCircleDots, Graph, ListChecks,
} from '@phosphor-icons/react'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 16 } },
}

interface FirstRunDashboardProps {
  /** True when the user already belongs to a team but it has no data yet. */
  hasTeam?: boolean
}

export default function FirstRunDashboard({ hasTeam = false }: FirstRunDashboardProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const firstName = (user?.displayName || user?.name || '').split(' ')[0]

  const firstStep = hasTeam
    ? {
        n: '01',
        rail: 'Invite team members',
        designator: 'CREW',
        Icon: UserPlus,
        to: '/team',
        desc: 'Your team is created — bring colleagues on board and assign roles.',
      }
    : {
        n: '01',
        rail: 'Create your team',
        designator: 'TEAM',
        Icon: Users,
        to: '/team',
        desc: 'Set up your workspace — members, roles, and module-level access all live here.',
      }

  const steps = [
    firstStep,
    {
      n: '02',
      rail: 'Explore a repository',
      designator: 'REPO',
      Icon: Compass,
      to: '/explore',
      desc: 'Paste any GitHub URL and get an architecture map, dependency graph, and guided paths in minutes.',
    },
    {
      n: '03',
      rail: 'Start onboarding plan',
      designator: 'RAMP',
      Icon: Rocket,
      to: '/onboarding-plan',
      desc: 'Generate a 30-60-90 day plan so your ramp is tracked from day one.',
    },
    {
      n: '04',
      rail: 'Learn fundamentals',
      designator: 'LEARN',
      Icon: GraduationCap,
      to: '/learn',
      desc: 'Work through learning paths and curated first issues to build momentum.',
    },
  ]

  const CAPABILITIES = [
    { Icon: Graph, label: 'Architecture Explorer' },
    { Icon: ChatCircleDots, label: 'Ask Codebase' },
    { Icon: ListChecks, label: 'Tasks & Reviews' },
    { Icon: Sparkle, label: 'AI Onboarding Plans' },
  ]

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div variants={item} className="mb-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="tile tile-go">Welcome</span>
          <span className="designator opacity-50">
            {hasTeam ? 'NEW TEAM · GETTING STARTED' : 'FIRST CONTACT · GETTING STARTED'}
          </span>
        </div>
        <h1 className="text-display-md md:text-display-lg text-ink mb-1">
          {firstName ? `Welcome aboard, ${firstName}` : 'Welcome aboard'}
        </h1>
        <p className="text-body-sm text-ink-secondary mt-1 font-code">
          {hasTeam
            ? 'Your team is on station — stock it with members and take your first flight.'
            : 'Your station is live — set up your workspace and take your first flight.'}
        </p>
      </motion.div>

      {/* ── Verdict hero ────────────────────────────────────────────── */}
      <motion.div variants={item} className="mb-6">
        <StatusVerdict
          verdict="go"
          label={hasTeam ? 'Your team is ready' : 'All systems ready'}
          detail={
            hasTeam
              ? 'Invite your colleagues, then explore a repo to light up the mission console.'
              : "You're signed in and your account is active. Everything below is optional — move at your own pace."
          }
          action={
            <button onClick={() => navigate('/team')} className="btn-glass">
              {hasTeam ? 'Add team members' : 'Create your team'}
              <ArrowRight size={14} weight="bold" className="ml-1.5" />
            </button>
          }
        />
      </motion.div>

      {/* ── Four next actions ──────────────────────────────────────── */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-6">
        {steps.map((s) => (
          <Link key={s.n} to={s.to} className="group block">
            <ConsoleCard
              rail={`STEP ${s.n}`}
              designator={s.designator}
              className="h-full transition-all duration-200 hover:border-seam-strong hover:shadow-lift"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-tile bg-well/60 border border-seam flex items-center justify-center text-ink-secondary group-hover:text-go group-hover:border-go/30 transition-colors shrink-0">
                  <s.Icon size={20} weight="duotone" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-body-sm font-semibold text-ink group-hover:text-go transition-colors">
                    {s.rail}
                  </h3>
                  <p className="text-caption text-ink-muted mt-1.5 leading-relaxed">{s.desc}</p>
                </div>
                <ArrowRight
                  size={16}
                  weight="bold"
                  className="text-ink-muted/30 group-hover:text-go group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                />
              </div>
            </ConsoleCard>
          </Link>
        ))}
      </motion.div>

      {/* ── What unlocks ───────────────────────────────────────────── */}
      <motion.div variants={item}>
        <ConsolePanel rail="What unlocks next" designator="CAPABILITIES" status="go" live>
          <div className="flex flex-wrap gap-2">
            {CAPABILITIES.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-well/50 border border-seam text-caption text-ink-secondary"
              >
                <c.Icon size={15} weight="duotone" className="text-go" />
                {c.label}
              </span>
            ))}
          </div>
        </ConsolePanel>
      </motion.div>
    </motion.div>
  )
}
