import { useState } from 'react'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import CardSpotlight from '../components/ui/card-spotlight'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { detectArchitectureDrift, type DriftResult } from '../lib/api'
import {
  GitBranch,
  FileCode,
  Warning,
  CheckCircle,
  WarningCircle,
  Info,
  MagnifyingGlass,
  Spinner,
  CaretRight,
  ArrowsClockwise,
  Copy,
  Check,
  Files,
} from '@phosphor-icons/react'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  aligned: { label: 'Aligned', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', icon: CheckCircle },
  minor_drift: { label: 'Minor Drift', color: 'text-amber-400 bg-amber-500/10 border-amber-500/25', icon: WarningCircle },
  major_drift: { label: 'Major Drift', color: 'text-red-400 bg-red-500/10 border-red-500/25', icon: Warning },
  undocumented: { label: 'Undocumented', color: 'text-blue-400 bg-blue-500/10 border-blue-500/25', icon: Info },
  no_code: { label: 'No Code', color: 'text-text-muted bg-bg-tertiary/20 border-border', icon: Info },
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
}

export default function DriftDetectionPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [docs, setDocs] = useState('')
  const [filePaths, setFilePaths] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DriftResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  async function handleDetect() {
    if (!docs.trim()) {
      toast.error('Docs required', 'Paste architecture documentation to compare against.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      // Build repo structure from file paths if provided
      const files = filePaths
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((path) => ({ path }))

      // If repo URL provided, add it as a basic file entry
      if (repoUrl.trim() && files.length === 0) {
        const repoName = repoUrl.split('/').pop() || 'repo'
        files.push({ path: `${repoName}/` })
      }

      const repoStructure = { files }
      const data = await detectArchitectureDrift(repoStructure, docs)
      setResult(data)
      toast.success('Analysis complete', `Drift score: ${data.drift_score}`)
    } catch (err: any) {
      setError(err.message || 'Failed to detect architecture drift.')
      toast.error('Detection failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  function copyResult() {
    if (!result) return
    const text = [
      `Architecture Drift Report`,
      `=======================`,
      `Status: ${result.status} (Score: ${result.drift_score}/100)`,
      `Summary: ${result.summary}`,
      ``,
      `Documented But Missing: ${result.documented_but_missing.length}`,
      ...result.documented_but_missing.map((n) => `  - ${n}`),
      ``,
      `Undocumented Components: ${result.undocumented_components.length}`,
      ...result.undocumented_components.map((n) => `  - ${n}`),
      ``,
      `Code Components: ${result.code_component_count}`,
      `Documented Components: ${result.documented_component_count}`,
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusCfg = STATUS_CONFIG[result?.status || 'undocumented']
  const StatusIcon = statusCfg?.icon || Info

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto"
    >
      <PageHeader
        title="Architecture Drift Detection"
        subtitle="Compare your documented architecture against actual code structure to find divergence"
      />

      {/* Input Section */}
      <motion.div variants={itemVariants} className="space-y-4 mb-8">
        <CardSpotlight className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Warning className="w-5 h-5 text-amber-400" weight="fill" />
            <h3 className="font-display font-bold">Detection Input</h3>
          </div>

          {/* Repo URL */}
          <div className="mb-4">
            <label className="block text-caption text-text-tertiary mb-1.5 font-medium">
              Repository URL <span className="text-text-muted/50">(optional)</span>
            </label>
            <div className="relative flex items-center">
              <GitBranch size={16} className="absolute left-3.5 text-text-muted/40 pointer-events-none" />
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
                placeholder="github.com/owner/repo"
                className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-4 py-2.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/40 transition-colors placeholder:text-text-muted/40"
              />
            </div>
          </div>

          {/* File Paths */}
          <div className="mb-4">
            <label className="block text-caption text-text-tertiary mb-1.5 font-medium">
              Code Structure — File Paths <span className="text-text-muted/50">(optional — one per line)</span>
            </label>
            <div className="relative">
              <Files size={16} className="absolute left-3.5 top-3 text-text-muted/40 pointer-events-none" />
              <textarea
                value={filePaths}
                onChange={(e) => setFilePaths(e.target.value)}
                placeholder="src/auth_service/login.py&#10;src/billing/payments/invoice.py&#10;src/api/v1/users.py&#10;tests/test_auth.py"
                rows={4}
                className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-3 py-2.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/40 transition-colors placeholder:text-text-muted/40 resize-y font-mono text-[13px]"
              />
            </div>
            <p className="text-[11px] text-text-tertiary/50 mt-1.5">
              For best results, paste your repo's file tree or run Architecture Explorer first to get real file paths.
            </p>
          </div>

          {/* Docs Input */}
          <div className="mb-4">
            <label className="block text-caption text-text-tertiary mb-1.5 font-medium">
              Architecture Documentation
            </label>
            <textarea
              value={docs}
              onChange={(e) => setDocs(e.target.value)}
              placeholder="Paste your README, architecture docs, or wiki content here...&#10;&#10;The agent will extract component names, module references,&#10;and service boundaries from this text to compare against the code."
              rows={7}
              className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input px-3.5 py-2.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/40 transition-colors placeholder:text-text-muted/40 resize-y"
            />
            <p className="text-[11px] text-text-tertiary/50 mt-1.5">
              Include mentions of modules, services, components, file names, and architecture patterns.
            </p>
          </div>

          {/* Detect Button */}
          <button
            onClick={handleDetect}
            disabled={loading || !docs.trim()}
            className="btn btn-primary text-caption px-5 py-2.5 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Spinner className="w-4 h-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <MagnifyingGlass size={16} weight="bold" />
                Detect Drift
              </>
            )}
          </button>
        </CardSpotlight>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div variants={itemVariants} className="mb-6 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={handleDetect} className="text-caption underline ml-4 text-red-400/70 hover:text-red-400">
            Retry
          </button>
        </motion.div>
      )}

      {/* Loading */}
      {loading && !result && (
        <motion.div variants={itemVariants} className="text-center py-12">
          <Spinner className="w-8 h-8 text-go animate-spin mx-auto mb-3" />
          <p className="text-text-tertiary text-body-sm">Analyzing architecture documentation against code structure…</p>
        </motion.div>
      )}

      {/* Results */}
      {result && (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
          {/* Score + Status */}
          <motion.div variants={itemVariants}>
            <CardSpotlight className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-bold">Drift Assessment</h3>
                <button
                  onClick={copyResult}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/30 transition-all"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy Report'}
                </button>
              </div>

              {/* Score gauge */}
              <div className="flex items-center gap-6 mb-4">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-bg-tertiary/30" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="currentColor"
                      className={
                        result.drift_score < 15 ? 'text-emerald-400' :
                        result.drift_score < 40 ? 'text-amber-400' :
                        'text-red-400'
                      }
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(100 - result.drift_score) * 2.64} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-display-sm font-bold">{result.drift_score}</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusCfg?.color || ''}`}>
                      <StatusIcon size={12} weight="fill" />
                      {statusCfg?.label || result.status}
                    </span>
                  </div>
                  <p className="text-body-sm text-text-secondary leading-relaxed">{result.summary}</p>
                </div>
              </div>

              {/* Metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
                  <div className="text-display-sm font-bold text-text-primary">{result.code_component_count}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">Code Components</div>
                </div>
                <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
                  <div className="text-display-sm font-bold text-text-primary">{result.documented_component_count}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">Doc References</div>
                </div>
                <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
                  <div className="text-display-sm font-bold text-red-400">{result.documented_but_missing.length}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">Missing From Code</div>
                </div>
                <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
                  <div className="text-display-sm font-bold text-amber-400">{result.undocumented_components.length}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">Undocumented</div>
                </div>
              </div>
            </CardSpotlight>
          </motion.div>

          {/* Alerts */}
          {result.alerts.length > 0 && (
            <motion.div variants={itemVariants}>
              <CardSpotlight className="p-5">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                  <Warning size={16} className="text-amber-400" weight="fill" />
                  Alerts ({result.alerts.length})
                </h3>
                <div className="space-y-3">
                  {result.alerts.map((alert, i) => (
                    <div key={i} className={`rounded-xl border p-4 ${SEVERITY_COLORS[alert.severity] || 'bg-bg-secondary border-border'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          alert.severity === 'high' ? 'text-red-400 bg-red-500/10' :
                          alert.severity === 'medium' ? 'text-amber-400 bg-amber-500/10' :
                          'text-blue-400 bg-blue-500/10'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-[10px] font-mono text-text-tertiary uppercase">{alert.type.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-body-sm text-text-primary mb-1">{alert.detail}</p>
                      <p className="text-caption text-text-tertiary flex items-start gap-1.5">
                        <CaretRight size={12} className="mt-0.5 shrink-0 text-go" />
                        {alert.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </CardSpotlight>
            </motion.div>
          )}

          {/* Documented but Missing */}
          {result.documented_but_missing.length > 0 && (
            <motion.div variants={itemVariants}>
              <CardSpotlight className="p-5">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                  <WarningCircle size={16} className="text-red-400" weight="fill" />
                  Documented But Missing ({result.documented_but_missing.length})
                </h3>
                <p className="text-caption text-text-tertiary mb-3">Components described in docs but absent from the codebase.</p>
                <div className="flex flex-wrap gap-2">
                  {result.documented_but_missing.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-[11px] font-mono">
                      <Warning size={10} weight="fill" />
                      {name}
                    </span>
                  ))}
                </div>
              </CardSpotlight>
            </motion.div>
          )}

          {/* Undocumented Components */}
          {result.undocumented_components.length > 0 && (
            <motion.div variants={itemVariants}>
              <CardSpotlight className="p-5">
                <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                  <FileCode size={16} className="text-amber-400" weight="fill" />
                  Undocumented Components ({result.undocumented_components.length})
                </h3>
                <p className="text-caption text-text-tertiary mb-3">Code components not mentioned in the architecture docs.</p>
                <div className="flex flex-wrap gap-2">
                  {result.undocumented_components.map((name, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-400 text-[11px] font-mono">
                      <FileCode size={10} />
                      {name}
                    </span>
                  ))}
                </div>
              </CardSpotlight>
            </motion.div>
          )}

          {/* Re-run */}
          <motion.div variants={itemVariants} className="text-center pb-8">
            <button
              onClick={handleDetect}
              disabled={loading}
              className="btn btn-secondary text-caption px-5 py-2.5 flex items-center gap-2 mx-auto"
            >
              <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
              Re-run Detection
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Empty State */}
      {!result && !loading && !error && (
        <motion.div variants={itemVariants}>
          <CardSpotlight className="p-10">
            <EmptyState
              title="No drift analysis yet"
              description="Paste your architecture docs above, optionally add file paths from your codebase, then click 'Detect Drift' to compare them."
              icon={<Warning size={40} />}
            />
          </CardSpotlight>
        </motion.div>
      )}
    </motion.div>
  )
}
