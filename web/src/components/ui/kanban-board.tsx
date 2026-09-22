import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '../../lib/utils'

/* ─────────────────────────────────────────────────────────────
 * KanbanBoard — Mission Control task board.
 *
 * True drag-and-drop between workflow columns with zero deps:
 *  - native HTML5 drag for the drop plumbing (mouse + touch fallback)
 *  - framer-motion `layout` prop for silky reordering within/across columns
 *  - drop-target columns light up with a GO ring + call-sign hint
 *  - optimistic local state; the caller owns persistence via onMoveTask
 * ───────────────────────────────────────────────────────────── */

export interface KanbanColumn {
  state: string
  label: string
  /** LED dot colour class (e.g. 'bg-go') */
  dot: string
  /** Optional rail label shown under the count */
  designator?: string
}

export interface KanbanTask {
  task_id: string
  state: string
  title: string
  priority?: string
  module?: string | null
  estimated_hours?: number | null
  assigned_to?: string | null
  depends_on?: string | null
  actual_hours?: number | null
}

interface KanbanBoardProps {
  columns: KanbanColumn[]
  tasks: KanbanTask[]
  /** Persist a move. Return a promise; rejecting will roll back the optimistic update. */
  onMoveTask: (taskId: string, newState: string) => Promise<void>
  onTaskClick?: (task: KanbanTask) => void
  priorityDot?: Record<string, string>
  renderCardMeta?: (task: KanbanTask) => ReactNode
  /** Resolve an assignee UUID to a display name (falls back to N/A). */
  memberName?: (uid: string | null | undefined) => string
  className?: string
  emptyLabel?: string
}

const DEFAULT_PRIORITY_DOT: Record<string, string> = {
  low: 'bg-go', medium: 'bg-mission', high: 'bg-caution', urgent: 'bg-abort',
}

export default function KanbanBoard({
  columns,
  tasks,
  onMoveTask,
  onTaskClick,
  priorityDot = DEFAULT_PRIORITY_DOT,
  renderCardMeta,
  memberName,
  className,
  emptyLabel = 'Clear',
}: KanbanBoardProps) {
  // Local mirror of the board so drops reorder instantly (optimistic).
  const [localTasks, setLocalTasks] = useState<KanbanTask[]>(tasks)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverState, setDragOverState] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const movedRef = useRef(false)
  // Set right after a drop so the click that follows the drag is suppressed.
  const justDraggedAtRef = useRef(0)
  // Skip prop re-sync while a move is in flight so the optimistic update
  // isn't clobbered by a stale filtered-tasks snapshot from the parent.
  const movingRef = useRef(false)

  useEffect(() => {
    if (!movingRef.current) setLocalTasks(tasks)
  }, [tasks])

  async function handleDrop(taskId: string, toState: string) {
    const task = localTasks.find((t) => t.task_id === taskId)
    if (!task || task.state === toState) return

    movedRef.current = true
    movingRef.current = true
    setMoving(true)
    setDropError(null)
    setLocalTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, state: toState } : t)))

    try {
      await onMoveTask(taskId, toState)
    } catch (e) {
      setDropError(e instanceof Error ? e.message : 'Move failed · reverted')
      setLocalTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, state: task.state } : t)))
    } finally {
      justDraggedAtRef.current = Date.now()
      movingRef.current = false
      setMoving(false)
      setDraggingId(null)
      setDragOverState(null)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="flex gap-3 min-w-max pb-2">
        {columns.map((col) => {
          const colTasks = localTasks.filter((t) => t.state === col.state)
          const isOver = dragOverState === col.state && draggingId

          return (
            <div
              key={col.state}
              onDragOver={(e) => { e.preventDefault(); setDragOverState(col.state) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverState((s) => (s === col.state ? null : s)) }}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain') || draggingId
                if (id) handleDrop(id, col.state)
                else { setDraggingId(null); setDragOverState(null) }
              }}
              className={cn(
                'flex w-60 shrink-0 flex-col rounded-md border transition-colors duration-150',
                isOver
                  ? 'border-go/50 bg-go/[0.04] shadow-[0_0_0_1px_rgb(var(--go-rgb)_/_0.25),0_8px_24px_-12px_rgb(var(--go-rgb)_/_0.35)]'
                  : 'border-seam bg-well/40'
              )}
            >
              {/* column rail */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', col.dot)} />
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {col.label}
                </h3>
                <span key={`${col.state}-${colTasks.length}`} className="font-code text-[10px] tabular-nums">
                  {colTasks.length}
                </span>
              </div>

              {/* cards */}
              <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
                
                  {colTasks.map((task) => (
                    <div key={task.task_id} draggable role="button" tabIndex={0} aria-label={`Task: ${task.title} (${task.state.replace(/_/g, ' ')})`} className={cn(
                        'group relative cursor-grab rounded-card border border-seam bg-well p-3 shadow-seam',
                        'transition-colors hover:border-go/40 active:cursor-grabbing',
                        'focus:outline-none focus-visible:ring-1 focus-visible:ring-go/50',
                        draggingId === task.task_id && 'opacity-40'
                      )} onClick={() => {
                        // Suppress the click that fires right after a drag-drop.
                        if (Date.now() - justDraggedAtRef.current < 350) return
                        onTaskClick?.(task)
                      }} onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onTaskClick?.(task)
                        }
                      }}>
                      {/* top hairline — lights up on hover */}
                      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-go/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                          {task.state.replace(/_/g, ' ')}
                        </span>
                        <span className={cn('h-1.5 w-1.5 rounded-full', priorityDot[task.priority ?? 'medium'] ?? priorityDot.medium)} />
                      </div>

                      <h4 className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                        {task.title}
                      </h4>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {task.module && (
                          <span className="rounded-sm border border-go/20 bg-go/5 px-1.5 py-0.5 font-code text-[10px] text-go">
                            {task.module}
                          </span>
                        )}
                        {task.estimated_hours != null && (
                          <span className="font-code text-[10px] text-ink-muted">~{task.estimated_hours}h</span>
                        )}
                        {task.depends_on && (
                          <span className="rounded-sm border border-mission/20 bg-mission/5 px-1.5 py-0.5 font-code text-[10px] text-mission" title={`Blocked until ${task.depends_on} completes`}>
                            dep
                          </span>
                        )}
                        {task.assigned_to && (
                          <span className="ml-auto max-w-[72px] truncate font-code text-[10px] text-ink-muted" title={memberName?.(task.assigned_to) ?? task.assigned_to}>
                            {memberName?.(task.assigned_to) || 'N/A'}
                          </span>
                        )}
                        {renderCardMeta?.(task)}
                      </div>
                    </div>
                  ))}
                

                {colTasks.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-seam-strong bg-well/40 py-8 transition-colors">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">{emptyLabel}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* status strip — shows while a move is in flight */}
      
        {(moving || dropError) && (
          <div className="sticky bottom-2 z-10 mt-1 flex w-fit items-center gap-2 rounded-card border border-seam bg-panel-raised px-3 py-1.5 shadow-overhead">
            {moving ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-go/30 border-t-go" />
                <span className="font-code text-[11px] text-ink-secondary">SYNCING MISSION DATA…</span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-abort" />
                <span className="font-code text-[11px] text-abort">{dropError}</span>
              </>
            )}
          </div>
        )}
      
    </div>
  )
}
