import { useState } from 'react'
import { indexRepo, askQuestion } from '../lib/api'
import ChatInterface from '../components/ChatInterface'
import { cn } from '../lib/utils'
import { ChatAreaSkeleton } from '../components/ui/Skeleton'

export default function AskPage() {
  const [repoPath, setRepoPath] = useState('')
  const [indexId, setIndexId] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState('')

  async function handleIndex() {
    if (!repoPath.trim()) return
    setIndexing(true)
    setError('')
    try {
      const result = await indexRepo(repoPath.trim())
      setIndexId(result.index_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Indexing failed')
    }
    setIndexing(false)
  }

  async function handleAsk(question: string): Promise<string> {
    if (!indexId) return 'Please index a repository first.'
    const result = await askQuestion(indexId, question)
    return result.answer
  }

  return (
    <div className="animate-in max-w-4xl flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Ask Your Codebase</h1>
      <p className="text-text-secondary text-sm mb-6">Index a repository and ask questions about it</p>

      <div className="flex gap-3 mb-6">
        <input
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="Local path to repository (e.g., C:\\projects\\my-app)"
          className="input flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleIndex()}
        />
        <button
          onClick={handleIndex}
          disabled={indexing || !repoPath.trim()}
          className={cn(
            'btn whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
            indexId && '!bg-gradient-to-r !from-green-500 !to-emerald-500'
          )}
        >
          {indexing ? 'Indexing...' : indexId ? 'Re-index' : 'Index'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {indexId && (
        <div className="text-xs text-green-400 mb-4">
          Indexed: {indexId}
        </div>
      )}

      {indexing ? (
        <ChatAreaSkeleton />
      ) : (
        <div className="flex-1 bg-bg-tertiary rounded-card border border-border overflow-hidden">
          <ChatInterface onSend={handleAsk} placeholder="e.g., How does authentication work?" />
        </div>
      )}
    </div>
  )
}
