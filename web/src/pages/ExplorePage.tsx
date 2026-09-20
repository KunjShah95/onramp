import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  analyzeArchitecture,
  fetchRepoGraph,
  rebuildRepoGraph,
  type RepoGraphSnapshot,
} from '../lib/api'
import ForceGraph, { PALETTE, type GraphNode, type GraphEdge } from '../components/ForceGraph'
import type { ArchitectureResult } from '../lib/types'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import CardSpotlight from '../components/ui/card-spotlight'
import { ExploreResultSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { useRealTime } from '../context/RealTimeContext'
import { cn } from '../lib/utils'
import {
  MagnifyingGlass,
  Graph,
  X,
  ArrowLeft,
  File,
  Funnel,
  Cube,
  ArrowsOut,
  Spinner,
  ArrowsClockwise,
} from '@phosphor-icons/react'

/**
 * View model the page renders — normalised from either a live `/explore/analyze`
 * result or a durable persisted snapshot. This is what makes the graph survive
 * a reload: the persisted branch needs no live analysis to render.
 */
interface GraphViewModel {
  source: 'live' | 'persisted'
  services: { name: string; files: string[]; description?: string }[]
  dependencies: Record<string, string[]>
  circularDependencies: string[][]
  architecturePattern: string
  fileCount: number
  classCount: number
  functionCount: number
  commit?: string | null
  builtAt?: string
  stale?: boolean | null
  building?: boolean
}

function fromLive(result: ArchitectureResult): GraphViewModel {
  return {
    source: 'live',
    services: result.services ?? [],
    dependencies: result.dependencies ?? {},
    circularDependencies: result.circular_dependencies ?? [],
    architecturePattern: result.architecture_pattern,
    fileCount: result.entities?.files?.length ?? 0,
    classCount: result.entities?.classes?.length ?? 0,
    functionCount: result.entities?.functions?.length ?? 0,
  }
}

function fromSnapshot(snap: RepoGraphSnapshot): GraphViewModel {
  return {
    source: 'persisted',
    services: snap.services ?? [],
    dependencies: snap.dependencies ?? {},
    circularDependencies: snap.circular_dependencies ?? [],
    architecturePattern: snap.architecture_pattern,
    fileCount: snap.stats?.file_count ?? 0,
    classCount: snap.stats?.class_count ?? 0,
    functionCount: snap.stats?.function_count ?? 0,
    commit: snap.commit,
    builtAt: snap.built_at,
    stale: null,
    building: false,
  }
}

/**
 * Group a service by its dominant top-level folder so node colours mean
 * something (a layer/package cluster) instead of every service getting its
 * own colour — the old behaviour made the palette decorative noise.
 */
function layerForFiles(files: string[]): string {
  const counts = new Map<string, number>()
  for (const f of files) {
    const parts = f.split('/').filter(Boolean)
    if (parts.length === 0) continue
    const layer = parts.length > 1 ? parts[0] : '(root)'
    counts.set(layer, (counts.get(layer) ?? 0) + 1)
  }
  let best = '(root)'
  let bestN = -1
  for (const [layer, n] of counts) {
    if (n > bestN) { best = layer; bestN = n }
  }
  return best
}

function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const raw = input.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  if (!raw) return null
  const parts = raw.includes('://')
    ? raw.split('/').filter(Boolean).slice(-2)
    : raw.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] }
}

