import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bug,
  GitPullRequest,
  Clock,
  Tag,
  Warning,
  BookOpen,
  ChatCircleText,
  Link as LinkIcon,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { Modal } from '../components/ui/modal'
import { FirstIssueSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { findIssues, generateGuide, fetchPairWalkthrough } from '../lib/api'
import type { PairWalkthroughResult } from '../lib/api'
import type { ScoredIssue, IssueGuide } from '../lib/types'

type Level = 'junior' | 'mid' | 'senior'

const TABS: { key: 'all' | Level; label: string; level: Level }[] = [
  { key: 'all', label: 'All', level: 'junior' },
  { key: 'junior', label: 'Easy', level: 'junior' },
  { key: 'mid', label: 'Medium', level: 'mid' },
  { key: 'senior', label: 'Hard', level: 'senior' },
]

function difficultyFromScore(score: number): { text: string; bg: string; label: string } {
  if (score <= 4) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Easy' }
  if (score <= 7) return { text: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Medium' }
  return { text: 'text-red-400', bg: 'bg-red-500/10', label: 'Hard' }
}

export default function FirstIssuePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [tab, setTab] = useState<'all' | Level>('all')
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<ScoredIssue[]>([])
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const [guideIssue, setGuideIssue] = useState<ScoredIssue | null>(null)
  const [guide, setGuide] = useState<IssueGuide | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [guideError, setGuideError] = useState('')

  const [walkIssue, setWalkIssue] = useState<ScoredIssue | null>(null)
  const [walk, setWalk] = useState<PairWalkthroughResult | null>(null)
  const [walkLoading, setWalkLoading] = useState(false)
  const [walkError, setWalkError] = useState('')

  const toast = useToast()

  const activeLevel = TABS.find((t) => t.key === tab)!.level

  async function handleSearch() {
    if (!repoUrl.trim()) return
    setLoading(true); setError(''); setHasSearched(true)
    try {
      const data = await findIssues(repoUrl, activeLevel)
      setIssues(data.issues ?? [])
      toast.success('Issues found', `${data.issues?.length ?? 0} beginner-friendly issues for ${repoUrl.split('/').pop()}`)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch issues.')
      toast.error('Search failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleTabChange(next: 'all' | Level) {
    setTab(next)
    if (hasSearched && repoUrl.trim()) {
      setLoading(true); setError('')
      try {
        const data = await findIssues(repoUrl, TABS.find((t) => t.key === next)!.level)
        setIssues(data.issues ?? [])
      } catch (err: any) {
        setError(err.message || 'Failed to fetch issues.')
      } finally {
        setLoading(false)
      }
    }
  }

  async function openGuide(issue: ScoredIssue) {
    setGuideIssue(issue); setGuide(null); setGuideError(''); setGuideLoading(true)
    try {
      const data = await generateGuide(issue.id, {})
      setGuide(data)
    } catch (err: any) {
      setGuideError(err.message || 'Failed to generate guide.')
    } finally {
      setGuideLoading(false)
    }
  }

  async function openWalkthrough(issue: ScoredIssue) {
    setWalkIssue(issue); setWalk(null); setWalkError(''); setWalkLoading(true)
    try {
      const data = await fetchPairWalkthrough(issue.title, issue.body, {})
      setWalk(data)
    } catch (err: any) {
      setWalkError(err.message || 'Failed to generate walkthrough.')
    } finally {
      setWalkLoading(false)
    }
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <Bug className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                First Issues
              </h1>
            </div>
            <p className="text-body-sm text-text-tertiary max-w-xl">
              Curated issues perfect for getting started. Pick one and make your first contribution.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-caption text-text-tertiary">
            <Warning className="w-3.5 h-3.5" />
            {hasSearched ? `${issues.length} available` : 'Enter a repo'}
          </div>
        </div>

        {/* Repo input */}
        <div className="relative flex items-center w-full md:w-[520px]">
          <Bug size={16} className="absolute left-3.5 text-text-tertiary/40 pointer-events-none" />
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="github.com/owner/repo"
            className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-28 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !repoUrl.trim()}
            className="absolute right-1.5 bg-accent-primary hover:brightness-110 disabled:opacity-40 text-[#09090B] px-3 py-1.5 rounded-md text-caption font-semibold transition-all"
          >
            {loading ? 'Searching…' : 'Find Issues'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleSearch} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {/* Filter Tabs */}
        {hasSearched && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary/30 w-fit">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-all disabled:opacity-50 ${
                  tab === t.key
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* States */}
        {loading && <FirstIssueSkeleton />}

        {!loading && hasSearched && issues.length === 0 && (
          <CardSpotlight className="border border-accent-primary/10">
            <EmptyState
              icon={<Bug size={40} />}
              title="No matching issues found"
              description="Try a different repository or difficulty level. Issues are scored by complexity via LLM."
            />
          </CardSpotlight>
        )}

        {!loading && !hasSearched && (
          <CardSpotlight className="border border-accent-primary/10">
            <EmptyState
              icon={<Bug size={40} />}
              title="Enter a GitHub repository above"
              description="We'll scan open issues, score them by complexity, and surface the best first contributions."
              action={
                <button onClick={handleSearch} disabled={!repoUrl.trim()} className="mt-2 px-5 py-2 rounded-btn text-caption border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors font-code disabled:opacity-40">
                  Find Issues
                </button>
              }
            />
          </CardSpotlight>
        )}

        {/* Issue List */}
        {!loading && issues.length > 0 && (
          <div className="space-y-3">
            {issues.map((issue, i) => {
              const diff = difficultyFromScore(issue.complexity_score)
              return (
                <motion.div
                  key={`${issue.id}-${issue.number}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="card p-5 hover:border-accent-primary/30 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-body font-medium text-text-primary group-hover:text-accent-primary transition-colors"
                        >
                          {issue.title}
                        </a>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${diff.bg} ${diff.text}`}>
                          {diff.label}
                        </span>
                      </div>
                      <p className="text-caption text-text-tertiary mb-3 leading-relaxed line-clamp-2">
                        {issue.body || 'No description provided.'}
                      </p>
                      <div className="flex items-center gap-3 text-caption text-text-tertiary flex-wrap">
                        <span className="flex items-center gap-1.5">
                          <Tag className="w-3 h-3" />#{issue.number}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Warning className="w-3 h-3" />Score {issue.complexity_score}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />~{issue.estimated_hours}h
                        </span>
                        {issue.labels.slice(0, 3).map((label) => (
                          <span
                            key={label}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary/30 text-text-tertiary"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="shrink-0 flex flex-col gap-2">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-xl text-caption font-medium flex items-center gap-2 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-all"
                      >
                        <GitPullRequest className="w-3.5 h-3.5" weight="bold" />
                        Open
                      </a>
                      <button
                        onClick={() => openGuide(issue)}
                        className="px-4 py-2 rounded-xl text-caption font-medium flex items-center gap-2 bg-bg-tertiary/40 text-text-secondary hover:bg-bg-tertiary transition-all"
                      >
                        <BookOpen className="w-3.5 h-3.5" weight="bold" />
                        View Guide
                      </button>
                      <button
                        onClick={() => openWalkthrough(issue)}
                        className="px-4 py-2 rounded-xl text-caption font-medium flex items-center gap-2 bg-bg-tertiary/40 text-text-secondary hover:bg-bg-tertiary transition-all"
                      >
                        <ChatCircleText className="w-3.5 h-3.5" weight="bold" />
                        Walkthrough
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Tips */}
        <CardSpotlight className="p-5 border border-accent-primary/10">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Warning className="w-4 h-4 text-accent-primary" weight="duotone" />
            </div>
            <div>
              <h3 className="text-body-sm font-medium text-text-primary mb-1">Tips for Your First Issue</h3>
              <ul className="text-caption text-text-tertiary space-y-1">
                <li>• Start with "Easy" issues tagged <span className="text-accent-primary">good-first-issue</span> to build confidence</li>
                <li>• Read the contributing guidelines before starting</li>
                <li>• Ask questions in the issue comments — the community is here to help</li>
                <li>• Don't worry about perfect code — focus on learning and iterating</li>
              </ul>
            </div>
          </div>
        </CardSpotlight>
      </div>

      {/* Guide Modal */}
      <Modal
        open={guideIssue !== null}
        onClose={() => setGuideIssue(null)}
        title={guideIssue ? `Guide · ${guideIssue.title}` : 'Guide'}
      >
        {guideLoading && <p className="text-caption text-text-tertiary animate-pulse">Generating step-by-step guide…</p>}
        {guideError && <p className="text-caption text-error">{guideError}</p>}
        {guide && (
          <div className="space-y-5">
            {guide.files_to_touch.length > 0 && (
              <div>
                <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Files to Touch</div>
                <div className="flex flex-wrap gap-2">
                  {guide.files_to_touch.map((f) => (
                    <span key={f} className="px-2 py-1 rounded-md text-caption bg-bg-tertiary/40 text-text-secondary font-mono">{f}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Steps</div>
              <ol className="space-y-2 list-decimal list-inside text-body-sm text-text-secondary">
                {guide.steps.map((s, idx) => (
                  <li key={idx} className="leading-relaxed">{s}</li>
                ))}
              </ol>
            </div>
            {guide.similar_prs.length > 0 && (
              <div>
                <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Similar PRs</div>
                <div className="space-y-2">
                  {guide.similar_prs.map((pr) => (
                    <a
                      key={pr.url}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-caption text-accent-primary hover:underline"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      {pr.title} {pr.merged ? '· merged' : ''}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Walkthrough Modal */}
      <Modal
        open={walkIssue !== null}
        onClose={() => setWalkIssue(null)}
        title={walkIssue ? `Walkthrough · ${walkIssue.title}` : 'Walkthrough'}
        maxWidth="max-w-3xl"
      >
        {walkLoading && <p className="text-caption text-text-tertiary animate-pulse">Narrating senior-dev walkthrough…</p>}
        {walkError && <p className="text-caption text-error">{walkError}</p>}
        {walk && (
          <div className="space-y-5">
            <div>
              <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Thought Process</div>
              <p className="text-body-sm text-text-secondary leading-relaxed whitespace-pre-line">{walk.thought_process}</p>
            </div>
            {walk.key_insights.length > 0 && (
              <div>
                <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Key Insights</div>
                <ul className="space-y-1 list-disc list-inside text-body-sm text-text-secondary">
                  {walk.key_insights.map((k, idx) => (
                    <li key={idx}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Solution Steps</div>
              <ol className="space-y-2 list-decimal list-inside text-body-sm text-text-secondary">
                {walk.solution_steps.map((s, idx) => (
                  <li key={idx} className="leading-relaxed">{s}</li>
                ))}
              </ol>
            </div>
            {walk.testing_approach && (
              <div>
                <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Testing Approach</div>
                <p className="text-body-sm text-text-secondary leading-relaxed whitespace-pre-line">{walk.testing_approach}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageTransition>
  )
}
