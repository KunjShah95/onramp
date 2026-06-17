import { useState, useCallback, useEffect } from 'react'
import { indexRepo, askQuestionStream, getAskHistory, clearAskHistory } from '../lib/api'
import type { HistoryTurn } from '../lib/types'
import ChatInterface from '../components/ChatInterface'
import HistorySidebar from '../components/HistorySidebar'
import { cn } from '../lib/utils'
import { ChatAreaSkeleton } from '../components/ui/Skeleton'

export default function AskPage() {
  const [repoPath, setRepoPath] = useState('')
  const [indexId, setIndexId] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState('')

  // History state
  const [history, setHistory] = useState<HistoryTurn[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyVisible, setHistoryVisible] = useState(false)

  // Restore state — changes to this key trigger ChatInterface to reload messages
  const [restoreKey, setRestoreKey] = useState(0)
  const [restoreMessages, setRestoreMessages] = useState<
    { question: string; answer: string }[] | undefined
  >(undefined)

  // Append state — adds history turns to the existing chat
  const [appendKey, setAppendKey] = useState(0)
  const [appendMessages, setAppendMessages] = useState<
    { question: string; answer: string }[] | undefined
  >(undefined)

  // ── Load history when indexId changes ─────────────────────────────────
  useEffect(() => {
    if (!indexId) {
      setHistory([])
      return
    }
    let active = true
    setHistoryLoading(true)
    getAskHistory(indexId, 20)
      .then((res) => {
        if (active) setHistory(res.history)
      })
      .catch(() => {
        if (active) setHistory([])
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [indexId])

  // ── Refresh history list ──────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    if (!indexId) return
    try {
      const res = await getAskHistory(indexId, 20)
      setHistory(res.history)
    } catch {
      // silently fail — user can still use the chat
    }
  }, [indexId])

  // ── Index repo ────────────────────────────────────────────────────────
  async function handleIndex() {
    if (!repoPath.trim()) return
    setIndexing(true)
    setError('')
    try {
      const result = await indexRepo(repoPath.trim())
      setIndexId(result.index_id)
      // Auto-show history sidebar when a repo is indexed
      setHistoryVisible(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Indexing failed')
    }
    setIndexing(false)
  }

  // ── Ask a question ────────────────────────────────────────────────────
  const handleAsk = useCallback(
    async (
      question: string,
      onToken: (token: string) => void,
      signal?: AbortSignal
    ): Promise<void> => {
      if (!indexId) {
        onToken('Please index a repository first.')
        return
      }
      await askQuestionStream(indexId, question, onToken, signal)
      // Refresh history after a successful answer (fire-and-forget)
      refreshHistory()
    },
    [indexId, refreshHistory]
  )

  // ── Shared: build turns up to the selected one ────────────────────────
  const turnsUpTo = useCallback(
    (turn: HistoryTurn): { question: string; answer: string }[] => {
      const idx = history.findIndex((t) => t.id === turn.id)
      return idx >= 0
        ? history.slice(0, idx + 1).map((t) => ({ question: t.question, answer: t.answer }))
        : [{ question: turn.question, answer: turn.answer }]
    },
    [history]
  )

  // ── Restore the full conversation up to the selected turn ─────────────
  const handleHistorySelect = useCallback(
    (turn: HistoryTurn) => {
      setRestoreMessages(turnsUpTo(turn))
      setRestoreKey((prev) => prev + 1)
    },
    [turnsUpTo]
  )

  // ── Append history turns to the current chat ──────────────────────────
  const handleHistoryContinue = useCallback(
    (turn: HistoryTurn) => {
      setAppendMessages(turnsUpTo(turn))
      setAppendKey((prev) => prev + 1)
    },
    [turnsUpTo]
  )

  // ── Clear all history ─────────────────────────────────────────────────
  const handleClearHistory = useCallback(async () => {
    if (!indexId) return
    try {
      await clearAskHistory(indexId)
      setHistory([])
    } catch {
      // silently fail
    }
  }, [indexId])

  return (
    <div className="animate-in w-full pt-8 pb-12 font-body flex flex-col h-[calc(100vh-2rem)]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="max-w-4xl px-6">
        <h1 className="font-display text-3xl font-bold text-[#FDFBF8] mb-2">
          Codebase Context
        </h1>
        <p className="text-[#FDFBF8]/60 text-sm mb-6">
          Query your architecture, locate dependencies, and retrieve code references across the repository.
        </p>

        {/* Indexing bar */}
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
              indexId
                ? 'bg-green-500/10 text-green-400'
                : 'bg-[#FF8C00] text-[#3D1C00] hover:bg-[#FFB347]'
            )}
          >
            {indexing ? 'Indexing...' : indexId ? 'Re-index' : 'Index'}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/20">
            {error}
          </div>
        )}
      </div>

      {/* ── Main content: chat + history sidebar ─────────────────────────── */}
      <div className="flex-1 flex min-h-0 max-w-[calc(100vw-260px)]">
        {/* Chat area */}
        <div className="flex-1 min-w-0 px-6 pb-6 relative">
          {/* History toggle button — always visible on the right edge of the chat area */}
          <button
            onClick={() => setHistoryVisible((v) => !v)}
            className="
              absolute right-0 top-4 z-10 w-7 h-7 flex items-center justify-center
              bg-[#1A1512] border border-[#FDFBF8]/10 rounded-l-md text-[#FDFBF8]/50
              hover:text-[#FDFBF8] hover:bg-[#241912] transition-colors
            "
            title={historyVisible ? 'Hide history' : 'Show history'}
          >
            <span className="material-symbols-outlined text-sm">
              {historyVisible ? 'chevron_right' : 'history'}
            </span>
          </button>
          {indexing ? (
            <ChatAreaSkeleton />
          ) : (
            <div className="h-full min-h-[400px]">
              <ChatInterface
                onSend={handleAsk}
                placeholder="Ask a question..."
                restoreKey={restoreKey}
                restoreMessages={restoreMessages}
                appendKey={appendKey}
                appendMessages={appendMessages}
              />
            </div>
          )}
        </div>

        {/* History sidebar */}
        <HistorySidebar
          history={history}
          loading={historyLoading}
          onSelect={handleHistorySelect}
          onContinue={handleHistoryContinue}
          onClear={handleClearHistory}
          visible={historyVisible}
        />
      </div>
    </div>
  )
}
