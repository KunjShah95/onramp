import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { fetchHrDevelopers, fetchHrHeatmap, listTeams } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import {
  Users, MagnifyingGlass, CheckCircle, WarningCircle,
  Fire, Clock, ArrowRight, Code, UserSwitch,
  ChartBar, Hash, CaretCircleRight, User, TrendUp,
  Sparkle,
} from '@phosphor-icons/react'
import type { HrDeveloperOverview, HrDayBucket } from '../lib/api'

const STAGE_CONFIG: Record<string, { label: string; color: string; glow: string; icon: any }> = {
  onboarding: { label: 'Onboarding', color: 'text-blue-400', glow: 'shadow-blue-500/10', icon: UserSwitch },
  ramping: { label: 'Ramping', color: 'text-amber-400', glow: 'shadow-amber-500/10', icon: Clock },
  contributing: { label: 'Contributing', color: 'text-emerald-400', glow: 'shadow-emerald-500/10', icon: Code },
  independent: { label: 'Independent', color: 'text-violet-400', glow: 'shadow-violet-500/10', icon: CheckCircle },
}

function ProgressRing({ pct, size = 72, strokeWidth = 4 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="ring-progress shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={pct >= 80 ? '#0E7A3C' : pct >= 50 ? '#B5710A' : pct >= 25 ? '#D6870F' : '#BE3A2E'}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  )
}

function ActivityHeatmap({ days }: { days: HrDayBucket[] }) {
  const weeks: HrDayBucket[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  const maxVal = Math.max(...days.map((d) => d.tasks + d.logins), 1)

  const intensity = (val: number) => {
    if (val === 0) return 'bg-bg-tertiary/30'
    const ratio = val / maxVal
    if (ratio <= 0.25) return 'bg-amber-500/15'
    if (ratio <= 0.5) return 'bg-amber-500/35'
    if (ratio <= 0.75) return 'bg-amber-500/60'
    return 'bg-amber-400'
  }

  const monthLabels: { label: string; index: number }[] = []
  const seen = new Set<string>()
  days.forEach((d, i) => {
    const m = d.date.slice(0, 7)
    if (!seen.has(m)) { seen.add(m); monthLabels.push({ label: d.date.slice(5, 7) === '01' ? d.date.slice(0, 4) : d.date.slice(5, 7), index: i }) }
  })

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        <div className="shrink-0 w-8">
          {monthLabels.map((ml) => (
            <div key={ml.index} style={{ marginTop: ml.index > 0 ? `${(ml.index / 7) * 10}px` : 0 }}
              className="text-[8px] text-text-muted/30 font-code text-right pr-1.5 h-4">
              {ml.label}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) => {
                const val = day.tasks + day.logins
                return (
                  <div key={di} className="group relative">
                    <div className={cn('w-[10px] h-[10px] rounded-[3px] transition-colors', intensity(val))} />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg bg-bg-elevated border border-border text-caption text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-elevated">
                      {day.date}: {val} acts
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2.5">
        <span className="text-[8px] text-text-muted/30">Less</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn(
            'w-[10px] h-[10px] rounded-[3px]',
            i === 0 ? 'bg-bg-tertiary/30' : i <= 1 ? 'bg-amber-500/15' : i <= 2 ? 'bg-amber-500/35' : i <= 3 ? 'bg-amber-500/60' : 'bg-amber-400'
          )} />
        ))}
        <span className="text-[8px] text-text-muted/30">More</span>
      </div>
    </div>
  )
}

function DeveloperList({
  developers, selectedId, onSelect, search,
}: {
  developers: HrDeveloperOverview[]
  selectedId: string | null
  onSelect: (id: string) => void
  search: string
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return developers
    const q = search.toLowerCase()
    return developers.filter(d => d.name.toLowerCase().includes(q) || d.stage.includes(q))
  }, [developers, search])

  return (
    <div className="space-y-1">
      {filtered.length === 0 && (
        <p className="text-caption text-text-muted/20 italic py-6 text-center">No developers match</p>
      )}
      {filtered.map((dev, i) => {
        const stage = STAGE_CONFIG[dev.stage]
        const StageIcon = stage?.icon || UserSwitch
        const isSelected = dev.user_id === selectedId
        return (
          <motion.button
            key={dev.user_id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.025, duration: 0.3 }}
            onClick={() => onSelect(dev.user_id)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group',
              isSelected
                ? 'bg-amber-400/8 border border-amber-400/20 shadow-glow-sm'
                : 'hover:bg-bg-tertiary/30 border border-transparent'
            )}
          >
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center font-display text-body-sm font-bold transition-all',
              isSelected ? 'bg-amber-400/15 text-amber-400' : 'bg-bg-tertiary border border-border text-text-muted/40'
            )}>
              {dev.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body-sm font-medium text-text-primary truncate">{dev.name}</span>
                {dev.at_risk && (
                  <WarningCircle size={12} className="text-red-400 shrink-0" weight="fill" />
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StageIcon size={10} className={cn(stage?.color || 'text-text-muted')} weight="fill" />
                <span className={cn('text-caption font-code', stage?.color || 'text-text-muted')}>
                  {stage?.label || dev.stage}
                </span>
                <span className="text-caption text-text-muted/20">·</span>
                <span className="text-caption text-text-muted/40 tabular-nums">{dev.completion_pct}%</span>
              </div>
            </div>
            <ArrowRight size={14} className={cn('shrink-0 transition-all', isSelected ? 'text-amber-400 opacity-100' : 'text-text-muted/10 group-hover:text-text-muted/40')} />
          </motion.button>
        )
      })}
    </div>
  )
}

