import { useState } from 'react'
import { generateLearningPath } from '../lib/api'
import type { LearningPathResult } from '../lib/types'
import LearningPathTimeline from '../components/LearningPathTimeline'
import { cn } from '../lib/utils'
import { LearningPathSkeleton } from '../components/ui/Skeleton'

const LEVELS = [
  { value: 'junior', label: 'Junior', years: '0-2 years' },
  { value: 'mid', label: 'Mid-Level', years: '2-5 years' },
  { value: 'senior', label: 'Senior', years: '5+ years' },
]

export default function LearnPage() {
  const [repoStructure, setRepoStructure] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LearningPathResult | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate() {
    let structure: Record<string, unknown>
    try {
      structure = JSON.parse(repoStructure)
    } catch {
      setError('Invalid JSON. Paste a valid repo structure JSON.')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await generateLearningPath(structure, userLevel)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    }
    setLoading(false)
  }

  return (
    <div className="animate-in max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Learning Path Generator</h1>
      <p className="text-text-secondary text-sm mb-6">Personalized learning path for your codebase</p>

      <div className="space-y-4 mb-8">
        <div>
          <label className="text-sm text-text-muted mb-1 block">Experience Level</label>
          <div className="flex gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => setUserLevel(l.value)}
                className={cn(
                  'px-4 py-2 rounded-btn text-sm font-medium transition-all duration-200',
                  userLevel === l.value
                    ? 'bg-accent-from text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                )}
              >
                {l.label}
                <span className={cn(
                  'block text-xs',
                  userLevel === l.value ? 'text-white/60' : 'text-text-muted'
                )}>{l.years}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-text-muted mb-1 block">
            Repo Structure JSON (paste from explore analysis)
          </label>
          <textarea
            value={repoStructure}
            onChange={(e) => setRepoStructure(e.target.value)}
            placeholder='{"files": [{"path": "auth.py", "language": "python"}], "classes": [...], "functions": [...]}'
            rows={6}
            className="input font-code"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !repoStructure.trim()}
          className="btn disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating...' : 'Generate Learning Path'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {loading && <LearningPathSkeleton />}

      {result && (
        <LearningPathTimeline modules={result.path} totalHours={result.total_estimated_hours} />
      )}
    </div>
  )
}
