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
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { LearningPathSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { generateLearningPath, createTask, generateQuiz, submitQuizAnswers } from '../lib/api'
import type { LearningPathResult, LearningPathModule } from '../lib/types'
import type { QuizQuestion, SubmitQuizResponse } from '../lib/api'
import { cn } from '../lib/utils'

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

  // ── Quiz flow ──────────────────────────────────────────────

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
      setQuizModule(moduleName) // open modal only after data ready
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
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <BookOpenText className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Learn
              </h1>
            </div>
            <p className="text-body-sm text-text-tertiary max-w-xl">
              Generate a personalized learning path from any repository, then turn each module into a tracked task.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex items-center w-full md:flex-1">
            <GitBranch size={16} className="absolute left-3.5 text-text-tertiary/40 pointer-events-none" />
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="github.com/owner/repo"
              className="w-full bg-bg-secondary border border-border text-text-primary text-body-sm rounded-input pl-9 pr-4 py-2.5 focus:outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/40 transition-colors placeholder:text-text-tertiary/40"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-tertiary/30 w-fit">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => setUserLevel(l.key)}
                className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-all ${
                  userLevel === l.key
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !repoUrl.trim()}
            className="px-5 py-2.5 rounded-xl text-caption font-semibold bg-accent-primary hover:brightness-110 disabled:opacity-40 text-[#09090B] transition-all flex items-center gap-2 shrink-0"
          >
            <Play className="w-3.5 h-3.5" weight="fill" />
            {loading ? 'Generating…' : 'Generate Path'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleGenerate} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {loading && <LearningPathSkeleton />}

        {!loading && !path && (
          <CardSpotlight className="border border-accent-primary/10">
            <EmptyState
              icon={<BookOpenText size={40} />}
              title="Enter a GitHub repository above"
              description="We'll analyze its structure and build a personalized 5–8 module learning path for your skill level."
              action={
                <button onClick={handleGenerate} disabled={!repoUrl.trim()} className="mt-2 px-5 py-2 rounded-btn text-caption border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors font-code disabled:opacity-40">
                  Generate Path
                </button>
              }
            />
          </CardSpotlight>
        )}

        {!loading && path && (
          <>
            <CardSpotlight className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightning className="w-4 h-4 text-amber-400" weight="fill" />
                  <span className="text-body-sm font-medium text-text-primary">
                    {path.path.length} modules · ~{path.total_estimated_hours}h · {userLevel} level
                  </span>
                </div>
                <button
                  onClick={handleStartLearning}
                  disabled={creating || !activeTeamId}
                  title={activeTeamId ? 'Create a task per module' : 'Join a team first'}
                  className="px-4 py-2 rounded-xl text-caption font-semibold bg-accent-primary hover:brightness-110 disabled:opacity-40 text-[#09090B] transition-all flex items-center gap-2"
                >
                  <Target className="w-3.5 h-3.5" weight="fill" />
                  {creating ? 'Creating tasks…' : 'Start Learning'}
                </button>
              </div>
              {!activeTeamId && (
                <p className="text-caption text-text-tertiary mt-2">Join or create a team to turn modules into tracked tasks.</p>
              )}
            </CardSpotlight>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {path.path.map((mod: LearningPathModule, i) => (
                <motion.div
                  key={`${mod.order}-${mod.name}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <CardSpotlight className="p-5 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-caption font-mono text-accent-primary/70">Module {mod.order}</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-caption text-text-tertiary">
                          <Clock className="w-3 h-3" />{mod.time_hours}h
                        </span>
                      </div>
                    </div>
                    <h3 className="text-body font-medium text-text-primary mb-1.5">{mod.name}</h3>
                    <p className="text-caption text-text-tertiary leading-relaxed mb-4 flex-1">
                      {mod.description}
                    </p>
                    {mod.objectives.length > 0 && (
                      <div className="mb-3">
                        <div className="text-overline text-text-tertiary/50 font-semibold mb-1.5">Objectives</div>
                        <ul className="space-y-1 list-disc list-inside text-caption text-text-secondary">
                          {mod.objectives.map((o, idx) => (
                            <li key={idx}>{o}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {mod.files.length > 0 && (
                      <div className="flex items-start gap-2 text-caption text-text-tertiary mb-3">
                        <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="flex flex-wrap gap-1.5">
                          {mod.files.slice(0, 6).map((f) => (
                            <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary/30 text-text-tertiary font-mono">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => openQuiz(mod.name)}
                      className="flex items-center justify-center gap-1.5 w-full mt-auto px-3 py-2 rounded-lg border border-accent-primary/20 text-caption text-accent-primary font-medium hover:bg-accent-primary/5 transition-colors"
                    >
                      <ClipboardText className="w-3.5 h-3.5" weight="duotone" />
                      Take Quiz
                    </button>
                  </CardSpotlight>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Quiz Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {quizModule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={closeQuiz}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-bg-primary border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="sticky top-0 z-10 bg-bg-primary border-b border-border px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                    <ClipboardText className="w-4 h-4 text-accent-primary" weight="duotone" />
                  </div>
                  <div>
                    <h2 className="text-body-sm font-semibold text-text-primary">Knowledge Check</h2>
                    <p className="text-caption text-text-tertiary">{quizModule}</p>
                  </div>
                </div>
                <button onClick={closeQuiz} className="w-7 h-7 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors">
                  <XCircle className="w-3.5 h-3.5" weight="bold" />
                </button>
              </div>

              <div className="p-6">
                {/* Loading */}
                {quizLoading && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <svg className="w-6 h-6 animate-spin text-accent-primary mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-caption text-text-tertiary">Generating quiz questions…</p>
                  </div>
                )}

                {/* Intro screen */}
                {!quizLoading && quizStep === 'intro' && (
                  <div className="flex flex-col items-center text-center py-8">
                    <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-4">
                      <ClipboardText className="w-7 h-7 text-accent-primary" weight="duotone" />
                    </div>
                    <h3 className="text-body font-semibold text-text-primary mb-2">Test Your Knowledge</h3>
                    <p className="text-caption text-text-tertiary max-w-sm mb-1">
                      Answer {quizQuestions.length} questions about <strong>{quizModule}</strong> to check your understanding.
                    </p>
                    <p className="text-caption text-text-tertiary/50 mb-6">
                      You need <strong className="text-accent-primary">70%</strong> to pass.
                    </p>
                    <button
                      onClick={startQuiz}
                      className="px-6 py-2.5 rounded-xl bg-accent-primary text-[#09090B] text-caption font-semibold hover:brightness-110 transition-all"
                    >
                      Start Quiz
                    </button>
                  </div>
                )}

                {/* Questions */}
                {!quizLoading && quizStep === 'questions' && quizQuestions.length > 0 && (
                  <div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-primary rounded-full transition-all duration-300"
                          style={{ width: `${((currentQuestion + 1) / quizQuestions.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-caption text-text-tertiary font-mono shrink-0">
                        {currentQuestion + 1}/{quizQuestions.length}
                      </span>
                    </div>

                    {/* Question */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentQuestion}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                      >
                        <div className="flex items-start gap-2">
                          <span className="w-6 h-6 rounded-lg bg-accent-primary/10 flex items-center justify-center text-[11px] font-mono text-accent-primary shrink-0 mt-0.5">
                            {currentQuestion + 1}
                          </span>
                          <div>
                            <p className="text-body-sm font-medium text-text-primary mb-1">
                              {quizQuestions[currentQuestion].question_text}
                            </p>
                            <span className="text-[10px] text-text-tertiary/50 uppercase tracking-wider">
                              {quizQuestions[currentQuestion].difficulty} · {quizQuestions[currentQuestion].question_type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        {/* Answer options */}
                        <div className="space-y-2 pl-8">
                          {quizQuestions[currentQuestion].question_type === 'true_false' ? (
                            ['True', 'False'].map((opt) => (
                              <button
                                key={opt}
                                onClick={() => selectAnswer(quizQuestions[currentQuestion].question_id, opt)}
                                className={cn(
                                  'w-full text-left px-4 py-3 rounded-xl border text-caption transition-all',
                                  quizAnswers[quizQuestions[currentQuestion].question_id] === opt
                                    ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                                    : 'border-border bg-bg-secondary text-text-secondary hover:border-border-hover'
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
                                  'w-full text-left px-4 py-3 rounded-xl border text-caption transition-all',
                                  quizAnswers[quizQuestions[currentQuestion].question_id] === opt
                                    ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                                    : 'border-border bg-bg-secondary text-text-secondary hover:border-border-hover'
                                )}
                              >
                                <span className="text-text-tertiary/50 mr-2 font-mono">
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
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                      <button
                        onClick={prevQuestion}
                        disabled={currentQuestion === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-caption text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-all"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
                        Previous
                      </button>

                      <div className="flex gap-1.5">
                        {quizQuestions.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentQuestion(i)}
                            className={cn(
                              'w-2 h-2 rounded-full transition-all',
                              i === currentQuestion
                                ? 'bg-accent-primary w-5'
                                : quizAnswers[quizQuestions[i].question_id]
                                  ? 'bg-accent-primary/40'
                                  : 'bg-bg-tertiary'
                            )}
                          />
                        ))}
                      </div>

                      {currentQuestion < quizQuestions.length - 1 ? (
                        <button
                          onClick={nextQuestion}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-caption text-text-tertiary hover:text-text-primary transition-all"
                        >
                          Next
                          <ArrowRight className="w-3.5 h-3.5" weight="bold" />
                        </button>
                      ) : (
                        <button
                          onClick={handleSubmitQuiz}
                          disabled={submitting || Object.keys(quizAnswers).length < quizQuestions.length}
                          className="px-5 py-2 rounded-xl bg-accent-primary text-[#09090B] text-caption font-semibold hover:brightness-110 disabled:opacity-40 transition-all"
                        >
                          {submitting ? 'Submitting…' : 'Submit Quiz'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Results */}
                {!quizLoading && quizStep === 'results' && quizResult && (
                  <div className="space-y-6">
                    {/* Score card */}
                    <div className="flex flex-col items-center py-6">
                      <div className={cn(
                        'w-20 h-20 rounded-full flex items-center justify-center mb-4',
                        quizResult.passed ? 'bg-green-500/15' : 'bg-red-500/15'
                      )}>
                        {quizResult.passed ? (
                          <CheckCircle className="w-9 h-9 text-green-400" weight="fill" />
                        ) : (
                          <XCircle className="w-9 h-9 text-red-400" weight="fill" />
                        )}
                      </div>
                      <h3 className="text-display-sm font-display font-bold text-text-primary mb-1">
                        {quizResult.percentage}%
                      </h3>
                      <p className={cn(
                        'text-body-sm font-medium mb-1',
                        quizResult.passed ? 'text-green-400' : 'text-red-400'
                      )}>
                        {quizResult.passed ? 'Passed!' : 'Needs Improvement'}
                      </p>
                      <p className="text-caption text-text-tertiary">
                        {quizResult.score} / {quizResult.total} correct
                      </p>
                      <p className="text-caption text-text-tertiary/50 mt-1">
                        {quizResult.summary}
                      </p>
                    </div>

                    {/* Detailed results */}
                    <div className="space-y-3">
                      {quizResult.results.map((r, i) => (
                        <div
                          key={r.question_id}
                          className={cn(
                            'rounded-xl border p-4',
                            r.correct
                              ? 'border-green-500/20 bg-green-500/5'
                              : 'border-red-500/20 bg-red-500/5'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {r.correct ? (
                                <CheckCircle className="w-4 h-4 text-green-400" weight="fill" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400" weight="fill" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-caption text-text-primary font-medium mb-1">
                                Question {i + 1}
                              </p>
                              {!r.correct && (
                                <p className="text-[11px] text-text-secondary">
                                  <span className="text-text-tertiary">Correct answer: </span>
                                  <span className="text-green-400 font-mono">{r.correct_answer}</span>
                                </p>
                              )}
                              <p className="text-[11px] text-text-tertiary mt-1">{r.feedback}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Retry / Close */}
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => openQuiz(quizModule!)}
                        className="px-5 py-2 rounded-xl border border-accent-primary/30 text-caption text-accent-primary font-medium hover:bg-accent-primary/5 transition-all"
                      >
                        Retry Quiz
                      </button>
                      <button
                        onClick={closeQuiz}
                        className="px-5 py-2 rounded-xl bg-accent-primary text-[#09090B] text-caption font-semibold hover:brightness-110 transition-all"
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
    </PageTransition>
  )
}