function DevDetailCard({ dev }: { dev: HrDeveloperOverview }) {
  const stage = STAGE_CONFIG[dev.stage]
  const StageIcon = stage?.icon || UserSwitch

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-5">
        <div className="relative">
          <ProgressRing pct={dev.completion_pct} size={72} strokeWidth={4} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-body-sm font-bold text-text-primary">{dev.name.charAt(0).toUpperCase()}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-body font-bold text-text-primary">{dev.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StageIcon size={13} className={stage?.color || 'text-text-muted'} weight="fill" />
            <span className={cn('text-body-xs font-code', stage?.color)}>{stage?.label || dev.stage}</span>
            {dev.at_risk && (
              <span className="flex items-center gap-1 text-caption text-red-400 ml-1">
                <WarningCircle size={10} weight="fill" /> At risk
              </span>
            )}
          </div>
          <p className="text-caption text-text-muted/30 mt-0.5">{dev.completion_pct}% through {dev.stage} stage</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Tasks', val: `${dev.completed}/${dev.assigned}`, sub: 'completed', color: 'text-emerald-400', icon: CheckCircle },
          { label: 'Ramp Time', val: dev.ramp_days !== null ? `${dev.ramp_days}d` : '—', sub: 'to first PR', color: 'text-amber-400', icon: Clock },
          { label: 'Streak', val: `${dev.current_streak}d`, sub: `best ${dev.longest_streak}d`, color: 'text-orange-400', icon: Fire },
          { label: 'Stage', val: stage?.label || dev.stage, sub: 'onboarding', color: stage?.color || 'text-text-muted', icon: ChartBar },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ y: -1 }}
            className="p-3 rounded-xl bg-bg-tertiary/40 border border-border/40 transition-all"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <stat.icon size={11} className={stat.color} weight="fill" />
              <span className="text-caption text-text-muted/40">{stat.label}</span>
            </div>
            <div className={cn('font-display text-body font-bold tabular-nums', stat.color)}>{stat.val}</div>
            <div className="text-caption text-text-muted/20">{stat.sub}</div>
          </motion.div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption text-text-muted/50 font-medium">Onboarding Progress</span>
          <span className="text-caption font-code text-text-muted/30 tabular-nums">{dev.completion_pct}%</span>
        </div>
        <div className="relative h-2 rounded-full bg-bg-tertiary overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${dev.completion_pct}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'h-full rounded-full',
              dev.completion_pct >= 80 ? 'bg-emerald-400' :
              dev.completion_pct >= 50 ? 'bg-amber-400' :
              dev.completion_pct >= 25 ? 'bg-orange-400' :
              'bg-red-400'
            )}
          />
        </div>
      </div>
    </div>
  )
}

type StageFilter = 'all' | 'onboarding' | 'ramping' | 'contributing' | 'independent'

