import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChatCircleDots,
  PaperPlaneRight,
  Spinner,
  Robot,
  User,
  Copy,
  Check,
  Trash,
  GitBranch,
  Fire,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'
import { indexRepo, askQuestionStream } from '../lib/api'

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
  const [roastMode, setRoastMode] = useState(false)
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
    <PageTransition>
      <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
              <ChatCircleDots className="w-5 h-5 text-accent-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Ask the Codebase
              </h1>
              <p className="text-body-xs text-text-tertiary">
                Ask questions about your codebase, PRs, and modules.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Roast Mode Toggle */}
            <button
              onClick={() => setRoastMode(!roastMode)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-medium transition-all duration-200',
                roastMode
                  ? 'bg-red-500/15 text-red-400 border border-red-500/25 shadow-sm'
                  : 'bg-bg-tertiary/30 text-text-tertiary border border-border hover:text-text-secondary'
              )}
            >
              <Fire className={cn('w-3.5 h-3.5', roastMode && 'animate-pulse')} weight={roastMode ? 'fill' : 'regular'} />
              {roastMode ? 'Roast Mode ON' : 'Roast Mode'}
            </button>
            {messages.length > 1 && (
              <button
                onClick={handleClear}
                className="btn btn-secondary text-caption px-3 py-1.5 flex items-center gap-1.5"
              >
                <Trash className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Repo input */}
        <div className="relative flex items-center w-full md:w-[440px] mb-4 shrink-0">
          <GitBranch size={16} className="absolute left-3.5 text-text-tertiary/40 pointer-events-none" />
          <input
            value={repoUrl}
            onChange={(e) => { setRepoUrl(e.target.value); setIndexId(null) }}
            placeholder="github.com/owner/repo (indexed on first question)"
            className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-4 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
          />
          {indexId && (
            <span className="absolute right-3 flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />indexed
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-accent-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Robot className="w-4 h-4 text-accent-primary" weight="fill" />
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  <div className={`rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-accent-primary/10 text-text-primary'
                      : 'card'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        {msg.content.split('\n').map((line, i) => {
                          if (line.startsWith('|')) return null // skip table rendering
                          if (line.startsWith('**')) {
                            return <p key={i} className="text-body-sm font-medium text-text-primary mb-1">{line.replace(/\*\*/g, '')}</p>
                          }
                          if (line.startsWith('-') || line.startsWith('•')) {
                            return <p key={i} className="text-caption text-text-secondary pl-3 mb-0.5">{line}</p>
                          }
                          if (line.match(/^\d+\./)) {
                            return <p key={i} className="text-caption text-text-secondary ml-2 mb-1">{line}</p>
                          }
                          if (line.startsWith('```') || line.startsWith('``')) {
                            return null
                          }
                          if (line.trim()) {
                            return <p key={i} className="text-caption text-text-secondary mb-1">{line}</p>
                          }
                          return <br key={i} />
                        })}
                      </div>
                    ) : (
                      <p className="text-body-sm text-text-primary">{msg.content}</p>
                    )}
                  </div>
                  <div className={`flex items-center gap-2 mt-1 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    <span className="text-[11px] text-text-tertiary/40">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'assistant' && msg.id !== 'welcome' && (
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="text-text-tertiary/40 hover:text-text-tertiary transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" weight="bold" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-blue-400" weight="fill" />
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
              <div className="w-8 h-8 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <Robot className="w-4 h-4 text-accent-primary" weight="fill" />
              </div>
              <div className="card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Spinner className="w-4 h-4 text-accent-primary animate-spin" />
                  <span className="text-caption text-text-tertiary">{indexing ? 'Indexing repository…' : 'Thinking…'}</span>
                </div>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mt-4 shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); handleSend() }}
                className="px-3 py-1.5 rounded-xl bg-bg-tertiary/30 text-caption text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 border border-border transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="mt-4 shrink-0">
          <div className="flex items-center gap-2 card p-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question about the codebase..."
              className="flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-tertiary/40 outline-none px-2"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary hover:bg-accent-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <Spinner className="w-4 h-4 animate-spin" />
              ) : (
                <PaperPlaneRight className="w-4 h-4" weight="fill" />
              )}
            </button>
          </div>
          <p className="text-caption text-text-tertiary/40 mt-1.5 text-center">
            AI responses are generated based on codebase analysis
          </p>
        </div>
      </div>
    </PageTransition>
  )
}
