import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { generateWiki } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import {
  FileCode, GitFork, Star, Bug, BookOpen, Copy, Check,
  Sparkle, CaretRight, ArrowLineRight,
  Book,
} from '@phosphor-icons/react'

function MarkdownContent({ content }: { content: string }) {
  const sections = content.split(/(?=^## )/m)
  return (
    <div className="space-y-8">
      {sections.map((section, i) => {
        if (section.startsWith('# ')) {
          const title = section.match(/^# (.+)$/m)?.[1] || 'Wiki'
          const body = section.replace(/^# .+\n*/, '').trim()
          return (
            <div key={i} className="mb-6">
              <h1 className="font-display text-display-sm font-bold text-text-primary mb-3 leading-tight">{title}</h1>
              {body && (
                <div className="text-body-sm text-text-muted/60 leading-[1.8] space-y-3 max-w-none">
                  {body.split('\n\n').map((p, j) => <p key={j}>{p}</p>)}
                </div>
              )}
            </div>
          )
        }
        const title = section.match(/^## (.+)$/m)?.[1]
        const body = section.replace(/^## .+\n*/, '').trim()
        return (
          <div key={i} className="scroll-mt-24" id={`section-${i}`}>
            {title && (
              <div className="flex items-center gap-2.5 mb-3 group">
                <span className="w-1 h-5 rounded-full bg-amber-500/50 group-hover:bg-amber-400 transition-colors" />
                <h2 className="font-display text-body font-bold text-text-primary m-0 tracking-tight">{title}</h2>
              </div>
            )}
            {body && (
              <div className="pl-3.5 border-l border-border/30 text-body-sm text-text-muted/50 leading-[1.8] space-y-3 max-w-none">
                {body.split('\n\n').map((p, j) => {
                  const isCode = p.startsWith('```')
                  if (isCode) {
                    const code = p.replace(/```\w*\n?/, '').replace(/```$/, '').trim()
                    return (
                      <pre key={j} className="bg-bg-tertiary/60 border border-border rounded-xl p-4 overflow-x-auto text-code-sm text-text-muted/80 font-code leading-relaxed">
                        <code>{code}</code>
                      </pre>
                    )
                  }
                  if (p.startsWith('- ')) {
                    const items = p.split('\n').filter(l => l.startsWith('- '))
                    return (
                      <ul key={j} className="space-y-1.5">
                        {items.map((item, k) => (
                          <li key={k} className="flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/30 mt-2 shrink-0" />
                            <span>{item.replace(/^- /, '')}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  }
                  if (p.match(/^\d+\.\s/)) {
                    const items = p.split('\n').filter(l => l.match(/^\d+\.\s/))
                    return (
                      <ol key={j} className="space-y-1.5 list-decimal list-inside marker:text-text-muted/30">
                        {items.map((item, k) => (
                          <li key={k}>{item.replace(/^\d+\.\s/, '')}</li>
                        ))}
                      </ol>
                    )
                  }
                  return <p key={j}>{p}</p>
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

export default function WikiPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeSection, setActiveSection] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const mutation = useMutation({
    mutationFn: (url: string) => generateWiki(url),
    onSuccess: () => setCopied(false),
  })

  const handleCopy = () => {
    if (mutation.data?.content) {
      navigator.clipboard.writeText(mutation.data.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText()
    if (text?.includes('github.com')) setRepoUrl(text)
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="relative min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <motion.div variants={item} className="mb-8">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">Onboarding Wiki</span>
            <span className="designator opacity-50">CODEBASE ARCHIVE</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-text-primary">Onboarding Wiki</h1>
          <p className="text-body-sm text-text-secondary mt-1 font-code">Generate an onboarding guide from any GitHub repository</p>
        </motion.div>

        {/* Repo Input */}
        <motion.div variants={item} className="mb-8">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/10 via-transparent to-emerald-500/10 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur" />
            <div className="relative flex items-center gap-2 bg-bg-secondary border border-border group-focus-within:border-amber-400/30 rounded-2xl px-4 py-3 transition-all">
              <GitFork size={18} className="text-text-muted/30 shrink-0" weight="duotone" />
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-muted/20 outline-none border-none font-code"
              />
              <button onClick={handlePaste}
                className="text-caption text-text-muted/20 hover:text-text-muted/60 px-2 py-1 rounded-lg hover:bg-bg-tertiary transition-all">
                Paste
              </button>
              <div className="w-px h-5 bg-border mx-1" />
              <button
                onClick={() => mutation.mutate(repoUrl)}
                disabled={!repoUrl || mutation.isPending}
                className="flex items-center gap-2 bg-warning hover:bg-warning-lit text-[hsl(var(--primary-foreground))] px-4 py-2 rounded-btn text-body-xs font-semibold transition-all disabled:opacity-40 whitespace-nowrap">
                <Sparkle size={14} weight="fill" />
                {mutation.isPending ? 'Reading...' : 'Generate'}
              </button>
            </div>
          </div>
          <p className="text-caption text-text-muted/20 mt-2 ml-1">Paste a GitHub URL and the AI will analyze the codebase to produce a structured onboarding guide.</p>
        </motion.div>

        {/* Loading state */}
        <AnimatePresence>
          {mutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-8"
            >
              <CardSpotlight className="p-6 flex items-center justify-center min-h-[180px]">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-3">
                    <div className="w-5 h-5 border-2 border-border rounded-full border-t-amber-400 animate-spin" />
                  </div>
                  <p className="text-body-sm text-text-muted/60">Cloning repository and generating wiki...</p>
                  <p className="text-caption text-text-muted/20 mt-1">Reading code structure, extracting patterns, writing documentation</p>
                </div>
              </CardSpotlight>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {mutation.isError && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-8"
            >
              <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-3">
                <Bug size={18} className="text-red-400 shrink-0 mt-0.5" weight="fill" />
                <div>
                  <p className="text-body-xs font-medium text-red-400">Generation failed</p>
                  <p className="text-caption text-text-muted/50 mt-0.5">{(mutation.error as any)?.message || 'Could not generate wiki. Check the URL and try again.'}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {mutation.data && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Repo Stats Bar */}
              <motion.div variants={item} className="mb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border">
                    <FileCode size={12} className="text-text-muted/40" />
                    <span className="text-caption font-code text-text-muted/60">{mutation.data.stats.language}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border">
                    <Star size={12} className="text-amber-400" weight="fill" />
                    <span className="text-caption font-code text-text-muted/60 tabular-nums">{mutation.data.stats.stars}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border">
                    <Bug size={12} className="text-text-muted/40" />
                    <span className="text-caption font-code text-text-muted/60 tabular-nums">{mutation.data.stats.open_issues} issues</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border">
                    <ArrowLineRight size={12} className="text-emerald-400" />
                    <span className="text-caption font-code text-text-muted/60 tabular-nums">{mutation.data.stats.first_issues_found} first issues</span>
                  </div>
                  <div className="ml-auto text-caption text-text-muted/20 tabular-nums">{new Date(mutation.data.generated_at).toLocaleDateString()}</div>
                </div>
              </motion.div>

              {/* Content Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Sidebar */}
                <div className="lg:col-span-1 order-2 lg:order-1">
                  <div className="lg:sticky lg:top-20 space-y-4">
                    <CardSpotlight className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Book size={12} className="text-amber-400" />
                        <span className="text-caption font-medium text-text-primary">Sections</span>
                      </div>
                      <div className="space-y-0.5">
                        {mutation.data.sections.map((section: string, i: number) => (
                          <button
                            key={section}
                            onClick={() => {
                              setActiveSection(i)
                              document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: 'smooth' })
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 text-body-xs px-2 py-1.5 rounded-lg transition-all text-left',
                              activeSection === i
                                ? 'text-amber-400 bg-amber-400/8'
                                : 'text-text-muted/40 hover:text-text-muted/70 hover:bg-bg-tertiary/30'
                            )}
                          >
                            <CaretRight size={10} className={cn('shrink-0 transition-transform', activeSection === i && 'rotate-90')} />
                            <span className="truncate">{section}</span>
                          </button>
                        ))}
                      </div>
                    </CardSpotlight>

                    <button onClick={handleCopy}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-bg-tertiary hover:bg-bg-elevated text-body-xs text-text-muted/60 hover:text-text-primary transition-all">
                      {copied ? <Check size={14} className="text-emerald-400" weight="bold" /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy Wiki'}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="lg:col-span-4 order-1 lg:order-2" ref={contentRef}>
                  <CardSpotlight className="p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border/40">
                      <BookOpen size={15} className="text-amber-400" />
                      <span className="font-display text-body-sm font-bold text-text-primary">Onboarding Guide</span>
                    </div>
                    <MarkdownContent content={mutation.data.content} />
                  </CardSpotlight>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
