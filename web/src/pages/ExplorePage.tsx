import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { analyzeArchitecture } from '../lib/api'
import ForceGraph, { type GraphNode, type GraphEdge } from '../components/ForceGraph'
import type { ArchitectureResult } from '../lib/types'
import { StatCard } from '../components/ui/stat-card'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { ExploreResultSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
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
} from '@phosphor-icons/react'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function ExplorePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ArchitectureResult | null>(null)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [drillNodeId, setDrillNodeId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const toast = useToast()

  async function handleAnalyze() {
    if (!repoUrl.trim()) return
    setLoading(true); setError(''); setSearchQuery(''); setSelectedNode(null); setDrillNodeId(null)
    try {
      const data = await analyzeArchitecture(repoUrl)
      setResult(data)
      toast.success('Analysis complete', `${repoUrl.split('/').pop()} — ${data.entities.files.length} files mapped`)
    } catch (err: any) {
      setError(err.message || 'Failed to analyze repository.')
      toast.error('Analysis failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Build graph data from result ─────────────────────────────────
  const allNodes: GraphNode[] = useMemo(() => {
    if (!result) return []
    return result.services?.map((s) => ({
      id: s.name,
      group: s.name,
      files: s.files,
      description: s.description,
    })) ?? []
  }, [result])

  const allEdges: GraphEdge[] = useMemo(() => {
    if (!result) return []
    return Object.entries(result.dependencies ?? {}).flatMap(([source, targets]) =>
      targets.map((target) => ({ source, target }))
    )
  }, [result])

  // ── Active groups for filtering ─────────────────────────────────
  const allGroups = useMemo(() => new Set(allNodes.map((n) => n.group)), [allNodes])
  const [activeGroups, setActiveGroups] = useState<Set<string> | null>(null)

  // Initialize activeGroups when data loads
  useEffect(() => {
    if (allGroups.size > 0 && activeGroups === null) {
      setActiveGroups(allGroups)
    }
  }, [allGroups, activeGroups])

  // ── Filtered data for drill-down ────────────────────────────────
  const displayNodes = useMemo(() => {
    if (!drillNodeId) return allNodes
    const neighborIds = new Set<string>()
    neighborIds.add(drillNodeId)

    // Find immediate neighbors
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

  // ── Node details for selected node ──────────────────────────────
  const selectedDetails = useMemo(() => {
    if (!selectedNode || !result) return null
    const srv = result.services?.find((s) => s.name === selectedNode.id)
    if (!srv) return null

    const edgesIn = allEdges.filter((e) => e.target === selectedNode.id)
    const edgesOut = allEdges.filter((e) => e.source === selectedNode.id)

    return { service: srv, edgesIn, edgesOut }
  }, [selectedNode, result, allEdges])

  // ── Toggle filter group ────────────────────────────────────────
  function toggleGroup(group: string) {
    setActiveGroups((prev) => {
      if (!prev) return new Set([group])
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next.size === allGroups.size ? null : next
    })
  }

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body max-w-full overflow-x-hidden">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="mb-8">
          <GradientHeading as="h1" className="mb-2">Architecture Explorer</GradientHeading>
          <p className="text-body-sm text-text-muted mb-6 max-w-2xl">
            Deep codebase analysis — dependency graph, service map, circular deps detection
          </p>

          {/* URL Input */}
          <div className="relative flex items-center w-full md:w-[440px]">
            <MagnifyingGlass size={16} className="absolute left-3.5 text-text-muted/40 pointer-events-none" />
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="github.com/owner/repo"
              className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-28 py-2.5 focus:outline-none focus:border-accent-from/60 focus:ring-1 focus:ring-accent-muted transition-colors placeholder:text-text-muted/40"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !repoUrl.trim()}
              className="absolute right-1.5 bg-accent-from hover:brightness-110 disabled:opacity-40 text-[#09090B] px-3 py-1.5 rounded-md text-caption font-semibold transition-all"
            >
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleAnalyze} disabled={loading || !repoUrl.trim()} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {loading && !result && <ExploreResultSkeleton />}

        {/* ── Metric cards ────────────────────────────────── */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {([
            { label: 'Total Files', value: result?.entities.files.length ?? '—', color: result ? 'text-text-primary' : 'text-text-disabled/40', accent: '#F59E0B' },
            { label: 'Classes', value: result?.entities.classes.length ?? '—', color: result ? 'text-text-primary' : 'text-text-disabled/40', accent: '#EF4444' },
            { label: 'Functions', value: result?.entities.functions.length ?? '—', color: result ? 'text-text-primary' : 'text-text-disabled/40', accent: '#3B82F6' },
            {
              label: 'Circular Deps',
              value: result?.circular_dependencies.length ?? '—',
              color: result
                ? (result.circular_dependencies.length > 0 ? 'text-error' : 'text-success')
                : 'text-text-disabled/40',
              accent: result && result.circular_dependencies.length > 0 ? '#EF4444' : '#60606E',
            },
          ] as const).map((stat, i) => (
            <motion.div key={i} variants={itemVariants}>
              <CardSpotlight><StatCard label={stat.label} value={stat.value} color={stat.color} accentColor={stat.accent} /></CardSpotlight>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Graph controls ──────────────────────────────── */}
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 mb-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/40 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes…"
                className="w-full bg-bg-secondary border border-border text-text-primary text-caption rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-accent-from/60 placeholder:text-text-muted/30 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/30 hover:text-text-muted transition-colors">
                  <X size={12} weight="bold" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium border transition-all',
                showFilters
                  ? 'bg-accent-from/10 border-accent-from/30 text-accent-from'
                  : 'bg-bg-tertiary/30 border-border text-text-muted hover:text-text-secondary'
              )}
            >
              <Funnel size={14} weight={showFilters ? 'fill' : 'regular'} />
              Filters {activeGroups && activeGroups.size < allGroups.size ? `(${activeGroups.size})` : ''}
            </button>

            {/* Drill-down indicator */}
            {drillNodeId && (
              <button
                onClick={() => { setDrillNodeId(null); setSelectedNode(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium bg-blue-500/10 border border-blue-500/25 text-blue-400 transition-all hover:bg-blue-500/20"
              >
                <ArrowLeft size={14} weight="bold" />
                Back to all
              </button>
            )}

            {/* Selected node badge */}
            {selectedNode && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-from/10 border border-accent-from/20 text-accent-from text-caption font-medium">
                <Cube size={14} weight="fill" />
                {selectedNode.id.length > 18 ? selectedNode.id.slice(0, 16) + '…' : selectedNode.id}
                <button onClick={() => setSelectedNode(null)} className="ml-1 hover:text-white transition-colors">
                  <X size={12} weight="bold" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Filter chips ────────────────────────────────── */}
        {showFilters && result && !loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 p-2 bg-bg-tertiary/20 border border-border rounded-xl">
              {Array.from(allGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => toggleGroup(group)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium border transition-all',
                    (!activeGroups || activeGroups.has(group))
                      ? 'bg-accent-from/10 border-accent-from/25 text-accent-from'
                      : 'bg-transparent border-border/50 text-text-muted/40 hover:text-text-muted'
                  )}
                >
                  {group}
                </button>
              ))}
            </div>
          </motion.div>
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
            <div className="h-10 border-b border-border bg-bg-tertiary/60 flex items-center px-4 relative shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/20" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-text-muted/30 text-caption font-code tracking-wide">
                  {drillNodeId
                    ? `drill: ${drillNodeId.slice(0, 24)}`
                    : result
                      ? `${result.architecture_pattern} · ${allNodes.length} nodes · ${allEdges.length} edges`
                      : 'arch_graph.viz'}
                </span>
              </div>
              {result && (
                <div className="absolute right-4 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-caption text-success/70 font-code">live</span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 relative overflow-hidden" style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjAzIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+\")`,
            }}>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,bg-bg-secondary_100%)] pointer-events-none z-10" />

              {!result && !loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                  <EmptyState
                    title="Enter a GitHub URL above to analyze"
                    description="Renders an interactive dependency graph with D3 force simulation"
                    icon={<Graph size={40} />}
                    action={
                      <button onClick={handleAnalyze}
                        className="mt-2 px-5 py-2 rounded-btn text-caption border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors font-code">
                        Initialize Graph
                      </button>
                    }
                  />
                </div>
              )}

              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                  <svg className="w-7 h-7 animate-spin text-accent-from mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-text-muted/60 text-caption font-code animate-pulse">Cloning repository and parsing AST…</p>
                </div>
              )}

              {result && !loading && (
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
          <AnimatePresence>
            {selectedDetails && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="lg:w-[340px] shrink-0"
              >
                <CardSpotlight className="p-5 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-accent-from" />
                      <h3 className="text-body-sm font-semibold text-text-primary truncate">
                        {selectedDetails.service.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setDrillNodeId(selectedDetails.service.name)
                          setShowFilters(false)
                        }}
                        className="w-7 h-7 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                        title="Focus on this node"
                      >
                        <ArrowsOut size={14} weight="bold" />
                      </button>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="w-7 h-7 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  </div>

                  {selectedDetails.service.description && (
                    <p className="text-caption text-text-secondary leading-relaxed mb-4 pb-4 border-b border-border">
                      {selectedDetails.service.description}
                    </p>
                  )}

                  {/* Dependency counts */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-bg-tertiary/30 rounded-lg p-2.5 text-center">
                      <div className="text-body-sm font-bold text-blue-400">{selectedDetails.edgesIn.length}</div>
                      <div className="text-[10px] text-text-muted/50">Dependencies</div>
                    </div>
                    <div className="bg-bg-tertiary/30 rounded-lg p-2.5 text-center">
                      <div className="text-body-sm font-bold text-accent-from">{selectedDetails.edgesOut.length}</div>
                      <div className="text-[10px] text-text-muted/50">Dependents</div>
                    </div>
                  </div>

                  {/* Files */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <File size={12} className="text-text-muted/50" weight="bold" />
                      <span className="text-[10px] uppercase tracking-wider text-text-muted/50 font-semibold">
                        Files ({selectedDetails.service.files.length})
                      </span>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar">
                      {selectedDetails.service.files.map((f, i) => {
                        const ext = f.split('.').pop() ?? ''
                        return (
                          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-bg-tertiary/30 transition-colors group">
                            <span className="text-[10px] font-mono text-text-muted/30 uppercase w-8 shrink-0">{ext}</span>
                            <span className="text-[11px] text-text-secondary group-hover:text-text-primary truncate font-mono transition-colors">
                              {f}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardSpotlight>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Architecture insights ───────────────────────── */}
        {result && !loading && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <motion.div variants={itemVariants} className="bg-bg-secondary border border-border rounded-card p-4 hover:border-border-hover transition-colors">
              <div className="text-overline text-text-muted/50 font-semibold mb-2">Pattern</div>
              <div className="text-accent-from font-code text-body-sm font-medium">{result.architecture_pattern}</div>
              <div className="text-caption text-text-muted/40 mt-1">
                {allNodes.length} services · {allEdges.length} dep edges
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="md:col-span-2 bg-bg-secondary border border-border rounded-card p-4 hover:border-border-hover transition-colors">
              <div className="text-overline text-text-muted/50 font-semibold mb-3">Services</div>
              {result.services && result.services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.services.map((srv, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const node = allNodes.find((n) => n.id === srv.name)
                        if (node) setSelectedNode(node)
                      }}
                      className="bg-bg-tertiary/60 border border-border rounded-lg px-3 py-1.5 text-body-xs hover:border-accent-from/30 hover:bg-accent-from/5 transition-colors cursor-pointer"
                    >
                      <span className="text-text-primary/75 font-medium">{srv.name}</span>
                      <span className="text-text-muted/40 ml-1.5 font-code">{srv.files.length}f</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-text-disabled/50 text-body-xs">No distinct services identified.</span>
              )}
            </motion.div>
          </motion.div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </PageTransition>
  )
}
