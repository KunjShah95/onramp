/*
 * ─── DIRECTION CONTRACT · KNOWLEDGE MAP ─────────────────────────────────────
 * THESIS: Explore shows the code. This page shows what *you* understand of
 *   it. Every module starts fogged and is lit only by evidence: a fact check
 *   graded against the real import graph, or a senior walkthrough. Knowledge
 *   decays visibly when the code under it changes. Seniors record tours, see
 *   where the team gets stuck, and get told which critical hubs have no tour.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, CheckCircle, Compass, Eye, Flag, Lightbulb,
  MapTrifold, Path, Plus, Spinner, Trash, Warning, X, XCircle,
} from '@phosphor-icons/react'

import {
  completeWalkthrough, createWalkthrough, deleteWalkthrough, fetchChangeImpact, fetchComprehensionMap,
  fetchComprehensionTeam, fetchFactChecks, fetchRepos, fetchWalkthroughs,
  gradeFactChecks, reverifyWalkthrough,
  type ComprehensionMap, type ComprehensionNode, type FactCheckResult, type Walkthrough,
} from '../lib/api'
import type { GraphEdge, GraphNode } from '../components/ForceGraph'
import ConsolePanel from '../components/ui/console-panel'
import { NodeImpact, PrImpactChecker, StarterTasks } from '../components/knowledge/ImpactPanels'
import ModuleContextPanel from '../components/knowledge/ModuleContextPanel'
import { EmptyState, EmptyRow } from '../components/ui/empty-state'
import { MetricCell, MetricStrip } from '../components/ui/metric-strip'
import { PageHeader } from '../components/ui/page-header'
import { NextUp, type NextUpAction } from '../components/ui/progressive'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'

const ForceGraph = lazy(() => import('../components/ForceGraph'))

const inputCls =
  'w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3 py-2 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/50'
const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-go text-white text-body-sm font-semibold rounded-[3px] hover:bg-go-lit disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border border-seam text-ink-secondary text-caption font-semibold rounded-[3px] hover:border-seam-strong hover:text-ink disabled:opacity-50 transition-colors'

const STATE_LABEL: Record<ComprehensionNode['state'], string> = {
  lit: 'Understood',
  changed: 'Changed since you learned it',
  fog: 'Not yet understood',
}

function shortName(id: string): string {
  const parts = id.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : id
}

function litSourceLabel(source: string): string {
  if (source.startsWith('walkthrough')) return 'walkthrough'
  if (source.startsWith('pr:')) return `merged PR #${source.slice(3)}`
  return 'fact check'
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

// ── Fact check panel ───────────────────────────────────────────────────────

function FactCheck({
  owner, repo, node, onPassed,
}: { owner: string; repo: string; node: ComprehensionNode; onPassed: () => void }) {
  const toast = useToast()
  const [picked, setPicked] = useState<Record<string, Set<string>>>({})
  const [result, setResult] = useState<FactCheckResult | null>(null)

  const checks = useQuery({
    queryKey: ['fact-checks', owner, repo, node.id],
    queryFn: () => fetchFactChecks(owner, repo, node.id),
    enabled: node.checkable,
  })

  useEffect(() => { setPicked({}); setResult(null) }, [node.id])

  const grade = useMutation({
    mutationFn: () => gradeFactChecks(
      owner, repo, node.id,
      Object.fromEntries(Object.entries(picked).map(([k, v]) => [k, [...v]])),
    ),
    onSuccess: (res) => {
      setResult(res)
      if (res.passed) {
        toast.success('Module understood', shortName(node.id))
        onPassed()
      }
    },
    onError: (err) => toast.error('Check not graded', errorText(err)),
  })

  if (!node.checkable) {
    return (
      <p className="text-caption text-ink-tertiary">
        This module has no import edges, so there is nothing verifiable to check. A senior walkthrough can still cover it.
      </p>
    )
  }
  if (checks.isLoading) return <div className="flex items-center gap-2 text-caption text-ink-tertiary"><Spinner className="animate-spin" /> Building questions from the graph…</div>
  if (checks.isError) return <p className="text-caption text-abort">{errorText(checks.error)}</p>

  const questions = checks.data?.questions ?? []
  const locked = checks.data?.locked_for_seconds ?? 0
  const verdict = (id: string) => result?.results.find((r) => r.id === id)

  return (
    <div className="space-y-4">
      {locked > 0 && !result && (
        <p className="text-caption text-caution flex items-center gap-1.5">
          <Warning /> Too many misses. Try again in {Math.ceil(locked / 60)} min, or take a walkthrough that covers it.
        </p>
      )}
      {questions.map((q) => {
        const v = verdict(q.id)
        return (
          <fieldset key={q.id} className="space-y-2">
            <legend className="text-body-xs text-ink font-medium mb-1.5 flex items-start gap-1.5">
              {v && (v.correct
                ? <CheckCircle weight="fill" className="text-go mt-0.5 shrink-0" />
                : <XCircle weight="fill" className="text-abort mt-0.5 shrink-0" />)}
              <span>{q.prompt.replace(/`/g, '')}</span>
            </legend>
            {q.options.map((opt) => {
              const checked = picked[q.id]?.has(opt) ?? false
              const isAnswer = v?.answer?.includes(opt)
              return (
                <label
                  key={opt}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-[3px] border cursor-pointer text-caption font-code transition-colors',
                    checked ? 'border-go/50 bg-go/5 text-ink' : 'border-seam text-ink-secondary hover:border-seam-strong',
                    isAnswer && 'border-go bg-go/10',
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-go"
                    checked={checked}
                    disabled={!!result?.passed}
                    onChange={() => setPicked((prev) => {
                      const next = new Set(prev[q.id] ?? [])
                      if (next.has(opt)) next.delete(opt)
                      else next.add(opt)
                      return { ...prev, [q.id]: next }
                    })}
                  />
                  <span className="truncate" title={opt}>{opt}</span>
                </label>
              )
            })}
          </fieldset>
        )
      })}
      {result && !result.passed && (
        <p className="text-caption text-ink-tertiary">
          Not quite. Open the files and trace the imports, then try again. The graph is the answer key, not a model.
        </p>
      )}
      {!result?.passed && (
        <button
          className={primaryBtn}
          disabled={grade.isPending || locked > 0 || Object.values(picked).every((s) => s.size === 0)}
          onClick={() => grade.mutate()}
        >
          {grade.isPending ? <Spinner className="animate-spin" /> : <CheckCircle />} Check answers
        </button>
      )}
    </div>
  )
}

// ── Walkthrough player ─────────────────────────────────────────────────────

function WalkthroughPlayer({
  owner, repo, tour, step, onStep, onClose, onDone,
}: {
  owner: string
  repo: string
  tour: Walkthrough
  step: number
  onStep: (i: number) => void
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const current = tour.steps[step]
  const last = step === tour.steps.length - 1
  const finish = useMutation({
    mutationFn: () => completeWalkthrough(owner, repo, tour.id),
    onSuccess: (res) => {
      toast.success(`Walkthrough complete: ${res.lit.length} module${res.lit.length === 1 ? '' : 's'} understood`, res.skipped_stale ? `${res.skipped_stale} step(s) changed since recording and were not counted.` : undefined)
      onDone()
    },
    onError: (err) => toast.error('Could not complete', errorText(err)),
  })

  return (
    <ConsolePanel
      rail={tour.title}
      designator={`${step + 1}/${tour.steps.length}`}
      status={tour.stale ? 'caution' : 'go'}
      action={<button aria-label="Close walkthrough" className="text-ink-tertiary hover:text-ink" onClick={onClose}><X /></button>}
    >
      <div className="space-y-3">
        <div className="font-code text-caption text-go truncate" title={current.node}>{current.node}</div>
        {current.status !== 'fresh' && (
          <p className="text-caption text-caution flex items-center gap-1.5">
            <Warning /> {current.status === 'removed' ? 'This module no longer exists.' : 'The code here changed after this step was recorded.'}
          </p>
        )}
        <p className="text-body-sm text-ink-secondary whitespace-pre-wrap">{current.note || 'No note for this step. Read the module and its neighbours.'}</p>
        <div className="flex items-center gap-2 pt-1">
          <button className={ghostBtn} disabled={step === 0} onClick={() => onStep(step - 1)}><ArrowLeft /> Back</button>
          {last ? (
            <button className={primaryBtn} disabled={finish.isPending} onClick={() => finish.mutate()}>
              {finish.isPending ? <Spinner className="animate-spin" /> : <Flag />} Finish tour
            </button>
          ) : (
            <button className={primaryBtn} onClick={() => onStep(step + 1)}>Next <ArrowRight /></button>
          )}
        </div>
      </div>
    </ConsolePanel>
  )
}

// ── Walkthrough builder (seniors) ──────────────────────────────────────────

function WalkthroughBuilder({
  owner, repo, steps, setSteps, gaps, onSaved, onCancel,
}: {
  owner: string
  repo: string
  steps: { node: string; note: string }[]
  setSteps: (s: { node: string; note: string }[]) => void
  gaps: string[]
  onSaved: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const save = useMutation({
    mutationFn: () => createWalkthrough(owner, repo, { title, summary, steps }),
    onSuccess: () => {
      toast.success('Walkthrough published', 'Pinned to the current commit. It will flag itself if the code moves.')
      onSaved()
    },
    onError: (err) => toast.error('Could not publish', errorText(err)),
  })

  return (
    <ConsolePanel rail="Record a walkthrough" designator="SENIOR" status="standby"
      action={<button aria-label="Cancel" className="text-ink-tertiary hover:text-ink" onClick={onCancel}><X /></button>}>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Title, e.g. How a request reaches the database" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={cn(inputCls, 'resize-none')} rows={2} placeholder="Why this tour matters (optional)" value={summary} maxLength={1000} onChange={(e) => setSummary(e.target.value)} />
        <p className="text-caption text-ink-tertiary">Click modules on the graph, in order, to add steps.</p>
        {gaps.length > 0 && steps.length === 0 && (
          <div className="text-caption text-ink-tertiary">
            <span className="text-ink-secondary font-medium">No tour covers these critical modules yet: </span>
            {gaps.slice(0, 4).map((g) => (
              <button key={g} className="font-code text-go/80 hover:text-go mr-2" onClick={() => setSteps([...steps, { node: g, note: '' }])}>{shortName(g)}</button>
            ))}
          </div>
        )}
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={`${s.node}-${i}`} className="border border-seam rounded-[3px] p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-caption text-ink-tertiary font-code w-5">{i + 1}.</span>
                <span className="font-code text-caption text-ink truncate flex-1" title={s.node}>{s.node}</span>
                <button aria-label="Remove step" className="text-ink-tertiary hover:text-abort" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash /></button>
              </div>
              <textarea
                className={cn(inputCls, 'resize-none text-caption')}
                rows={2}
                maxLength={1000}
                placeholder="What should a newcomer notice here? Traps, conventions, why it exists."
                value={s.note}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              />
            </li>
          ))}
        </ol>
        <button className={primaryBtn} disabled={save.isPending || title.trim().length < 3 || steps.length === 0} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner className="animate-spin" /> : <Path />} Publish walkthrough
        </button>
      </div>
    </ConsolePanel>
  )
}

// ── Senior team panel ──────────────────────────────────────────────────────

function TeamPanel({ owner, repo, onFocus }: { owner: string; repo: string; onFocus: (node: string) => void }) {
  const team = useQuery({ queryKey: ['comprehension-team', owner, repo], queryFn: () => fetchComprehensionTeam(owner, repo) })
  if (team.isLoading) return <div className="h-40 rounded-card bg-panel border border-seam animate-skeleton" />
  if (team.isError || !team.data) return null
  const { members, stuck, bus_factor: busFactor = [] } = team.data
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <ConsolePanel rail="Who understands the critical path" designator={`${members.length}`}>
        {members.length === 0 ? <EmptyRow label="No one has started the map yet" /> : (
          <ul className="space-y-2.5">
            {members.map((m) => (
              <li key={m.uid} className="space-y-1">
                <div className="flex justify-between text-caption">
                  <span className="text-ink font-medium truncate">{m.name || m.uid}</span>
                  <span className="font-code text-ink-tertiary">
                    {m.critical_lit}/{m.critical_total}{m.changed > 0 && <span className="text-caution"> · {m.changed} decayed</span>}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-seam overflow-hidden">
                  <div className="h-full bg-go" style={{ width: `${m.critical_pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </ConsolePanel>
      <ConsolePanel rail="Where people get stuck" designator="FAILED CHECKS">
        {stuck.length === 0 ? <EmptyRow label="No failed checks yet" /> : (
          <ul className="divide-y divide-seam">
            {stuck.map((s) => (
              <li key={s.node} className="py-2 flex items-center gap-3">
                <button className="font-code text-caption text-go/80 hover:text-go truncate flex-1 text-left" title={s.node} onClick={() => onFocus(s.node)}>{s.node}</button>
                {s.critical && <span className="text-[10px] uppercase tracking-widest text-caution">critical</span>}
                <span className="font-code text-caption text-ink-tertiary">{s.failed_checks} misses · {s.developers} dev{s.developers === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        )}
        {stuck.length > 0 && <p className="text-caption text-ink-tertiary mt-3">A walkthrough on the top module here usually pays off first.</p>}
      </ConsolePanel>
      <ConsolePanel rail="Bus factor" designator="CRITICAL PATH" status={busFactor.some((b) => b.count <= 1) ? 'caution' : 'go'}>
        {busFactor.length === 0 ? <EmptyRow label="No critical modules detected" /> : (
          <ul className="divide-y divide-seam">
            {busFactor.slice(0, 8).map((b) => (
              <li key={b.node} className="py-2 flex items-center gap-3">
                <button className="font-code text-caption text-go/80 hover:text-go truncate flex-1 text-left" title={b.node} onClick={() => onFocus(b.node)}>{shortName(b.node)}</button>
                <span
                  className={cn('font-code text-caption', b.count === 0 ? 'text-abort' : b.count === 1 ? 'text-caution' : 'text-ink-tertiary')}
                  title={b.understood_by.join(', ') || 'Nobody yet'}
                >
                  {b.count === 0 ? 'nobody' : b.count === 1 ? `only ${b.understood_by[0]}` : `${b.count} people`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {busFactor.some((b) => b.count <= 1) && (
          <p className="text-caption text-ink-tertiary mt-3">Modules one person understands are where a walkthrough protects the team most.</p>
        )}
      </ConsolePanel>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ComprehensionMapPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const owner = params.get('owner') ?? ''
  const repo = params.get('repo') ?? ''
  const hasRepo = !!owner && !!repo

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tour, setTour] = useState<{ id: string; step: number } | null>(null)
  const [building, setBuilding] = useState(false)
  const [draftSteps, setDraftSteps] = useState<{ node: string; note: string }[]>([])

  const repos = useQuery({ queryKey: ['repos'], queryFn: fetchRepos })
  useEffect(() => {
    const first = repos.data?.repos?.[0]
    if (!hasRepo && first) setParams({ owner: first.owner, repo: first.name }, { replace: true })
  }, [repos.data, hasRepo, setParams])

  const map = useQuery({
    queryKey: ['comprehension-map', owner, repo],
    queryFn: () => fetchComprehensionMap(owner, repo),
    enabled: hasRepo,
    retry: false,
  })
  const tours = useQuery({
    queryKey: ['walkthroughs', owner, repo],
    queryFn: () => fetchWalkthroughs(owner, repo),
    enabled: hasRepo && map.isSuccess,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['comprehension-map', owner, repo] })
    qc.invalidateQueries({ queryKey: ['walkthroughs', owner, repo] })
    qc.invalidateQueries({ queryKey: ['comprehension-team', owner, repo] })
  }

  // Graph structure is keyed on the snapshot, not on fog state, so lighting a
  // node restyles in place instead of re-running the force layout.
  const data: ComprehensionMap | undefined = map.data
  const structureKey = data ? `${data.snapshot.commit}|${data.snapshot.built_at}|${data.nodes.length}|${data.edges.length}` : ''
  const graphNodes: GraphNode[] = useMemo(
    () => (data?.nodes ?? []).map((n) => ({ id: n.id, group: n.group, files: n.files.length ? n.files : [n.id] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey],
  )
  const graphEdges: GraphEdge[] = useMemo(
    () => (data?.edges ?? []).map((e) => ({ source: e.source, target: e.target })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey],
  )
  const nodeStates = useMemo(
    () => Object.fromEntries((data?.nodes ?? []).map((n) => [n.id, n.state])) as Record<string, ComprehensionNode['state']>,
    [data],
  )
  const criticalIds = useMemo(() => new Set(data?.critical_path ?? []), [data])
  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data])

  const activeTour = tours.data?.walkthroughs.find((w) => w.id === tour?.id) ?? null
  const pathIds = useMemo(
    () => (building ? draftSteps.map((s) => s.node) : activeTour?.steps.map((s) => s.node)) ?? undefined,
    [building, draftSteps, activeTour],
  )
  const selected = selectedId ? byId.get(selectedId) ?? null : null

  // Same query key as the side panel's NodeImpact, so this is one request:
  // the panel lists the blast radius, the canvas rings it.
  const impact = useQuery({
    queryKey: ['change-impact', owner, repo, selectedId],
    queryFn: () => fetchChangeImpact(owner, repo, { nodes: [selectedId as string] }),
    enabled: !!selectedId && !building && !tour && byId.has(selectedId),
  })
  const highlightIds = useMemo(
    () => (impact.data && selectedId && !building && !tour ? new Set(impact.data.affected_modules) : undefined),
    [impact.data, selectedId, building, tour],
  )

  const onNodeClick = (n: GraphNode) => {
    if (building) {
      setDraftSteps((prev) => (prev.some((s) => s.node === n.id) ? prev : [...prev, { node: n.id, note: '' }]))
      return
    }
    setSelectedId(n.id)
  }

  const focusNode = (id: string) => {
    if (!byId.has(id)) return
    setBuilding(false)
    setTour(null)
    setSelectedId(id)
  }

  const startTour = (w: Walkthrough) => {
    setBuilding(false)
    setTour({ id: w.id, step: 0 })
    setSelectedId(w.steps[0]?.node ?? null)
  }

  const reverify = useMutation({
    mutationFn: (id: string) => reverifyWalkthrough(owner, repo, id),
    onSuccess: () => { toast.success('Walkthrough re-verified against the current graph'); refresh() },
    onError: (err) => toast.error('Re-verify failed', errorText(err)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteWalkthrough(owner, repo, id),
    onSuccess: () => refresh(),
    onError: (err) => toast.error('Delete failed', errorText(err)),
  })

  // ── Next move ──
  const nextUp = data?.next_up ? byId.get(data.next_up) : undefined
  const openTours = (tours.data?.walkthroughs ?? []).filter((w) => !w.completed && !w.stale)
  const secondary: NextUpAction[] = openTours.slice(0, 5).map((w) => ({
    id: w.id,
    label: w.title,
    detail: `${w.steps.length} steps by ${w.author_name || 'a senior'}`,
    icon: Path,
    onClick: () => startTour(w),
  }))

  const repoPicker = (
    <select
      aria-label="Repository"
      className={cn(inputCls, 'w-auto min-w-[200px] py-1.5')}
      value={hasRepo ? `${owner}/${repo}` : ''}
      onChange={(e) => {
        const [o, r] = e.target.value.split('/')
        setSelectedId(null); setTour(null); setBuilding(false); setDraftSteps([])
        setParams({ owner: o, repo: r })
      }}
    >
      {!hasRepo && <option value="">Select a repository</option>}
      {(repos.data?.repos ?? []).map((r) => (
        <option key={r.id} value={`${r.owner}/${r.name}`}>{r.owner}/{r.name}</option>
      ))}
    </select>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comprehension"
        title="Knowledge Map"
        subtitle="The codebase as you understand it. Pass a fact check or finish a senior walkthrough to clear the fog."
        actions={repoPicker}
      />

      {!hasRepo && !repos.isLoading && (
        <EmptyState
          framed
          icon={<MapTrifold className="w-8 h-8 text-ink-tertiary/40" />}
          title="No tracked repositories"
          description="Register a repository and build its architecture graph in Explore to start your map."
          action={<Link to="/explore" className={primaryBtn}><Compass /> Go to Explore</Link>}
        />
      )}

      {hasRepo && map.isLoading && <div className="h-[520px] rounded-card bg-panel border border-seam animate-skeleton" />}

      {hasRepo && map.isError && (
        <EmptyState
          framed
          icon={<MapTrifold className="w-8 h-8 text-ink-tertiary/40" />}
          title="No map for this repository yet"
          description={errorText(map.error)}
          action={<Link to={`/explore?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`} className={primaryBtn}><Compass /> Build the graph in Explore</Link>}
        />
      )}

      {data && (
        <>
          {nextUp && !tour && !building && (
            <NextUp
              eyebrow="Learn next"
              headline={`Understand ${shortName(nextUp.id)}`}
              detail={`${nextUp.fan_in} module${nextUp.fan_in === 1 ? '' : 's'} depend on it. It is on your critical path${nextUp.state === 'changed' ? ', and it changed since you last learned it' : ''}.`}
              tone={nextUp.state === 'changed' ? 'caution' : 'go'}
              primary={{ id: 'check', label: 'Check my understanding', icon: Lightbulb, onClick: () => setSelectedId(nextUp.id) }}
              secondary={secondary}
            />
          )}

          <MetricStrip>
            <MetricCell label="Critical path" value={`${data.progress.critical_lit}/${data.progress.critical_total}`} sub={`${data.progress.critical_pct}% understood`} accent="text-go" />
            <MetricCell label="Modules understood" value={`${data.progress.overall_lit}/${data.progress.overall_total}`} />
            <MetricCell label="Decayed" value={data.progress.changed} sub="changed since you learned them" accent={data.progress.changed ? 'text-caution' : undefined} />
            <MetricCell label="Walkthroughs" value={tours.data?.walkthroughs.length ?? 0} sub={tours.data?.coverage_gaps.length ? `${tours.data.coverage_gaps.length} critical modules uncovered` : 'critical path covered'} />
          </MetricStrip>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
            <ConsolePanel
              rail={building ? 'Click modules to add tour steps' : 'Your map'}
              designator={data.snapshot.commit ? data.snapshot.commit.slice(0, 7) : undefined}
              pad="none"
            >
              <div className="h-[560px] relative">
                <Suspense fallback={<div className="h-full animate-skeleton" />}>
                  <ForceGraph
                    nodes={graphNodes}
                    edges={graphEdges}
                    onNodeClick={onNodeClick}
                    selectedNodeId={selectedId}
                    nodeStates={nodeStates}
                    criticalIds={criticalIds}
                    pathIds={pathIds}
                    highlightIds={highlightIds}
                  />
                </Suspense>
                <div className="absolute left-3 bottom-3 flex flex-wrap gap-3 text-[11px] text-ink-tertiary bg-panel/85 border border-seam rounded-[3px] px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-go" /> Understood</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-caution" /> Changed</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-seam-strong opacity-50" /> Fogged</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-ink-tertiary" /> Critical path</span>
                  {highlightIds && highlightIds.size > 0 && (
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-abort" /> Breaks if selection changes ({highlightIds.size})</span>
                  )}
                </div>
              </div>
            </ConsolePanel>

            <div className="space-y-6">
              {building && (
                <WalkthroughBuilder
                  owner={owner}
                  repo={repo}
                  steps={draftSteps}
                  setSteps={setDraftSteps}
                  gaps={tours.data?.coverage_gaps ?? []}
                  onSaved={() => { setBuilding(false); setDraftSteps([]); refresh() }}
                  onCancel={() => { setBuilding(false); setDraftSteps([]) }}
                />
              )}

              {activeTour && tour && !building && (
                <WalkthroughPlayer
                  owner={owner}
                  repo={repo}
                  tour={activeTour}
                  step={tour.step}
                  onStep={(i) => { setTour({ id: activeTour.id, step: i }); setSelectedId(activeTour.steps[i].node) }}
                  onClose={() => setTour(null)}
                  onDone={() => { setTour(null); refresh() }}
                />
              )}

              {selected && !building && (
                <ConsolePanel
                  rail={shortName(selected.id)}
                  designator={selected.critical ? 'CRITICAL' : undefined}
                  status={selected.state === 'lit' ? 'go' : selected.state === 'changed' ? 'caution' : 'idle'}
                  action={<button aria-label="Close" className="text-ink-tertiary hover:text-ink" onClick={() => setSelectedId(null)}><X /></button>}
                >
                  <div className="space-y-4">
                    <div className="space-y-1 text-caption">
                      <div className="font-code text-ink-secondary break-all">{selected.id}</div>
                      <div className="text-ink-tertiary">
                        {STATE_LABEL[selected.state]}
                        {selected.lit_source && ` · via ${litSourceLabel(selected.lit_source)}`}
                      </div>
                      <div className="text-ink-tertiary font-code">{selected.fan_in} depend on it · it depends on {selected.fan_out}</div>
                    </div>
                    {selected.state === 'lit'
                      ? <p className="text-caption text-go flex items-center gap-1.5"><CheckCircle weight="fill" /> You have shown you understand this module.</p>
                      : <FactCheck owner={owner} repo={repo} node={selected} onPassed={refresh} />}
                    <NodeImpact owner={owner} repo={repo} node={selected.id} onFocus={focusNode} />
                    <ModuleContextPanel owner={owner} repo={repo} node={selected.id} />
                  </div>
                </ConsolePanel>
              )}

              <ConsolePanel
                rail="Senior walkthroughs"
                designator={`${tours.data?.walkthroughs.length ?? 0}`}
                action={tours.data?.can_author && !building ? (
                  <button className={ghostBtn} onClick={() => { setTour(null); setSelectedId(null); setBuilding(true) }}><Plus /> Record</button>
                ) : undefined}
              >
                {(tours.data?.walkthroughs.length ?? 0) === 0 ? (
                  <EmptyRow label={tours.data?.can_author ? 'Record the first tour of the critical path' : 'No walkthroughs yet. Ask a senior to record one.'} />
                ) : (
                  <ul className="divide-y divide-seam -my-2">
                    {tours.data!.walkthroughs.map((w) => (
                      <li key={w.id} className="py-2.5 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <button className="text-body-xs text-ink font-medium text-left hover:text-go flex-1" onClick={() => startTour(w)}>{w.title}</button>
                          {w.completed && <CheckCircle weight="fill" className="text-go shrink-0 mt-0.5" aria-label="Completed" />}
                        </div>
                        <div className="text-caption text-ink-tertiary flex flex-wrap items-center gap-x-2">
                          <span>{w.steps.length} steps</span>
                          <span>by {w.author_name || 'a senior'}</span>
                          <span>{w.completed_count} completed</span>
                          {w.stale && <span className="text-caution flex items-center gap-1"><Warning /> {w.stale_steps} step{w.stale_steps === 1 ? '' : 's'} out of date</span>}
                        </div>
                        {tours.data?.can_author && (
                          <div className="flex gap-2">
                            {w.stale && (
                              <button className={ghostBtn} disabled={reverify.isPending} onClick={() => reverify.mutate(w.id)}><Eye /> Re-verify</button>
                            )}
                            <button className={ghostBtn} disabled={remove.isPending} onClick={() => remove.mutate(w.id)}><Trash /> Delete</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </ConsolePanel>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StarterTasks owner={owner} repo={repo} onFocus={focusNode} />
            <PrImpactChecker owner={owner} repo={repo} onFocus={focusNode} />
          </div>

          {data.is_senior && <TeamPanel owner={owner} repo={repo} onFocus={focusNode} />}
        </>
      )}
    </div>
  )
}
