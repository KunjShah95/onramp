import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence, useInView, useMotionValue, useSpring, useTransform, animate } from 'framer-motion'
import { cn } from '../lib/utils'
import { createOnboardingPlan, getOnboardingPlan, listOnboardingPlans, completeMilestone, submitPulse, getPulseTrends, fetchPlanRoadmap } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import StatusTile from '../components/ui/status-tile'
import { Modal } from '../components/ui/modal'
import {
  Rocket, Target, Users, Fire, Lightbulb,
  Handshake, Code, TrendUp, X, ListChecks,
  Compass, Flag, Sparkle, Check, Circle, CaretDoubleDown,
  Waveform,
} from '@phosphor-icons/react'

const CATEGORY_CONFIG: Record<string, { label: string; hue: string; icon: any }> = {
  // Mission Control: category identity is carried by the label + mono designator,
  // never by decorative color. Every chip seats on the neutral room surface.
  technical: { label: 'Technical', hue: 'bg-well text-ink-tertiary border-seam', icon: Code },
  cultural: { label: 'Cultural', hue: 'bg-well text-ink-tertiary border-seam', icon: Handshake },
  process: { label: 'Process', hue: 'bg-well text-ink-tertiary border-seam', icon: ListChecks },
  product: { label: 'Product', hue: 'bg-well text-ink-tertiary border-seam', icon: Lightbulb },
  social: { label: 'Social', hue: 'bg-well text-ink-tertiary border-seam', icon: Users },
}

const SENTIMENT = [
  { value: 'very_happy', label: 'Stoked', icon: Fire },
  { value: 'happy', label: 'Good', icon: TrendUp },
  { value: 'neutral', label: 'Okay', icon: Circle },
  { value: 'frustrated', label: 'Meh', icon: X },
  { value: 'very_frustrated', label: 'Tough', icon: X },
]

const ASSIGNEE: Record<string, string> = {
  developer: 'Dev', hr: 'HR', it: 'IT', manager: 'Mgr', buddy: 'Buddy',
}

const ASSIGNEE_COLORS: Record<string, string> = {
  developer: 'text-ink-tertiary border-seam bg-well',
  hr: 'text-ink-tertiary border-seam bg-well',
  it: 'text-ink-tertiary border-seam bg-well',
  manager: 'text-ink-tertiary border-seam bg-well',
  buddy: 'text-ink-tertiary border-seam bg-well',
}

function ProgressRing({ pct, size = 88 }: { pct: number; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const r = size * 0.42
  const circ = 2 * Math.PI * r
  // A single spring drives the live arc AND the readout, so the number
  // settles in lock-step with the ring — a weighted instrument, not a spinner.
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 90, damping: 26, mass: 0.8 })
  const dash = useTransform(spring, (v) => circ - (v / 100) * circ)
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(mv, pct, { duration: 1.2, ease: [0.16, 1, 0.3, 1] })
    const unsub = spring.on('change', (v) => setDisplay(Math.round(v)))
    return () => { controls.stop(); unsub() }
  }, [inView, pct, mv, spring])

  return (
    <div ref={ref} className="relative">
      <svg width={size} height={size} className="block -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(24,27,24,0.10)" strokeWidth={5} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="var(--go)"
          strokeWidth={5}
          strokeLinecap="butt"
          strokeDasharray={circ}
          style={{ strokeDashoffset: dash }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-display-sm font-bold text-ink tabular-nums leading-none">{display}</span>
        <span className="text-[8px] text-ink-muted/40 tracking-widest uppercase mt-0.5">pct</span>
      </div>
    </div>
  )
}

