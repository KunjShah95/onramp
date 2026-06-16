import { useState } from 'react'
import {
  createTeam,
  listTeams,
  addTeamMember,
  changeTeamTier,
} from '../lib/api'
import { cn } from '../lib/utils'

export default function TeamPage() {
  const [teamName, setTeamName] = useState('')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [tier, setTier] = useState('free')

  async function handleCreateTeam() {
    if (!teamName.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await createTeam(teamName.trim(), 'current-user', tier)
      setTeamId(data.team_id)
      setTeamName('')
      await fetchTeams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create team')
    }
    setLoading(false)
  }

  async function fetchTeams() {
    try {
      const data = await listTeams('current-user')
      setTeams(data.teams || [])
    } catch { /* ignore */ }
  }

  async function handleAddMember() {
    if (!teamId || !memberEmail.trim()) return
    try {
      await addTeamMember(teamId, memberEmail.trim(), 'member')
      setMemberEmail('')
      await fetchTeams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member')
    }
  }

  async function handleChangeTier(newTier: string) {
    if (!teamId) return
    try {
      await changeTeamTier(teamId, newTier)
      setTier(newTier)
      await fetchTeams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change tier')
    }
  }

  return (
    <div className="animate-in max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">Team Management</h1>
      <p className="text-text-secondary text-sm mb-6">Create teams, invite members, manage subscriptions</p>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4">Create Team</h2>
          <div className="space-y-3">
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
              className="input"
            />
            <select value={tier} onChange={(e) => setTier(e.target.value)} className="input">
              <option value="free">Free — 1 member</option>
              <option value="startup">Startup — $49/mo, 5 members</option>
              <option value="professional">Professional — $299/mo, 20 members</option>
              <option value="enterprise">Enterprise — Custom</option>
            </select>
            <button onClick={handleCreateTeam} disabled={loading || !teamName.trim()} className="btn disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </div>

        {teamId && (
          <div className="card">
            <h2 className="font-display text-base font-semibold text-text-primary mb-4">Add Member</h2>
            <div className="space-y-3">
              <input
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="User email or ID"
                className="input"
              />
              <button onClick={handleAddMember} disabled={!memberEmail.trim()} className="btn disabled:opacity-50">
                Add Member
              </button>
            </div>
          </div>
        )}
      </div>

      {teamId && (
        <div className="card mb-8">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4">Subscription Tier</h2>
          <div className="flex flex-wrap gap-2">
            {['free', 'startup', 'professional', 'enterprise'].map((t) => (
              <button
                key={t}
                onClick={() => handleChangeTier(t)}
                className={cn(
                  'px-4 py-2 rounded-btn text-sm font-semibold capitalize transition-all',
                  tier === t
                    ? 'bg-accent-from text-white shadow-card'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-elevated'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {teams.length > 0 && (
        <div className="card">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4">Your Teams</h2>
          <div className="space-y-3">
            {teams.map((t: any) => (
              <div key={t.team_id} className="flex items-center justify-between p-3 rounded-card bg-bg-secondary border border-border/40">
                <div>
                  <p className="text-sm font-medium text-text-primary">{t.name}</p>
                  <p className="text-xs text-text-muted">
                    {t.members?.length || 0} members · {t.tier} tier
                  </p>
                </div>
                <button
                  onClick={() => { setTeamId(t.team_id); setTier(t.tier || 'free') }}
                  className="text-xs text-accent-from hover:underline"
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
