import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Robot, GithubLogo, Scroll, Sparkle,
  GitPullRequest, Check, Warning,
  Spinner, LinkSimple, CaretDown,
} from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import { useToast } from '../context/ToastContext'
import { executeAutonomousCoding, type AutonomousCodingResult } from '../lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

export default function AutonomousCodingPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AutonomousCodingResult | null>(null)
  const [error, setError] = useState('')
  const [showOutput, setShowOutput] = useState(true)

  const toast = useToast()

  async function handleExecute() {
    if (!repoUrl.trim() || !issueDescription.trim()) {
      setError('Enter a repo URL and issue description.')
      return
    }
    setRunning(true); setError(''); setResult(null)
    try {
      const res = await executeAutonomousCoding(repoUrl.trim(), issueDescription.trim(), baseBranch)
      setResult(res)
      if (res.success) {
        toast.success('PR created', `PR #${res.pr_number} opened on ${repoUrl.split('/').slice(-2).join('/')}`)
      } else {
        toast.error('Coding failed', res.error || 'Could not generate changes.')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute autonomous coding.')
      toast.error('Execution failed', err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto space-y-6 px-4 sm:px-0"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
            <Robot className="w-5 h-5 text-accent-primary" weight="duotone" />
          </div>
          <div>
            <h1 className="text-xl sm:text-display-sm font-display font-medium text-text-primary">
              Autonomous Coding Agent
            </h1>
            <p className="text-caption text-text-tertiary mt-0.5">
              Describe an issue or feature — the AI will implement it and open a pull request.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Input Column */}
        <motion.div variants={itemVariants} className="lg:col-span-3 space-y-4">
          <CardSpotlight className="p-5 space-y-4">
            <h2 className="text-body-sm font-medium text-text-primary flex items-center gap-2">
              <Scroll className="w-4 h-4 text-accent-primary" />
              Issue Description
            </h2>

            <div className="space-y-1">
              <label className="text-caption text-text-tertiary">Repository URL</label>
              <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-xl px-3.5 py-2.5">
                <GithubLogo size={16} className="text-text-tertiary/40 shrink-0" />
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-tertiary/20 outline-none border-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-caption text-text-tertiary">Base branch</label>
                <input
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-bg-secondary border border-border rounded-xl px-3.5 py-2.5 text-body-sm text-text-primary placeholder:text-text-tertiary/20 outline-none mt-1"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-caption text-text-tertiary">What needs to be implemented?</label>
              <textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                rows={8}
                placeholder="Describe the feature or fix in detail. Include expected behavior, edge cases, and any relevant context..."
                className="w-full bg-bg-secondary border border-border rounded-xl px-3.5 py-2.5 text-body-sm text-text-primary placeholder:text-text-tertiary/20 focus:outline-none focus:border-accent-primary/30 transition-all resize-y"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-caption text-red-400">
                <Warning size={14} weight="fill" className="shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleExecute}
              disabled={running || !repoUrl.trim() || !issueDescription.trim()}
              className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-body-sm font-semibold transition-all"
            >
              {running ? (
                <Spinner size={16} className="animate-spin" />
              ) : (
                <Sparkle size={16} weight="fill" />
              )}
              {running ? 'Implementing...' : 'Implement & Open PR'}
            </button>
          </CardSpotlight>

          {/* Tips */}
          <CardSpotlight className="p-4 text-caption text-text-tertiary space-y-1.5">
            <p className="font-medium text-text-primary mb-1">Tips for best results</p>
            <p>• Be specific about what you want to achieve</p>
            <p>• Include error messages or expected behavior</p>
            <p>• Mention relevant files or functions if known</p>
            <p>• The agent works best with clear, well-scoped issues</p>
          </CardSpotlight>
        </motion.div>

        {/* Output Column */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <CardSpotlight className="p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-medium text-text-primary flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-accent-primary" />
                Result
              </h2>
              {result && (
                <button onClick={() => setShowOutput(!showOutput)} className="text-text-tertiary hover:text-text-primary">
                  <CaretDown size={14} className={`transition-transform ${showOutput ? '' : '-rotate-90'}`} />
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {running ? (
                <motion.div
                  key="running"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <Spinner size={28} className="text-accent-primary animate-spin mb-4" />
                  <p className="text-body-sm text-text-tertiary mb-1">Implementing your feature...</p>
                  <p className="text-caption text-text-tertiary/60">This may take a minute or two</p>
                </motion.div>
              ) : result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`space-y-4 ${showOutput ? '' : 'hidden'}`}
                >
                  {result.success ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <Check size={16} className="text-emerald-400 shrink-0" weight="bold" />
                        <span className="text-caption font-medium text-emerald-300">Pull Request Created</span>
                      </div>

                      {/* PR Link */}
                      <a
                        href={result.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-bg-secondary border border-border hover:border-accent-primary/30 transition-all group"
                      >
                        <div className="min-w-0">
                          <p className="text-body-sm text-text-primary font-medium truncate">
                            PR #{result.pr_number}
                          </p>
                          <p className="text-caption text-text-tertiary truncate">
                            {result.summary}
                          </p>
                        </div>
                        <LinkSimple size={14} className="text-text-tertiary group-hover:text-accent-primary shrink-0" />
                      </a>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
                          <p className="text-display-xs font-bold text-accent-primary">{result.files_changed}</p>
                          <p className="text-caption text-text-tertiary">Files changed</p>
                        </div>
                        <div className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
                          <p className="text-display-xs font-bold text-accent-primary">{result.patches_applied}</p>
                          <p className="text-caption text-text-tertiary">Patches applied</p>
                        </div>
                      </div>

                      {result.patches_failed && result.patches_failed > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-caption text-amber-300">
                          <Warning size={14} weight="fill" className="shrink-0" />
                          {result.patches_failed} patch(es) failed — check the PR for details
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <Warning size={16} className="text-red-400 shrink-0" weight="fill" />
                        <span className="text-caption font-medium text-red-300">Failed</span>
                      </div>
                      <p className="text-body-sm text-text-tertiary">{result.error || 'Could not generate code changes.'}</p>
                    </div>
                  )}

                  <button
                    onClick={() => { setResult(null); setError('') }}
                    className="w-full text-caption text-text-tertiary hover:text-text-primary py-2 transition-colors"
                  >
                    New Issue
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <Robot size={32} className="text-text-tertiary/20 mb-3" />
                  <p className="text-body-sm text-text-tertiary/50 mb-1">Waiting for an issue...</p>
                  <p className="text-caption text-text-tertiary/30">
                    Describe what to implement and the AI will open a PR
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </CardSpotlight>
        </motion.div>
      </div>
    </motion.div>
  )
}
