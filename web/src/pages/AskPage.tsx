import { useState, useCallback, useEffect } from 'react'
import { indexRepo, askQuestionStream, getAskHistory, clearAskHistory } from '../lib/api'
import type { HistoryTurn } from '../lib/types'
import ChatInterface from '../components/ChatInterface'
import HistorySidebar from '../components/HistorySidebar'
import { cn } from '../lib/utils'
import { ChatAreaSkeleton } from '../components/ui/Skeleton'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

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

  // Roast mode toggle
  const [roastMode, setRoastMode] = useState(false)

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
      signal?: AbortSignal,
      mode?: string
    ): Promise<void> => {
      if (!indexId) {
        onToken('Please index a repository first.')
        return
      }
      await askQuestionStream(indexId, question, onToken, signal, mode ?? 'normal')
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
    <PageTransition>
      <div className="w-full pt-4 sm:pt-8 pb-12 font-body flex flex-col h-[calc(100vh-2rem)] max-w-full overflow-x-hidden">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="max-w-4xl px-6">
          <GradientHeading as="h1" className="mb-2">Codebase Context</GradientHeading>
          <p className="text-[#FDFBF8]/60 text-sm mb-6">
            Query your architecture, locate dependencies, and retrieve code references across the repository.
          </p>

          {/* Indexing bar */}
          <CardSpotlight>
            <div className="flex gap-3 p-2">
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
          </CardSpotlight>

          {error && (
            <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/20">
              {error}
            </div>
          )}
        </div>

        {/* ── Main content: chat + history sidebar ─────────────────────────── */}
        <div className="flex-1 flex min-h-0 max-w-full lg:max-w-[calc(100vw-260px)]">
          {/* Chat area */}
          <div className="flex-1 min-w-0 px-4 sm:px-6 pb-6 relative">
            {/* History toggle button — always visible on the right edge of the chat area */}
            <div className="absolute right-0 top-4 z-10">
              <CardSpotlight className="rounded-l-md border-r-0">
                <button
                  onClick={() => setHistoryVisible((v) => !v)}
                  className="w-7 h-7 flex items-center justify-center text-[#FDFBF8]/50 hover:text-[#FDFBF8] transition-colors"
                  title={historyVisible ? 'Hide history' : 'Show history'}
                >
                  <span className="material-symbols-outlined text-sm">
                    {historyVisible ? 'chevron_right' : 'history'}
                  </span>
                </button>
              </CardSpotlight>
            </div>

            {/* Roast mode toggle */}
            <div className="absolute right-8 top-4 z-10 flex items-center gap-2">
              <button
                onClick={() => setRoastMode((v) => !v)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wider
                  transition-all duration-200
                  ${roastMode
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-[0_0_12px_rgba(255,140,0,0.15)]'
                    : 'bg-[#1A1512] text-[#FDFBF8]/40 border border-[#FDFBF8]/10 hover:bg-[#241912] hover:text-[#FDFBF8]/70'
                  }
                `}
                title={roastMode ? 'Disable Roast Mode' : 'Enable Roast Mode'}
              >
                <span className="material-symbols-outlined text-[13px]">
                  {roastMode ? 'local_fire_department' : 'sentiment_satisfied'}
                </span>
                {roastMode ? 'ROAST ACTIVE' : 'ROAST'}
              </button>
            </div>

            {indexing ? (
              <ChatAreaSkeleton />
            ) : (
              <CardSpotlight className="h-full min-h-[400px]">
                <div className="h-full">
                  <ChatInterface
                    onSend={handleAsk}
                    mode={roastMode ? 'roast' : 'normal'}
                    placeholder="Ask a question..."
                    restoreKey={restoreKey}
                    restoreMessages={restoreMessages}
                    appendKey={appendKey}
                    appendMessages={appendMessages}
                    feedbackFeature="ask"
                    feedbackContext={indexId ? { index_id: indexId, mode: roastMode ? 'roast' : 'normal' } : undefined}
                  />
                </div>
              </CardSpotlight>
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
    </PageTransition>
  )
}