function relativeTime(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramOwner = searchParams.get('owner')
  const paramRepo = searchParams.get('repo')
  const isRepoMode = Boolean(paramOwner && paramRepo)

  const [repoUrl, setRepoUrl] = useState(
    isRepoMode ? `github.com/${paramOwner}/${paramRepo}` : ''
  )
  const [loading, setLoading] = useState(false)
  const [liveResult, setLiveResult] = useState<ArchitectureResult | null>(null)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [drillNodeId, setDrillNodeId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [activeGroups, setActiveGroups] = useState<Set<string> | null>(null)

  const toast = useToast()
  const queryClient = useQueryClient()
  const { onEvent } = useRealTime()

  const repoGraphKey = ['repo-graph', paramOwner, paramRepo] as const

  // ── Persisted, permanent graph (loaded from URL, survives reload) ───────
  const graphQuery = useQuery({
    queryKey: repoGraphKey,
    queryFn: () => fetchRepoGraph(paramOwner as string, paramRepo as string, { branch: 'main' }),
    enabled: isRepoMode,
    staleTime: 30_000,
    // While a push-triggered rebuild is in flight, poll until it lands.
    refetchInterval: (query) => (query.state.data?.building ? 4000 : false),
  })

  const rebuildMutation = useMutation({
    mutationFn: () => rebuildRepoGraph(paramOwner as string, paramRepo as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoGraphKey })
      toast.success('Rebuild complete', 'Architecture graph updated to the latest commit')
    },
    onError: (err: unknown) => {
      toast.error('Rebuild failed', err instanceof Error ? err.message : 'Unknown error')
    },
  })

  // Live push events for this repo → refetch so the open page updates itself.
  useEffect(() => {
    if (!isRepoMode) return
    const unsub = onEvent((event) => {
      if (event.type !== 'repo_graph') return
      const matches =
        (event.owner && event.owner.toLowerCase() === paramOwner?.toLowerCase()) ||
        (event.name && event.name.toLowerCase() === paramRepo?.toLowerCase())
      if (!matches) return
      toast.info?.('Rebuilding graph', `New commits on ${paramOwner}/${paramRepo}`)
      queryClient.invalidateQueries({ queryKey: repoGraphKey })
    })
    return unsub
  }, [isRepoMode, paramOwner, paramRepo, onEvent, queryClient])

  async function handleAnalyze() {
    const parsed = parseRepoInput(repoUrl)
    if (!parsed) {
      setError('Enter a repository as github.com/owner/repo')
      return
    }
    setLoading(true); setError(''); setSearchQuery(''); setSelectedNode(null); setDrillNodeId(null); setActiveGroups(null)
    try {
      const data = await analyzeArchitecture(repoUrl)
      setLiveResult(data)
      // Persist into the URL so the graph is restored from the durable
      // snapshot on reload instead of vanishing.
      setSearchParams({ owner: parsed.owner, repo: parsed.repo }, { replace: true })
      toast.success('Analysis complete', `${parsed.repo} · ${data.entities.files.length} files mapped`)
    } catch (err: any) {
      setError(err.message || 'Failed to analyze repository.')
      toast.error('Analysis failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Resolve snapshot → view model ───────────────────────────────────────
  const snapshot: RepoGraphSnapshot | null = graphQuery.data?.snapshot ?? null
  const vm: GraphViewModel | null = useMemo(() => {
    if (liveResult) {
      const live = fromLive(liveResult)
      if (graphQuery.data) {
        live.stale = graphQuery.data.stale
        live.building = graphQuery.data.building
        live.commit = snapshot?.commit ?? live.commit
        live.builtAt = snapshot?.built_at ?? live.builtAt
      }
      return live
    }
    if (snapshot) {
      return {
        ...fromSnapshot(snapshot),
        stale: graphQuery.data?.stale ?? null,
        building: graphQuery.data?.building ?? false,
      }
    }
    return null
  }, [liveResult, snapshot, graphQuery.data])

  const busy = loading || rebuildMutation.isPending || Boolean(vm?.building)

  // ── Build graph data from view model ─────────────────────────────────────
  const allNodes: GraphNode[] = useMemo(() => {
    if (!vm) return []
    return vm.services.map((s) => ({
      id: s.name,
      group: layerForFiles(s.files ?? []),
      files: s.files,
      description: s.description,
    }))
  }, [vm])

  const allEdges: GraphEdge[] = useMemo(() => {
    if (!vm) return []
    // Build file → service lookup so we can map file-level deps to service-level edges
    const fileToService = new Map<string, string>()
    for (const svc of vm.services) {
      for (const f of (svc.files ?? [])) fileToService.set(f, svc.name)
    }
    const seen = new Set<string>()
    const edges: GraphEdge[] = []
    for (const [srcFile, tgtFiles] of Object.entries(vm.dependencies ?? {})) {
      const srcSvc = fileToService.get(srcFile)
      if (!srcSvc) continue
      for (const tgtFile of tgtFiles) {
        const tgtSvc = fileToService.get(tgtFile)
        if (!tgtSvc || tgtSvc === srcSvc) continue
        const key = `${srcSvc}→${tgtSvc}`
        if (!seen.has(key)) { seen.add(key); edges.push({ source: srcSvc, target: tgtSvc }) }
      }
    }
    return edges
  }, [vm])

  // ── Active groups for filtering ─────────────────────────────────────────
  const allGroups = useMemo(() => new Set(allNodes.map((n) => n.group)), [allNodes])
  const groupOrder = useMemo(() => {
    const seen: string[] = []
    for (const n of allNodes) if (!seen.includes(n.group)) seen.push(n.group)
    return seen
  }, [allNodes])

  // Initialize activeGroups when data loads
  useEffect(() => {
    if (allGroups.size > 0 && activeGroups === null) {
      setActiveGroups(allGroups)
    }
  }, [allGroups, activeGroups])

  // Reset filter when the dataset changes (new repo / rebuild).
  useEffect(() => {
    setActiveGroups(null)
  }, [snapshot?.id, liveResult])

  // ── Filtered data for drill-down ────────────────────────────────────────
  const displayNodes = useMemo(() => {
    if (!drillNodeId) return allNodes
    const neighborIds = new Set<string>()
    neighborIds.add(drillNodeId)

    for (const edge of allEdges) {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id
      if (sourceId === drillNodeId) neighborIds.add(targetId)
      if (targetId === drillNodeId) neighborIds.add(sourceId)
    }

    return allNodes.filter((n) => neighborIds.has(n.id))
  }, [allNodes, allEdges, drillNodeId])

  const displayEdges = useMemo(() => {
    if (!drillNodeId) return allEdges
    const relevantIds = new Set(displayNodes.map((n) => n.id))
    return allEdges.filter((edge) => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id
      return relevantIds.has(sourceId) && relevantIds.has(targetId)
    })
  }, [allEdges, displayNodes, drillNodeId])

  // ── Node details for selected node ──────────────────────────────────────
  const selectedDetails = useMemo(() => {
    if (!selectedNode || !vm) return null
    const srv = vm.services.find((s) => s.name === selectedNode.id)
    if (!srv) return null

    const edgesIn = allEdges.filter((e) => e.target === selectedNode.id)
    const edgesOut = allEdges.filter((e) => e.source === selectedNode.id)

    return { service: srv, edgesIn, edgesOut }
  }, [selectedNode, vm, allEdges])

  // ── Toggle filter group ────────────────────────────────────────────────
  function toggleGroup(group: string) {
    setActiveGroups((prev) => {
      if (!prev) return new Set([group])
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next.size === allGroups.size ? null : next
    })
  }

  const graphLoading = isRepoMode && graphQuery.isLoading
  const hasGraph = Boolean(vm && allNodes.length > 0)
  const showError = error || (graphQuery.isError && !liveResult
    ? (graphQuery.error instanceof Error ? graphQuery.error.message : 'Failed to load the saved graph.')
    : '')

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] font-body text-ink max-w-full overflow-x-hidden relative">
        {/* Header */}
        <PageHeader
          eyebrow="Folio 08 · Explore"
          title="Architecture Explorer"
          subtitle={
            isRepoMode
              ? `${paramOwner}/${paramRepo} · durable graph, updates on every push`
              : 'Deep codebase analysis · dependency graph, service map, circular deps detection'
          }
          actions={
            <div className="relative flex items-center w-full md:w-[360px]">
              <MagnifyingGlass size={16} className="absolute left-3 text-ink-muted/40 pointer-events-none" />
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                placeholder="github.com/owner/repo"
                className="w-full bg-base border border-seam text-ink text-body-sm rounded-[3px] pl-9 pr-24 py-2.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/40"
              />
              <button
                onClick={handleAnalyze}
                disabled={loading || !repoUrl.trim()}
                className="absolute right-1.5 rounded-[3px] bg-go text-white px-3 py-1.5 text-caption font-semibold hover:bg-go-lit disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Analyzing…' : 'Analyze'}
              </button>
            </div>
          }
        />

        {showError && (
          <div className="mb-6 px-4 py-3 rounded-[3px] bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
            <span>{showError}</span>
            <button
              onClick={() => (isRepoMode ? graphQuery.refetch() : handleAnalyze())}
              disabled={busy}
              className="text-caption underline ml-4 text-abort/70 hover:text-abort disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        {(loading || graphLoading) && !vm && <ExploreResultSkeleton />}

        {/* ── Graph status bar — durable state (commit · built · stale) ── */}
        {isRepoMode && vm && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[3px] border border-seam bg-well/30 px-3.5 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                vm.building ? 'bg-amber-400 animate-pulse' : 'bg-go'
              )} />
              <span className="font-code text-[11px] text-ink-secondary truncate">
                {vm.commit ? `pinned to ${vm.commit}` : 'no commit pinned'}
              </span>
            </div>
            {vm.builtAt && (
              <span className="font-code text-[11px] text-ink-muted/70">
                built {relativeTime(vm.builtAt)}
              </span>
            )}
            {vm.building && (
              <span className="font-code text-[11px] text-amber-500">rebuilding…</span>
            )}
            {!vm.building && vm.stale === true && (
              <span className="font-code text-[11px] text-amber-500">
                newer commit available
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => rebuildMutation.mutate()}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-[3px] border border-seam bg-panel px-2.5 py-1 text-caption font-medium text-ink-secondary hover:text-ink hover:border-go/40 transition-colors disabled:opacity-40"
              >
                <ArrowsClockwise size={13} weight="bold" className={busy ? 'animate-spin' : ''} />
                Rebuild
              </button>
            </div>
          </div>
        )}

        {/* ── Metric strip — single ruled panel, four readouts (matches Dashboard Folio 01) ── */}
        <div className="mb-6">
          <div className="metric-strip grid-cols-2 md:grid-cols-4">
            {([
              { label: 'Total files', value: vm ? vm.fileCount : '—', sub: vm ? 'scanned' : 'awaiting index' },
              { label: 'Classes', value: vm ? vm.classCount : '—', sub: vm ? 'entities' : '—' },
              { label: 'Functions', value: vm ? vm.functionCount : '—', sub: vm ? 'entities' : '—' },
              {
                label: 'Circular deps',
                value: vm ? vm.circularDependencies.length : '—',
                sub: vm ? (vm.circularDependencies.length > 0 ? 'needs attention' : 'clean') : '—',
              },
            ] as const).map((stat) => (
              <div key={stat.label} className="metric-cell">
                <div className="overline mb-1">{stat.label}</div>
                <div className="readout text-[15px]">{stat.value}</div>
                <div className="font-code text-[11px] text-ink-tertiary mt-1">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Graph controls ──────────────────────────────── */}
        {hasGraph && !busy && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted/40 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes…"
                className="w-full bg-base border border-seam text-ink text-caption rounded-[3px] pl-8 pr-3 py-1.5 focus:outline-none focus:border-go/60 placeholder:text-ink-muted/30 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted/30 hover:text-ink-muted transition-colors">
                  <X size={12} weight="bold" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-caption font-medium border transition-all',
                showFilters
                  ? 'bg-mission/10 border-mission/30 text-mission'
                  : 'bg-well/30 border-seam text-ink-muted hover:text-ink-secondary'
              )}
            >
              <Funnel size={14} weight={showFilters ? 'fill' : 'regular'} />
              Layers {activeGroups && activeGroups.size < allGroups.size ? `(${activeGroups.size})` : ''}
            </button>

            {/* Drill-down indicator */}
            {drillNodeId && (
              <button
                onClick={() => { setDrillNodeId(null); setSelectedNode(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-caption font-medium bg-mission/10 border border-mission/25 text-mission-lit transition-all hover:bg-mission/20"
              >
                <ArrowLeft size={14} weight="bold" />
                Back to all
              </button>
            )}

            {/* Selected node badge */}
            {selectedNode && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] bg-mission/10 border border-mission/20 text-mission text-caption font-medium">
                <Cube size={14} weight="fill" />
                {selectedNode.id.length > 18 ? selectedNode.id.slice(0, 16) + '…' : selectedNode.id}
                <button onClick={() => setSelectedNode(null)} className="ml-1 hover:text-ink-secondary transition-colors">
                  <X size={12} weight="bold" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Layer legend — colour meaning ───────────────── */}
        {hasGraph && !busy && groupOrder.length > 1 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            {groupOrder.map((group, i) => {
              const on = !activeGroups || activeGroups.has(group)
              return (
                <button
                  key={group}
                  onClick={() => toggleGroup(group)}
                  className={cn(
                    'flex items-center gap-1.5 text-[11px] font-code transition-opacity',
                    on ? 'opacity-100' : 'opacity-35'
                  )}
                  title={`Toggle layer ${group}`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="text-ink-secondary">{group}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Filter chips ────────────────────────────────── */}
        {showFilters && hasGraph && !busy && (
          <div className="mb-3 overflow-hidden">
            <div className="flex flex-wrap gap-1.5 p-2 bg-well/20 border border-seam rounded-[3px]">
              {Array.from(allGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => toggleGroup(group)}
                  className={cn(
                    'px-2.5 py-1 rounded-[3px] text-[11px] font-mono font-medium border transition-all',
                    (!activeGroups || activeGroups.has(group))
                      ? 'bg-mission/10 border-mission/25 text-mission'
                      : 'bg-transparent border-[rgb(var(--border-rgb)/0.5)] text-ink-muted/40 hover:text-ink-muted'
                  )}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Graph + Details layout ──────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Graph window */}
          <CardSpotlight className={cn(
            'overflow-hidden flex flex-col',
            selectedDetails ? 'lg:flex-[2]' : 'lg:flex-1',
            'h-[500px]'
          )}>
            {/* Window chrome */}
            <div className="h-10 border-b border-seam bg-well/60 flex items-center px-4 relative shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/20" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-ink-muted/30 text-caption font-code tracking-wide">
                  {drillNodeId
                    ? `drill: ${drillNodeId.slice(0, 24)}`
                    : vm
                      ? `${vm.architecturePattern} · ${allNodes.length} nodes · ${allEdges.length} edges`
                      : 'arch_graph.viz'}
                </span>
              </div>
              {vm && (
                <div className="absolute right-4 flex items-center gap-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full', vm.building ? 'bg-amber-400' : 'bg-go')} />
                  <span className={cn('text-caption font-code', vm.building ? 'text-amber-500' : 'text-go/70')}>
                    {vm.building ? 'rebuilding' : vm.source === 'persisted' ? 'saved' : 'live'}
                  </span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 relative overflow-hidden" style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjAzIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")`,
            }}>
              <div className="absolute inset-0 bg-well/10 pointer-events-none z-10" />

              {!vm && !busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                  <EmptyState
                    title={
                      isRepoMode
                        ? 'No saved graph for this repository yet'
                        : 'Enter a GitHub URL above to analyze'
                    }
                    description={
                      isRepoMode
                        ? 'Build it once — it stays saved and refreshes on every push.'
                        : 'Renders an interactive dependency graph with D3 force simulation'
                    }
                    icon={<Graph size={40} />}
                    action={
                      <button
                        onClick={() => (isRepoMode ? rebuildMutation.mutate() : handleAnalyze())}
                        disabled={busy}
                        className="mt-2 px-5 py-2 rounded-[3px] text-caption border border-seam text-ink-muted hover:text-ink hover:bg-well transition-colors font-code disabled:opacity-50"
                      >
                        {isRepoMode ? 'Build graph' : 'Initialize Graph'}
                      </button>
                    }
                  />
                </div>
              )}

              {busy && !vm && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                  <Spinner size={28} aria-hidden className="animate-spin text-go mb-4 shrink-0" />
                  <p className="text-ink-muted/60 text-caption font-code animate-pulse">
                    {isRepoMode ? 'Loading saved graph…' : 'Cloning repository and parsing AST…'}
                  </p>
                </div>
              )}

              {vm && allNodes.length > 0 && (
                <div className="absolute inset-0 z-20">
                  <ForceGraph
                    nodes={displayNodes}
                    edges={displayEdges}
                    onNodeClick={(node) => {
                      setSelectedNode(node)
                    }}
                    selectedNodeId={selectedNode?.id ?? null}
                    searchQuery={searchQuery}
                    activeGroups={activeGroups}
                  />
                </div>
              )}
            </div>
          </CardSpotlight>

          {/* ── Details panel ─────────────────────────────── */}

            {selectedDetails && (
              <div className="lg:w-[340px] shrink-0">
                <CardSpotlight className="p-5 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-go" />
                      <h3 className="text-body-sm font-semibold text-ink truncate">
                        {selectedDetails.service.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setDrillNodeId(selectedDetails.service.name)
                          setShowFilters(false)
                        }}
                        className="w-7 h-7 rounded-[3px] bg-well/50 flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
                        title="Focus on this node"
                      >
                        <ArrowsOut size={14} weight="bold" />
                      </button>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="w-7 h-7 rounded-[3px] bg-well/50 flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  </div>

                  {selectedDetails.service.description && (
                    <p className="text-caption text-ink-secondary leading-relaxed mb-4 pb-4 border-b border-seam">
                      {selectedDetails.service.description}
                    </p>
                  )}

                  {/* Dependency counts */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-well/30 rounded-[3px] p-2.5 text-center">
                      <div className="text-body-sm font-bold text-mission-lit">{selectedDetails.edgesIn.length}</div>
                      <div className="text-[10px] text-ink-muted/50">Dependencies</div>
                    </div>
                    <div className="bg-well/30 rounded-[3px] p-2.5 text-center">
                      <div className="text-body-sm font-bold text-go">{selectedDetails.edgesOut.length}</div>
                      <div className="text-[10px] text-ink-muted/50">Dependents</div>
                    </div>
                  </div>

                  {/* Files */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <File size={12} className="text-ink-muted/50" weight="bold" />
                      <span className="text-[10px] uppercase tracking-wider text-ink-muted/50 font-semibold">
                        Files ({selectedDetails.service.files.length})
                      </span>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar">
                      {selectedDetails.service.files.map((f, i) => {
                        const ext = f.split('.').pop() ?? ''
                        return (
                          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-[3px] hover:bg-well/30 transition-colors group">
                            <span className="text-[10px] font-mono text-ink-muted/30 uppercase w-8 shrink-0">{ext}</span>
                            <span className="text-[11px] text-ink-secondary group-hover:text-ink truncate font-mono transition-colors">
                              {f}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardSpotlight>
              </div>
            )}

        </div>

        {/* ── Architecture insights ───────────────────────── */}
        {vm && !busy && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="bg-base border border-seam rounded-card p-4 hover:border-seam-strong transition-colors">
              <div className="text-overline text-ink-muted/50 font-semibold mb-2">Pattern</div>
              <div className="text-ink readout text-body-sm font-medium">{vm.architecturePattern}</div>
              <div className="text-caption text-ink-muted/40 mt-1">
                {allNodes.length} services · {allEdges.length} dep edges
              </div>
            </div>

            <div className="md:col-span-2 bg-base border border-seam rounded-card p-4 hover:border-seam-strong transition-colors">
              <div className="text-overline text-ink-muted/50 font-semibold mb-3">Services</div>
              {vm.services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {vm.services.map((srv, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const node = allNodes.find((n) => n.id === srv.name)
                        if (node) setSelectedNode(node)
                      }}
                      className="bg-well/60 border border-seam rounded-[3px] px-3 py-1.5 text-body-xs hover:border-mission/40 hover:bg-mission/5 transition-colors cursor-pointer"
                    >
                      <span className="text-ink/75 font-medium">{srv.name}</span>
                      <span className="text-ink-muted/40 ml-1.5 font-code">{srv.files.length}f</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-ink-disabled/50 text-body-xs">No distinct services identified.</span>
              )}
            </div>
          </div>
        )}

    </div>
  )
}
