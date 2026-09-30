import { describe, it, expect } from 'vitest'
import { bucketCounts, inBucket, pickNextMove } from '../lib/task-buckets'

const t = (task_id: string, state: string, assigned_to: string | null = null) => ({ task_id, state, assigned_to })

describe('task buckets', () => {
  const tasks = [
    t('1', 'pending'),
    t('2', 'pending', 'me'),
    t('3', 'in_progress', 'me'),
    t('4', 'submitted', 'other'),
    t('5', 'peer_review', 'other'),
    t('6', 'needs_changes', 'other'),
    t('7', 'completed', 'me'),
    t('8', 'cancelled', 'other'),
  ]

  it('counts each bucket from the same list', () => {
    expect(bucketCounts(tasks, 'me')).toEqual({
      all: 8, mine: 3, review: 2, rework: 1, unassigned: 1, done: 1,
    })
  })

  it('an assigned pending task is not unassigned', () => {
    expect(inBucket(t('x', 'pending', 'me'), 'unassigned', 'me')).toBe(false)
  })

  it('"mine" is empty without a signed-in id', () => {
    expect(bucketCounts(tasks, null).mine).toBe(0)
  })
})

describe('pickNextMove', () => {
  it('ranks my rework above a review queue', () => {
    const move = pickNextMove([t('a', 'submitted', 'x'), t('b', 'needs_changes', 'me')], 'me')
    expect(move).toMatchObject({ kind: 'my-rework', bucket: 'rework', count: 1, taskId: 'b' })
  })

  it("someone else's rework does not become my move", () => {
    const move = pickNextMove([t('a', 'needs_changes', 'x'), t('b', 'submitted', 'x'), t('c', 'peer_review', 'y')], 'me')
    expect(move).toMatchObject({ kind: 'review', count: 2 })
    // More than one candidate: filter, don't guess which to open.
    expect(move.taskId).toBeUndefined()
  })

  it('falls through to my active work, then unassigned', () => {
    expect(pickNextMove([t('a', 'in_progress', 'me'), t('b', 'pending')], 'me').kind).toBe('my-active')
    expect(pickNextMove([t('b', 'pending'), t('c', 'completed', 'me')], 'me').kind).toBe('unassigned')
  })

  it('reports a clear board', () => {
    expect(pickNextMove([t('c', 'completed', 'me')], 'me')).toEqual({ kind: 'clear', bucket: 'all', count: 0 })
    expect(pickNextMove([], 'me').kind).toBe('clear')
  })
})
