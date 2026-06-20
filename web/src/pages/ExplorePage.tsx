import { useState } from 'react'
import { motion } from 'framer-motion'
import { analyzeArchitecture } from '../lib/api'
import ForceGraph from '../components/ForceGraph'
import type { ArchitectureResult } from '../lib/types'
import { StatCard } from '../components/ui/stat-card'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

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

  async function handleAnalyze() {
    if (!repoUrl.trim()) return
    setLoading(true); setError('')
    try { setResult(await analyzeArchitecture(repoUrl)) }
    catch (err: any) { setError(err.message || 'Failed to analyze repository.') }
    finally { setLoading(false) }
  }

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
        <div className="mb-8">
          <GradientHeading as="h1" className="mb-2">Architecture Explorer</GradientHeading>
          <p className="text-[#FDFBF8]/60 text-sm mb-6 max-w-2xl">
            Deep codebase analysis — dependency graph, service map, circular deps detection
          </p>
          <div className="relative flex items-center w-full md:w-[440px]">
            <svg className="absolute left-3.5 w-4 h-4 text-[#FDFBF8]/25 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="github.com/owner/repo"
              className="w-full bg-[#120D0A] border border-[#FDFBF8]/8 text-[#FDFBF8] text-sm rounded-lg pl-10 pr-28 py-2.5 focus:outline-none focus:border-[#FF8C00]/40 transition-colors placeholder:text-[#FDFBF8]/25"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !repoUrl.trim()}
              className="absolute right-1.5 bg-[#FF8C00] hover:bg-[#FFB347] disabled:opacity-40 text-[#3D1C00] px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
            >
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Metric cards */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <motion.div variants={itemVariants}>
            <CardSpotlight>
              <StatCard
                label="Total Files"
                value={result ? result.entities.files.length : '—'}
                accentColor="#FF8C00"
                color={result ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/20'}
              />
            </CardSpotlight>
          </motion.div>
          <motion.div variants={itemVariants}>
            <CardSpotlight>
              <StatCard
                label="Classes"
                value={result ? result.entities.classes.length : '—'}
                accentColor="#E16A6A"
                color={result ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/20'}
              />
            </CardSpotlight>
          </motion.div>
          <motion.div variants={itemVariants}>
            <CardSpotlight>
              <StatCard
                label="Functions"
                value={result ? result.entities.functions.length : '—'}
                accentColor="#4DA8DA"
                color={result ? 'text-[#FDFBF8]' : 'text-[#FDFBF8]/20'}
              />
            </CardSpotlight>
          </motion.div>
          <motion.div variants={itemVariants}>
            <CardSpotlight>
              <StatCard
                label="Circular Deps"
                value={result ? result.circular_dependencies.length : '—'}
                accentColor={result && result.circular_dependencies.length > 0 ? '#ef4444' : '#8C8C8C'}
                color={result
                  ? result.circular_dependencies.length > 0 ? 'text-red-400' : 'text-green-400'
                  : 'text-[#FDFBF8]/20'}
              />
            </CardSpotlight>
          </motion.div>
        </motion.div>

        {/* Graph window */}
        <CardSpotlight className="rounded-xl border border-[#FDFBF8]/5 bg-[#0D0906] overflow-hidden flex flex-col h-[500px] shadow-2xl">
          {/* Window chrome */}
          <div className="h-10 border-b border-[#FDFBF8]/5 bg-[#120D0A] flex items-center px-4 relative shrink-0">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[#FDFBF8]/20 text-xs font-mono tracking-wide">
                {result ? `${result.architecture_pattern} · ${result.services?.length ?? 0} services` : 'arch_graph.viz'}
              </span>
            </div>
            {result && (
              <div className="absolute right-4 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[10px] text-green-400/70 font-mono">live</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 relative overflow-hidden" style={{
            backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFBMTEwRCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")`
          }}>
            {/* Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#0D0906_100%)] pointer-events-none z-10" />

            {!result && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                <EmptyState
                  title="Enter a GitHub URL above to analyze"
                  description="Renders an interactive dependency graph with D3 force simulation"
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>}
                  action={
                    <button onClick={handleAnalyze}
                      className="mt-2 px-5 py-2 rounded-lg text-xs border border-[#FDFBF8]/15 text-[#FDFBF8]/50 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5 transition-colors font-mono">
                      Initialize Graph
                    </button>
                  }
                />
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                <svg className="w-7 h-7 animate-spin text-[#FF8C00] mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-[#FDFBF8]/40 text-xs font-mono animate-pulse">Cloning repository and parsing AST…</p>
              </div>
            )}

            {result && !loading && (
              <div className="absolute inset-0 z-20">
                <ForceGraph
                  nodes={result.services?.map((s) => ({ id: s.name, group: s.name, files: s.files })) ?? []}
                  edges={Object.entries(result.dependencies ?? {}).flatMap(([source, targets]) =>
                    targets.map((target) => ({ source, target }))
                  )}
                  onNodeClick={(node) => console.log('Node clicked:', node)}
                />
              </div>
            )}
          </div>
        </CardSpotlight>

        {/* Architecture insights */}
        {result && !loading && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <motion.div variants={itemVariants} className="bg-[#120D0A] border border-[#FDFBF8]/5 rounded-xl p-4 hover:border-[#FDFBF8]/10 transition-colors">
              <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/25 font-semibold mb-2">Pattern</div>
              <div className="text-[#FF8C00] font-mono text-sm font-medium">{result.architecture_pattern}</div>
              <div className="text-[11px] text-[#FDFBF8]/30 mt-1">
                {result.services?.length ?? 0} services · {Object.keys(result.dependencies ?? {}).length} dep edges
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="md:col-span-2 bg-[#120D0A] border border-[#FDFBF8]/5 rounded-xl p-4 hover:border-[#FDFBF8]/10 transition-colors">
              <div className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/25 font-semibold mb-3">Services</div>
              {result.services && result.services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.services.map((srv, idx) => (
                    <div key={idx} className="bg-[#FDFBF8]/4 border border-[#FDFBF8]/8 rounded-lg px-3 py-1.5 text-xs hover:border-[#FDFBF8]/15 transition-colors">
                      <span className="text-[#FDFBF8]/75 font-medium">{srv.name}</span>
                      <span className="text-[#FDFBF8]/30 ml-1.5 font-mono">{srv.files.length}f</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[#FDFBF8]/25 text-xs">No distinct services identified.</span>
              )}
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  )
}
