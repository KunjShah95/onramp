/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: HR's daily job is triage — "who needs me today" — not browsing a
 *   directory of forty names. The page opens on the at-risk list, the stage
 *   filter rail counts the field before the list renders, the roster is capped,
 *   and the 12-week heatmap is sealed until a person is actually selected.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { PageHeader } from '../components/ui/page-header'
import { SkeletonBase } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'
import { fetchHrDevelopers, fetchHrHeatmap, listTeams } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import {
  Users, MagnifyingGlass, CheckCircle, WarningCircle,
  Fire, Clock, ArrowRight, Code, UserSwitch,
  ChartBar, Hash, CaretCircleRight, User, Funnel, X,
} from '@phosphor-icons/react'
import type { HrDeveloperOverview, HrDayBucket } from '../lib/api'
import { NextUp, FilterChips, ShowMore, Disclosure } from '../components/ui/progressive'
import { useAuth } from '../context/AuthContext'

const STAGE_CONFIG: Record<string, { label: string; color: string; glow: string; icon: any }> = {
  onboarding: { label: 'Onboarding', color: 'text-mission', glow: 'shadow-mission/10', icon: UserSwitch },
  ramping: { label: 'Ramping', color: 'text-caution', glow: 'shadow-caution/10', icon: Clock },
  contributing: { label: 'Contributing', color: 'text-go', glow: 'shadow-go/10', icon: Code },
  independent: { label: 'Independent', color: 'text-mission', glow: '', icon: CheckCircle },
}

function ProgressRing({ pct, size = 72, strokeWidth = 4 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="ring-progress shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--seam-strong)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={pct >= 80 ? 'var(--go)' : pct >= 50 ? 'var(--caution)' : pct >= 25 ? 'var(--caution-lit)' : 'var(--abort)'} strokeWidth={strokeWidth} strokeDasharray={circ} style={{ strokeDashoffset: offset }} />
    </svg>
  )
}

function ActivityHeatmap({ days }: { days: HrDayBucket[] }) {
  const weeks: HrDayBucket[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  const maxVal = Math.max(...days.map((d) => d.tasks + d.logins), 1)

  const intensity = (val: number) => {
    if (val === 0) return 'bg-well/30'
    const ratio = val / maxVal
    if (ratio <= 0.25) return 'bg-go/15'
    if (ratio <= 0.5) return 'bg-go/35'
    if (ratio <= 0.75) return 'bg-go/60'
    return 'bg-go'
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
              className="text-[8px] text-ink-muted/30 font-code text-right pr-1.5 h-4">
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
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg bg-panel-raised border border-seam text-caption text-ink whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lift">
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
        <span className="text-[8px] text-ink-muted/30">Less</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn(
            'w-[10px] h-[10px] rounded-[3px]',
            i === 0 ? 'bg-well/30' : i <= 1 ? 'bg-go/15' : i <= 2 ? 'bg-go/35' : i <= 3 ? 'bg-go/60' : 'bg-go'
          )} />
        ))}
        <span className="text-[8px] text-ink-muted/30">More</span>
      </div>
    </div>
  )
}

