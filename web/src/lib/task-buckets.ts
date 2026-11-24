/**
 * Task buckets — the "reduce the choices first" layer for the Tasks page.
 *
 * A board with nine state columns asks the reader to scan all of them to find
 * the one card that needs them. These helpers collapse the nine workflow states
 * into the handful of questions people actually arrive with ("what's mine?",
 * "what's waiting on a reviewer?") and rank which of those to answer first.
 *
 * Pure functions, no React — the page and its tests share them.
 */

export type TaskBucket = 'all' | 'mine' | 'review' | 'rework' | 'unassigned' | 'done'

export interface BucketableTask {
  task_id: string
  state: string
  assigned_to?: string | null
}

const REVIEW_STATES = new Set(['submitted', 'under_review', 'peer_review', 'product_review'])
const ACTIVE_STATES = new Set(['assigned', 'in_progress'])
const DONE_STATES = new Set(['approved', 'completed'])

export function inBucket(task: BucketableTask, bucket: TaskBucket, uid: string | null | undefined): boolean {
  switch (bucket) {
    case 'all': return true
    case 'mine': return !!uid && task.assigned_to === uid
    case 'review': return REVIEW_STATES.has(task.state)
    case 'rework': return task.state === 'needs_changes'
    case 'unassigned': return task.state === 'pending' && !task.assigned_to
    case 'done': return DONE_STATES.has(task.state)
  }
}

export const BUCKET_ORDER: { value: TaskBucket; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'review', label: 'Needs review' },
  { value: 'rework', label: 'Rework' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'done', label: 'Done' },
]

export function bucketCounts(tasks: BucketableTask[], uid: string | null | undefined): Record<TaskBucket, number> {
  const counts: Record<TaskBucket, number> = { all: 0, mine: 0, review: 0, rework: 0, unassigned: 0, done: 0 }
  for (const t of tasks) {
    for (const { value } of BUCKET_ORDER) if (inBucket(t, value, uid)) counts[value]++
  }
  return counts
}

export type NextMoveKind = 'my-rework' | 'review' | 'my-active' | 'unassigned' | 'clear'

export interface NextMove {
  kind: NextMoveKind
  count: number
  /** The bucket that answers this move — the page filters to it. */
  bucket: TaskBucket
  /** When exactly one task answers the move, open it directly. */
  taskId?: string
}

/**
 * Rank what to do first. Order is deliberate: work bounced back to *you* is
 * the most blocking thing on the board (someone already reviewed it), then
 * anything waiting on a reviewer (a teammate is blocked), then your own
 * in-flight work, then unowned work nobody has picked up.
 */
export function pickNextMove(tasks: BucketableTask[], uid: string | null | undefined): NextMove {
  const mine = uid ? tasks.filter((t) => t.assigned_to === uid) : []
  const candidates: [NextMoveKind, TaskBucket, BucketableTask[]][] = [
    ['my-rework', 'rework', mine.filter((t) => t.state === 'needs_changes')],
    ['review', 'review', tasks.filter((t) => REVIEW_STATES.has(t.state))],
    ['my-active', 'mine', mine.filter((t) => ACTIVE_STATES.has(t.state))],
    ['unassigned', 'unassigned', tasks.filter((t) => inBucket(t, 'unassigned', uid))],
  ]
  for (const [kind, bucket, hits] of candidates) {
    if (hits.length > 0) {
      return { kind, bucket, count: hits.length, taskId: hits.length === 1 ? hits[0].task_id : undefined }
    }
  }
  return { kind: 'clear', bucket: 'all', count: 0 }
}
