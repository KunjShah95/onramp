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
    <div className="animate-in w-full max-w-4xl pt-8 pb-12 font-body flex flex-col h-[calc(100vh-2rem)]">
      <h1 className="font-display text-3xl font-bold text-[#FDFBF8] mb-2">Codebase Context</h1>
      <p className="text-[#FDFBF8]/60 text-sm mb-8">Query your architecture, locate dependencies, and retrieve code references across the repository.</p>

      {/* Hidden/Subtle Indexing bar for functionality without breaking the mockup design */}
      <div className="flex gap-3 mb-6 bg-[#1A1512] p-2 rounded-xl border border-[#FDFBF8]/5">
        <input
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="Local path to repository (e.g., C:\projects\my-app)"
          className="flex-1 bg-transparent border-none outline-none px-3 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/30"
          onKeyDown={(e) => e.key === 'Enter' && handleIndex()}
        />
        <button
          onClick={handleIndex}
          disabled={indexing || !repoPath.trim()}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            indexId ? 'bg-green-500/10 text-green-400' : 'bg-[#FF8C00] text-[#3D1C00] hover:bg-[#FFB347]'
          )}
        >
          {indexing ? 'Indexing...' : indexId ? 'Re-index' : 'Index'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {indexing ? (
        <ChatAreaSkeleton />
      ) : (
        <div className="flex-1 overflow-hidden min-h-[400px]">
          <ChatInterface onSend={handleAsk} placeholder="Ask a question..." />
        </div>
      )}
    </div>
  )
}
