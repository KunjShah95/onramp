import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import { detectArchitectureDrift, type DriftResult } from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import {
  GitBranch,
  Warning,
  MagnifyingGlass,
  Spinner,
  CaretRight,
  ArrowsClockwise,
  Copy,
  Check,
  Files,
  TextT,
  FileCode,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'
import InputField from '../components/ui/first-principles/InputField'

const STATUS_CONFIG: Record<string, { label: string; tone: 'go' | 'caution' | 'abort' | 'mission' | 'idle' }> = {
  aligned: { label: 'Aligned', tone: 'go' },
  minor_drift: { label: 'Minor Drift', tone: 'caution' },
  major_drift: { label: 'Major Drift', tone: 'abort' },
  undocumented: { label: 'Undocumented', tone: 'mission' },
  no_code: { label: 'No Code', tone: 'idle' },
}

const SEVERITY_TONE: Record<string, 'abort' | 'caution' | 'mission'> = {
  high: 'abort',
  medium: 'caution',
  low: 'mission',
}

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
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
    setLoading(true); setError(''); setResult(null)
    try {
      const files = filePaths
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((path) => ({ path }))
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

  const statusCfg = STATUS_CONFIG[result?.status ?? ''] ?? { label: result?.status ?? 'Unknown', tone: 'idle' as const }
  const verdict = (result?.drift_score ?? 0) < 15 ? 'go' : (result?.drift_score ?? 0) < 40 ? 'standby' : 'hold'

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[hsl(var(--background))]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">

        {/* Header */}
        <motion.header initial="hidden" animate="show" variants={fade}>
          <PageHeader
            eyebrow="Folio · Drift detection"
            title="Drift Detection"
            subtitle="Paste your architecture docs, optionally list code paths · find what's missing, what's undocumented, and how far the codebase has drifted."
          />
        </motion.header>

        {/* Input panel */}
        <motion.div initial="hidden" animate="show" variants={fade}>
          <ConsolePanel rail="Inputs" designator="DOCS + CODE" status="standby">
            <div className="space-y-4">
              <InputField
                label="Repository URL (optional)"
                icon={<GitBranch size={14} weight="bold" />}
                placeholder="github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary mb-1.5">
                  Code Structure · File Paths <span className="text-ink-disabled normal-case font-normal tracking-normal">(optional, one per line)</span>
                </label>
                <div className="relative">
                  <Files size={14} className="absolute left-3 top-3 text-ink-tertiary pointer-events-none" weight="bold" />
                  <textarea
                    value={filePaths}
                    onChange={(e) => setFilePaths(e.target.value)}
                    placeholder={'src/auth_service/login.py\nsrc/billing/payments/invoice.py\nsrc/api/v1/users.py'}
                    rows={4}
                    className={cn(
                      'w-full bg-base border border-seam-strong text-ink placeholder:text-ink-disabled',
                      'pl-10 pr-3.5 py-2.5 text-[13px] font-code rounded-[3px] resize-y',
                      'transition-[border-color,box-shadow] duration-150',
                      'focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(14_122_60_/_0.12)]'
                    )}
                  />
                </div>
                <p className="font-code text-[10px] text-ink-tertiary mt-1.5">
                  For best results, paste your repo's file tree or run Architecture Explorer first.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary mb-1.5">
                  Architecture Documentation
                </label>
                <div className="relative">
                  <TextT size={14} className="absolute left-3 top-3 text-ink-tertiary pointer-events-none" weight="bold" />
                  <textarea
                    value={docs}
                    onChange={(e) => setDocs(e.target.value)}
                    placeholder={'Paste your README, architecture docs, or wiki content here.\n\nThe agent will extract component names, module references,\nand service boundaries from this text.'}
                    rows={7}
                    className={cn(
                      'w-full bg-base border border-seam-strong text-ink placeholder:text-ink-disabled',
                      'pl-10 pr-3.5 py-2.5 text-[13px] font-body rounded-[3px] resize-y',
                      'transition-[border-color,box-shadow] duration-150',
                      'focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(14_122_60_/_0.12)]'
                    )}
                  />
                </div>
                <p className="font-code text-[10px] text-ink-tertiary mt-1.5">
                  Include mentions of modules, services, components, file names, and architecture patterns.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleDetect}
                  disabled={loading || !docs.trim()}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-[3px] bg-go px-5 py-2.5',
                    'text-[13px] font-semibold text-white shadow-seam transition-all',
                    'hover:bg-go-lit active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {loading ? (
                    <>
                      <Spinner size={14} className="animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <MagnifyingGlass size={14} weight="bold" />
                      Detect Drift
                    </>
                  )}
                </button>
                {result && (
                  <button
                    onClick={copyResult}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-seam-strong bg-panel-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-base transition-colors"
                  >
                    {copied ? <Check size={12} weight="bold" className="text-go" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy Report'}
                  </button>
                )}
              </div>
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ConsolePanel pad="dense" status="abort" className="flex items-center justify-between">
                <span className="text-[13px] text-abort">{error}</span>
                <button onClick={handleDetect} disabled={loading} className="text-[12px] text-abort/70 hover:text-abort underline">
                  Retry
                </button>
              </ConsolePanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        <AnimatePresence>
          {loading && !result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <Spinner size={28} className="text-go animate-spin mb-3" />
              <p className="font-body text-[13px] text-ink-secondary">Analyzing documentation against code structure…</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.06 } } }}
              className="space-y-6"
            >
              {/* Verdict */}
              <motion.div variants={fade}>
                <ConsolePanel
                  rail={statusCfg.label}
                  designator={`DRIFT ${result.drift_score}/100`}
                  status={verdict === 'hold' ? 'caution' : verdict === 'standby' ? 'standby' : 'go'}
                  live={verdict === 'go'}
                >
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="font-display text-5xl font-bold tabular-nums text-ink leading-none">
                      {result.drift_score}
                    </div>
                    <div className="flex-1">
                      <p className="font-body text-[14px] text-ink-secondary leading-relaxed">
                        {result.summary}
                      </p>
                      <div className="flex items-center gap-4 mt-3 font-code text-[12px] text-ink-tertiary">
                        <span><span className="text-ink">{result.code_component_count}</span> in code</span>
                        <span className="w-1 h-1 rounded-full bg-ink-disabled" />
                        <span><span className="text-ink">{result.documented_component_count}</span> in docs</span>
                        {result.documented_but_missing.length > 0 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-ink-disabled" />
                            <span className="text-abort">{result.documented_but_missing.length} missing</span>
                          </>
                        )}
                        {result.undocumented_components.length > 0 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-ink-disabled" />
                            <span className="text-caution">{result.undocumented_components.length} undocumented</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </ConsolePanel>
              </motion.div>

              {/* Alerts */}
              {result.alerts.length > 0 && (
                <motion.div variants={fade}>
                  <ConsolePanel rail="Alerts" designator={`${result.alerts.length} SIGNALS`} status="caution">
                    <div className="space-y-2">
                      {result.alerts.map((alert, i) => {
                        const tone = SEVERITY_TONE[alert.severity] ?? 'mission'
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={cn(
                              'rounded-[3px] border px-3.5 py-3',
                              tone === 'abort' && 'bg-abort/5 border-abort/20',
                              tone === 'caution' && 'bg-caution/5 border-caution/20',
                              tone === 'mission' && 'bg-mission/5 border-mission/20',
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={cn(
                                'px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase tracking-wider',
                                tone === 'abort' && 'bg-abort/10 text-abort',
                                tone === 'caution' && 'bg-caution/10 text-caution',
                                tone === 'mission' && 'bg-mission/10 text-mission',
                              )}>
                                {alert.severity}
                              </span>
                              <span className="font-code text-[10px] text-ink-tertiary uppercase tracking-wider">
                                {alert.type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="font-body text-[13px] text-ink leading-relaxed mb-1">{alert.detail}</p>
                            <p className="font-body text-[12px] text-ink-secondary flex items-start gap-1.5">
                              <CaretRight size={11} className="mt-0.5 shrink-0 text-go" weight="bold" />
                              {alert.recommendation}
                            </p>
                          </motion.div>
                        )
                      })}
                    </div>
                  </ConsolePanel>
                </motion.div>
              )}

              {/* Documented but missing */}
              {result.documented_but_missing.length > 0 && (
                <motion.div variants={fade}>
                  <ConsolePanel rail="Documented but missing" designator={`${result.documented_but_missing.length} COMPONENTS`} status="abort">
                    <p className="font-body text-[13px] text-ink-secondary mb-3">
                      Components described in docs but absent from the codebase.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.documented_but_missing.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[3px] bg-abort/10 border border-abort/20 text-abort text-[11px] font-code"
                        >
                          <Warning size={10} weight="fill" />
                          {name}
                        </span>
                      ))}
                    </div>
                  </ConsolePanel>
                </motion.div>
              )}

              {/* Undocumented */}
              {result.undocumented_components.length > 0 && (
                <motion.div variants={fade}>
                  <ConsolePanel rail="Undocumented" designator={`${result.undocumented_components.length} COMPONENTS`} status="caution">
                    <p className="font-body text-[13px] text-ink-secondary mb-3">
                      Code components not mentioned in the architecture docs.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.undocumented_components.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[3px] bg-caution/10 border border-caution/20 text-caution text-[11px] font-code"
                        >
                          <FileCode size={10} weight="bold" />
                          {name}
                        </span>
                      ))}
                    </div>
                  </ConsolePanel>
                </motion.div>
              )}

              {/* Re-run */}
              <motion.div variants={fade} className="text-center pb-2">
                <button
                  onClick={handleDetect}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-[3px] border border-seam-strong bg-panel-raised px-4 py-2 text-[12px] font-medium text-ink hover:bg-base transition-colors disabled:opacity-40"
                >
                  <ArrowsClockwise size={12} className={cn(loading && 'animate-spin')} />
                  Re-run Detection
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty */}
        {!result && !loading && !error && (
          <motion.div initial="hidden" animate="show" variants={fade}>
            <ConsolePanel rail="Awaiting" designator="NO ANALYSIS" status="idle" className="py-16 text-center">
              <div className="w-14 h-14 rounded-[3px] bg-base border border-seam flex items-center justify-center mx-auto mb-4">
                <Warning size={26} className="text-ink-disabled" weight="duotone" />
              </div>
              <p className="font-display text-lg text-ink font-semibold mb-1">No drift analysis yet</p>
              <p className="text-[13px] text-ink-tertiary max-w-md mx-auto">
                Paste your architecture docs above, optionally add file paths from your codebase,
                then click <span className="font-code text-ink">Detect Drift</span> to compare them.
              </p>
            </ConsolePanel>
          </motion.div>
        )}
      </div>
    </div>
  )
}
