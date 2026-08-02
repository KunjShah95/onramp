import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { createOnboardingPlan, getOnboardingPlan, listOnboardingPlans, completeMilestone, submitPulse, getPulseTrends, fetchPlanRoadmap } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import {
  Rocket, Target, Users, Fire, Lightbulb,
  Handshake, Code, TrendUp, X, ListChecks,
  Compass, Flag, Sparkle, Check, Circle, CaretDoubleDown,
  Waveform,
} from '@phosphor-icons/react'

const CATEGORY_CONFIG: Record<string, { label: string; hue: string; icon: any }> = {
  technical: { label: 'Technical', hue: 'from-amber-400/80 to-amber-500/40', icon: Code },
  cultural: { label: 'Cultural', hue: 'from-blue-400/80 to-blue-500/40', icon: Handshake },
  process: { label: 'Process', hue: 'from-orange-400/80 to-orange-500/40', icon: ListChecks },
  product: { label: 'Product', hue: 'from-emerald-400/80 to-emerald-500/40', icon: Lightbulb },
  social: { label: 'Social', hue: 'from-pink-400/80 to-pink-500/40', icon: Users },
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
  developer: 'text-amber-400 border-amber-400/30 bg-amber-400/8',
  hr: 'text-blue-400 border-blue-400/30 bg-blue-400/8',
  it: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/8',
  manager: 'text-purple-400 border-purple-400/30 bg-purple-400/8',
  buddy: 'text-pink-400 border-pink-400/30 bg-pink-400/8',
}

function ProgressRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const r = size * 0.42
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="ring-progress drop-shadow-glow">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.04)" strokeWidth={5} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="url(#ringGrad)"
        strokeWidth={5}
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0E7A3C" />
          <stop offset="100%" stopColor="#17A34A" />
        </linearGradient>
      </defs>
    </svg>
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
  const avgColor = avg >= 7 ? 'text-emerald-400' : avg >= 4 ? 'text-amber-400' : 'text-red-400'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-4 rounded-2xl border border-border bg-bg-secondary shadow-elevated-lg overflow-hidden"
      >
        <div className="relative p-6 pb-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-accent-soft border border-accent/20 flex items-center justify-center">
                <Waveform size={18} className="text-amber-400" weight="fill" />
              </div>
              <div>
                <h2 className="text-body font-bold text-text-primary">Weekly Pulse</h2>
                <p className="text-caption text-text-muted/50">How's the onboarding feeling?</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-bg-tertiary border border-border flex items-center justify-center text-text-muted hover:text-text-primary transition-all">
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between mb-6 p-3 rounded-xl bg-bg-tertiary/60 border border-border">
            <span className="text-body-xs text-text-muted/60">Week</span>
            <div className="flex gap-1">
              {[1,2,4,6,8,12].map(w => (
                <button key={w} onClick={() => setWeek(w)}
                  className={cn('px-3 py-1.5 rounded-lg text-caption font-code transition-all',
                    week === w ? 'bg-amber-400/15 text-amber-400 border border-amber-400/20' : 'text-text-muted/40 hover:text-text-muted')}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 space-y-4">
          {(['confidence', 'clarity', 'support', 'workload'] as const).map((key) => (
            <div key={key}>
              <div className="flex justify-between text-caption mb-1.5">
                <span className="text-text-muted/60 capitalize">{key}</span>
                <span className={cn('font-code text-sm tabular-nums', avgColor)}>{scores[key]}/10</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full', key === 'workload' ? 'bg-amber-400' : 'bg-gradient-to-r from-amber-500 to-emerald-400')}
                  initial={{ width: 0 }}
                  animate={{ width: `${scores[key] * 10}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <input type="range" min={1} max={10} value={scores[key]}
                onChange={(e) => setScores(s => ({ ...s, [key]: Number(e.target.value) }))}
                className="w-full mt-1 opacity-0 absolute top-0 left-0 h-8 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-text-muted/20 px-0.5 -mt-0.5">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pt-5">
          <label className="text-caption text-text-muted/60 mb-2 block">Mood</label>
          <div className="flex gap-2">
            {SENTIMENT.map(s => (
              <button key={s.value} onClick={() => setSentiment(s.value)}
                className={cn('flex-1 py-2.5 rounded-xl border text-center transition-all',
                  sentiment === s.value
                    ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                    : 'border-border text-text-muted/30 hover:text-text-muted/60 bg-bg-tertiary')}>
                <s.icon size={16} className="mx-auto mb-0.5" weight={sentiment === s.value ? 'fill' : 'regular'} />
                <span className="text-[9px] block font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pt-4 pb-6">
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
            placeholder="Anything on your mind? Blockers, wins, questions..."
            className="w-full bg-bg-tertiary border border-border rounded-xl px-3 py-2.5 text-body-xs h-16 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400/30 transition-all"
          />
        </div>

        <div className="px-6 pb-6">
          <button onClick={() => pulseMutation.mutate()} disabled={pulseMutation.isPending}
            className="w-full bg-gradient-to-r from-amber-500 to-emerald-500 hover:brightness-110 text-[#09090B] py-3 rounded-xl text-body-sm font-semibold transition-all shadow-glow disabled:opacity-50">
            {pulseMutation.isPending ? (
              <span className="flex items-center justify-center gap-2"><span className="loader w-4 h-4" /> Submitting...</span>
            ) : 'Submit Pulse'}
          </button>
        </div>
      </motion.div>
    </motion.div>
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
    <motion.div variants={item} className="relative">
      <div className="sticky top-20 z-10 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center border', hue)}>
            <Icon size={16} weight="fill" />
          </div>
          <div>
            <div className="text-body-sm font-bold text-text-primary">{label}</div>
            <div className="text-caption text-text-muted/40 tabular-nums">{done}/{data.length} complete</div>
          </div>
        </div>
      </div>

      <div className="relative ml-[18px] pl-6 border-l border-border/40">
        {data.length === 0 ? (
          <p className="text-caption text-text-muted/20 italic py-3">No milestones yet</p>
        ) : (
          <div className="space-y-0">
            {data.map((m, i) => {
              const cat = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.technical
              const CatIcon = cat.icon
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.35 }}
                  className={cn(
                    'relative group pb-3',
                    m.is_completed ? 'opacity-50' : ''
                  )}
                >
                  <div className={cn(
                    'absolute -left-[25px] top-2.5 w-2 h-2 rounded-full border-2 transition-all',
                    m.is_completed
                      ? 'bg-emerald-400 border-emerald-400/40'
                      : 'bg-bg-tertiary border-border group-hover:border-amber-400/30'
                  )} />
                  <div className={cn(
                    'p-3 rounded-xl border transition-all',
                    m.is_completed
                      ? 'bg-bg-tertiary/30 border-border'
                      : 'bg-bg-secondary border-border group-hover:border-border-hover'
                  )}>
                    <div className="flex items-start gap-2.5">
                      <button onClick={() => !m.is_completed && completeMutation.mutate(m.id)}
                        disabled={m.is_completed}
                        className={cn(
                          'w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all',
                          m.is_completed
                            ? 'bg-emerald-400 text-[#09090B]'
                            : 'bg-bg-tertiary border border-border text-text-muted/20 hover:border-amber-400/30 hover:text-amber-400'
                        )}>
                        {m.is_completed ? <Check size={10} weight="bold" /> : <Circle size={10} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CatIcon size={10} className="text-text-muted/40" />
                          <span className={cn('text-body-xs', m.is_completed ? 'text-text-muted/50 line-through' : 'text-text-primary')}>
                            {m.title}
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-caption text-text-muted/30 leading-relaxed">{m.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
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
                <div className="absolute inset-0 bg-gradient-accent/10 rounded-full blur-2xl" />
                {planToShow ? (
                  <div className="relative">
                    <ProgressRing pct={progressPct} size={88} />
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="font-display text-display-sm font-bold text-text-primary tabular-nums leading-none">{progressPct}</span>
                      <span className="text-[8px] text-text-muted/40 tracking-widest uppercase mt-0.5">pct</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-[88px] h-[88px] rounded-full bg-bg-tertiary border border-border flex items-center justify-center">
                    <Target size={32} className="text-text-muted/30" />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Rocket size={16} className="text-amber-400" weight="duotone" />
                  <span className="text-overline text-amber-400/80">Onboarding Journey</span>
                </div>
                <GradientHeading as="h1" className="text-display-md mb-1">{planToShow ? 'Plan Active' : 'Onboarding Plan'}</GradientHeading>
                <p className="text-body-sm text-text-muted/60">
                  {planToShow
                    ? `${allDone}/${allTotal} milestones · Pre-boarding ${preDone}/${preBoard.length}`
                    : 'Create a 30-60-90 day plan to track your onboarding'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {planToShow ? (
                <button onClick={() => setShowPulse(true)}
                  className="group flex items-center gap-2.5 bg-bg-tertiary hover:bg-bg-elevated border border-border px-4 py-2.5 rounded-xl text-body-xs font-medium text-text-primary transition-all">
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
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

        {!planToShow ? (
          <motion.div variants={item}>
            <CardSpotlight className="p-12 flex items-center justify-center min-h-[400px]">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center mx-auto mb-5">
                  <Compass size={30} className="text-text-muted/20" />
                </div>
                <p className="text-text-muted/40 text-body-sm mb-1 font-medium">No plan yet</p>
                <p className="text-caption text-text-muted/20 mb-6">Set up a personalized 30-60-90 day plan with milestones, pre-boarding tasks, and weekly pulse checks.</p>
                <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
                  className="btn flex items-center gap-2 mx-auto">
                  <Flag size={14} />
                  Start Your Journey
                </button>
              </div>
            </CardSpotlight>
          </motion.div>
        ) : (
          <>
            {/* Pulse trend bar */}
            {pulses.length > 0 && (
              <motion.div variants={item} className="mb-8">
                <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-amber-500/[0.04] via-transparent to-emerald-500/[0.04] p-5">
                  <div className="absolute inset-0 dot-grid opacity-30" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-4">
                      <Fire size={14} className="text-amber-400" weight="fill" />
                      <span className="text-body-xs font-semibold text-text-primary">Wellness Trend</span>
                      <span className="text-caption text-text-muted/30 tabular-nums">{pulses.length} check-ins</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        { label: 'Confidence', val: trends.confidence_avg, color: 'text-emerald-400' },
                        { label: 'Clarity', val: trends.clarity_avg, color: 'text-amber-400' },
                        { label: 'Support', val: trends.support_avg, color: 'text-blue-400' },
                        { label: 'Workload', val: trends.workload_avg, color: 'text-purple-400' },
                      ] as const).map(t => (
                        <div key={t.label} className="text-center p-2.5 rounded-xl bg-bg-tertiary/40 border border-border/40">
                          <motion.div
                            className={cn('font-display text-display-sm font-bold tabular-nums', t.color)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                          >
                            {t.val !== null && t.val !== undefined ? Number(t.val).toFixed(1) : '—'}
                          </motion.div>
                          <div className="text-overline text-text-muted/40">{t.label}</div>
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
                  <ListChecks size={14} className="text-amber-400" />
                  <h2 className="text-body-sm font-bold text-text-primary">Pre-Boarding</h2>
                  <span className="text-caption text-text-muted/30 tabular-nums">{preDone}/{preBoard.length}</span>
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
                          done ? 'bg-bg-tertiary/30 border-border/30' : 'bg-bg-secondary border-border hover:border-border-hover'
                        )}
                      >
                        <div className={cn(
                          'text-[10px] font-code px-1.5 py-0.5 rounded-md border inline-block mb-2',
                          ASSIGNEE_COLORS[t.assignee] || 'text-text-muted/40 border-border bg-bg-tertiary'
                        )}>
                          {ASSIGNEE[t.assignee] || t.assignee}
                        </div>
                        <p className={cn('text-body-xs leading-relaxed', done ? 'text-text-muted/40 line-through' : 'text-text-primary')}>
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
                  <ListChecks size={14} className="text-emerald-400" />
                  <h2 className="text-body-sm font-bold text-text-primary">Roadmap</h2>
                  <span className="text-caption text-text-muted/30 tabular-nums">
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
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className={cn(
                            'w-44 p-3 rounded-xl border transition-all',
                            m.status === 'completed' && 'bg-emerald-500/[0.06] border-emerald-500/20',
                            m.status === 'in_progress' && 'bg-amber-500/[0.08] border-amber-500/30 shadow-glow',
                            m.status === 'available' && 'bg-bg-secondary border-border hover:border-border-hover',
                            m.status === 'locked' && 'bg-bg-tertiary/40 border-border/50 opacity-50'
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <cat.icon size={10} className="text-text-muted/40" />
                            <span className="text-overline font-semibold uppercase tracking-widest">
                              Day {m.day_target ?? '—'}
                            </span>
                          </div>
                          <p className={cn('text-body-xs leading-snug mb-2', m.is_completed ? 'line-through text-text-muted/50' : 'text-text-primary')}>
                            {m.title}
                          </p>
                          <div className={cn(
                            'inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md uppercase tracking-wider',
                            m.status === 'completed' && 'bg-emerald-500/15 text-emerald-400',
                            m.status === 'in_progress' && 'bg-amber-500/15 text-amber-400',
                            m.status === 'available' && 'bg-blue-500/15 text-blue-400',
                            m.status === 'locked' && 'bg-bg-tertiary text-text-muted/40'
                          )}>
                            {m.status === 'completed' ? <Check size={8} weight="bold" /> : null}
                            {m.status === 'locked' ? '🔒 ' : null}
                            {m.status === 'in_progress' ? '▶ ' : null}
                            {m.status}
                          </div>
                          {m.depends_on.length > 0 && (
                            <div className="mt-2 text-[9px] text-text-muted/30 font-code truncate">
                              needs {m.depends_on.length} prior
                            </div>
                          )}
                        </motion.div>
                        {i < roadmap.milestones.length - 1 && (
                          <div className="hidden sm:flex items-center text-text-muted/20">
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
                <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 via-transparent to-transparent" />
                <CaretDoubleDown size={14} className="text-amber-400/50" />
                <span className="text-overline text-amber-400/60">Milestone Plan</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <PhaseColumn label="30 Days — Foundation" data={milestones30} icon={Compass} hue="text-amber-400 border-amber-400/20 bg-amber-400/8" />
                <PhaseColumn label="60 Days — Growth" data={milestones60} icon={Target} hue="text-blue-400 border-blue-400/20 bg-blue-400/8" />
                <PhaseColumn label="90 Days — Flight" data={milestones90} icon={Rocket} hue="text-emerald-400 border-emerald-400/20 bg-emerald-400/8" />
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
