import { useState } from 'react'
import {
  GitPullRequest,
  Code,
  GithubLogo,
  Spinner,
  Warning,
  Check,
  Fire,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { useToast } from '../context/ToastContext'
import { describePR } from '../lib/api'

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
    if (!repoUrl.trim() || !prNumber.trim()) {
      setError('Enter a repository URL and PR number.')
      return
    }
    const num = parseInt(prNumber, 10)
    if (isNaN(num)) {
      setError('PR number must be numeric.')
      return
    }
    setGenerating(true); setError(''); setDescription('')
    try {
      const res = await describePR(repoUrl.trim(), num)
      setDescription(res.description || '')
      if ((res as any).hot_take) setHotTake((res as any).hot_take)
      toast.success('Description generated')
    } catch (err: any) {
      setError(err.message || 'Failed to generate description.')
      toast.error('Generation failed', err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(description)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <GitPullRequest className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                PR Description
              </h1>
            </div>
            <p className="text-body-sm text-text-tertiary max-w-xl">
              Generate AI-powered pull request descriptions based on your code changes.
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <div className="relative flex items-center">
            <GithubLogo size={16} className="absolute left-3.5 text-text-tertiary/40 pointer-events-none" />
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="github.com/owner/repo"
              className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-4 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
            />
          </div>
          <input
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="# PR number"
            className="w-full sm:w-40 bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input px-4 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
          />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleGenerate} disabled={generating} className="text-caption underline ml-4 text-error/70 hover:text-error">Retry</button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating || !repoUrl.trim() || !prNumber.trim()}
            className="btn btn-primary flex items-center gap-2"
          >
            {generating ? (
              <Spinner className="w-4 h-4 animate-spin" />
            ) : (
              <GitPullRequest className="w-4 h-4" weight="bold" />
            )}
            {generating ? 'Generating...' : 'Generate Description'}
          </button>
          {description && (
            <button onClick={handleCopy} className="btn btn-secondary flex items-center gap-2">
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" weight="bold" />
              ) : (
                <Code className="w-4 h-4" />
              )}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          )}
        </div>

        {/* Hot Take */}
        {hotTake && (
          <div className="relative overflow-hidden rounded-2xl border border-accent-primary/20 bg-gradient-to-r from-accent-primary/5 to-transparent p-5">
            <div className="absolute top-0 left-0 w-1 h-full bg-accent-primary/40 rounded-l" />
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent-primary/15 flex items-center justify-center shrink-0">
                <Fire className="w-4 h-4 text-accent-primary" weight="fill" />
              </div>
              <div>
                <p className="text-caption text-accent-primary/60 uppercase tracking-wider font-semibold mb-1">
                  🔥 Hot Take
                </p>
                <p className="text-body-sm text-text-primary italic leading-relaxed">
                  &ldquo;{hotTake}&rdquo;
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Description Output */}
        {description ? (
          <div>
            <h3 className="text-body-sm font-medium text-text-primary mb-3">Generated Description</h3>
            <CardSpotlight className="p-5">
              <pre className="font-code text-body-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                {description}
              </pre>
            </CardSpotlight>
          </div>
        ) : (
          !generating && (
            <CardSpotlight className="border border-accent-primary/10">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <GitPullRequest className="w-10 h-10 text-text-tertiary/30 mb-3" weight="duotone" />
                <p className="text-body-sm text-text-tertiary/70 mb-1">No description yet</p>
                <p className="text-caption text-text-tertiary/40 max-w-sm">
                  Enter a repository and PR number, then generate an AI-written description.
                </p>
              </div>
            </CardSpotlight>
          )
        )}

        {/* Tips */}
        <div className="card p-5 border border-accent-primary/10">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Warning className="w-4 h-4 text-accent-primary" weight="duotone" />
            </div>
            <div>
              <h3 className="text-body-sm font-medium text-text-primary mb-1">
                Tips for Great PR Descriptions
              </h3>
              <ul className="text-caption text-text-tertiary space-y-1">
                <li>• Explain the "why" — what problem does this solve?</li>
                <li>• Highlight breaking changes and migration steps</li>
                <li>• Include performance data, screenshots, or benchmarks</li>
                <li>• Link to related issues, docs, or design documents</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
