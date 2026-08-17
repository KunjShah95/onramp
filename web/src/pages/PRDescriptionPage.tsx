import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Code, GithubLogo, Warning, Check, Fire,
  Sparkle, ArrowRight, CopySimple, GitBranch, CaretDown,
  SealCheck, LinkSimple,
} from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import { PageHeader } from '../components/ui/page-header'
import { useToast } from '../context/ToastContext'
import { describePR, autoApplySuggestions, type AutoApplySuggestion, type AutoApplyResult } from '../lib/api'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

export default function PRDescriptionPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [prNumber, setPrNumber] = useState('')
  const [generating, setGenerating] = useState(false)
  const [description, setDescription] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [hotTake, setHotTake] = useState<string | null>(null)

  // Auto-apply state
  const [showAutoApply, setShowAutoApply] = useState(false)
  const [fixes, setFixes] = useState<AutoApplySuggestion[]>([{ file_path: '', old_string: '', new_string: '' }])
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<AutoApplyResult | null>(null)

  const toast = useToast()

  const handleGenerate = async () => {
    if (!repoUrl.trim() || !prNumber.trim()) { setError('Enter a repo URL and PR number.'); return }
    const num = parseInt(prNumber, 10)
    if (isNaN(num)) { setError('PR number must be numeric.'); return }
    setGenerating(true); setError(''); setDescription('')
    try {
      const res = await describePR(repoUrl.trim(), num)
      setDescription(res.description || '')
      if ((res as any).hot_take) setHotTake((res as any).hot_take)
      toast.success('Description generated')
    } catch (err: any) {
      setError(err.message || 'Failed to generate description.')
      toast.error('Generation failed', err.message)
    } finally { setGenerating(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(description)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ── Auto-Apply Handlers ─────────────────────────────────────────────────

  const addFixRow = () => {
    setFixes([...fixes, { file_path: '', old_string: '', new_string: '' }])
  }

  const updateFix = (idx: number, field: keyof AutoApplySuggestion, value: string) => {
    const updated = fixes.map((f, i) => (i === idx ? { ...f, [field]: value } : f))
    setFixes(updated)
  }

  const removeFix = (idx: number) => {
    if (fixes.length === 1) return
    setFixes(fixes.filter((_, i) => i !== idx))
  }

  const handleApplyAll = async () => {
    const num = parseInt(prNumber, 10)
    if (!repoUrl.trim() || isNaN(num)) return
    const valid = fixes.filter((f) => f.file_path.trim() && f.old_string.trim() && f.new_string.trim())
    if (valid.length === 0) {
      toast.error('No valid fixes', 'Fill in file path, old code, and new code for at least one fix.')
      return
    }
    setApplying(true); setApplyResult(null)
    try {
      const result = await autoApplySuggestions(repoUrl.trim(), num, valid)
      setApplyResult(result)
      if (result.succeeded > 0) toast.success(`Applied ${result.succeeded} fix${result.succeeded > 1 ? 'es' : ''}`)
      if (result.failed > 0) toast.error(`${result.failed} fix${result.failed > 1 ? 'es' : ''} failed`)
    } catch (err: any) {
      toast.error('Auto-apply failed', err.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="w-full min-h-[calc(100vh-4rem)] relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <PageHeader
          eyebrow="PR ASSISTANT · PULL REQUEST"
          title="PR Description"
          subtitle="Generate AI-powered pull request descriptions from your changes"
        />

        {/* Inputs */}
        <motion.div variants={item} className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative group">
              <div className="relative flex items-center bg-base border border-seam group-focus-within:border-go/50 rounded-[3px] px-3.5 py-2.5 transition-colors">
                <GithubLogo size={16} className="text-ink-muted/30 shrink-0" />
                <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="github.com/owner/repo"
                  className="flex-1 bg-transparent text-body-sm text-ink placeholder:text-ink-muted/20 outline-none border-none ml-2.5" />
              </div>
            </div>
            <input value={prNumber} onChange={(e) => setPrNumber(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="# PR number"
              className="sm:w-36 bg-base border border-seam text-ink text-body-sm rounded-[3px] px-3.5 py-2.5 focus:outline-none focus:border-go/60 focus:ring-1 focus:ring-go/30 transition-colors placeholder:text-ink-muted/20" />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="flex items-center justify-between p-3 rounded-[3px] bg-abort/5 border border-abort/20">
                <div className="flex items-center gap-2.5">
                  <Warning size={16} className="text-abort shrink-0" weight="fill" />
                  <span className="text-body-xs text-abort">{error}</span>
                </div>
                <button onClick={handleGenerate} disabled={generating}
                  className="text-caption text-abort/60 hover:text-abort underline">Retry</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <motion.div variants={item} className="flex items-center gap-3 mb-8">
          <button onClick={handleGenerate} disabled={generating || !repoUrl.trim() || !prNumber.trim()}
            className="flex items-center gap-2 bg-go hover:bg-go-lit disabled:opacity-40 text-[hsl(var(--primary-foreground))] px-5 py-2.5 rounded-[3px] text-body-sm font-semibold transition-all shadow-seam">
            {generating ? (
              <span className="w-4 h-4 border-2 border-[hsl(var(--primary-foreground))]/30 border-t-[hsl(var(--primary-foreground))] rounded-full animate-spin" />
            ) : <Sparkle size={14} weight="fill" />}
            {generating ? 'Generating...' : 'Generate'}
          </button>
          {description && (
            <button onClick={handleCopy}
              className="flex items-center gap-2 bg-well hover:bg-panel-raised border border-seam px-4 py-2.5 rounded-[3px] text-body-xs text-ink transition-all">
              {copied ? <Check size={14} className="text-go" weight="bold" /> : <CopySimple size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </motion.div>

        {/* Hot Take */}
        <AnimatePresence>
          {hotTake && (
            <motion.div variants={item} className="mb-6">
              <div className="rounded-card border border-caution/20 bg-caution/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-card bg-caution/10 flex items-center justify-center shrink-0 border border-caution/10">
                    <Fire size={16} className="text-caution" weight="regular" />
                  </div>
                  <div>
                    <p className="text-caption text-caution/80 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-caution" />
                      Hot Take
                    </p>
                    <p className="text-body-sm text-ink italic leading-relaxed">
                      &ldquo;{hotTake}&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Output */}
        <AnimatePresence mode="wait">
          {description ? (
            <motion.div
              key="output"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Code size={14} className="text-go" />
                <span className="text-body-xs font-semibold text-ink">Generated Description</span>
              </div>
              <CardSpotlight className="p-5">
                <pre className="font-code text-body-xs text-ink-muted/70 leading-relaxed whitespace-pre-wrap">{description}</pre>
              </CardSpotlight>
            </motion.div>
          ) : !generating && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CardSpotlight className="flex flex-col items-center justify-center py-16 text-center border border-seam/30">
                <div className="w-12 h-12 rounded-card bg-well border border-seam flex items-center justify-center mx-auto mb-4">
                  <ArrowRight size={22} className="text-ink-muted/20" />
                </div>
                <p className="text-body-sm text-ink-muted/40 font-medium mb-1">No description yet</p>
                <p className="text-caption text-ink-muted/20 max-w-xs">Enter a repository URL and PR number to generate an AI-written description.</p>
              </CardSpotlight>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tips */}
        <motion.div variants={item} className="mt-8">
          <div className="p-4 rounded-[3px] bg-well/30 border border-seam">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-[3px] bg-caution/5 border border-caution/10 flex items-center justify-center shrink-0 mt-0.5">
                <Warning size={14} className="text-caution/60" />
              </div>
              <div>
                <h3 className="text-body-xs font-medium text-ink mb-1.5">Writing Tips</h3>
                <ul className="text-caption text-ink-muted/40 space-y-1">
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-caution/30" /> Explain the "why" — what problem does this solve?</li>
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-caution/30" /> Highlight breaking changes and migration steps</li>
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-caution/30" /> Include performance data, screenshots, or benchmarks</li>
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-caution/30" /> Link to related issues, docs, or design documents</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Auto-Apply Fixes ───────────────────────────────────────── */}
        <motion.div variants={item} className="mt-10">
          <button
            onClick={() => setShowAutoApply(!showAutoApply)}
            className="w-full flex items-center justify-between p-4 rounded-[3px] bg-well/30 border border-seam hover:bg-well/50 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-[3px] bg-go/10 flex items-center justify-center">
                <GitBranch size={16} className="text-go" weight="duotone" />
              </div>
              <div className="text-left">
                <h3 className="text-body-sm font-medium text-ink">Auto-Apply Fixes</h3>
                <p className="text-caption text-ink-tertiary">Create inline fix commits on the PR branch via GitHub's API</p>
              </div>
            </div>
            <CaretDown
              size={16}
              className={`text-ink-tertiary transition-transform ${showAutoApply ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence>
            {showAutoApply && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-4">
                  {fixes.map((fix, idx) => (
                    <div key={idx} className="p-3 rounded-[3px] border border-seam/60 bg-base/30 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-caption font-medium text-ink-tertiary">Fix #{idx + 1}</span>
                        {fixes.length > 1 && (
                          <button onClick={() => removeFix(idx)}
                            className="text-caption text-abort/50 hover:text-abort transition-colors">
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        value={fix.file_path}
                        onChange={(e) => updateFix(idx, 'file_path', e.target.value)}
                        placeholder="src/file.py"
                        className="w-full bg-base border border-seam rounded-[3px] px-3 py-1.5 text-body-xs text-ink placeholder:text-ink-tertiary/30 focus:outline-none focus:border-go/30"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-ink-tertiary/40 uppercase tracking-wide">Old Code</label>
                          <textarea
                            value={fix.old_string}
                            onChange={(e) => updateFix(idx, 'old_string', e.target.value)}
                            rows={3}
                            placeholder="Exact code to replace..."
                            className="w-full bg-base border border-seam rounded-[3px] px-3 py-1.5 font-code text-[12px] text-ink placeholder:text-ink-tertiary/20 focus:outline-none focus:border-go/30 resize-y"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-ink-tertiary/40 uppercase tracking-wide">New Code</label>
                          <textarea
                            value={fix.new_string}
                            onChange={(e) => updateFix(idx, 'new_string', e.target.value)}
                            rows={3}
                            placeholder="Replacement code..."
                            className="w-full bg-base border border-seam rounded-[3px] px-3 py-1.5 font-code text-[12px] text-ink placeholder:text-ink-tertiary/20 focus:outline-none focus:border-go/30 resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center gap-3">
                    <button onClick={addFixRow}
                      className="text-caption text-go/60 hover:text-go transition-colors">
                      + Add another fix
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={handleApplyAll}
                      disabled={applying}
                      className="flex items-center gap-2 bg-go hover:bg-go-lit disabled:opacity-40 text-[hsl(var(--primary-foreground))] px-4 py-2 rounded-[3px] text-caption font-semibold transition-all"
                    >
                      {applying ? (
                        <span className="w-3.5 h-3.5 border-2 border-[hsl(var(--primary-foreground))]/30 border-t-[hsl(var(--primary-foreground))] rounded-full animate-spin" />
                      ) : (
                        <SealCheck size={14} weight="bold" />
                      )}
                      {applying ? 'Applying...' : 'Apply All Fixes'}
                    </button>
                  </div>

                  {/* Results */}
                  {applyResult && (
                    <div className="p-3 rounded-[3px] bg-well/30 border border-seam/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-body-xs font-medium text-ink">Results</span>
                        <span className="font-code text-[12px] tabular-nums text-ink-tertiary">
                          {applyResult.succeeded} succeeded, {applyResult.failed} failed
                        </span>
                      </div>
                      {applyResult.results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-caption">
                          <div className="flex items-center gap-2 min-w-0">
                            {r.success ? (
                              <Check size={12} className="text-go shrink-0" weight="bold" />
                            ) : (
                              <Warning size={12} className="text-abort shrink-0" weight="fill" />
                            )}
                            <span className="truncate text-ink-tertiary">{r.file_path || `Fix #${i + 1}`}</span>
                          </div>
                          {r.success && r.commit_url ? (
                            <a
                              href={r.commit_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-go/60 hover:text-go shrink-0"
                            >
                              <LinkSimple size={11} /> View commit
                            </a>
                          ) : r.error ? (
                            <span className="text-abort/60 truncate shrink-0 max-w-[160px]" title={r.error}>
                              {r.error}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  )
}
