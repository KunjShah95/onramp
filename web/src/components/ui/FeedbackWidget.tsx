import { useState } from 'react'
import { submitFeedback, type FeedbackFeature } from '../../lib/api'

interface Props {
  feature: FeedbackFeature
  /** What was rated: index_id, question, answer preview, path id, etc. */
  context?: Record<string, unknown>
  className?: string
}

/**
 * Thumbs up/down on an AI output. Fire-and-forget: failures are swallowed so
 * feedback can never break the surface it's attached to. A thumbs-down offers
 * an optional one-line comment before submitting.
 */
export default function FeedbackWidget({ feature, context, className }: Props) {
  const [state, setState] = useState<'idle' | 'commenting' | 'done'>('idle')
  const [comment, setComment] = useState('')

  async function send(rating: 1 | -1, withComment?: string) {
    setState('done')
    try {
      await submitFeedback(feature, rating, context, withComment || undefined)
    } catch {
      // Never surface feedback errors to the user
    }
  }

  if (state === 'done') {
    return (
      <div className={`text-[11px] text-[#FDFBF8]/30 ${className ?? ''}`}>
        Thanks for the feedback
      </div>
    )
  }

  if (state === 'commenting') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <input
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(-1, comment.trim())
            if (e.key === 'Escape') send(-1)
          }}
          placeholder="What was wrong? (optional)"
          maxLength={2000}
          className="flex-1 max-w-xs bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-3 py-1.5 text-xs text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 outline-none focus:border-[#FF8C00]/50"
        />
        <button
          onClick={() => send(-1, comment.trim())}
          className="text-[11px] text-[#FDFBF8]/50 hover:text-[#FDFBF8] px-2 py-1 rounded transition-colors"
        >
          Send
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <button
        onClick={() => send(1)}
        title="Good answer"
        aria-label="Thumbs up"
        className="p-1 rounded text-[#FDFBF8]/25 hover:text-[#FF8C00] hover:bg-[#FDFBF8]/5 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">thumb_up</span>
      </button>
      <button
        onClick={() => setState('commenting')}
        title="Bad answer"
        aria-label="Thumbs down"
        className="p-1 rounded text-[#FDFBF8]/25 hover:text-[#FF8C00] hover:bg-[#FDFBF8]/5 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">thumb_down</span>
      </button>
    </div>
  )
}