function DeveloperList({
  developers, selectedId, onSelect, search, limit = 8,
}: {
  developers: HrDeveloperOverview[]
  selectedId: string | null
  onSelect: (id: string) => void
  search: string
  limit?: number
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return developers
    const q = search.toLowerCase()
    return developers.filter(d => d.name.toLowerCase().includes(q) || d.stage.includes(q))
  }, [developers, search])

  if (filtered.length === 0) {
    return (
      <p className="text-caption text-ink-muted/40 italic py-6 text-center">
        No developers match &ldquo;{search}&rdquo;
      </p>
    )
  }

  return (
    <ShowMore items={filtered} limit={limit} noun="developer" resetKey={search} className="space-y-1">
      {(visible) => (
        /* A real list, not a div soup: the roster is a set of peers and the
           count matters to a screen reader as much as it does visually. */
        <ul className="space-y-1" aria-label="Developers">
          {visible.map((dev) => {
            const stage = STAGE_CONFIG[dev.stage]
            const StageIcon = stage?.icon || UserSwitch
            const isSelected = dev.user_id === selectedId
            return (
              <li key={dev.user_id}>
                <button onClick={() => onSelect(dev.user_id)} aria-pressed={isSelected} className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-card text-left group transition-colors',
                    isSelected
                      ? 'bg-go/[0.07] border border-go/30'
                      : 'border border-transparent hover:bg-well/40'
                  )}>
                  <div className={cn(
                    'w-9 h-9 rounded-card flex items-center justify-center font-display text-body-xs font-bold transition-colors shrink-0',
                    isSelected ? 'bg-go/10 text-go' : 'bg-well border border-seam text-ink-muted/60'
                  )}>
                    {dev.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-medium text-ink truncate">{dev.name}</span>
                      {dev.at_risk && (
                        <WarningCircle size={12} className="text-abort shrink-0" weight="fill" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StageIcon size={10} className={cn(stage?.color || 'text-ink-muted')} weight="fill" />
                      <span className={cn('text-caption font-code', stage?.color || 'text-ink-muted')}>
                        {stage?.label || dev.stage}
                      </span>
                      <span className="text-caption text-ink-muted/30">·</span>
                      <span className="text-caption text-ink-muted/60 tabular-nums">{dev.completion_pct}%</span>
                    </div>
                  </div>
                  <ArrowRight size={14} className={cn('shrink-0 transition-colors', isSelected ? 'text-go opacity-100' : 'text-ink-muted/20 group-hover:text-ink-muted/60')} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </ShowMore>
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
            <span className="font-display text-body-sm font-bold text-ink">{dev.name.charAt(0).toUpperCase()}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-body font-bold text-ink">{dev.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StageIcon size={13} className={stage?.color || 'text-ink-muted'} weight="fill" />
            <span className={cn('text-body-xs font-code', stage?.color)}>{stage?.label || dev.stage}</span>
            {dev.at_risk && (
              <span className="flex items-center gap-1 text-caption text-abort ml-1">
                <WarningCircle size={10} weight="fill" /> At risk
              </span>
            )}
          </div>
          <p className="text-caption text-ink-muted/30 mt-0.5">{dev.completion_pct}% through {dev.stage} stage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {[
          { label: 'Tasks', val: `${dev.completed}/${dev.assigned}`, sub: 'completed', color: 'text-go', icon: CheckCircle },
          { label: 'Ramp Time', val: dev.ramp_days !== null ? `${dev.ramp_days}d` : 'N/A', sub: 'to first PR', color: 'text-caution', icon: Clock },
          { label: 'Streak', val: `${dev.current_streak}d`, sub: `best ${dev.longest_streak}d`, color: 'text-caution-lit', icon: Fire },
          { label: 'Stage', val: stage?.label || dev.stage, sub: 'onboarding', color: stage?.color || 'text-ink-muted', icon: ChartBar },
        ].map((stat) => (
          <div key={stat.label} className="p-3 rounded-xl bg-well/40 border border-[rgb(var(--border-rgb)/0.4)] transition-all">
            <div className="flex items-center gap-1.5 mb-1">
              <stat.icon size={11} className={stat.color} weight="fill" />
              <span className="text-caption text-ink-muted/40">{stat.label}</span>
            </div>
            <div className={cn('font-display text-body font-bold tabular-nums', stat.color)}>{stat.val}</div>
            <div className="text-caption text-ink-muted/20">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption text-ink-muted/50 font-medium">Onboarding Progress</span>
          <span className="text-caption font-code text-ink-muted/30 tabular-nums">{dev.completion_pct}%</span>
        </div>
        <div className="relative h-2 rounded-full bg-well overflow-hidden">
          <div className={cn(
              'h-full rounded-full',
              dev.completion_pct >= 80 ? 'bg-go' :
              dev.completion_pct >= 50 ? 'bg-caution' :
              dev.completion_pct >= 25 ? 'bg-caution-lit' :
              'bg-abort'
            )} style={{ width: `${dev.completion_pct}%` }} />
        </div>
      </div>
    </div>
  )
}

type StageFilter = 'all' | 'onboarding' | 'ramping' | 'contributing' | 'independent'

export default function HrPeoplePage() {
  const { activeTeamId } = useAuth()
  const [selectedTeamId, setSelectedTeamId] = useState(activeTeamId ?? '')
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

  useEffect(() => {
    if (activeTeamId) setSelectedTeamId(activeTeamId)
  }, [activeTeamId])

  const teams = useMemo(() => {
    const raw = (teamsList as any)?.teams || teamsList || []
    return Array.isArray(raw) ? raw.map((t: any) => ({ ...t, id: t.team_id || t.id })) : []
  }, [teamsList])

  const teamId = selectedTeamId || activeTeamId || (teams[0]?.team_id || teams[0]?.id || '')

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

  const atRiskList = useMemo(
    () => (devData?.developers ?? []).filter((d) => d.at_risk),
    [devData],
  )

  const FILTERS: { key: StageFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'ramping', label: 'Ramping' },
    { key: 'contributing', label: 'Contributing' },
    { key: 'independent', label: 'Independent' },
  ]

  const atRiskCount = devData?.developers.filter((d) => d.at_risk).length || 0
  const avgCompletion = developers.length > 0
    ? Math.round(developers.reduce((s, d) => s + d.completion_pct, 0) / developers.length) : 0
  const avgRamp = devData?.developers
    ? devData.developers.filter((d) => d.ramp_days !== null).reduce((s, d) => s + (d.ramp_days || 0), 0) /
      Math.max(devData.developers.filter((d) => d.ramp_days !== null).length, 1) : 0

  // The roster is filtered first, then capped. The list the user actually reads
  // is `developers`; `allDevelopers` only feeds the counts, so a filter chip
  // always tells the truth about the whole team.
  const allDevelopers = useMemo(() => devData?.developers ?? [], [devData])
  const chipOptions = useMemo(
    () => FILTERS.map((f) => ({
      value: f.key,
      label: f.label,
      count: f.key === 'all' ? allDevelopers.length : allDevelopers.filter((d) => d.stage === f.key).length,
    })),
    [FILTERS, allDevelopers],
  )

  if (devLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] space-y-5 max-w-6xl mx-auto animate-in" role="status" aria-label="Loading people directory">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBase className="h-7 w-48 rounded-lg" />
            <SkeletonBase className="h-4 w-64" />
          </div>
          <SkeletonBase className="h-9 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonBase key={i} className="h-24 rounded-xl border border-seam" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SkeletonBase className="lg:col-span-1 h-96 rounded-xl border border-seam" />
          <SkeletonBase className="lg:col-span-2 h-96 rounded-xl border border-seam" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-card bg-well border border-seam flex items-center justify-center">
              <Users size={20} className="text-ink-tertiary" weight="regular" />
            </div>
            <PageHeader
              eyebrow="Folio · People"
              title="Developer Onboarding"
              subtitle={`${devData?.developers.length || 0} developers across ${teams.length} team${teams.length !== 1 ? 's' : ''}`}
              flush
            />
          </div>
          <div className="flex items-center gap-3">
            {teams.length > 1 && (
              <div className="flex items-center gap-2 bg-panel border border-seam rounded-xl px-3 py-1.5">
                <Hash size={14} className="text-ink-muted/30" />
                <select
                  value={teamId}
                  onChange={(e) => { setSelectedTeamId(e.target.value); setSelectedDevId(null) }}
                  className="bg-transparent text-body-xs text-ink font-medium py-1 outline-none cursor-pointer appearance-none"
                >
                  {teams.map((t: any) => (
                    <option key={t.team_id || t.id} value={t.team_id || t.id} className="bg-panel">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {teamId && (
              <Link
                to={`/hr/cohort/${teamId}`}
                className="inline-flex items-center gap-2 rounded-xl border border-mission/25 bg-mission/10 px-3.5 py-2 text-body-xs font-medium text-mission transition-all hover:bg-mission/20 active:scale-[0.98]"
              >
                <ChartBar size={15} weight="fill" />
                Cohort analytics
              </Link>
            )}
          </div>
        </div>

        {/* ── Triage first: who needs HR today ─────────────────────────── */}
        <div className="mb-6">
          <NextUp
            tone={atRiskCount > 0 ? 'abort' : 'go'}
            eyebrow="Needs attention"
            headline={
              atRiskCount > 0
                ? `${atRiskCount} developer${atRiskCount === 1 ? '' : 's'} flagged at risk`
                : 'Nobody is flagged at risk'
            }
            detail={
              atRiskCount > 0
                ? 'Open a person to see their stage, ramp time, and 12-week activity before you decide what to do.'
                : `${allDevelopers.length} developers tracked · use the stage filters to narrow the roster.`
            }
            primary={
              atRiskCount > 0
                ? { id: 'first-risk', label: `Open ${atRiskList[0].name}`, detail: `${atRiskList[0].completion_pct}% through ${STAGE_CONFIG[atRiskList[0].stage]?.label ?? atRiskList[0].stage}`, icon: WarningCircle, tone: 'abort', onClick: () => { setStageFilter('all'); setSelectedDevId(atRiskList[0].user_id) } }
                : undefined
            }
            secondary={
              atRiskList.length > 1
                ? atRiskList.slice(1, 5).map((d) => ({
                    id: d.user_id,
                    label: d.name,
                    detail: `${d.completion_pct}% · ${STAGE_CONFIG[d.stage]?.label ?? d.stage}`,
                    icon: WarningCircle,
                    tone: 'abort' as const,
                    onClick: () => { setStageFilter('all'); setSelectedDevId(d.user_id) },
                  }))
                : teamId
                  ? [{ id: 'cohort', label: 'Cohort analytics', detail: 'Ramp and retention by cohort', to: `/hr/cohort/${teamId}`, icon: ChartBar, tone: 'mission' as const }]
                  : []
            }
          />
        </div>

        {/* Metric Cells — one ruled strip, not four floating cards */}
        <div className="mb-6">
          <div className="metric-strip grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total', value: allDevelopers.length, sub: 'developers tracked' },
              { label: 'Avg completion', value: `${avgCompletion}%`, sub: 'across the current filter' },
              { label: 'Avg ramp', value: avgRamp ? `${Math.round(avgRamp)}d` : 'N/A', sub: 'to first PR' },
              { label: 'At risk', value: atRiskCount, sub: 'flagged by the model' },
            ].map((m) => (
              <div key={m.label} className="metric-cell">
                <div className="overline text-ink-muted/80">{m.label}</div>
                <div className={cn(
                  'font-code tabular-nums text-2xl md:text-[28px] font-semibold leading-none mt-2',
                  m.label === 'At risk'
                    ? (atRiskCount > 0 ? 'text-abort' : 'text-go')
                    : m.label === 'Avg completion'
                      ? (avgCompletion >= 50 ? 'text-go' : 'text-caution')
                      : m.label === 'Avg ramp' ? 'text-caution' : 'text-ink',
                )}>
                  {m.value}
                </div>
                <div className="text-caption text-ink-muted mt-1.5">{m.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stage Filters — counted, so the field narrows before the list */}
        <div className="mb-5">
          <FilterChips
            label="Stage"
            value={stageFilter}
            onChange={(v) => { setStageFilter(v as StageFilter); setSelectedDevId(null) }}
            options={chipOptions}
            summary={`${developers.length} of ${allDevelopers.length}`}
          />
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Developer List */}
          <div>
            <CardSpotlight className="p-4">
              <div className="relative mb-3">
                <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted/40 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name or stage…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search developers"
                  className="w-full bg-well border border-seam rounded-tile pl-8 pr-8 py-2 text-body-xs text-ink placeholder:text-ink-muted/30 focus:outline-none focus:border-go/50 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted/50 hover:text-ink transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2 text-caption text-ink-muted/50">
                <Funnel size={11} weight="bold" />
                <span>
                  {search
                    ? `${developers.length} match · filter by stage above`
                    : 'Filter by stage above, or scroll the roster'}
                </span>
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

              {selectedDev && selectedDevId ? (
                <div key={selectedDev.user_id} className="reveal-row">
                  <CardSpotlight className="p-5">
                    <DevDetailCard dev={selectedDev} />
                  </CardSpotlight>

                  {/* 12 weeks of activity is a deep read, not a summary —
                      sealed until the person is chosen. */}
                  {selectedHeatmap && (
                    <div className="mt-4">
                      <Disclosure
                        label="Activity heatmap"
                        designator="12 WEEKS"
                        tone="caution"
                        hint={`${selectedHeatmap.total} activities · tasks + logins`}
                      >
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="w-8 h-8 rounded-tile bg-caution/10 border border-caution/20 flex items-center justify-center">
                            <CaretCircleRight size={16} className="text-caution" />
                          </div>
                          <div>
                            <h2 className="font-heading text-body-sm font-semibold text-ink">Activity Heatmap</h2>
                            <p className="text-caption text-ink-muted/60">{selectedHeatmap.total} activities over 12 weeks</p>
                          </div>
                        </div>
                        <ActivityHeatmap days={selectedHeatmap.days} />
                      </Disclosure>
                    </div>
                  )}
                </div>
              ) : (
                <div key="empty" className="reveal-row">
                  <CardSpotlight className="p-10 flex items-center justify-center min-h-[300px]">
                    <div className="text-center max-w-xs">
                      <div className="w-14 h-14 rounded-card bg-well border border-seam flex items-center justify-center mx-auto mb-4 empty-tile">
                        <User size={26} className="text-ink-muted/40" />
                      </div>
                      <p className="text-ink-secondary text-body-sm mb-1 font-medium">Select a developer</p>
                      <p className="text-caption text-ink-muted/50">Click any name to view onboarding details, progress, and activity patterns.</p>
                    </div>
                  </CardSpotlight>
                </div>
              )}

          </div>
        </div>
      </div>
    </div>
  )
}