export default function HrPeoplePage() {
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedDevId, setSelectedDevId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')

  const { data: teamsList } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      try { return await listTeams('current-user') }
      catch { return [] }
    },
    staleTime: 60_000,
  })

  const teams = useMemo(() => {
    const raw = (teamsList as any)?.teams || teamsList || []
    return Array.isArray(raw) ? raw.map((t: any) => ({ ...t, id: t.team_id || t.id })) : []
  }, [teamsList])

  const teamId = selectedTeamId || (teams[0]?.team_id || teams[0]?.id || '')

  const { data: devData, isLoading: devLoading } = useQuery({
    queryKey: ['hrDevelopers', teamId],
    queryFn: () => fetchHrDevelopers(teamId),
    enabled: !!teamId, staleTime: 30_000,
  })

  const { data: heatmapData } = useQuery({
    queryKey: ['hrHeatmap', teamId],
    queryFn: () => fetchHrHeatmap(teamId),
    enabled: !!teamId, staleTime: 30_000,
  })

  const developers = useMemo(() => {
    if (!devData?.developers) return []
    let list = devData.developers
    if (stageFilter !== 'all') list = list.filter((d) => d.stage === stageFilter)
    return list
  }, [devData, stageFilter])

  const selectedDev = useMemo(() => {
    if (!selectedDevId || !devData) return null
    return devData.developers.find((d) => d.user_id === selectedDevId) || null
  }, [selectedDevId, devData])

  const selectedHeatmap = useMemo(() => {
    if (!selectedDevId || !heatmapData?.members) return null
    return heatmapData.members[selectedDevId] || null
  }, [selectedDevId, heatmapData])

  const handleSelectDev = useCallback((id: string) => {
    setSelectedDevId((prev) => (prev === id ? null : id))
  }, [])

  const stageCounts = useMemo(() => {
    if (!devData?.developers) return { onboarding: 0, ramping: 0, contributing: 0, independent: 0 }
    const counts: Record<string, number> = { onboarding: 0, ramping: 0, contributing: 0, independent: 0 }
    for (const d of devData.developers) counts[d.stage] = (counts[d.stage] || 0) + 1
    return counts
  }, [devData])

  const FILTERS: { key: StageFilter; label: string; color: string; activeColor: string }[] = [
    { key: 'all', label: 'All', color: '', activeColor: 'bg-amber-400/10 text-amber-400 border-amber-400/20' },
    { key: 'onboarding', label: `Onboarding ${stageCounts.onboarding}`, color: 'text-blue-400/60', activeColor: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
    { key: 'ramping', label: `Ramping ${stageCounts.ramping}`, color: 'text-amber-400/60', activeColor: 'bg-amber-400/10 text-amber-400 border-amber-400/20' },
    { key: 'contributing', label: `Contributing ${stageCounts.contributing}`, color: 'text-emerald-400/60', activeColor: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
    { key: 'independent', label: `Independent ${stageCounts.independent}`, color: 'text-violet-400/60', activeColor: 'bg-violet-400/10 text-violet-400 border-violet-400/20' },
  ]

  const atRiskCount = devData?.developers.filter((d) => d.at_risk).length || 0
  const avgCompletion = developers.length > 0
    ? Math.round(developers.reduce((s, d) => s + d.completion_pct, 0) / developers.length) : 0
  const avgRamp = devData?.developers
    ? devData.developers.filter((d) => d.ramp_days !== null).reduce((s, d) => s + (d.ramp_days || 0), 0) /
      Math.max(devData.developers.filter((d) => d.ramp_days !== null).length, 1) : 0

  if (devLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] p-6 space-y-5 max-w-6xl mx-auto px-4 sm:px-6 animate-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-bg-secondary rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-bg-secondary rounded animate-pulse" />
          </div>
          <div className="h-9 w-36 bg-bg-secondary rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-bg-secondary border border-border animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 h-96 rounded-xl bg-bg-secondary border border-border animate-pulse" />
          <div className="lg:col-span-2 h-96 rounded-xl bg-bg-secondary border border-border animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-[calc(100vh-4rem)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 px-4 sm:px-6 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 flex items-center justify-center">
              <Users size={20} className="text-blue-400" weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Sparkle size={12} className="text-amber-400" weight="fill" />
                <span className="text-overline text-amber-400/80">People Command Center</span>
              </div>
              <GradientHeading as="h1" className="text-display-md">Developer Onboarding</GradientHeading>
              <p className="text-body-sm text-text-muted/50">{devData?.developers.length || 0} developers across {teams.length} team{teams.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {teams.length > 1 && (
              <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-xl px-3 py-1.5">
                <Hash size={14} className="text-text-muted/30" />
                <select
                  value={selectedTeamId}
                  onChange={(e) => { setSelectedTeamId(e.target.value); setSelectedDevId(null) }}
                  className="bg-transparent text-body-xs text-text-primary font-medium py-1 outline-none cursor-pointer appearance-none"
                >
                  {teams.map((t: any) => (
                    <option key={t.team_id || t.id} value={t.team_id || t.id} className="bg-bg-secondary">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </motion.div>

        {/* Metric Cards — one hero + 3 compact */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          {[
            { label: 'Total', value: devData?.developers.length || 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/8 border-blue-400/15', hue: 'from-blue-500/10 to-blue-600/5' },
            { label: 'Avg Completion', value: `${avgCompletion}%`, icon: TrendUp, color: avgCompletion >= 50 ? 'text-emerald-400' : 'text-amber-400', bg: avgCompletion >= 50 ? 'bg-emerald-400/8 border-emerald-400/15' : 'bg-amber-400/8 border-amber-400/15', hue: 'from-emerald-500/10 to-emerald-600/5' },
            { label: 'Avg Ramp', value: avgRamp ? `${Math.round(avgRamp)}d` : '—', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/8 border-amber-400/15', hue: 'from-amber-500/10 to-amber-600/5' },
            { label: 'At Risk', value: atRiskCount, icon: WarningCircle, color: atRiskCount > 0 ? 'text-red-400' : 'text-emerald-400', bg: atRiskCount > 0 ? 'bg-red-400/8 border-red-400/15' : 'bg-emerald-400/8 border-emerald-400/15', hue: 'from-red-500/10 to-red-600/5' },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.04, duration: 0.4 }}
            >
              <div className={cn('relative overflow-hidden p-4 rounded-xl border shadow-card transition-all group', m.bg)}>
                <div className={cn('absolute inset-0 bg-gradient-to-br opacity-30', m.hue)} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-2">
                    <m.icon size={18} className={m.color} weight="fill" />
                  </div>
                  <div className={cn('font-display text-display-sm font-bold tracking-tight', m.color)}>{m.value}</div>
                  <div className="text-caption text-text-muted/40 mt-0.5">{m.label}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Stage Filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex flex-wrap items-center gap-1.5 mb-5"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setStageFilter(f.key); setSelectedDevId(null) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-caption font-code border transition-all',
                stageFilter === f.key
                  ? f.activeColor
                  : 'border-border text-text-muted/40 hover:text-text-muted/70 bg-transparent hover:bg-bg-tertiary/30'
              )}
            >
              {f.label}
            </button>
          ))}
        </motion.div>

        {/* Main Layout */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-5"
        >
          {/* Developer List */}
          <div>
            <CardSpotlight className="p-4">
              <div className="relative mb-3">
                <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/30" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border rounded-xl pl-8 pr-3 py-2 text-body-xs text-text-primary placeholder:text-text-muted/20 focus:outline-none focus:ring-1 focus:ring-amber-400/20 transition-all"
                />
              </div>
              <DeveloperList
                developers={developers}
                selectedId={selectedDevId}
                onSelect={handleSelectDev}
                search={search}
              />
            </CardSpotlight>
          </div>

          {/* Detail + Heatmap */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="wait">
              {selectedDev && selectedDevId ? (
                <motion.div
                  key={selectedDev.user_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <CardSpotlight className="p-5">
                    <DevDetailCard dev={selectedDev} />
                  </CardSpotlight>

                  {selectedHeatmap && (
                    <CardSpotlight className="p-5 mt-4">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-amber-400/8 border border-amber-400/15 flex items-center justify-center">
                          <CaretCircleRight size={16} className="text-amber-400" />
                        </div>
                        <div>
                          <h2 className="font-display text-body-sm font-bold text-text-primary">Activity Heatmap</h2>
                          <p className="text-caption text-text-muted/40">{selectedHeatmap.total} activities over 12 weeks</p>
                        </div>
                      </div>
                      <ActivityHeatmap days={selectedHeatmap.days} />
                    </CardSpotlight>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <CardSpotlight className="p-10 flex items-center justify-center min-h-[300px]">
                    <div className="text-center max-w-xs">
                      <div className="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center mx-auto mb-4">
                        <User size={26} className="text-text-muted/20" />
                      </div>
                      <p className="text-text-muted/40 text-body-sm mb-1 font-medium">Select a developer</p>
                      <p className="text-caption text-text-muted/20">Click any name to view onboarding details, progress, and activity patterns.</p>
                    </div>
                  </CardSpotlight>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
