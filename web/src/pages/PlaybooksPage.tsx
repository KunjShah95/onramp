import { useState } from 'react'
import { createPlaybook, listPlaybooks, archivePlaybook } from '../lib/api'

export default function PlaybooksPage() {
  const [teamId, setTeamId] = useState('')
  const [playbooks, setPlaybooks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [stepsStr, setStepsStr] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function fetchPlaybooks() {
    if (!teamId.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await listPlaybooks(teamId.trim())
      setPlaybooks(data.playbooks || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load playbooks')
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!title.trim() || !stepsStr.trim()) return
    const steps = stepsStr.split('\n').filter((s) => s.trim())
    try {
      await createPlaybook({
        team_id: teamId,
        title: title.trim(),
        description: description.trim(),
        steps,
        created_by: 'current-user',
      })
      setTitle('')
      setDescription('')
      setStepsStr('')
      setShowCreate(false)
      await fetchPlaybooks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create playbook')
    }
  }

  async function handleArchive(pbId: string) {
    try {
      await archivePlaybook(pbId)
      await fetchPlaybooks()
    } catch { /* ignore */ }
  }

  return (
    <div className="animate-in max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Playbooks</h1>
      <p className="text-text-secondary text-sm mb-6">Create and share onboarding playbooks for your team</p>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      <div className="flex gap-3 mb-8">
        <input
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="Team ID"
          className="input flex-1"
        />
        <button onClick={fetchPlaybooks} disabled={loading || !teamId.trim()} className="btn whitespace-nowrap disabled:opacity-50">
          {loading ? 'Loading...' : 'Load Playbooks'}
        </button>
        <button onClick={() => setShowCreate(!showCreate)} className="btn whitespace-nowrap">
          {showCreate ? 'Cancel' : 'New Playbook'}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-8 space-y-4">
          <h2 className="font-display text-base font-semibold text-text-primary">Create Playbook</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input" />
          <textarea
            value={stepsStr}
            onChange={(e) => setStepsStr(e.target.value)}
            placeholder="One step per line:"
            rows={5}
            className="input font-code"
          />
          <button onClick={handleCreate} disabled={!title.trim() || !stepsStr.trim()} className="btn disabled:opacity-50">
            Create Playbook
          </button>
        </div>
      )}

      <div className="space-y-4">
        {playbooks.length === 0 && !loading && (
          <div className="card text-center py-8">
            <p className="text-text-muted text-sm">No playbooks yet. Create one to get started.</p>
          </div>
        )}

        {playbooks.map((pb: any) => (
          <div key={pb.playbook_id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3
                  className="font-display text-base font-semibold text-text-primary cursor-pointer hover:text-accent-from"
                  onClick={() => setExpanded(expanded === pb.playbook_id ? null : pb.playbook_id)}
                >
                  {pb.title}
                </h3>
                {pb.description && (
                  <p className="text-xs text-text-muted mt-1">{pb.description}</p>
                )}
              </div>
              <button onClick={() => handleArchive(pb.playbook_id)} className="text-xs text-red-400 hover:underline ml-4">
                Archive
              </button>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-text-muted mb-3">
              <span>v{pb.version || 1}</span>
              <span>Used {pb.use_count || 0}x</span>
              {pb.tags?.length > 0 && pb.tags.map((t: string) => (
                <span key={t} className="bg-bg-secondary px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>

            {expanded === pb.playbook_id && pb.steps && (
              <ol className="space-y-2 mt-3 border-t border-border/40 pt-3">
                {pb.steps.map((step: string, i: number) => (
                  <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                    <span className="text-accent-from font-mono font-semibold shrink-0 w-5">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