function PulseCheckModal({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [week, setWeek] = useState(1)
  const [scores, setScores] = useState({ confidence: 7, clarity: 7, support: 7, workload: 5 })
  const [sentiment, setSentiment] = useState('happy')
  const [feedback, setFeedback] = useState('')

  const pulseMutation = useMutation({
    mutationFn: () => submitPulse(planId, {
      week_number: week, confidence_score: scores.confidence, clarity_score: scores.clarity,
      support_score: scores.support, workload_score: scores.workload,
      sentiment, open_feedback: feedback || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const avg = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 4)
  const avgColor = avg >= 7 ? 'text-go' : avg >= 4 ? 'text-caution' : 'text-abort'

  return (
    <Modal open onClose={onClose} title="Weekly Pulse" maxWidth="max-w-lg">
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-tile bg-well border border-seam flex items-center justify-center text-mission">
            <Waveform size={18} weight="fill" />
          </div>
          <p className="text-caption text-ink-muted">How's the onboarding feeling?</p>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded-card bg-well/70 border border-seam">
          <span className="text-caption text-ink-muted">Week</span>
          <div className="flex gap-1">
            {[1,2,4,6,8,12].map(w => (
              <button key={w} onClick={() => setWeek(w)}
                className={cn('px-3 py-1.5 rounded-md text-caption font-code tabular-nums transition-all',
                  week === w ? 'bg-panel text-ink border border-seam-strong' : 'text-ink-muted/40 hover:text-ink-muted')}>
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {(['confidence', 'clarity', 'support', 'workload'] as const).map((key) => (
            <div key={key}>
              <div className="flex justify-between text-caption mb-1.5">
                <span className="text-ink-muted capitalize">{key}</span>
                <span className={cn('font-code text-sm tabular-nums', avgColor)}>{scores[key]}/10</span>
              </div>
              <div className="relative h-1.5 rounded-sm bg-well overflow-hidden">
                <div
                  className={cn('h-full rounded-sm', key === 'workload' ? 'bg-caution' : 'bg-mission')}
                  style={{ width: `${scores[key] * 10}%` }}
                />
              </div>
              <input type="range" min={1} max={10} value={scores[key]}
                onChange={(e) => setScores(s => ({ ...s, [key]: Number(e.target.value) }))}
                className="w-full mt-1 opacity-0 absolute top-0 left-0 h-8 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-ink-muted/40 px-0.5 -mt-0.5">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="text-caption text-ink-muted mb-2 block">Mood</label>
          <div className="flex gap-2">
            {SENTIMENT.map(s => (
              <button key={s.value} onClick={() => setSentiment(s.value)}
                className={cn('flex-1 py-2.5 rounded-md border text-center transition-all',
                  sentiment === s.value
                    ? 'bg-well border-seam-strong text-ink'
                    : 'border-seam text-ink-muted/30 hover:text-ink-muted/60 bg-well/40')}>
                <s.icon size={16} className="mx-auto mb-0.5" weight={sentiment === s.value ? 'fill' : 'regular'} />
                <span className="text-[9px] block font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
            placeholder="Anything on your mind? Blockers, wins, questions..."
            className="w-full bg-base border border-seam-strong rounded-sm px-3 py-2.5 text-body-xs h-16 resize-none focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(14_122_60_/_0.12)] transition-all"
          />
        </div>

        <div className="pt-1">
          <button onClick={() => pulseMutation.mutate()} disabled={pulseMutation.isPending}
            className="btn btn-primary w-full py-3 text-sm font-semibold disabled:opacity-50">
            {pulseMutation.isPending ? 'Submitting…' : 'Submit Pulse'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PhaseColumn({ label, data, icon: Icon, hue }: { label: string; data: any[]; icon: any; hue: string }) {
  const qc = useQueryClient()
  const done = data.filter((m: any) => m.is_completed).length

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeMilestone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  })

  return (
    <div className="relative">
      <div className="sticky top-20 z-10 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className={cn('w-9 h-9 rounded-tile flex items-center justify-center border', hue)}>
            <Icon size={16} weight="fill" />
          </div>
          <div>
            <div className="text-body-sm font-bold text-ink">{label}</div>
            <div className="text-caption text-ink-muted/60 font-code tabular-nums">{done}/{data.length} complete</div>
          </div>
        </div>
      </div>

      <div className="relative ml-[18px] pl-6 border-l border-seam">
        {data.length === 0 ? (
          <p className="text-caption text-ink-muted/40 italic py-3">No milestones yet</p>
        ) : (
          <div className="space-y-0">
            {data.map((m) => {
              const cat = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.technical
              const CatIcon = cat.icon
              return (
                <div
                  key={m.id}
                  className={cn(
                    'relative group pb-3',
                    m.is_completed ? 'opacity-50' : ''
                  )}
                >
                  <div className={cn(
                    'absolute -left-[25px] top-2.5 w-2 h-2 rounded-[2px] border transition-all',
                    m.is_completed
                      ? 'bg-go border-go'
                      : 'bg-well border-seam group-hover:border-go/40'
                  )} />
                  <div className={cn(
                    'p-3 rounded-card border transition-all',
                    m.is_completed
                      ? 'bg-well/40 border-seam'
                      : 'bg-panel border-seam group-hover:border-seam-strong'
                  )}>
                    <div className="flex items-start gap-2.5">
                      <button onClick={() => !m.is_completed && completeMutation.mutate(m.id)}
                        disabled={m.is_completed}
                        className={cn(
                          'w-5 h-5 rounded-sm flex items-center justify-center shrink-0 mt-0.5 transition-all',
                          m.is_completed
                            ? 'bg-go text-[var(--panel-raised)]'
                            : 'bg-well border border-seam text-ink-muted/40 hover:border-go/50 hover:text-go'
                        )}>
                        {m.is_completed ? <Check size={10} weight="bold" /> : <Circle size={10} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CatIcon size={10} className="text-ink-muted/40" />
                          <span className={cn('text-body-xs', m.is_completed ? 'text-ink-muted/50 line-through' : 'text-ink')}>
                            {m.title}
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-caption text-ink-muted/50 leading-relaxed">{m.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

export default function OnboardingPlanPage() {
  const { user, activeTeamId } = useAuth()
  const [planId, setPlanId] = useState<string | null>(null)
  const [showPulse, setShowPulse] = useState(false)

  const { data: plans } = useQuery({
    queryKey: ['onboardingPlans', activeTeamId],
    queryFn: () => listOnboardingPlans({ team_id: activeTeamId || undefined }),
    enabled: !!activeTeamId, staleTime: 30_000,
  })

  const { data: plan } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getOnboardingPlan(planId!),
    enabled: !!planId, staleTime: 15_000,
  })

  const { data: pulseData } = useQuery({
    queryKey: ['pulseTrends', planId],
    queryFn: () => getPulseTrends(planId!),
    enabled: !!planId,
  })

  const qc = useQueryClient()
  const createMutation = useMutation({
    mutationFn: () => createOnboardingPlan({ team_id: activeTeamId!, user_id: user?.id || '' }),
    onSuccess: (data) => { setPlanId(data.id); qc.invalidateQueries({ queryKey: ['onboardingPlans'] }) },
  })

  const planToShow = plan || (plans && plans[0])

  const { data: roadmap } = useQuery({
    queryKey: ['planRoadmap', planToShow?.id],
    queryFn: () => fetchPlanRoadmap(planToShow!.id),
    enabled: !!planToShow?.id,
    staleTime: 15_000,
  })
  const milestones30 = planToShow?.milestones?.filter((m: any) => m.day_target === 30) || []
  const milestones60 = planToShow?.milestones?.filter((m: any) => m.day_target === 60) || []
  const milestones90 = planToShow?.milestones?.filter((m: any) => m.day_target === 90) || []
  const preBoard = planToShow?.pre_boarding_tasks || []
  const pulses = planToShow?.pulse_surveys || []
  const trends = pulseData?.trends || {}
  const allDone = [...milestones30, ...milestones60, ...milestones90].filter((m: any) => m.is_completed).length
  const allTotal = [...milestones30, ...milestones60, ...milestones90].length
  const progressPct = allTotal > 0 ? Math.round((allDone / allTotal) * 100) : 0
  const preDone = preBoard.filter((t: any) => t.is_completed).length

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 px-4 sm:px-6 py-6">
        {/* Hero */}
        <motion.div variants={item} className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative shrink-0">
                {planToShow ? (
                  <ProgressRing pct={progressPct} />
                ) : (
                  <div className="w-[88px] h-[88px] rounded-full bg-well border border-seam flex items-center justify-center">
                    <Target size={32} className="text-ink-muted/30" />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="tile tile-go">{planToShow ? 'Plan Active' : 'Onboarding Plan'}</span>
                  <span className="designator opacity-50">ONBOARDING JOURNEY</span>
                </div>
                <h1 className="text-display-md md:text-display-lg text-ink mb-1">{planToShow ? 'Plan Active' : 'Onboarding Plan'}</h1>
                <p className="text-body-sm text-ink-secondary font-code">
                  {planToShow
                    ? `${allDone}/${allTotal} milestones · Pre-boarding ${preDone}/${preBoard.length}`
                    : 'Create a 30-60-90 day plan to track your onboarding'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {planToShow ? (
                <button onClick={() => setShowPulse(true)}
                  className="group flex items-center gap-2.5 bg-well hover:bg-panel-raised border border-seam px-4 py-2.5 rounded-md text-body-xs font-medium text-ink transition-all">
                  <span aria-hidden="true" className="w-2 h-2 rounded-[2px] bg-go" />
                  Pulse Check
                </button>
              ) : (
                <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                  className="btn flex items-center gap-2">
                  <Sparkle size={14} weight="fill" />
                  {createMutation.isPending ? 'Creating...' : 'Create Plan'}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {planToShow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="mb-9 flex items-center gap-3"
          >
            <div className="flex-1 h-px bg-border/60 relative overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-go"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
              />
            </div>
            <span className="readout text-[10px] text-ink-muted/60 tabular-nums uppercase tracking-wider shrink-0">
              OVERALL · {progressPct}%
            </span>
          </motion.div>
        )}

        {!planToShow ? (
          <motion.div variants={item}>
            <div className="rounded-card border border-seam bg-panel p-12 flex items-center justify-center min-h-[400px]">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-card bg-well border border-seam flex items-center justify-center mx-auto mb-5">
                  <Compass size={30} className="text-ink-muted/20" />
                </div>
                <p className="text-ink-muted/40 text-body-sm mb-1 font-medium">No plan yet</p>
                <p className="text-caption text-ink-muted/20 mb-6">Set up a personalized 30-60-90 day plan with milestones, pre-boarding tasks, and weekly pulse checks.</p>
                <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                  className="btn flex items-center gap-2 mx-auto">
                  <Flag size={14} />
                  Start Your Journey
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Pulse trend bar */}
            {pulses.length > 0 && (
              <motion.div variants={item} className="mb-8">
                <div className="relative overflow-hidden rounded-md border border-seam bg-panel shadow-seam p-5">
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-4">
                      <Fire size={14} className="text-ink-tertiary" weight="fill" />
                      <span className="text-body-xs font-semibold text-ink">Wellness Trend</span>
                      <span className="text-caption text-ink-muted/30 tabular-nums readout">{pulses.length} check-ins</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        { label: 'Confidence', val: trends.confidence_avg, color: 'text-ink' },
                        { label: 'Clarity', val: trends.clarity_avg, color: 'text-ink' },
                        { label: 'Support', val: trends.support_avg, color: 'text-ink' },
                        { label: 'Workload', val: trends.workload_avg, color: 'text-ink' },
                      ] as const).map(t => (
                        <div key={t.label} className="text-center p-2.5 rounded-md bg-well/40 border border-seam/40">
                          <motion.div
                            className={cn('font-code text-display-sm font-bold tabular-nums', t.color)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                          >
                            {t.val !== null && t.val !== undefined ? Number(t.val).toFixed(1) : '—'}
                          </motion.div>
                          <div className="text-overline text-ink-muted/40">{t.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Pre-Boarding */}
            {preBoard.length > 0 && (
              <motion.div variants={item} className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <ListChecks size={14} className="text-ink-tertiary" />
                  <h2 className="text-body-sm font-bold text-ink">Pre-Boarding</h2>
                  <span className="text-caption text-ink-muted/30 tabular-nums">{preDone}/{preBoard.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {preBoard.map((t: any) => {
                    const done = t.is_completed
                    return (
                      <motion.div
                        key={t.id}
                        whileHover={{ y: -2 }}
                        className={cn(
                          'p-3 rounded-xl border transition-all',
                          done ? 'bg-well/30 border-seam/30' : 'bg-panel border-seam hover:border-seam-strong'
                        )}
                      >
                        <div className={cn(
                          'text-[10px] font-code px-1.5 py-0.5 rounded-md border inline-block mb-2',
                          ASSIGNEE_COLORS[t.assignee] || 'text-ink-muted/40 border-seam bg-well'
                        )}>
                          {ASSIGNEE[t.assignee] || t.assignee}
                        </div>
                        <p className={cn('text-body-xs leading-relaxed', done ? 'text-ink-muted/40 line-through' : 'text-ink')}>
                          {t.title}
                        </p>
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* Roadmap — dependency-aware progression */}
            {roadmap && roadmap.milestones.length > 0 && (
              <motion.div variants={item} className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <ListChecks size={14} className="text-ink-tertiary" />
                  <h2 className="text-body-sm font-bold text-ink">Roadmap</h2>
                  <span className="text-caption text-ink-muted/30 tabular-nums">
                    {roadmap.milestones.filter((m) => m.is_completed).length}/{roadmap.milestones.length} · statuses from milestone dependencies
                  </span>
                </div>
                <div className="flex flex-wrap items-stretch gap-2">
                  {roadmap.milestones.map((m, i) => {
                    const cat = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.technical
                    return (
                      <div key={m.id} className="flex items-stretch gap-2">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          whileHover={{ y: -2 }}
                          viewport={{ once: true, margin: '-40px' }}
                          transition={{ delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          className={cn(
                            'w-44 p-3 rounded-md border transition-all',
                            m.status === 'completed' && 'bg-well/30 border-seam',
                            m.status === 'in_progress' && 'bg-panel border-go',
                            m.status === 'available' && 'bg-panel border-seam hover:border-seam-strong',
                            m.status === 'locked' && 'bg-well/40 border-seam/50 opacity-50'
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <cat.icon size={10} className="text-ink-muted/40" />
                            <span className="text-overline font-semibold uppercase tracking-widest">
                              Day {m.day_target ?? '—'}
                            </span>
                          </div>
                          <p className={cn('text-body-xs leading-snug mb-2', m.is_completed ? 'line-through text-ink-muted/50' : 'text-ink')}>
                            {m.title}
                          </p>
                          <div className={cn(
                            'inline-flex items-center',
                            m.status === 'locked' && 'opacity-60'
                          )}>
                            <StatusTile
                              status={m.status === 'completed' ? 'go' : m.status === 'in_progress' ? 'standby' : 'idle'}
                              label={m.status === 'in_progress' ? 'ACTIVE' : m.status === 'available' ? 'AVAILABLE' : m.status}
                              designator={m.status === 'locked' ? 'LOCKED' : undefined}
                            />
                          </div>
                          {m.depends_on.length > 0 && (
                            <div className="mt-2 text-[9px] text-ink-muted/30 font-code truncate">
                              needs {m.depends_on.length} prior
                            </div>
                          )}
                        </motion.div>
                        {i < roadmap.milestones.length - 1 && (
                          <div className="hidden sm:flex items-center text-ink-muted/20">
                            <CaretDoubleDown size={10} className="rotate-[-90deg]" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* 30-60-90 Day Phases */}
            <motion.div variants={item}>
              <div className="relative flex items-center gap-2 mb-6">
                <div className="flex-1 h-px bg-border" />
                <CaretDoubleDown size={14} className="text-ink-muted/40" />
                <span className="text-overline text-ink-muted/60">Milestone Plan</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <PhaseColumn label="30 Days — Foundation" data={milestones30} icon={Compass} hue="text-ink-secondary border-seam bg-well" />
                <PhaseColumn label="60 Days — Growth" data={milestones60} icon={Target} hue="text-ink-secondary border-seam bg-well" />
                <PhaseColumn label="90 Days — Flight" data={milestones90} icon={Rocket} hue="text-ink-secondary border-seam bg-well" />
              </div>
            </motion.div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showPulse && planToShow && <PulseCheckModal planId={planToShow.id} onClose={() => setShowPulse(false)} />}
      </AnimatePresence>
    </motion.div>
  )
}
