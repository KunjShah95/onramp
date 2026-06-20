import { useState } from 'react'
import { createPlaybook, listPlaybooks, archivePlaybook } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

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
    <PageTransition>
    <div className="w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8] max-w-4xl">
      <GradientHeading as="h1" className="mb-1">Playbooks</GradientHeading>
      <p className="text-[#FDFBF8]/60 text-sm mb-6">Create and share onboarding playbooks for your team</p>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      <div className="flex gap-3 mb-8">
        <input
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="Team ID"
          className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 flex-1 outline-none focus:border-[#FF8C00]/40 transition-colors"
        />
        <button onClick={fetchPlaybooks} disabled={loading || !teamId.trim()} className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-50">
          {loading ? 'Loading...' : 'Load Playbooks'}
        </button>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap">
          {showCreate ? 'Cancel' : 'New Playbook'}
        </button>
      </div>

      {showCreate && (
        <CardSpotlight className="p-6 mb-8 space-y-4">
          <GradientHeading as="h2" className="text-base">Create Playbook</GradientHeading>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 w-full outline-none focus:border-[#FF8C00]/40 transition-colors" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 w-full outline-none focus:border-[#FF8C00]/40 transition-colors" />
          <textarea
            value={stepsStr}
            onChange={(e) => setStepsStr(e.target.value)}
            placeholder="One step per line:"
            rows={5}
            className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 w-full outline-none focus:border-[#FF8C00]/40 transition-colors font-mono"
          />
          <button onClick={handleCreate} disabled={!title.trim() || !stepsStr.trim()} className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
            Create Playbook
          </button>
        </CardSpotlight>
      )}

      <div className="space-y-4">
        {playbooks.length === 0 && !loading && (
          <CardSpotlight className="py-8 text-center">
            <p className="text-[#FDFBF8]/40 text-sm">No playbooks yet. Create one to get started.</p>
          </CardSpotlight>
        )}

        {playbooks.map((pb: any) => (
          <CardSpotlight key={pb.playbook_id} className="p-6">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3
                  className="font-display text-base font-semibold text-[#FDFBF8] cursor-pointer hover:text-[#FF8C00]"
                  onClick={() => setExpanded(expanded === pb.playbook_id ? null : pb.playbook_id)}
                >
                  {pb.title}
                </h3>
                {pb.description && (
                  <p className="text-xs text-[#FDFBF8]/40 mt-1">{pb.description}</p>
                )}
              </div>
              <button onClick={() => handleArchive(pb.playbook_id)} className="text-xs text-red-400 hover:underline ml-4">
                Archive
              </button>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-[#FDFBF8]/40 mb-3">
              <span>v{pb.version || 1}</span>
              <span>Used {pb.use_count || 0}x</span>
              {pb.tags?.length > 0 && pb.tags.map((t: string) => (
                <span key={t} className="bg-[#1A110D] px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>

            {expanded === pb.playbook_id && pb.steps && (
              <ol className="space-y-2 mt-3 border-t border-[#FDFBF8]/5 pt-3">
                {pb.steps.map((step: string, i: number) => (
                  <li key={i} className="text-sm text-[#FDFBF8]/60 flex items-start gap-2">
                    <span className="text-[#FF8C00] font-mono font-semibold shrink-0 w-5">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardSpotlight>
        ))}
      </div>
    </div>
    </PageTransition>
  )
}
