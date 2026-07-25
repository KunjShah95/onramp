import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitPullRequest, Code, GithubLogo, Warning, Check, Fire,
  Sparkle, ArrowRight, CopySimple,
} from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import { useToast } from '../context/ToastContext'
import { describePR } from '../lib/api'

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

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="relative min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Hero */}
        <motion.div variants={item} className="mb-8">
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-bg-tertiary border border-border flex items-center justify-center">
              <GitPullRequest size={16} className="text-amber-400" weight="duotone" />
            </div>
            <span className="text-overline text-amber-400/80">PR Assistant</span>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div>
              <GradientHeading as="h1" className="text-display-md mb-1">PR Description</GradientHeading>
              <p className="text-body-sm text-text-muted/60">Generate AI-powered pull request descriptions from your changes</p>
            </div>
          </div>
        </motion.div>

        {/* Inputs */}
        <motion.div variants={item} className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/8 to-transparent rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
              <div className="relative flex items-center bg-bg-secondary border border-border group-focus-within:border-amber-400/20 rounded-xl px-3.5 py-2.5 transition-all">
                <GithubLogo size={16} className="text-text-muted/30 shrink-0" />
                <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="github.com/owner/repo"
                  className="flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-muted/20 outline-none border-none ml-2.5" />
              </div>
            </div>
            <input value={prNumber} onChange={(e) => setPrNumber(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="# PR number"
              className="sm:w-36 bg-bg-secondary border border-border text-text-primary text-body-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-400/20 focus:ring-1 focus:ring-amber-400/10 transition-all placeholder:text-text-muted/20" />
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
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                <div className="flex items-center gap-2.5">
                  <Warning size={16} className="text-red-400 shrink-0" weight="fill" />
                  <span className="text-body-xs text-red-300">{error}</span>
                </div>
                <button onClick={handleGenerate} disabled={generating}
                  className="text-caption text-red-400/60 hover:text-red-400 underline">Retry</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <motion.div variants={item} className="flex items-center gap-3 mb-8">
          <button onClick={handleGenerate} disabled={generating || !repoUrl.trim() || !prNumber.trim()}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#09090B] px-5 py-2.5 rounded-xl text-body-sm font-semibold transition-all shadow-glow">
            {generating ? (
              <span className="w-4 h-4 border-2 border-[#09090B]/30 border-t-[#09090B] rounded-full animate-spin" />
            ) : <Sparkle size={14} weight="fill" />}
            {generating ? 'Generating...' : 'Generate'}
          </button>
          {description && (
            <button onClick={handleCopy}
              className="flex items-center gap-2 bg-bg-tertiary hover:bg-bg-elevated border border-border px-4 py-2.5 rounded-xl text-body-xs text-text-primary transition-all">
              {copied ? <Check size={14} className="text-emerald-400" weight="bold" /> : <CopySimple size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </motion.div>

        {/* Hot Take */}
        <AnimatePresence>
          {hotTake && (
            <motion.div variants={item} className="mb-6">
              <div className="relative overflow-hidden rounded-2xl border border-amber-400/15 bg-gradient-to-r from-amber-500/5 via-transparent to-transparent p-5">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-400 to-amber-600/40 rounded-l" />
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-400/10 flex items-center justify-center shrink-0 border border-amber-400/10">
                    <Fire size={16} className="text-amber-400" weight="fill" />
                  </div>
                  <div>
                    <p className="text-caption text-amber-400/70 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-glow" />
                      Hot Take
                    </p>
                    <p className="text-body-sm text-text-primary italic leading-relaxed">
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
                <Code size={14} className="text-emerald-400" />
                <span className="text-body-xs font-semibold text-text-primary">Generated Description</span>
              </div>
              <CardSpotlight className="p-5">
                <pre className="font-code text-body-xs text-text-muted/70 leading-relaxed whitespace-pre-wrap">{description}</pre>
              </CardSpotlight>
            </motion.div>
          ) : !generating && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CardSpotlight className="flex flex-col items-center justify-center py-16 text-center border border-border/30">
                <div className="w-12 h-12 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center mx-auto mb-4">
                  <ArrowRight size={22} className="text-text-muted/20" />
                </div>
                <p className="text-body-sm text-text-muted/40 font-medium mb-1">No description yet</p>
                <p className="text-caption text-text-muted/20 max-w-xs">Enter a repository URL and PR number to generate an AI-written description.</p>
              </CardSpotlight>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tips */}
        <motion.div variants={item} className="mt-8">
          <div className="p-4 rounded-xl bg-bg-tertiary/30 border border-border">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-400/8 border border-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
                <Warning size={14} className="text-amber-400/60" />
              </div>
              <div>
                <h3 className="text-body-xs font-medium text-text-primary mb-1.5">Writing Tips</h3>
                <ul className="text-caption text-text-muted/40 space-y-1">
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400/30" /> Explain the "why" — what problem does this solve?</li>
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400/30" /> Highlight breaking changes and migration steps</li>
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400/30" /> Include performance data, screenshots, or benchmarks</li>
                  <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-400/30" /> Link to related issues, docs, or design documents</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
