import { useMemo } from 'react'
import { type HistoryTurn } from '../lib/types'

interface Props {
  history: HistoryTurn[]
  loading: boolean
  onSelect: (turn: HistoryTurn) => void
  onContinue: (turn: HistoryTurn) => void
  onClear: () => void
  visible: boolean
}

const SESSION_GAP_MINUTES = 30

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60_000)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`

    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    if (isToday) {
      return `Today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    }

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()

    if (isYesterday) {
      return `Yesterday at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    }

    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function truncate(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/**
 * Partition turns into session groups based on time gaps.
 * Turns within SESSION_GAP_MINUTES of each other belong to the same session.
 */
function buildSessions(turns: HistoryTurn[]): HistoryTurn[][] {
  if (turns.length === 0) return []

  const sessions: HistoryTurn[][] = [[turns[0]]]

  for (let i = 1; i < turns.length; i++) {
    const prev = new Date(turns[i - 1].created_at).getTime()
    const curr = new Date(turns[i].created_at).getTime()
    const gapMin = (curr - prev) / 60_000

    if (gapMin > SESSION_GAP_MINUTES) {
      sessions.push([turns[i]])
    } else {
      sessions[sessions.length - 1].push(turns[i])
    }
  }

  return sessions
}

export default function HistorySidebar({
  history,
  loading,
  onSelect,
  onContinue,
  onClear,
  visible,
}: Props) {
  const sessions = useMemo(() => buildSessions(history), [history])

  return (
    <div
      className={`
        flex flex-col border-l border-[#FDFBF8]/5 bg-[#1A1512] transition-all duration-300 ease-in-out shrink-0 overflow-hidden
        ${visible ? 'w-[320px] min-w-[320px]' : 'w-0 min-w-0 border-l-0'}
      `}
    >
      {/* Content */}
      <div className="flex flex-col h-full min-w-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#FDFBF8]/5 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#FDFBF8] tracking-tight">
              Conversation History
            </h3>
            {history.length > 0 && (
              <button
                onClick={onClear}
                className="text-[10px] text-[#FDFBF8]/40 hover:text-red-400 transition-colors uppercase tracking-wider"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-[10px] text-[#FDFBF8]/30 mt-1">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} · {history.length} {history.length === 1 ? 'turn' : 'turns'}
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {loading && history.length === 0 && (
            <div className="space-y-2 px-3 pt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-1.5">
                  <div className="h-3 bg-[#FDFBF8]/5 rounded w-3/4" />
                  <div className="h-2 bg-[#FDFBF8]/5 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!loading && history.length === 0 && (
            <div className="text-center py-12 px-4">
              <span className="material-symbols-outlined text-2xl text-[#FDFBF8]/15 block mb-2">chat</span>
              <p className="text-xs text-[#FDFBF8]/35">No conversations yet.</p>
              <p className="text-[10px] text-[#FDFBF8]/20 mt-1">Ask a question to get started.</p>
            </div>
          )}

          {sessions.map((session, sIdx) => (
            <div key={sIdx}>
              {/* Session divider — except for the first session */}
              {sIdx > 0 && (
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="flex-1 h-px bg-[#FDFBF8]/8" />
                  <span className="text-[10px] text-[#FDFBF8]/25 whitespace-nowrap uppercase tracking-wider">
                    {formatSessionDate(session[0].created_at)}
                  </span>
                  <div className="flex-1 h-px bg-[#FDFBF8]/8" />
                </div>
              )}

              {/* Turns within this session */}
              <div className="space-y-0.5">
                {session.map((turn, tIdx) => (
                  <div
                    key={turn.id}
                    className={`group relative ${tIdx === 0 ? 'mt-1' : ''}`}
                  >
                    <button
                      onClick={() => onSelect(turn)}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#FDFBF8]/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-[#FF8C00]/60 text-base mt-0.5 shrink-0">
                          {tIdx === 0 ? 'forum' : 'question_answer'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#FDFBF8]/80 font-medium leading-snug line-clamp-2">
                            {truncate(turn.question, 80)}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-[#FDFBF8]/30">
                              {formatTime(turn.created_at)}
                            </span>
                            <span className="text-[10px] text-[#FDFBF8]/15">·</span>
                            <span className="text-[10px] text-[#FDFBF8]/30 truncate">
                              {truncate(turn.answer.replace(/```.*?```/gs, '').trim(), 40) || 'No answer'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                    {/* Continue button — appears on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onContinue(turn)
                      }}
                      className="
                        absolute right-2 top-1/2 -translate-y-1/2
                        opacity-0 group-hover:opacity-100 transition-opacity
                        text-[10px] text-[#FF8C00]/70 hover:text-[#FF8C00]
                        bg-[#1A1512] hover:bg-[#241912]
                        px-2 py-1 rounded-md border border-[#FDFBF8]/10
                        flex items-center gap-1
                      "
                      title="Append to current chat and continue"
                    >
                      <span className="material-symbols-outlined text-[10px]">add</span>
                      <span>Continue</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
