import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { analyzeArchitecture } from '../lib/api'
import ForceGraph, { type GraphNode, type GraphEdge } from '../components/ForceGraph'
import type { ArchitectureResult } from '../lib/types'
import { StatCard } from '../components/ui/stat-card'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import CardSpotlight from '../components/ui/card-spotlight'
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
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
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
      toast.success('Analysis complete', `${repoUrl.split('/').pop()} · ${data.entities.files.length} files mapped`)
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
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-ink max-w-full overflow-x-hidden relative">
        {/* Header */}
        <PageHeader
          eyebrow="Folio 08 · Explore"
          title="Architecture Explorer"
          subtitle="Deep codebase analysis · dependency graph, service map, circular deps detection"
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

        {error && (
          <div className="mb-6 px-4 py-3 rounded-[3px] bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleAnalyze} disabled={loading || !repoUrl.trim()} className="text-caption underline ml-4 text-abort/70 hover:text-abort disabled:opacity-50">Retry</button>
          </div>
        )}

        {loading && !result && <ExploreResultSkeleton />}

        {/* ── Metric cards ────────────────────────────────── */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {([
            { label: 'Total Files', value: result?.entities.files.length ?? 'N/A', color: result ? 'text-ink' : 'text-ink-disabled/40' },
            { label: 'Classes', value: result?.entities.classes.length ?? 'N/A', color: result ? 'text-ink' : 'text-ink-disabled/40' },
            { label: 'Functions', value: result?.entities.functions.length ?? 'N/A', color: result ? 'text-ink' : 'text-ink-disabled/40' },
            {
              label: 'Circular Deps',
              value: result?.circular_dependencies.length ?? 'N/A',
              color: result
                ? (result.circular_dependencies.length > 0 ? 'text-abort' : 'text-go')
                : 'text-ink-disabled/40',
            },
          ] as const).map((stat, i) => (
            <StatCard key={i} label={stat.label} value={stat.value} color={stat.color} />
          ))}
        </motion.div>

        {/* ── Graph controls ──────────────────────────────── */}
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 mb-3">
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
              Filters {activeGroups && activeGroups.size < allGroups.size ? `(${activeGroups.size})` : ''}
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
            <div className="flex flex-wrap gap-1.5 p-2 bg-well/20 border border-seam rounded-[3px]">
              {Array.from(allGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => toggleGroup(group)}
                  className={cn(
                    'px-2.5 py-1 rounded-[3px] text-[11px] font-mono font-medium border transition-all',
                    (!activeGroups || activeGroups.has(group))
                      ? 'bg-mission/10 border-mission/25 text-mission'
                      : 'bg-transparent border-seam/50 text-ink-muted/40 hover:text-ink-muted'
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
                    : result
                      ? `${result.architecture_pattern} · ${allNodes.length} nodes · ${allEdges.length} edges`
                      : 'arch_graph.viz'}
                </span>
              </div>
              {result && (
                <div className="absolute right-4 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-go" />
                  <span className="text-caption text-go/70 font-code">live</span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 relative overflow-hidden" style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjAzIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+\")`,
            }}>
              <div className="absolute inset-0 bg-well/10 pointer-events-none z-10" />

              {!result && !loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                  <EmptyState
                    title="Enter a GitHub URL above to analyze"
                    description="Renders an interactive dependency graph with D3 force simulation"
                    icon={<Graph size={40} />}
                    action={
                      <button onClick={handleAnalyze}
                        className="mt-2 px-5 py-2 rounded-[3px] text-caption border border-seam text-ink-muted hover:text-ink hover:bg-well transition-colors font-code">
                        Initialize Graph
                      </button>
                    }
                  />
                </div>
              )}

              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                  <svg className="w-7 h-7 animate-spin text-go mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-ink-muted/60 text-caption font-code animate-pulse">Cloning repository and parsing AST…</p>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Architecture insights ───────────────────────── */}
        {result && !loading && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <motion.div variants={itemVariants} className="bg-base border border-seam rounded-card p-4 hover:border-seam-strong transition-colors">
              <div className="text-overline text-ink-muted/50 font-semibold mb-2">Pattern</div>
              <div className="text-ink readout text-body-sm font-medium">{result.architecture_pattern}</div>
              <div className="text-caption text-ink-muted/40 mt-1">
                {allNodes.length} services · {allEdges.length} dep edges
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="md:col-span-2 bg-base border border-seam rounded-card p-4 hover:border-seam-strong transition-colors">
              <div className="text-overline text-ink-muted/50 font-semibold mb-3">Services</div>
              {result.services && result.services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.services.map((srv, idx) => (
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
            </motion.div>
          </motion.div>
        )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgb(var(--border-rgb) / 0.18); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgb(var(--border-rgb) / 0.30); }
      `}</style>
    </motion.div>
  )
}
