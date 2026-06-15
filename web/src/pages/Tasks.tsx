import { useState, useEffect } from 'react'
import { ListPanelSkeleton, SkeletonBase } from '../components/ui/Skeleton'
import { fetchTasks, type TaskItem } from '../lib/api'

export default function Tasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const startTime = Date.now()

    const hide = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 150 - elapsed)
      setTimeout(() => { if (!cancelled) setLoading(false) }, remaining)
    }

    fetchTasks()
      .then((data) => { if (!cancelled) setTasks(data.tasks) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tasks') })
      .finally(hide)

    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="animate-in max-w-lg">
        <SkeletonBase className="h-8 w-24" />
        <div className="mt-8">
          <ListPanelSkeleton rows={3} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-in max-w-lg">
        <div className="card border-l-[3px] border-red-500 p-6">
          <h2 className="font-display text-lg font-semibold text-red-400">Failed to load tasks</h2>
          <p className="text-text-secondary text-sm mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="btn mt-4 text-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in max-w-lg">
      <h1 className="font-display text-2xl font-bold text-text-primary">Tasks</h1>
      <div className="mt-8 space-y-3">
        {tasks.map(task => (
          <div key={task.id} className="card flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-text-primary">{task.title}</h3>
              <span className={`badge ${task.priority === 'high' ? 'badge-error' : task.priority === 'medium' ? 'badge-warning' : ''} mt-1`}>
                {task.priority}
              </span>
            </div>
            <span className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'in_progress' ? 'badge-warning' : ''}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
