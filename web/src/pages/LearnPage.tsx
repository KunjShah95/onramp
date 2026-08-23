import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpenText,
  Clock,
  FileText,
  Play,
  Lightning,
  Target,
  GitBranch,
  ClipboardText,
  CheckCircle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  X,
} from '@phosphor-icons/react'
import { LearningPathSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { generateLearningPath, createTask, generateQuiz, submitQuizAnswers } from '../lib/api'
import type { LearningPathResult, LearningPathModule } from '../lib/types'
import type { QuizQuestion, SubmitQuizResponse } from '../lib/api'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'
import InputField from '../components/ui/first-principles/InputField'
import { PageHeader } from '../components/ui/page-header'

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
}

const LEVELS = [
  { key: 'junior', label: 'Junior' },
  { key: 'mid', label: 'Mid' },
  { key: 'senior', label: 'Senior' },
]

export default function LearnPage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [userLevel, setUserLevel] = useState('junior')
  const [loading, setLoading] = useState(false)
  const [path, setPath] = useState<LearningPathResult | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  // Quiz state
  const [quizModule, setQuizModule] = useState<string | null>(null)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizId, setQuizId] = useState<string | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizStep, setQuizStep] = useState<'intro' | 'questions' | 'results'>('intro')
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})
  const [quizResult, setQuizResult] = useState<SubmitQuizResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const toast = useToast()
  const { activeTeamId, user } = useAuth()

  async function handleGenerate() {
    if (!repoUrl.trim()) return
    setLoading(true); setError(''); setPath(null)
    try {
      const data = await generateLearningPath({}, userLevel, repoUrl)
      setPath(data)
      toast.success('Learning path ready', `${data.path.length} personalized modules · ~${data.total_estimated_hours}h`)
    } catch (err: any) {
      setError(err.message || 'Failed to generate learning path.')
      toast.error('Generation failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStartLearning() {
    if (!path || !activeTeamId) return
    setCreating(true)
    try {
      let created = 0
      for (const mod of path.path) {
        try {
          await createTask({
            team_id: activeTeamId,
            title: mod.name,
            description: mod.description,
            module: mod.name,
            priority: 'medium',
            estimated_hours: mod.time_hours,
            repo_url: repoUrl.trim() || undefined,
            assigned_to: user?.id,
          })
          created++
        } catch { /* continue */ }
      }
      toast.success('Tasks created', `${created} learning tasks added to /tasks`)
    } catch (err: any) {
      toast.error('Could not create tasks', err.message)
    } finally {
      setCreating(false)
    }
  }

  const closeQuiz = useCallback(() => {
    setQuizModule(null)
    setQuizQuestions([])
    setQuizId(null)
    setQuizStep('intro')
    setCurrentQuestion(0)
    setQuizAnswers({})
    setQuizResult(null)
  }, [])

  useEffect(() => {
    if (!quizModule) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeQuiz()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [quizModule, closeQuiz])

  async function openQuiz(moduleName: string) {
    setQuizLoading(true)
    setQuizStep('intro')
    setCurrentQuestion(0)
    setQuizAnswers({})
    setQuizResult(null)
    try {
      const data = await generateQuiz({
        mode: 'module',
        module_name: moduleName,
        repo_structure: {},
        num_questions: 5,
        difficulty: 'mixed',
      })
      setQuizQuestions(data.questions)
      setQuizId(data.quiz_id)
      setQuizModule(moduleName)
    } catch (err: any) {
      toast.error('Failed to generate quiz', err.message)
    } finally {
      setQuizLoading(false)
    }
  }

  function selectAnswer(questionId: string, answer: string) {
    setQuizAnswers((prev) => ({ ...prev, [questionId]: answer }))
  }

  function nextQuestion() {
    if (currentQuestion < quizQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    }
  }

  function prevQuestion() {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  async function handleSubmitQuiz() {
    if (!quizId) return
    setSubmitting(true)
    try {
      const result = await submitQuizAnswers(quizId, quizAnswers)
      setQuizResult(result)
      setQuizStep('results')
    } catch (err: any) {
      toast.error('Failed to submit quiz', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const startQuiz = () => {
    if (quizQuestions.length === 0) {
      toast.error('No questions generated')
      return
    }
    setQuizStep('questions')
    setCurrentQuestion(0)
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-base">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <PageHeader
          eyebrow="Folio 03 · Learn"
          title="Pick a level. Get a path."
          subtitle="Generate a personalized module path from any repo. Quiz each module. Convert the path into tracked tasks."
        />

        {/* Input rail — repo + level + generate */}
        <motion.div initial="hidden" animate="show" variants={fade} className="mb-8">
          <ConsolePanel pad="dense">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1 min-w-0">
                <InputField
                  label="Repository"
                  icon={<GitBranch size={14} weight="bold" />}
                  placeholder="github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
              </div>
              <div className="md:w-56">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary mb-1.5">
                  Level
                </label>
                <div className="flex items-center gap-1 p-1 rounded-[3px] bg-base border border-seam-strong">
                  {LEVELS.map((l) => (
                    <button
                      key={l.key}
                      onClick={() => setUserLevel(l.key)}
                      className={cn(
                        'flex-1 px-2.5 py-1.5 rounded-[2px] text-[12px] font-semibold transition-colors',
                        userLevel === l.key
                          ? 'bg-go text-white shadow-seam'
                          : 'text-ink-secondary hover:text-ink'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={loading || !repoUrl.trim()}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-[3px] bg-go px-5 py-2.5',
                  'text-[13px] font-semibold text-white shadow-seam transition-all',
                  'hover:bg-go-lit active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed',
                  'md:mb-0.5'
                )}
              >
                <Play size={12} weight="fill" />
                {loading ? 'Generating…' : 'Generate Path'}
              </button>
            </div>
          </ConsolePanel>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <ConsolePanel pad="dense" status="abort" className="flex items-center justify-between">
                <span className="text-[13px] text-abort">{error}</span>
                <button onClick={handleGenerate} disabled={loading} className="text-[12px] text-abort/70 hover:text-abort underline">
                  Retry
                </button>
              </ConsolePanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading && (
          <div className="py-8"><LearningPathSkeleton /></div>
        )}

        {/* Empty */}
        {!loading && !path && (
          <motion.div initial="hidden" animate="show" variants={fade}>
            <ConsolePanel rail="Awaiting" designator="NO PATH YET" status="idle" className="py-16 text-center">
              <div className="w-14 h-14 rounded-[3px] bg-base border border-seam flex items-center justify-center mx-auto mb-4">
                <BookOpenText size={26} className="text-ink-disabled" weight="duotone" />
              </div>
              <p className="font-display text-lg text-ink font-semibold mb-1">Enter a GitHub repository above</p>
              <p className="text-[13px] text-ink-tertiary max-w-md mx-auto">
                We'll analyze its structure and build a personalized 5–8 module learning path for your skill level.
              </p>
            </ConsolePanel>
          </motion.div>
        )}

        {/* Path */}
        {!loading && path && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            className="space-y-6"
          >
            {/* Verdict rail — path overview + start CTA */}
            <motion.div variants={fade}>
              <ConsolePanel
                rail="Path ready"
                designator={`${path.path.length} MODULES`}
                status="go"
                live
                action={
                  <button
                    onClick={handleStartLearning}
                    disabled={creating || !activeTeamId}
                    title={activeTeamId ? 'Create a task per module' : 'Join a team first'}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-[3px] bg-go px-3.5 py-1.5',
                      'text-[12px] font-semibold text-white shadow-seam transition-colors',
                      'hover:bg-go-lit active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed'
                    )}
                  >
                    <Target size={12} weight="fill" />
                    {creating ? 'Creating tasks…' : 'Start Learning'}
                  </button>
                }
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Lightning size={14} className="text-go" weight="fill" />
                    <span className="font-code text-[13px] text-ink">
                      {path.path.length} modules
                    </span>
                  </div>
                  <span className="w-1 h-1 rounded-full bg-ink-disabled" />
                  <span className="font-code text-[13px] text-ink-secondary">
                    ~{path.total_estimated_hours}h
                  </span>
                  <span className="w-1 h-1 rounded-full bg-ink-disabled" />
                  <span className="font-code text-[13px] text-ink-secondary uppercase">
                    {userLevel} level
                  </span>
                  {!activeTeamId && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-ink-disabled" />
                      <span className="font-code text-[12px] text-caution">
                        Join a team to track
                      </span>
                    </>
                  )}
                </div>
              </ConsolePanel>
            </motion.div>

            {/* Module grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {path.path.map((mod: LearningPathModule) => (
                <motion.div key={`${mod.order}-${mod.name}`} variants={fade}>
                  <ConsolePanel rail={`Module ${mod.order}`} designator={mod.time_hours + 'H'} className="h-full flex flex-col">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-display text-[16px] text-ink font-bold tracking-tight leading-snug">
                        {mod.name}
                      </h3>
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-ink-tertiary font-code">
                        <Clock size={11} />{mod.time_hours}h
                      </span>
                    </div>
                    <p className="font-body text-[13px] text-ink-secondary leading-relaxed mb-4 flex-1">
                      {mod.description}
                    </p>
                    {mod.objectives.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider mb-1.5">Objectives</div>
                        <ul className="space-y-0.5">
                          {mod.objectives.map((o) => (
                            <li key={o} className="font-body text-[12px] text-ink-secondary pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-ink-disabled">
                              {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {mod.files.length > 0 && (
                      <div className="flex items-start gap-2 mb-3">
                        <FileText size={12} className="text-ink-tertiary mt-0.5 shrink-0" />
                        <div className="flex flex-wrap gap-1">
                          {mod.files.slice(0, 6).map((f) => (
                            <span key={f} className="px-1.5 py-0.5 rounded-[2px] text-[10px] bg-base border border-seam text-ink-tertiary font-code">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => openQuiz(mod.name)}
                      disabled={quizLoading && quizModule === mod.name}
                      className={cn(
                        'flex items-center justify-center gap-1.5 w-full mt-auto px-3 py-2 rounded-[3px]',
                        'border border-go/30 text-[12px] text-go font-semibold',
                        'hover:bg-go/10 transition-colors disabled:opacity-40'
                      )}
                    >
                      <ClipboardText size={12} weight="duotone" />
                      Take Quiz
                    </button>
                  </ConsolePanel>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

      {/* ── Quiz Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {quizModule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
            onClick={closeQuiz}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-panel border border-seam rounded-card w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-seam"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="sticky top-0 z-10 bg-panel border-b border-seam px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center">
                    <ClipboardText size={14} className="text-go" weight="regular" />
                  </div>
                  <div>
                    <div className="designator opacity-60">KNOWLEDGE CHECK</div>
                    <p className="font-code text-[12px] text-ink-secondary mt-0.5">{quizModule}</p>
                  </div>
                </div>
                <button onClick={closeQuiz} className="w-7 h-7 rounded-[3px] bg-base border border-seam flex items-center justify-center text-ink-tertiary hover:text-ink transition-colors">
                  <X size={14} weight="bold" />
                </button>
              </div>

              <div className="p-6">
                {quizLoading && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <svg className="w-6 h-6 animate-spin text-go mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-[13px] text-ink-tertiary">Generating quiz questions…</p>
                  </div>
                )}

                {!quizLoading && quizStep === 'intro' && (
                  <div className="flex flex-col items-center text-center py-8">
                    <div className="w-14 h-14 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center mb-4">
                      <ClipboardText size={26} className="text-go" weight="regular" />
                    </div>
                    <h3 className="font-display text-lg text-ink font-bold mb-2">Test Your Knowledge</h3>
                    <p className="text-[13px] text-ink-secondary max-w-sm mb-1">
                      Answer {quizQuestions.length} questions about <strong className="text-ink">{quizModule}</strong>.
                    </p>
                    <p className="text-[12px] text-ink-tertiary mb-6">
                      You need <strong className="text-go">70%</strong> to pass.
                    </p>
                    <button
                      onClick={startQuiz}
                      className="inline-flex items-center gap-2 rounded-[3px] bg-go px-5 py-2.5 text-[13px] font-semibold text-white shadow-seam hover:bg-go-lit transition-colors"
                    >
                      Start Quiz
                    </button>
                  </div>
                )}

                {!quizLoading && quizStep === 'questions' && quizQuestions.length > 0 && (
                  <div>
                    {/* Progress */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex-1 h-1 rounded-full bg-base overflow-hidden">
                        <div
                          className="h-full bg-go transition-all duration-300"
                          style={{ width: `${((currentQuestion + 1) / quizQuestions.length) * 100}%` }}
                        />
                      </div>
                      <span className="font-code text-[12px] text-ink-tertiary shrink-0 tabular-nums">
                        {currentQuestion + 1} / {quizQuestions.length}
                      </span>
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentQuestion}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="w-6 h-6 rounded-[2px] bg-base border border-seam flex items-center justify-center font-code text-[11px] text-ink-secondary shrink-0 mt-0.5">
                            {currentQuestion + 1}
                          </span>
                          <div>
                            <p className="font-body text-[14px] text-ink font-medium leading-snug mb-1">
                              {quizQuestions[currentQuestion].question_text}
                            </p>
                            <span className="font-code text-[10px] text-ink-tertiary uppercase tracking-wider">
                              {quizQuestions[currentQuestion].difficulty} · {quizQuestions[currentQuestion].question_type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 pl-8">
                          {quizQuestions[currentQuestion].question_type === 'true_false' ? (
                            ['True', 'False'].map((opt) => (
                              <button
                                key={opt}
                                onClick={() => selectAnswer(quizQuestions[currentQuestion].question_id, opt)}
                                className={cn(
                                  'w-full text-left px-4 py-3 rounded-[3px] border text-[13px] font-body transition-colors',
                                  quizAnswers[quizQuestions[currentQuestion].question_id] === opt
                                    ? 'border-go/60 bg-go/10 text-ink'
                                    : 'border-seam bg-base text-ink-secondary hover:border-seam-strong'
                                )}
                              >
                                {opt}
                              </button>
                            ))
                          ) : (
                            quizQuestions[currentQuestion].options.map((opt, oi) => (
                              <button
                                key={oi}
                                onClick={() => selectAnswer(quizQuestions[currentQuestion].question_id, opt)}
                                className={cn(
                                  'w-full text-left px-4 py-3 rounded-[3px] border text-[13px] font-body transition-colors',
                                  quizAnswers[quizQuestions[currentQuestion].question_id] === opt
                                    ? 'border-go/60 bg-go/10 text-ink'
                                    : 'border-seam bg-base text-ink-secondary hover:border-seam-strong'
                                )}
                              >
                                <span className="font-code text-ink-tertiary mr-2">
                                  {String.fromCharCode(65 + oi)}.
                                </span>
                                {opt}
                              </button>
                            ))
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-seam">
                      <button
                        onClick={prevQuestion}
                        disabled={currentQuestion === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[3px] text-[12px] text-ink-tertiary hover:text-ink disabled:opacity-30 transition-colors"
                      >
                        <ArrowLeft size={12} weight="bold" />
                        Previous
                      </button>

                      <div className="flex gap-1.5">
                        {quizQuestions.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentQuestion(i)}
                            className={cn(
                              'h-1.5 rounded-[1px] transition-all',
                              i === currentQuestion
                                ? 'bg-go w-5'
                                : quizAnswers[quizQuestions[i].question_id]
                                  ? 'bg-go/50 w-1.5'
                                  : 'bg-seam w-1.5'
                            )}
                          />
                        ))}
                      </div>

                      {currentQuestion < quizQuestions.length - 1 ? (
                        <button
                          onClick={nextQuestion}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[3px] text-[12px] text-ink-tertiary hover:text-ink transition-colors"
                        >
                          Next
                          <ArrowRight size={12} weight="bold" />
                        </button>
                      ) : (
                        <button
                          onClick={handleSubmitQuiz}
                          disabled={submitting || Object.keys(quizAnswers).length < quizQuestions.length}
                          className="inline-flex items-center gap-1.5 rounded-[3px] bg-go px-4 py-2 text-[12px] font-semibold text-white hover:bg-go-lit transition-colors disabled:opacity-40"
                        >
                          {submitting ? 'Submitting…' : 'Submit Quiz'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!quizLoading && quizStep === 'results' && quizResult && (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center py-6">
                      <div className={cn(
                        'w-20 h-20 rounded-full flex items-center justify-center mb-4 border-2',
                        quizResult.passed ? 'border-go bg-go/10' : 'border-abort bg-abort/10'
                      )}>
                        {quizResult.passed ? (
                          <CheckCircle size={36} className="text-go" weight="fill" />
                        ) : (
                          <XCircle size={36} className="text-abort" weight="fill" />
                        )}
                      </div>
                      <div className={cn(
                        'font-display text-4xl font-bold tabular-nums mb-1',
                        quizResult.passed ? 'text-go' : 'text-abort'
                      )}>
                        {quizResult.percentage}%
                      </div>
                      <p className={cn(
                        'font-display text-[14px] font-semibold mb-1',
                        quizResult.passed ? 'text-go' : 'text-abort'
                      )}>
                        {quizResult.passed ? 'Passed' : 'Needs improvement'}
                      </p>
                      <p className="font-code text-[12px] text-ink-tertiary">
                        {quizResult.score} / {quizResult.total} correct
                      </p>
                      {quizResult.summary && (
                        <p className="text-[12px] text-ink-secondary mt-2 max-w-sm text-center">
                          {quizResult.summary}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {quizResult.results.map((r, i) => (
                        <div
                          key={r.question_id}
                          className={cn(
                            'rounded-[3px] border p-3',
                            r.correct
                              ? 'border-go/20 bg-go/5'
                              : 'border-abort/20 bg-abort/5'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {r.correct ? (
                                <CheckCircle size={14} className="text-go" weight="fill" />
                              ) : (
                                <XCircle size={14} className="text-abort" weight="fill" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-code text-[12px] text-ink font-medium mb-1">
                                Question {i + 1}
                              </p>
                              {!r.correct && (
                                <p className="text-[12px] text-ink-secondary">
                                  <span className="text-ink-tertiary">Correct answer: </span>
                                  <span className="text-go font-code">{r.correct_answer}</span>
                                </p>
                              )}
                              {r.feedback && (
                                <p className="text-[12px] text-ink-tertiary mt-1">{r.feedback}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => openQuiz(quizModule!)}
                        className="px-5 py-2 rounded-[3px] border border-seam-strong bg-panel-raised text-[12px] text-ink font-medium hover:bg-base transition-colors"
                      >
                        Retry Quiz
                      </button>
                      <button
                        onClick={closeQuiz}
                        className="inline-flex items-center gap-1.5 rounded-[3px] bg-go px-5 py-2 text-[12px] font-semibold text-white hover:bg-go-lit transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}
