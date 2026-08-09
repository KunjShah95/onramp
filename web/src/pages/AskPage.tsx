import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PaperPlaneRight,
  Spinner,
  Robot,
  User,
  Copy,
  Check,
  Trash,
  GitBranch,
} from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import { useToast } from '../context/ToastContext'
import { useRoastMode } from '../context/RoastModeContext'
import { indexRepo, askQuestionStream } from '../lib/api'
import RoastModeToggle from '../components/ui/RoastModeToggle'
import ConsolePanel from '../components/ui/console-panel'

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTIONS = [
  'How does the query pipeline work?',
  'Explain the code health scoring algorithm',
  'What modules have the highest tech debt?',
  'Show me recent PRs that need review',
]

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hello! I'm your AI coding assistant. I can help you understand the codebase, answer questions about modules, review PRs, and more. What would you like to know?",
  timestamp: new Date(),
}

export default function AskPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [indexId, setIndexId] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { enabled: roastMode } = useRoastMode()
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const toast = useToast()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    if (!repoUrl.trim()) {
      toast.error('Repository required', 'Enter a GitHub repo URL to index first.')
      return
    }

    const question = input.trim()
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    }
    const assistantId = `ai-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
    ])
    setInput('')
    setLoading(true)

    try {
      let idx = indexId
      if (!idx) {
        setIndexing(true)
        const res = await indexRepo(repoUrl)
        idx = res.index_id
        setIndexId(idx)
        setIndexing(false)
      }
      const controller = new AbortController()
      abortRef.current = controller
      await askQuestionStream(
        idx,
        question,
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )
          )
        },
        controller.signal,
        roastMode ? 'roast' : 'normal'
      )
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `Error: ${err.message || 'Failed to get an answer.'}` }
            : m
        )
      )
      toast.error('Ask failed', err.message)
    } finally {
      setLoading(false)
      setIndexing(false)
      abortRef.current = null
    }
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE])
  }

  return (
    <div className="bg-[hsl(var(--background))]">
      <div className="max-w-4xl mx-auto h-[calc(100vh-4rem)] flex flex-col px-4 sm:px-6 py-6">

        {/* Header */}
        <motion.header initial="hidden" animate="show" variants={fade} className="mb-4 shrink-0 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="designator opacity-50">CODEBASE QUERY</span>
              <span className="w-1 h-1 rounded-full bg-ink-disabled" />
              <span className="designator opacity-50">FLIGHT · DIALOG</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl text-ink font-bold tracking-tight leading-[1.05]">
              One anchor. One stream.
            </h1>
            <p className="font-body text-[13.5px] text-ink-secondary mt-1.5">
              Pin a repo. Ask the code. The repo indexes on first question.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-2">
            <RoastModeToggle />
            {messages.length > 1 && (
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-seam-strong bg-panel-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:border-seam-strong hover:bg-base transition-colors"
              >
                <Trash className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </motion.header>

        {/* Anchor — repo input (status panel, not just a field) */}
        <motion.div initial="hidden" animate="show" variants={fade} className="mb-4 shrink-0">
          <ConsolePanel
            rail={indexId ? 'Indexed' : 'Anchor'}
            designator="REPO"
            status={indexId ? 'go' : 'standby'}
            live={!!indexId}
            pad="dense"
          >
            <div className="relative flex items-center gap-2">
              <GitBranch size={14} className="text-ink-tertiary shrink-0" weight="bold" />
              <input
                value={repoUrl}
                onChange={(e) => { setRepoUrl(e.target.value); setIndexId(null) }}
                placeholder="github.com/owner/repo"
                className="flex-1 bg-transparent text-[13.5px] font-code text-ink placeholder:text-ink-disabled outline-none"
              />
              {indexId && (
                <span className="font-code text-[10px] text-go uppercase tracking-wider shrink-0">
                  Ready
                </span>
              )}
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-[3px] border border-seam bg-panel">
          <div className="p-4 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-start gap-3',
                    msg.role === 'user' ? 'justify-end' : ''
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Robot className="w-3.5 h-3.5 text-go" weight="fill" />
                    </div>
                  )}
                  <div className={cn('max-w-[80%]', msg.role === 'user' ? 'order-1' : '')}>
                    <div className={cn(
                      'rounded-[3px] px-4 py-3 border',
                      msg.role === 'user'
                        ? 'bg-go/10 border-go/20'
                        : 'bg-base border-seam',
                    )}>
                      {msg.role === 'assistant' ? (
                        <div className="font-body text-[13.5px] text-ink-secondary leading-relaxed space-y-1">
                          {msg.content.split('\n').map((line, i) => {
                            if (line.startsWith('|')) return null
                            if (line.startsWith('```') || line.startsWith('``')) return null
                            if (line.startsWith('**')) {
                              return <p key={i} className="text-ink font-semibold mb-1">{line.replace(/\*\*/g, '')}</p>
                            }
                            if (line.startsWith('-') || line.startsWith('•')) {
                              return <p key={i} className="pl-3 text-ink-secondary">{line}</p>
                            }
                            if (line.match(/^\d+\./)) {
                              return <p key={i} className="ml-2 text-ink-secondary">{line}</p>
                            }
                            if (line.trim()) {
                              return <p key={i} className="text-ink-secondary">{line}</p>
                            }
                            return <br key={i} />
                          })}
                          {!msg.content && (
                            <p className="text-ink-tertiary italic">…</p>
                          )}
                        </div>
                      ) : (
                        <p className="font-body text-[13.5px] text-ink">{msg.content}</p>
                      )}
                    </div>
                    <div className={cn('flex items-center gap-2 mt-1', msg.role === 'user' ? 'justify-end' : '')}>
                      <span className="font-code text-[10px] text-ink-tertiary">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.role === 'assistant' && msg.id !== 'welcome' && msg.content && (
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="text-ink-tertiary hover:text-ink transition-colors"
                          aria-label="Copy message"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-go" weight="bold" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-[3px] bg-mission/10 border border-mission/20 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-mission" weight="fill" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <div className="w-7 h-7 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center shrink-0">
                  <Robot className="w-3.5 h-3.5 text-go" weight="fill" />
                </div>
                <div className="rounded-[3px] bg-base border border-seam px-4 py-3 flex items-center gap-2">
                  <Spinner className="w-3.5 h-3.5 text-go animate-spin" />
                  <span className="font-code text-[12px] text-ink-tertiary">
                    {indexing ? 'Indexing repository…' : 'Thinking…'}
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Suggestions — appear only when there's nothing asked yet */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3 shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); handleSend() }}
                className="px-3 py-1.5 rounded-[3px] bg-base border border-seam text-[12px] font-body text-ink-secondary hover:text-ink hover:border-seam-strong transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="mt-3 shrink-0">
          <div className="flex items-center gap-2 bg-panel border border-seam rounded-[3px] px-3 py-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question about the codebase…"
              className="flex-1 bg-transparent font-body text-[13.5px] text-ink placeholder:text-ink-disabled outline-none px-1"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-[3px] bg-go text-white flex items-center justify-center transition-colors hover:bg-go-lit disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              {loading ? (
                <Spinner className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PaperPlaneRight className="w-3.5 h-3.5" weight="fill" />
              )}
            </button>
          </div>
          <p className="font-code text-[10px] text-ink-tertiary mt-1.5 text-center">
            AI responses are generated based on codebase analysis
          </p>
        </div>
      </div>
    </div>
  )
}
